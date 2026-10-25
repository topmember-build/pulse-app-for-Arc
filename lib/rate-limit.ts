import { createHash, createHmac } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export async function checkRateLimit(request: Request, bucket: string, limit: number, windowSeconds: number) {
  const clientAddress = request.headers.get('x-real-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const privacyKey = process.env.PRIVY_APP_SECRET
  const identityHash = privacyKey
    ? createHmac('sha256', privacyKey).update(clientAddress).digest('hex')
    : createHash('sha256').update(clientAddress).digest('hex')

  if (Math.random() < 0.01) {
    try {
      await db.execute(sql`
        DELETE FROM pulse_rate_limits
        WHERE (identity_hash, bucket) IN (
          SELECT identity_hash, bucket
          FROM pulse_rate_limits
          WHERE window_started_at < now() - interval '24 hours'
          LIMIT 100
        )
      `)
    } catch {
      // Cleanup is best effort; the atomic counter below remains authoritative.
    }
  }

  const result = await db.execute(sql`
    INSERT INTO pulse_rate_limits (identity_hash, bucket, window_started_at, request_count)
    VALUES (${identityHash}, ${bucket}, now(), 1)
    ON CONFLICT (identity_hash, bucket) DO UPDATE SET
      request_count = CASE
        WHEN pulse_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second') THEN 1
        ELSE pulse_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN pulse_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second') THEN now()
        ELSE pulse_rate_limits.window_started_at
      END
    RETURNING request_count, window_started_at + (${windowSeconds} * interval '1 second') AS reset_at
  `)

  const row = result.rows[0] as { request_count: number | string; reset_at: Date | string } | undefined
  if (!row) throw new Error('rate_limit_counter_unavailable')

  const resetAt = row.reset_at instanceof Date ? row.reset_at.getTime() : Date.parse(row.reset_at)
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return { allowed: Number(row.request_count) <= limit, retryAfter }
}
