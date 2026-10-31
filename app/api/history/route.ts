import { randomUUID } from 'node:crypto'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPrivyCaller, WalletAuthError } from '@/lib/privy-auth'
import { listScanHistory } from '@/lib/scan-history'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestId = randomUUID()
  const startedAt = Date.now()
  const responseHeaders = { 'cache-control': 'no-store', 'x-request-id': requestId }

  try {
    const rateLimit = await checkRateLimit(request, 'scan-history', 60, 60)
    if (!rateLimit.allowed) {
      console.info(JSON.stringify({ event: 'pulse.api.rate_limited', route: 'scan-history', requestId }))
      return Response.json({ error: 'rate_limited', retryAfter: rateLimit.retryAfter }, {
        status: 429,
        headers: { ...responseHeaders, 'retry-after': String(rateLimit.retryAfter) },
      })
    }
  } catch {
    console.error(JSON.stringify({ event: 'pulse.api.rate_limit_unavailable', route: 'scan-history', requestId }))
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers: responseHeaders })
  }

  let verifiedWallet: Awaited<ReturnType<typeof getPrivyCaller>>
  try {
    verifiedWallet = await getPrivyCaller(request)
  } catch (error) {
    const status = error instanceof WalletAuthError ? error.status : 503
    const code = error instanceof WalletAuthError ? error.code : 'auth_unavailable'
    return Response.json({ error: code }, { status, headers: responseHeaders })
  }

  try {
    const scans = await listScanHistory(verifiedWallet.userId)
    console.info(JSON.stringify({ event: 'pulse.scan_history.read', requestId, durationMs: Date.now() - startedAt, resultCount: scans.length }))
    return Response.json({ scans }, { headers: responseHeaders })
  } catch (error) {
    console.error(JSON.stringify({ event: 'pulse.scan_history.failed', requestId, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : 'unknown' }))
    return Response.json({ error: 'history_unavailable' }, { status: 503, headers: responseHeaders })
  }
}
