import { randomUUID } from 'node:crypto'
import { recoverMessageAddress } from 'viem'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pulsePayments } from '@/lib/db-schema'
import { getPaymentConfig, type PaymentConfig } from '@/lib/payment-config'
import { paymentMessage } from '@/lib/payment-message'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export type PaymentErrorCode =
  | 'payment_unavailable'
  | 'payment_pending'
  | 'payment_invalid'
  | 'payment_already_used'
  | 'payment_in_progress'
  | 'payment_signature_invalid'

const STATUS: Record<PaymentErrorCode, number> = {
  payment_unavailable: 503,
  payment_pending: 425,
  payment_invalid: 402,
  payment_already_used: 409,
  payment_in_progress: 409,
  payment_signature_invalid: 402,
}

export type PaymentFailure = { ok: false; code: PaymentErrorCode; status: number }
const fail = (code: PaymentErrorCode): PaymentFailure => ({ ok: false, code, status: STATUS[code] })

async function paymentRpc<T>(config: PaymentConfig, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('payment_rpc_http_error')
  const payload = await response.json() as { result?: T; error?: unknown }
  if (payload.error || !('result' in payload)) throw new Error('payment_rpc_error')
  return payload.result as T
}

type Receipt = {
  status?: string
  blockNumber?: string
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>
}

const topicAddress = (topic: string | undefined) => (topic && /^0x[0-9a-f]{64}$/i.test(topic) ? `0x${topic.slice(-40).toLowerCase()}` : null)

// Reads the transaction receipt from the payment chain and finds who paid at least the
// configured price of USDC to the configured receiver. The payer is whoever sent the tokens.
export async function verifyPaymentOnchain(config: PaymentConfig, txHash: string) {
  if (!config.enabled || !config.receiver) return fail('payment_unavailable')
  try {
    const chainId = Number.parseInt(await paymentRpc<string>(config, 'eth_chainId', []), 16)
    if (chainId !== config.chainId) return fail('payment_unavailable')

    const receipt = await paymentRpc<Receipt | null>(config, 'eth_getTransactionReceipt', [txHash])
    if (!receipt || !receipt.blockNumber) return fail('payment_pending')
    if (receipt.status !== '0x1') return fail('payment_invalid')

    const price = BigInt(config.priceUnits)
    const paidBy = new Map<string, bigint>()
    for (const log of receipt.logs ?? []) {
      if (log.address?.toLowerCase() !== config.usdc) continue
      const topics = log.topics ?? []
      if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue
      const from = topicAddress(topics[1])
      if (!from || topicAddress(topics[2]) !== config.receiver) continue
      if (!log.data || !/^0x[0-9a-f]{64}$/i.test(log.data)) continue
      paidBy.set(from, (paidBy.get(from) ?? BigInt(0)) + BigInt(log.data))
    }
    for (const [payer, amount] of paidBy) {
      if (amount >= price) return { ok: true as const, payer, amountUnits: amount.toString() }
    }
    return fail('payment_invalid')
  } catch {
    return fail('payment_unavailable')
  }
}

// The payer proves the payment is theirs by signing a message that names this account and scan.
async function signatureMatches(input: { signature: string | undefined; txHash: string; scanType: 'token' | 'contract'; target: string; chainId: number }, payer: string) {
  if (!input.signature || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) return false
  try {
    const signer = await recoverMessageAddress({
      message: paymentMessage({ txHash: input.txHash, scanType: input.scanType, target: input.target, chainId: input.chainId }),
      signature: input.signature as `0x${string}`,
    })
    return signer.toLowerCase() === payer.toLowerCase()
  } catch {
    return false
  }
}

const STALE_CLAIM = sql`now() - interval '2 minutes'`

// Atomically reserves a verified payment for one scan. A payment unlocks exactly one delivered
// scan, only for the wallet that paid (proven by its signature), and cannot be used twice at once.
export async function claimPayment(input: {
  txHash: string
  privyUserId: string | null
  signature: string | undefined
  scanType: 'token' | 'contract'
  targetAddress: string
}) {
  const config = getPaymentConfig()
  if (!config.enabled) return fail('payment_unavailable')
  const txHash = input.txHash.toLowerCase()
  const proof = { signature: input.signature, txHash, scanType: input.scanType, target: input.targetAddress, chainId: config.chainId }

  const [existing] = await db.select().from(pulsePayments).where(eq(pulsePayments.txHash, txHash)).limit(1)
  if (existing) {
    // Only the wallet that paid can resume this payment, proven by its signature.
    if (!(await signatureMatches(proof, existing.walletAddress))) return existing.status === 'consumed' ? fail('payment_already_used') : fail('payment_signature_invalid')
    if (existing.status === 'consumed') {
      // The scan was already delivered. If the payer lost the response, hand back the same result.
      const sameScan = existing.scanType === input.scanType && existing.targetAddress === input.targetAddress.toLowerCase()
      return sameScan && existing.result ? { ok: true as const, replay: existing.result } : fail('payment_already_used')
    }
    const [claimed] = await db.update(pulsePayments)
      .set({ status: 'in_progress', claimedAt: sql`now()`, scanType: input.scanType, targetAddress: input.targetAddress.toLowerCase() })
      .where(and(
        eq(pulsePayments.txHash, txHash),
        or(eq(pulsePayments.status, 'verified'), and(eq(pulsePayments.status, 'in_progress'), sql`${pulsePayments.claimedAt} < ${STALE_CLAIM}`)),
      ))
      .returning({ txHash: pulsePayments.txHash })
    return claimed ? { ok: true as const, replay: undefined } : fail('payment_in_progress')
  }

  const verification = await verifyPaymentOnchain(config, txHash)
  if (!verification.ok) return verification
  if (!(await signatureMatches(proof, verification.payer))) return fail('payment_signature_invalid')

  const [inserted] = await db.insert(pulsePayments).values({
    txHash,
    walletAddress: verification.payer,
    privyUserId: input.privyUserId ?? '',
    scanType: input.scanType,
    targetAddress: input.targetAddress.toLowerCase(),
    chainId: config.chainId,
    amountUnits: verification.amountUnits,
    status: 'in_progress',
  }).onConflictDoNothing().returning({ txHash: pulsePayments.txHash })
  return inserted ? { ok: true as const, replay: undefined } : fail('payment_in_progress')
}

export async function completePayment(txHash: string, result: Record<string, unknown>) {
  await db.update(pulsePayments)
    .set({ status: 'consumed', consumedAt: sql`now()`, result })
    .where(eq(pulsePayments.txHash, txHash.toLowerCase()))
}

// The scan failed after the payment was reserved: free it so the same payment can be retried.
export async function releasePayment(txHash: string) {
  await db.update(pulsePayments)
    .set({ status: 'verified' })
    .where(and(eq(pulsePayments.txHash, txHash.toLowerCase()), eq(pulsePayments.status, 'in_progress')))
}
