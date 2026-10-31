'use client'

import useSWR from 'swr'
import { BarChart3, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DayPoint, OverviewStats, Slice, UserStats } from '@/lib/stats'

const LABELS: Record<string, string> = {
  insufficient: 'Not enough data',
  low: 'Low signals',
  review: 'Worth reviewing',
  elevated: 'Elevated signals',
  eip1967: 'EIP-1967 proxy',
  eip1167: 'EIP-1167 clone',
  none_detected: 'No proxy detected',
  unknown: 'Unknown',
  active: 'Owner set',
  renounced: 'Renounced',
  not_exposed: 'No owner getter',
}
const label = (key: string) => LABELS[key] ?? key

function usdc(unitsText: string) {
  const units = BigInt(unitsText || '0')
  const whole = units / BigInt(1_000_000)
  const fraction = (units % BigInt(1_000_000)).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function Stat({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
      <p className="text-xs text-pulse-muted">{title}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {note ? <p className="mt-1 text-xs text-pulse-muted">{note}</p> : null}
    </div>
  )
}

function Bars({ title, slices, empty }: { title: string; slices: Slice[]; empty: string }) {
  const total = slices.reduce((sum, item) => sum + item.count, 0)
  return (
    <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
      <p className="text-xs font-semibold">{title}</p>
      {total === 0 ? <p className="mt-3 text-xs text-pulse-muted">{empty}</p> : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {slices.map((item) => (
            <li key={item.label}>
              <div className="flex items-center justify-between gap-3 text-xs"><span>{label(item.label)}</span><span className="tabular-nums text-pulse-muted">{item.count} · {Math.round((item.count / total) * 100)}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pulse-line"><div className="h-full rounded-full bg-pulse-accent" style={{ width: `${(item.count / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DayChart({ days, caption }: { days: DayPoint[]; caption: string }) {
  const max = Math.max(1, ...days.map((day) => day.total))
  const total = days.reduce((sum, day) => sum + day.total, 0)
  return (
    <figure className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
      <figcaption className="flex items-center justify-between text-xs"><span className="font-semibold">{caption}</span><span className="tabular-nums text-pulse-muted">{total} total</span></figcaption>
      <div className="mt-4 flex h-28 items-end gap-1" role="img" aria-label={`${caption}: ${days.map((day) => `${day.day} ${day.total}`).join(', ')}`}>
        {days.map((day) => (
          <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${day.day}: ${day.total} scans, ${day.deep} deep`}>
            <div className="w-full rounded-t bg-pulse-accent/35" style={{ height: `${(day.total / max) * 100}%`, minHeight: day.total > 0 ? 3 : 0 }}>
              {day.deep > 0 ? <div className="w-full rounded-t bg-pulse-accent" style={{ height: `${(day.deep / day.total) * 100}%` }} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-pulse-muted"><span>{days[0]?.day.slice(5)}</span><span>{days[days.length - 1]?.day.slice(5)}</span></div>
      <p className="mt-2 flex items-center gap-3 text-[10px] text-pulse-muted"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-pulse-accent/35" />All scans</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-pulse-accent" />Deep scans</span></p>
    </figure>
  )
}

export function ScanStats({
  enabled,
  userKey,
  getAccessToken,
  onSelectTarget,
}: {
  enabled: boolean
  userKey?: string
  getAccessToken: () => Promise<string | null>
  onSelectTarget: (address: string, scanType: 'token' | 'contract') => void
}) {
  const statsKey = enabled && userKey ? ['/api/stats', userKey] as const : null
  const { data, error, isLoading, mutate } = useSWR<UserStats>(statsKey, async ([path]: readonly [string, string]) => {
    const token = await getAccessToken()
    if (!token) throw new Error('auth')
    const response = await fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!response.ok) throw new Error('stats')
    return await response.json() as UserStats
  }, { revalidateOnFocus: true, dedupingInterval: 15_000 })
  const { data: overview } = useSWR<OverviewStats>('/api/stats/overview', async (path: string) => {
    const response = await fetch(path, { cache: 'no-store' })
    if (!response.ok) throw new Error('overview')
    return await response.json() as OverviewStats
  }, { refreshInterval: 60_000, revalidateOnFocus: false })

  return (
    <section className="rounded-2xl border border-pulse-line bg-pulse-panel/70" aria-labelledby="stats-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-line p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-muted">Analytics</p>
          <h2 id="stats-heading" className="mt-1.5 flex items-center gap-2 text-lg font-semibold tracking-tight"><BarChart3 aria-hidden="true" className="size-4 text-pulse-accent" />Your scan results</h2>
        </div>
        {enabled ? <Button type="button" variant="ghost" size="sm" onClick={() => { void mutate() }} disabled={isLoading}><RefreshCw data-icon="inline-start" className={isLoading ? 'animate-spin' : ''} />Refresh</Button> : null}
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {!enabled ? (
          <p className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-4 text-sm text-pulse-muted">Connect a wallet to see a breakdown of your own scans: totals, risk signals, what you scanned most, and what deep scans cost you.</p>
        ) : error ? (
          <p className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100" role="alert">Your analytics could not be loaded. Try Refresh in a moment.</p>
        ) : !data ? (
          <p className="text-sm text-pulse-muted" role="status">Loading your analytics…</p>
        ) : data.totals.scans === 0 ? (
          <p className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-4 text-sm text-pulse-muted">No saved scans yet. Run a scan while signed in and the breakdown appears here.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat title="Total scans" value={String(data.totals.scans)} note={`${data.totals.token} token · ${data.totals.contract} contract`} />
              <Stat title="Completed" value={String(data.totals.completed)} note={`${data.totals.failed} failed · ${Math.round((data.totals.completed / data.totals.scans) * 100)}% success`} />
              <Stat title="Deep scans" value={String(data.totals.deep)} note={`${data.totals.basic} basic`} />
              <Stat title="Spent on deep scans" value={`${usdc(data.spend.usdcUnits)} USDC`} note={`${data.spend.payments} payment${data.spend.payments === 1 ? '' : 's'} used`} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <DayChart days={data.daily} caption="Scans per day, last 14 days" />
              <Bars title="Token activity signals" slices={data.tokenRisk} empty="Complete a token scan to see how your results split." />
              <Bars title="Contract proxy patterns" slices={data.contractProxy} empty="Complete a contract scan to see proxy patterns." />
              <Bars title="Contract ownership" slices={data.contractOwner} empty="Complete a contract scan to see ownership." />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
                <p className="text-xs font-semibold">Deep scan findings</p>
                {data.deepFlagged.deepScans === 0 ? <p className="mt-3 text-xs text-pulse-muted">No deep scans yet.</p> : (
                  <p className="mt-3 text-sm leading-6"><span className="text-2xl font-semibold tabular-nums">{data.deepFlagged.withReviewControls}</span> of {data.deepFlagged.deepScans} deep scan{data.deepFlagged.deepScans === 1 ? '' : 's'} found controls worth reviewing, such as mint, pause, blacklist or upgrade functions.</p>
                )}
              </div>
              <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
                <p className="text-xs font-semibold">Most scanned</p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {data.topTargets.map((item) => (
                    <li key={`${item.scanType}-${item.address}`}>
                      <button type="button" onClick={() => onSelectTarget(item.address, item.scanType)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-xs transition hover:bg-pulse-line/40">
                        <span className="font-mono">{item.address.slice(0, 8)}…{item.address.slice(-6)}</span>
                        <span className="shrink-0 text-pulse-muted">{item.scanType} · {item.count}×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}

        {overview && overview.total > 0 ? (
          <div className="rounded-xl border border-pulse-line bg-pulse-bg/40 p-3.5">
            <p className="text-xs font-semibold">Pulse activity, last {overview.windowDays} days</p>
            <p className="mt-2 text-xs leading-5 text-pulse-muted">
              <span className="tabular-nums text-pulse-bone">{overview.total}</span> scans ({overview.token} token, {overview.contract} contract), <span className="tabular-nums text-pulse-bone">{overview.deep}</span> deep, {overview.anonymous} without an account, {overview.signedIn} signed in. Counts only: no addresses or identities are stored here.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
