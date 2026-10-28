import { createHash, createHmac } from 'node:crypto'
import { lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pulseRateLimits } from '@/lib/db-schema'

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
      await db.delete(pulseRateLimits).where(lt(
        pulseRateLimits.windowStartedAt,
        sql`now() - interval '24 hours'`,
      ))
    } catch {
      // Cleanup is best effort; the atomic counter below remains authoritative.
    }
  }

  const [row] = await db
    .insert(pulseRateLimits)
    .values({ identityHash, bucket })
    .onConflictDoUpdate({
      target: [pulseRateLimits.identityHash, pulseRateLimits.bucket],
      set: {
        requestCount: sql`CASE
          WHEN ${pulseRateLimits.windowStartedAt} <= now() - (${windowSeconds} * interval '1 second') THEN 1
          ELSE ${pulseRateLimits.requestCount} + 1
        END`,
        windowStartedAt: sql`CASE
          WHEN ${pulseRateLimits.windowStartedAt} <= now() - (${windowSeconds} * interval '1 second') THEN now()
          ELSE ${pulseRateLimits.windowStartedAt}
        END`,
      },
    })
    .returning({
      requestCount: pulseRateLimits.requestCount,
      resetAt: sql<Date>`${pulseRateLimits.windowStartedAt} + (${windowSeconds} * interval '1 second')`.as('reset_at'),
    })

  if (!row) throw new Error('rate_limit_counter_unavailable')

  const resetAt = row.resetAt instanceof Date ? row.resetAt.getTime() : Date.parse(String(row.resetAt))
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return { allowed: row.requestCount <= limit, retryAfter }
}
