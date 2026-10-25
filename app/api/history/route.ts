import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

export const runtime = 'nodejs'

const querySchema = z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })

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

  const wallet = new URL(request.url).searchParams.get('wallet')
  const parsed = querySchema.safeParse({ wallet })
  if (!parsed.success) return Response.json({ error: 'invalid_wallet' }, { status: 400, headers: responseHeaders })

  try {
    const rows = await db.execute(sql`
      SELECT id, scan_type, target_address, network, status, summary, created_at
      FROM pulse_scan_history
      WHERE lower(wallet_address) = lower(${parsed.data.wallet})
      ORDER BY created_at DESC
      LIMIT 25
    `)
    console.info(JSON.stringify({ event: 'pulse.scan_history.read', requestId, durationMs: Date.now() - startedAt, resultCount: rows.rows.length }))
    return Response.json({ scans: rows.rows }, { headers: responseHeaders })
  } catch (error) {
    console.error(JSON.stringify({ event: 'pulse.scan_history.failed', requestId, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : 'unknown' }))
    return Response.json({ error: 'history_unavailable' }, { status: 503, headers: responseHeaders })
  }
}
