import { db } from '@/lib/db'
import { pulseScanEvents } from '@/lib/db-schema'

// Best-effort counter for aggregate activity. Never stores an address, wallet, user id or IP.
export async function recordScanEvent(input: { scanType: 'token' | 'contract'; deep: boolean; outcome: 'complete' | 'failed'; signedIn: boolean }) {
  try {
    await db.insert(pulseScanEvents).values(input)
  } catch {
    // Analytics must never break a scan.
  }
}
