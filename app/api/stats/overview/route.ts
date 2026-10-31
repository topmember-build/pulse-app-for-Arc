import { randomUUID } from 'node:crypto'
import { checkRateLimit } from '@/lib/rate-limit'
import { getOverviewStats } from '@/lib/stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public aggregate counters. Contains no addresses or identities.
export async function GET(request: Request) {
  const headers = { 'cache-control': 'public, max-age=30', 'x-request-id': randomUUID() }
  try {
    const limit = await checkRateLimit(request, 'overview-stats', 60, 60)
    if (!limit.allowed) return Response.json({ error: 'rate_limited', retryAfter: limit.retryAfter }, { status: 429, headers: { ...headers, 'retry-after': String(limit.retryAfter) } })
    return Response.json(await getOverviewStats(7), { headers })
  } catch {
    return Response.json({ error: 'stats_unavailable' }, { status: 503, headers: { ...headers, 'cache-control': 'no-store' } })
  }
}
