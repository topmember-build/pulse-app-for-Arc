import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { z } from 'zod'

const querySchema = z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get('wallet')
  const parsed = querySchema.safeParse({ wallet })
  if (!parsed.success) return Response.json({ error: 'invalid_wallet' }, { status: 400 })
  const rows = await db.execute(sql`SELECT id, scan_type, target_address, network, status, summary, created_at FROM pulse_scan_history WHERE lower(wallet_address) = lower(${parsed.data.wallet}) ORDER BY created_at DESC LIMIT 25`)
  return Response.json({ scans: rows.rows })
}
