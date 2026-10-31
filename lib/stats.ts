import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

type Row = Record<string, unknown>
const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows as Row[]
const num = (value: unknown) => Number(value ?? 0)

export type DayPoint = { day: string; total: number; deep: number }
export type Slice = { label: string; count: number }

export type UserStats = {
  totals: { scans: number; completed: number; failed: number; deep: number; basic: number; token: number; contract: number }
  spend: { payments: number; usdcUnits: string }
  daily: DayPoint[]
  tokenRisk: Slice[]
  contractProxy: Slice[]
  contractOwner: Slice[]
  deepFlagged: { deepScans: number; withReviewControls: number }
  topTargets: Array<{ address: string; scanType: 'token' | 'contract'; count: number; lastScanned: string }>
}

// Fills every one of the last `days` days so charts show zero-scan days instead of gaps.
function fillDays(data: Row[], days: number): DayPoint[] {
  const byDay = new Map(data.map((row) => [String(row.day), { total: num(row.total), deep: num(row.deep) }]))
  const out: DayPoint[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
    out.push({ day, total: byDay.get(day)?.total ?? 0, deep: byDay.get(day)?.deep ?? 0 })
  }
  return out
}

export async function getUserStats(privyUserId: string): Promise<UserStats> {
  const owner = sql`privy_user_id = ${privyUserId} AND status IN ('complete', 'failed')`
  const hasDeep = sql`(summary->'snapshot'->'deep') IS NOT NULL`

  const [totals, daily, tokenRisk, proxy, ownerStatus, deepFlagged, top, spend] = await Promise.all([
    rows(sql`SELECT scan_type, status, (${hasDeep}) AS deep, count(*)::int AS n FROM pulse_scan_history WHERE ${owner} GROUP BY 1, 2, 3`),
    rows(sql`SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS total, count(*) FILTER (WHERE ${hasDeep})::int AS deep
             FROM pulse_scan_history WHERE ${owner} AND created_at > now() - interval '14 days' GROUP BY 1`),
    rows(sql`SELECT summary->'snapshot'->'assessment'->>'level' AS label, count(*)::int AS n FROM pulse_scan_history WHERE ${owner} AND scan_type = 'token' AND status = 'complete' AND summary->'snapshot'->'assessment' IS NOT NULL GROUP BY 1`),
    rows(sql`SELECT summary->'snapshot'->'contract'->'proxy'->>'kind' AS label, count(*)::int AS n FROM pulse_scan_history WHERE ${owner} AND scan_type = 'contract' AND status = 'complete' AND summary->'snapshot'->'contract' IS NOT NULL GROUP BY 1`),
    rows(sql`SELECT summary->'snapshot'->'contract'->>'ownerStatus' AS label, count(*)::int AS n FROM pulse_scan_history WHERE ${owner} AND scan_type = 'contract' AND status = 'complete' AND summary->'snapshot'->'contract' IS NOT NULL GROUP BY 1`),
    rows(sql`SELECT count(*)::int AS deep_scans,
                    count(*) FILTER (WHERE jsonb_path_exists(summary->'snapshot'->'deep'->'capabilities', '$[*] ? (@.severity == "review")'))::int AS flagged
             FROM pulse_scan_history WHERE ${owner} AND status = 'complete' AND ${hasDeep}`),
    rows(sql`SELECT target_address, scan_type, count(*)::int AS n, max(created_at) AS last FROM pulse_scan_history WHERE ${owner} AND status = 'complete' GROUP BY 1, 2 ORDER BY n DESC, last DESC LIMIT 5`),
    rows(sql`SELECT count(*)::int AS payments, coalesce(sum(amount_units::numeric), 0)::text AS units FROM pulse_payments WHERE privy_user_id = ${privyUserId} AND status = 'consumed'`),
  ])

  const sum = (predicate: (row: Row) => boolean) => totals.filter(predicate).reduce((acc, row) => acc + num(row.n), 0)
  const slices = (data: Row[]): Slice[] => data.filter((row) => row.label).map((row) => ({ label: String(row.label), count: num(row.n) })).sort((a, b) => b.count - a.count)

  return {
    totals: {
      scans: sum(() => true),
      completed: sum((row) => row.status === 'complete'),
      failed: sum((row) => row.status === 'failed'),
      deep: sum((row) => row.deep === true),
      basic: sum((row) => row.deep !== true),
      token: sum((row) => row.scan_type === 'token'),
      contract: sum((row) => row.scan_type === 'contract'),
    },
    spend: { payments: num(spend[0]?.payments), usdcUnits: String(spend[0]?.units ?? '0').split('.')[0] },
    daily: fillDays(daily, 14),
    tokenRisk: slices(tokenRisk),
    contractProxy: slices(proxy),
    contractOwner: slices(ownerStatus),
    deepFlagged: { deepScans: num(deepFlagged[0]?.deep_scans), withReviewControls: num(deepFlagged[0]?.flagged) },
    topTargets: top.map((row) => ({
      address: String(row.target_address),
      scanType: row.scan_type === 'contract' ? 'contract' as const : 'token' as const,
      count: num(row.n),
      lastScanned: new Date(String(row.last)).toISOString(),
    })),
  }
}

export type OverviewStats = {
  windowDays: number
  total: number
  token: number
  contract: number
  deep: number
  signedIn: number
  anonymous: number
  succeeded: number
  daily: DayPoint[]
}

export async function getOverviewStats(windowDays = 7): Promise<OverviewStats> {
  const [totals] = await rows(sql`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE scan_type = 'token')::int AS token,
      count(*) FILTER (WHERE scan_type = 'contract')::int AS contract,
      count(*) FILTER (WHERE deep)::int AS deep,
      count(*) FILTER (WHERE signed_in)::int AS signed_in,
      count(*) FILTER (WHERE outcome = 'complete')::int AS succeeded
    FROM pulse_scan_events WHERE created_at > now() - (${windowDays} * interval '1 day')`)
  const daily = await rows(sql`SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, count(*)::int AS total, count(*) FILTER (WHERE deep)::int AS deep
    FROM pulse_scan_events WHERE created_at > now() - (${windowDays} * interval '1 day') GROUP BY 1`)
  const total = num(totals?.total)
  return {
    windowDays,
    total,
    token: num(totals?.token),
    contract: num(totals?.contract),
    deep: num(totals?.deep),
    signedIn: num(totals?.signed_in),
    anonymous: total - num(totals?.signed_in),
    succeeded: num(totals?.succeeded),
    daily: fillDays(daily, windowDays),
  }
}
