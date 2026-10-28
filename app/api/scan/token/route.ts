import { randomUUID } from 'node:crypto'
import { checkRateLimit } from '@/lib/rate-limit'
import { getVerifiedPrivyWallet, WalletAuthError } from '@/lib/privy-auth'
import { analyzeTokenTransfers, formatTokenAmount, type TransferEvidence } from '@/lib/token-analysis'
import { saveScanHistory } from '@/lib/scan-history'
import { tokenScanRequestSchema, tokenScanSchema } from '@/lib/schemas'
import { ARC_CHAIN_ID, ARC_NETWORK_NAME } from '@/lib/arc-network'
import { callArcRpc, decodeAbiString, optionalEthCall, parseRpcBigInt, parseRpcQuantity } from '@/lib/arc-rpc'

export const runtime = 'nodejs'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const MAX_ANALYZED_EVENTS = 10_000

function response(requestId: string, body: unknown, status = 200, additionalHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId, ...additionalHeaders },
  })
}

function parseTransferLog(value: unknown): TransferEvidence | null {
  if (!value || typeof value !== 'object') return null
  const log = value as {
    topics?: unknown[]
    data?: unknown
    blockNumber?: unknown
    transactionHash?: unknown
    logIndex?: unknown
  }
  const topics = log.topics
  if (!Array.isArray(topics) || topics.length < 3 || typeof topics[0] !== 'string' || topics[0].toLowerCase() !== TRANSFER_TOPIC) return null
  if (typeof topics[1] !== 'string' || typeof topics[2] !== 'string' || typeof log.data !== 'string') return null
  if (!/^0x[0-9a-f]{64}$/i.test(topics[1]) || !/^0x[0-9a-f]{64}$/i.test(topics[2])) return null
  if (!/^0x[0-9a-f]{64}$/i.test(log.data)) return null
  if (typeof log.transactionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash)) return null

  const blockNumber = parseRpcQuantity(log.blockNumber)
  const logIndex = parseRpcQuantity(log.logIndex)
  const amount = parseRpcBigInt(log.data)
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

async function saveHistory(
  userId: string,
  walletAddress: string,
  address: string,
  status: 'complete' | 'failed',
  summary: Record<string, unknown>,
) {
  await saveScanHistory({
    walletAddress,
    privyUserId: userId,
    scanType: 'token',
    targetAddress: address,
    status,
    summary,
  })
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
    const [chainIdHex, latestHex] = await Promise.all([
      callArcRpc<unknown>('eth_chainId', []),
      callArcRpc<unknown>('eth_blockNumber', []),
    ])

    if (parseRpcQuantity(chainIdHex) !== ARC_CHAIN_ID) {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'wrong_network' }).catch(() => undefined)
      console.info(JSON.stringify({ event: 'pulse.token_scan.completed', requestId, outcome: 'wrong_network', durationMs: Date.now() - startedAt }))
      return response(requestId, { error: 'wrong_network' }, 502)
    }

    const latestBlock = parseRpcQuantity(latestHex)
    if (latestBlock === null) throw new Error('arc_rpc_invalid_block')
    const blockTag = `0x${latestBlock.toString(16)}`
    const [code, symbolResult, nameResult, decimalsResult, supplyResult] = await Promise.all([
      callArcRpc<unknown>('eth_getCode', [address, blockTag]),
      optionalEthCall(address, '0x95d89b41', blockTag),
      optionalEthCall(address, '0x06fdde03', blockTag),
      optionalEthCall(address, '0x313ce567', blockTag),
      optionalEthCall(address, '0x18160ddd', blockTag),
    ])

    if (typeof code !== 'string') throw new Error('arc_rpc_invalid_code')
    if (code === '0x') {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'not_a_contract' }).catch(() => undefined)
      console.info(JSON.stringify({ event: 'pulse.token_scan.completed', requestId, outcome: 'not_a_contract', durationMs: Date.now() - startedAt }))
      return response(requestId, { error: 'not_a_contract' }, 422)
    }

    const fromBlock = Math.max(0, latestBlock - 499)
    const rawLogs = await callArcRpc<unknown>('eth_getLogs', [{
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
    const decimalsValue = parseRpcQuantity(decimalsResult)
    const decimals = decimalsValue !== null && decimalsValue <= 36 ? decimalsValue : null
    const totalSupplyRaw = parseRpcBigInt(supplyResult)
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

    const resultCore = tokenScanSchema.omit({ historySaved: true }).parse({
      token: {
        address,
        name: decodeAbiString(typeof nameResult === 'string' ? nameResult : null),
        symbol: decodeAbiString(typeof symbolResult === 'string' ? symbolResult : null),
        decimals,
        totalSupply,
      },
      network: { name: ARC_NETWORK_NAME, chainId: ARC_CHAIN_ID },
      ...analysis,
      scannedAt: new Date().toISOString(),
    })

    let historySaved = false
    try {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'complete', {
        title: resultCore.token.name ?? resultCore.token.symbol ?? 'Token activity scan',
        subtitle: `${resultCore.metrics.transferCount} events · ${resultCore.assessment.label}`,
        snapshot: { ...resultCore, historySaved: true },
      })
      historySaved = true
    } catch (error) {
      console.warn(JSON.stringify({ event: 'pulse.scan_history.write_failed', route: 'token-scan', requestId, errorName: error instanceof Error ? error.name : 'unknown' }))
    }

    const result = tokenScanSchema.parse({ ...resultCore, historySaved })
    console.info(JSON.stringify({
      event: 'pulse.token_scan.completed',
      requestId,
      outcome: 'complete',
      durationMs: Date.now() - startedAt,
      transferEvents: result.metrics.transferCount,
      signalCount: result.assessment.signals.length,
      truncated: result.coverage.truncated,
      historySaved,
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
