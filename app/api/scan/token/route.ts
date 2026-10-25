import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { getVerifiedPrivyWallet, WalletAuthError } from '@/lib/privy-auth'
import { analyzeTokenTransfers, formatTokenAmount, TransferEvidence } from '@/lib/token-analysis'
import { tokenScanRequestSchema, tokenScanSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

const RPC = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID = 5042002
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const MAX_ANALYZED_EVENTS = 10_000

type RpcResponse = { result?: unknown; error?: { code?: number; message?: string } }
type RawTransferLog = {
  topics?: unknown[]
  data?: unknown
  blockNumber?: unknown
  transactionHash?: unknown
  logIndex?: unknown
}

function response(requestId: string, body: unknown, status = 200, additionalHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId, ...additionalHeaders },
  })
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      })
      if (!result.ok) {
        if (attempt < 2 && (result.status === 429 || result.status >= 500)) {
          await delay(150 * (attempt + 1))
          continue
        }
        throw new Error('arc_rpc_http_error')
      }

      const payload = await result.json() as RpcResponse
      if (payload.error) {
        const retryable = [-32005, -32016, -32603].includes(payload.error.code ?? 0)
        if (attempt < 2 && retryable) {
          await delay(150 * (attempt + 1))
          continue
        }
        throw new Error('arc_rpc_method_error')
      }
      if (!('result' in payload)) throw new Error('arc_rpc_invalid_response')
      return payload.result
    } catch (error) {
      const retryable = error instanceof TypeError
        || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      if (attempt < 2 && retryable) {
        await delay(150 * (attempt + 1))
        continue
      }
      throw error
    }
  }

  throw new Error('arc_rpc_unavailable')
}

async function optionalCall(address: string, data: string) {
  try {
    const result = await rpc('eth_call', [{ to: address, data }, 'latest'])
    return typeof result === 'string' ? result : null
  } catch {
    return null
  }
}

