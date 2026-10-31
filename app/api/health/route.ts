import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ARC_CHAIN_ID } from '@/lib/arc-network'
import { ARC_RPC_URL } from '@/lib/arc-rpc'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function checkArcRpc() {
  const response = await fetch(ARC_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) return 'unavailable'
  const payload = await response.json() as { result?: unknown }
  return typeof payload.result === 'string' && Number.parseInt(payload.result, 16) === ARC_CHAIN_ID
    ? 'ok'
    : 'wrong_network'
}

let cached: { at: number; body: unknown; status: number } | null = null

export async function GET(request: Request) {
  const requestId = randomUUID()
  const startedAt = Date.now()
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId }

  // Anyone can call this, and each call touches the database and the RPC, so it is throttled and
  // answers from a 10 second cache.
  try {
    const limit = await checkRateLimit(request, 'health', 30, 60)
    if (!limit.allowed) return Response.json({ error: 'rate_limited', retryAfter: limit.retryAfter }, { status: 429, headers: { ...headers, 'retry-after': String(limit.retryAfter) } })
  } catch {
    // If the limiter itself is down, still report that the database is unavailable below.
  }
  if (cached && Date.now() - cached.at < 10_000) return Response.json(cached.body, { status: cached.status, headers })
  const [database, arcRpc] = await Promise.all([
    db.execute(sql`SELECT 1`).then(() => 'ok' as const).catch(() => 'unavailable' as const),
    checkArcRpc().catch(() => 'unavailable' as const),
  ])
  const healthy = database === 'ok' && arcRpc === 'ok'
  const status = healthy ? 200 : 503
  console.info(JSON.stringify({
    event: 'pulse.health_check',
    requestId,
    status,
    durationMs: Date.now() - startedAt,
    database,
    arcRpc,
  }))

  const body = {
    status: healthy ? 'ok' : 'degraded',
    services: { database, arcRpc },
    checkedAt: new Date().toISOString(),
    requestId,
  }
  cached = { at: Date.now(), body, status }
  return Response.json(body, { status, headers })
}
