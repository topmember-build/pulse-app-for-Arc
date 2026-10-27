import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { getVerifiedPrivyWallet, WalletAuthError } from '@/lib/privy-auth'
import { contractScanRequestSchema, contractScanSchema } from '@/lib/schemas'
import { formatTokenAmount } from '@/lib/token-analysis'
import { ARC_CHAIN_ID, ARC_NETWORK_NAME, ARC_NATIVE_CURRENCY } from '@/lib/arc-network'
import { ARC_RPC_URL } from '@/lib/arc-rpc'

export const runtime = 'nodejs'

type RpcResponse = { result?: unknown; error?: { message?: string } }

function response(requestId: string, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId, ...headers } })
}

async function rpc(method: string, params: unknown[]) {
  const result = await fetch(ARC_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (!result.ok) throw new Error('arc_rpc_http_error')
  const payload = await result.json() as RpcResponse
  if (payload.error || !('result' in payload)) throw new Error('arc_rpc_method_error')
  return payload.result
}

async function saveHistory(userId: string, walletAddress: string, address: string, status: 'complete' | 'failed', summary: Record<string, unknown>) {
  await db.execute(sql`
    INSERT INTO pulse_scan_history (wallet_address, privy_user_id, scan_type, target_address, status, summary)
    VALUES (${walletAddress.toLowerCase()}, ${userId}, 'contract', ${address.toLowerCase()}, ${status}, ${JSON.stringify(summary)}::jsonb)
  `)
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const startedAt = Date.now()
  try {
    const rateLimit = await checkRateLimit(request, 'contract-scan', 20, 60)
    if (!rateLimit.allowed) {
      console.info(JSON.stringify({ event: 'pulse.api.rate_limited', route: 'contract-scan', requestId }))
      return response(requestId, { error: 'rate_limited', retryAfter: rateLimit.retryAfter }, 429, { 'retry-after': String(rateLimit.retryAfter) })
    }
  } catch {
    console.error(JSON.stringify({ event: 'pulse.api.rate_limit_unavailable', route: 'contract-scan', requestId }))
    return response(requestId, { error: 'service_unavailable' }, 503)
  }

  let verifiedWallet: Awaited<ReturnType<typeof getVerifiedPrivyWallet>>
  try {
    verifiedWallet = await getVerifiedPrivyWallet(request, request.headers.get('x-pulse-wallet') ?? '')
  } catch (error) {
    const status = error instanceof WalletAuthError ? error.status : 503
    const code = error instanceof WalletAuthError ? error.code : 'auth_unavailable'
    return response(requestId, { error: code }, status)
  }

  const parsed = contractScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return response(requestId, { error: 'invalid_input' }, 400)

  const address = parsed.data.address.toLowerCase()
  try {
    const [chainId, code, balance] = await Promise.all([
      rpc('eth_chainId', []),
      rpc('eth_getCode', [address, 'latest']),
      rpc('eth_getBalance', [address, 'latest']),
    ])
  if (typeof chainId !== 'string' || Number.parseInt(chainId, 16) !== ARC_CHAIN_ID) {
    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'wrong_network' }).catch(() => undefined)
    return response(requestId, { error: 'wrong_network' }, 502)
  }

    if (typeof code !== 'string' || typeof balance !== 'string' || !/^0x[0-9a-f]+$/i.test(balance)) {
      throw new Error('arc_rpc_invalid_response')
    }

    const isContract = code !== '0x'
    if (!isContract) {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'not_a_contract' }).catch(() => undefined)
      return response(requestId, { error: 'not_a_contract' }, 422)
    }

    const bytecodeBytes = Math.max(0, (code.length - 2) / 2)
    const nativeBalance = formatTokenAmount(BigInt(balance), ARC_NATIVE_CURRENCY.decimals)
    const findings = [
      {
        sev: 'ok', short: 'Contract bytecode found',
        plain: `This address has executable code on ${ARC_NETWORK_NAME}.`,
        title: 'Runtime bytecode exists',
        detail: `The live runtime bytecode is ${bytecodeBytes.toLocaleString()} bytes.`,
        where: `${ARC_NETWORK_NAME} · latest block`,
      },
    ] as const
    const result = contractScanSchema.parse({
      id: address,
      name: `${address.slice(0, 6)}…${address.slice(-4)}`,
      kind: `Live ${ARC_NETWORK_NAME} contract`,
      addr: address,
      headline: `Live bytecode was found on ${ARC_NETWORK_NAME}.`,
      beat: { every: 0, jitter: 0 },
      flow: { dep: 0, wd: 0, fail: 0 },
      owner: { type: 'unknown', label: 'Not inferred from RPC-only scan', dots: 0, lit: 0, last: 'No owner analysis yet' },
      facts: [['Network', ARC_NETWORK_NAME], ['Runtime bytecode', `${bytecodeBytes.toLocaleString()} bytes`], [`Native ${ARC_NATIVE_CURRENCY.symbol} balance`, `${nativeBalance} ${ARC_NATIVE_CURRENCY.symbol}`]],
      powers: [], findings,
    })

    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'complete', { headline: result.headline, findings: result.findings.length }).catch((error) => {
      console.warn(JSON.stringify({ event: 'pulse.scan_history.write_failed', route: 'contract-scan', requestId, errorName: error instanceof Error ? error.name : 'unknown' }))
    })
    console.info(JSON.stringify({ event: 'pulse.contract_scan.completed', requestId, durationMs: Date.now() - startedAt, isContract: true, bytecodeBytes }))
    return response(requestId, result)
  } catch (error) {
    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'arc_rpc_unavailable' }).catch(() => undefined)
    console.error(JSON.stringify({ event: 'pulse.contract_scan.failed', requestId, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : 'unknown' }))
    return response(requestId, { error: 'arc_rpc_unavailable' }, 502)
  }
}
