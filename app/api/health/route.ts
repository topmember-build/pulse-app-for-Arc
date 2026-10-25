import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ARC_RPC_URL = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID = 5042002

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

export async function GET() {
  const requestId = randomUUID()
  const startedAt = Date.now()
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

  return Response.json({
    status: healthy ? 'ok' : 'degraded',
    services: { database, arcRpc },
    checkedAt: new Date().toISOString(),
    requestId,
  }, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  })
}
