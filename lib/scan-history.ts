import { desc, eq, sql } from 'drizzle-orm'
import { ARC_NETWORK_NAME } from '@/lib/arc-network'
import { db } from '@/lib/db'
import { pulseScanHistory } from '@/lib/db-schema'

export type PulseScanType = 'token' | 'contract'
export type PulseScanStatus = 'complete' | 'failed'

export async function saveScanHistory(input: {
  walletAddress: string | null
  privyUserId: string
  scanType: PulseScanType
  targetAddress: string
  status: PulseScanStatus
  summary: Record<string, unknown>
}) {
  await db.insert(pulseScanHistory).values({
    walletAddress: input.walletAddress ? input.walletAddress.toLowerCase() : null,
    privyUserId: input.privyUserId,
    scanType: input.scanType,
    targetAddress: input.targetAddress.toLowerCase(),
    network: ARC_NETWORK_NAME,
    status: input.status,
    summary: input.summary,
  })
}

export async function listScanHistory(privyUserId: string) {
  return db
    .select({
      id: pulseScanHistory.id,
      scanType: pulseScanHistory.scanType,
      targetAddress: pulseScanHistory.targetAddress,
      network: pulseScanHistory.network,
      status: sql<string>`CASE
        WHEN ${pulseScanHistory.status} = 'pending'
          AND ${pulseScanHistory.createdAt} < now() - interval '10 minutes' THEN 'failed'
        ELSE ${pulseScanHistory.status}
      END`.as('status'),
      summary: pulseScanHistory.summary,
      createdAt: pulseScanHistory.createdAt,
    })
    .from(pulseScanHistory)
    .where(eq(pulseScanHistory.privyUserId, privyUserId))
    .orderBy(desc(pulseScanHistory.createdAt))
    .limit(25)
}
