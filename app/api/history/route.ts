import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { getVerifiedPrivyWallet, WalletAuthError } from '@/lib/privy-auth'

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

  const walletAddress = new URL(request.url).searchParams.get('wallet') ?? ''
  let verifiedWallet: Awaited<ReturnType<typeof getVerifiedPrivyWallet>>
  try {
    verifiedWallet = await getVerifiedPrivyWallet(request, walletAddress)
  } catch (error) {
    const status = error instanceof WalletAuthError ? error.status : 503
    const code = error instanceof WalletAuthError ? error.code : 'auth_unavailable'
    return Response.json({ error: code }, { status, headers: responseHeaders })
  }

  try {
    const rows = await db.execute(sql`
      SELECT id, scan_type, target_address, network,
        CASE
          WHEN status = 'pending' AND created_at < now() - interval '10 minutes' THEN 'failed'
          ELSE status
        END AS status,
        summary, created_at
      FROM pulse_scan_history
      WHERE lower(wallet_address) = lower(${verifiedWallet.walletAddress})
        AND (privy_user_id = ${verifiedWallet.userId} OR privy_user_id IS NULL)
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
