import { randomUUID } from 'node:crypto'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPrivyCaller, WalletAuthError } from '@/lib/privy-auth'
import { getUserStats } from '@/lib/stats'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestId = randomUUID()
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId }
  try {
    const limit = await checkRateLimit(request, 'user-stats', 30, 60)
    if (!limit.allowed) return Response.json({ error: 'rate_limited', retryAfter: limit.retryAfter }, { status: 429, headers: { ...headers, 'retry-after': String(limit.retryAfter) } })
  } catch {
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers })
  }

  let wallet: Awaited<ReturnType<typeof getPrivyCaller>>
  try {
    wallet = await getPrivyCaller(request)
  } catch (error) {
    const status = error instanceof WalletAuthError ? error.status : 503
    return Response.json({ error: error instanceof WalletAuthError ? error.code : 'auth_unavailable' }, { status, headers })
  }

  try {
    return Response.json(await getUserStats(wallet.userId), { headers })
  } catch (error) {
    console.error(JSON.stringify({ event: 'pulse.stats.failed', requestId, errorName: error instanceof Error ? error.name : 'unknown' }))
    return Response.json({ error: 'stats_unavailable' }, { status: 503, headers })
  }
}
