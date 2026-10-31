'use client'

import { ArrowUpRight, Clock3, Database, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ScanHistoryEntry } from '@/lib/schemas'

function shortAddress(value: string) {
  return `${value.slice(0, 7)}…${value.slice(-5)}`
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function scanTitle(entry: ScanHistoryEntry) {
  const snapshot = entry.summary.snapshot as { token?: { name?: string | null; symbol?: string | null }; contract?: { token?: { name?: string | null; symbol?: string | null } } } | undefined
  const token = snapshot?.token ?? snapshot?.contract?.token
  if (token?.name || token?.symbol) return [token.name, token.symbol].filter(Boolean).join(' · ')
  if (typeof entry.summary.title === 'string') return entry.summary.title
  return entry.scanType === 'token' ? 'Token activity scan' : 'Contract profile scan'
}

export function ScanHistory({
  entries,
  loading,
  error,
  enabled,
  onOpen,
  onRefresh,
}: {
  entries: ScanHistoryEntry[]
  loading: boolean
  error: string
  enabled: boolean
  onOpen: (entry: ScanHistoryEntry) => void
  onRefresh: () => void
}) {
  return (
    <section className="rounded-2xl border border-pulse-line bg-pulse-panel/70" aria-labelledby="history-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-line p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-pulse-line bg-pulse-bg text-pulse-accent"><Database aria-hidden="true" className="size-4" /></span>
          <div><h2 id="history-heading" className="text-sm font-semibold">Your scan history</h2><p className="mt-1 text-xs text-pulse-muted">Private to your signed-in account</p></div>
        </div>
        {enabled ? <Button type="button" variant="ghost" size="sm" onClick={onRefresh}><RefreshCw data-icon="inline-start" />Refresh</Button> : null}
      </div>
      {!enabled ? (
        <div className="flex flex-col items-center px-4 py-9 text-center">
          <Clock3 aria-hidden="true" className="size-5 text-pulse-muted" />
          <p className="mt-3 text-sm font-medium">Connect a wallet to see saved scans</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-pulse-muted">Scan history is stored in the database and scoped to your verified Privy account and wallet.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-9 text-sm text-pulse-muted" role="status"><RefreshCw aria-hidden="true" className="size-4 animate-spin" />Loading saved scans</div>
      ) : error ? (
        <div className="flex items-center gap-3 px-4 py-8 text-sm text-rose-100" role="alert"><XCircle aria-hidden="true" className="size-4 shrink-0" />{error}</div>
      ) : entries.length ? (
        <ul className="divide-y divide-pulse-line/80">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => onOpen(entry)} className="group flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-pulse-bg/70 sm:px-5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl border ${entry.status === 'complete' ? 'border-emerald-300/15 bg-emerald-300/5 text-emerald-100' : 'border-rose-300/15 bg-rose-300/5 text-rose-100'}`} aria-hidden="true">{entry.status === 'complete' ? <ArrowUpRight className="size-4" /> : entry.status === 'pending' ? <Clock3 className="size-4" /> : <XCircle className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="truncate text-sm font-medium text-pulse-bone">{scanTitle(entry)}</span><span className="rounded-md border border-pulse-line px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-pulse-muted">{entry.scanType}</span></span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-pulse-muted"><span className="font-mono">{shortAddress(entry.targetAddress)}</span><span>{entry.network}</span><span>{dateLabel(entry.createdAt)}</span></span>
                </span>
                <span className="hidden text-xs text-pulse-muted sm:inline">{entry.status === 'complete' ? 'View snapshot' : entry.status === 'pending' ? 'Pending' : 'Failed'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center px-4 py-9 text-center">
          <Database aria-hidden="true" className="size-5 text-pulse-muted" />
          <p className="mt-3 text-sm font-medium">No saved scans yet</p>
          <p className="mt-1 text-xs text-pulse-muted">Completed scans will appear here as private evidence snapshots.</p>
        </div>
      )}
    </section>
  )
}