function parseQuantity(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null
  const parsed = Number.parseInt(value, 16)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function parseUint(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function decodeAbiString(value: string | null): string | null {
  if (!value || !/^0x[0-9a-f]*$/i.test(value)) return null
  const data = value.slice(2)
  if (data.length < 64) return null

  try {
    const firstWord = BigInt(`0x${data.slice(0, 64)}`)
    let start = 0
    let length = 32

    if (firstWord === BigInt(32) && data.length >= 128) {
      const dynamicLength = Number(BigInt(`0x${data.slice(64, 128)}`))
      if (!Number.isSafeInteger(dynamicLength) || dynamicLength < 0 || dynamicLength > 1024) return null
      start = 128
      length = dynamicLength
    }

    const decoded = Buffer.from(data.slice(start, start + length * 2), 'hex')
      .toString('utf8')
      .replace(/\0+$/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
    return decoded ? decoded.slice(0, 64) : null
  } catch {
    return null
  }
}

function parseTransferLog(value: unknown): TransferEvidence | null {
  if (!value || typeof value !== 'object') return null
  const log = value as RawTransferLog
  const topics = log.topics
  if (!Array.isArray(topics) || topics.length < 3 || typeof topics[0] !== 'string' || topics[0].toLowerCase() !== TRANSFER_TOPIC) return null
  if (typeof topics[1] !== 'string' || typeof topics[2] !== 'string' || typeof log.data !== 'string') return null
  if (!/^0x[0-9a-f]{64}$/i.test(topics[1]) || !/^0x[0-9a-f]{64}$/i.test(topics[2])) return null
  if (!/^0x[0-9a-f]{64}$/i.test(log.data)) return null
  if (typeof log.transactionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash)) return null

  const blockNumber = parseQuantity(log.blockNumber)
  const logIndex = parseQuantity(log.logIndex)
  const amount = parseUint(log.data)
  if (blockNumber === null || logIndex === null || amount === null) return null

  return {
    blockNumber,
    logIndex,
    transactionHash: log.transactionHash.toLowerCase(),
    from: `0x${topics[1].slice(-40).toLowerCase()}`,
    to: `0x${topics[2].slice(-40).toLowerCase()}`,
    amount,
  }
}

async function saveHistory(userId: string, walletAddress: string, address: string, status: 'complete' | 'failed', summary: Record<string, unknown>) {
  await db.execute(sql`
    INSERT INTO pulse_scan_history (wallet_address, privy_user_id, scan_type, target_address, status, summary)
    VALUES (${walletAddress.toLowerCase()}, ${userId}, 'token', ${address.toLowerCase()}, ${status}, ${JSON.stringify(summary)}::jsonb)
  `)
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const startedAt = Date.now()

  try {
    const rateLimit = await checkRateLimit(request, 'token-scan', 10, 60)
    if (!rateLimit.allowed) {
      console.info(JSON.stringify({ event: 'pulse.api.rate_limited', route: 'token-scan', requestId }))
      return response(requestId, { error: 'rate_limited', retryAfter: rateLimit.retryAfter }, 429, { 'retry-after': String(rateLimit.retryAfter) })
    }
  } catch {
    console.error(JSON.stringify({ event: 'pulse.api.rate_limit_unavailable', route: 'token-scan', requestId }))
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

  const parsed = tokenScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return response(requestId, { error: 'invalid_input' }, 400)

  const address = parsed.data.address.toLowerCase()
  try {
    const [chainIdHex, code, latestHex, symbolResult, nameResult, decimalsResult, supplyResult] = await Promise.all([
      rpc('eth_chainId', []),
      rpc('eth_getCode', [address, 'latest']),
      rpc('eth_blockNumber', []),
      optionalCall(address, '0x95d89b41'),
      optionalCall(address, '0x06fdde03'),
      optionalCall(address, '0x313ce567'),
      optionalCall(address, '0x18160ddd'),
    ])

  if (parseQuantity(chainIdHex) !== ARC_CHAIN_ID) {
    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'wrong_network' }).catch(() => undefined)
    console.info(JSON.stringify({ event: 'pulse.token_scan.completed', requestId, outcome: 'wrong_network', durationMs: Date.now() - startedAt }))
    return response(requestId, { error: 'wrong_network' }, 502)
  }

    if (typeof code !== 'string') throw new Error('arc_rpc_invalid_code')
    if (code === '0x') {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'not_a_contract' }).catch(() => undefined)
      console.info(JSON.stringify({ event: 'pulse.token_scan.completed', requestId, outcome: 'not_a_contract', durationMs: Date.now() - startedAt }))
      return response(requestId, { error: 'not_a_contract' }, 422)
    }

    const latestBlock = parseQuantity(latestHex)
    if (latestBlock === null) throw new Error('arc_rpc_invalid_block')
    const fromBlock = Math.max(0, latestBlock - 499)
    const rawLogs = await rpc('eth_getLogs', [{
      address,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${latestBlock.toString(16)}`,
      topics: [TRANSFER_TOPIC],
    }])
    if (!Array.isArray(rawLogs)) throw new Error('arc_rpc_invalid_logs')

    const parsedEvents = rawLogs.map(parseTransferLog)
    const invalidEvents = parsedEvents.filter((event) => event === null).length
    const validEvents = parsedEvents
      .filter((event): event is TransferEvidence => event !== null)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
    const events = validEvents.length > MAX_ANALYZED_EVENTS ? validEvents.slice(-MAX_ANALYZED_EVENTS) : validEvents
    const decimalsHex = parseQuantity(decimalsResult)
    const decimals = decimalsHex !== null && decimalsHex <= 36 ? decimalsHex : null
    const totalSupplyRaw = parseUint(supplyResult)
    const totalSupply = totalSupplyRaw !== null && decimals !== null
      ? formatTokenAmount(totalSupplyRaw, decimals)
      : null
    const analysis = analyzeTokenTransfers({
      events,
      totalObserved: rawLogs.length,
      invalidEvents,
      fromBlock,
      toBlock: latestBlock,
      totalSupply: totalSupplyRaw,
      decimals,
    })

    const result = tokenScanSchema.parse({
      token: {
        address,
        name: decodeAbiString(typeof nameResult === 'string' ? nameResult : null) ?? 'Unnamed token',
        symbol: decodeAbiString(typeof symbolResult === 'string' ? symbolResult : null) ?? 'TOKEN',
        decimals,
        totalSupply,
      },
      network: { name: 'Arc Testnet', chainId: ARC_CHAIN_ID },
      ...analysis,
      scannedAt: new Date().toISOString(),
    })

    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'complete', {
      name: result.token.name,
      symbol: result.token.symbol,
      transferCount: result.metrics.transferCount,
      signalCount: result.assessment.signals.length,
      signalScore: result.assessment.score,
      signalLevel: result.assessment.level,
      fromBlock,
      toBlock: latestBlock,
    }).catch((error) => {
      console.warn(JSON.stringify({ event: 'pulse.scan_history.write_failed', route: 'token-scan', requestId, errorName: error instanceof Error ? error.name : 'unknown' }))
    })

    console.info(JSON.stringify({
      event: 'pulse.token_scan.completed',
      requestId,
      outcome: 'complete',
      durationMs: Date.now() - startedAt,
      transferEvents: result.metrics.transferCount,
      signalCount: result.assessment.signals.length,
      truncated: result.coverage.truncated,
    }))
    return response(requestId, result)
  } catch (error) {
    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'arc_rpc_unavailable' }).catch(() => undefined)
    console.error(JSON.stringify({
      event: 'pulse.token_scan.failed',
      requestId,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'unknown',
    }))
    return response(requestId, { error: 'arc_rpc_unavailable' }, 502)
  }
}
