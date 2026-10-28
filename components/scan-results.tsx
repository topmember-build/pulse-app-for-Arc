'use client'

import { ArrowUpRight, CheckCircle2, CircleAlert, ExternalLink, FileCode2, Info, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ContractScan, TokenScan } from '@/lib/schemas'

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function number(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function ExplorerLink({ address, type = 'address', children }: { address: string; type?: 'address' | 'tx'; children: React.ReactNode }) {
  const href = `https://explorer.arc.io/${type}/${address}`
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-pulse-muted underline decoration-pulse-line underline-offset-4 transition hover:text-pulse-bone">{children}<ExternalLink aria-hidden="true" className="size-3 shrink-0" /></a>
}

function SnapshotNotice({ historical, historySaved }: { historical: boolean; historySaved: boolean }) {
  if (historical) return <div className="rounded-xl border border-sky-200/15 bg-sky-200/5 px-4 py-3 text-sm text-sky-100" role="status">Saved evidence snapshot. Values describe the chain state at the scan time, not a refreshed live read.</div>
  if (!historySaved) return <div className="rounded-xl border border-amber-200/20 bg-amber-200/5 px-4 py-3 text-sm text-amber-100" role="status">The live result was returned, but the history database did not save this scan.</div>
  return null
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-pulse-line bg-pulse-bg/70 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-pulse-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tracking-tight text-pulse-bone">{value}</p>
      {note ? <p className="mt-1 text-xs leading-5 text-pulse-muted">{note}</p> : null}
    </div>
  )
}

const severityClass = {
  high: 'border-rose-300/20 bg-rose-300/5 text-rose-100',
  medium: 'border-amber-200/20 bg-amber-200/5 text-amber-100',
  info: 'border-sky-200/15 bg-sky-200/5 text-sky-100',
}

export function TokenScanResults({ result, historical, onScanContract }: { result: TokenScan; historical: boolean; onScanContract: () => void }) {
  const { token, network, coverage, metrics, assessment, transfers, scannedAt, historySaved } = result
  const symbolLabel = token.symbol ?? 'Symbol not returned'

  return (
    <section className="flex flex-col gap-5" aria-labelledby="token-result-title">
      <SnapshotNotice historical={historical} historySaved={historySaved} />
      <div className="overflow-hidden rounded-2xl border border-pulse-line bg-pulse-panel">
        <div className="border-b border-pulse-line p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-accent">Token activity · {network.name}</p>
              <h2 id="token-result-title" className="mt-2 break-words text-2xl font-semibold tracking-tight">{token.name ?? 'Token contract'}</h2>
              <p className="mt-1 text-sm text-pulse-muted">{symbolLabel} · {token.decimals === null ? 'Decimals not returned' : `${token.decimals} decimals`}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <ExplorerLink address={token.address}>{shortAddress(token.address)}</ExplorerLink>
                <span className="text-xs text-pulse-muted">Chain ID {network.chainId}</span>
              </div>
            </div>
            <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 px-4 py-3 sm:min-w-48">
              <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-pulse-muted">Rule-based signal points</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{assessment.score}<span className="ml-1 text-sm font-normal text-pulse-muted">/ 100</span></p>
              <p className="mt-1 text-xs text-pulse-muted">{assessment.label}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <Metric label="Transfer events" value={number(metrics.transferCount)} note={`${number(coverage.transferEventsAnalyzed)} analyzed`} />
          <Metric label="Unique senders" value={number(metrics.uniqueSenders)} note="From observed events" />
          <Metric label="Unique recipients" value={number(metrics.uniqueRecipients)} note="From observed events" />
          <Metric label="Active addresses" value={number(metrics.activeAddresses)} note="Sender or recipient in window" />
          <Metric label="Transfer volume" value={metrics.totalTransferAmount ?? 'Unavailable'} note={metrics.totalTransferAmount === null ? 'Token decimals could not be read' : `${symbolLabel} · observed events only`} />
          <Metric label="Minted in window" value={metrics.mintedAmount ?? 'Unavailable'} note={metrics.mintedSupplyPct === null ? 'Relative supply not calculated' : `${metrics.mintedSupplyPct.toFixed(2)}% of reported current supply`} />
          <Metric label="Burned in window" value={metrics.burnedAmount ?? 'Unavailable'} note="Zero-address transfer events" />
          <Metric label="Largest event share" value={metrics.largestTransferPct === null ? 'Unavailable' : `${metrics.largestTransferPct.toFixed(2)}%`} note="Share of observed transfer amount" />
        </div>

        <div className="grid gap-5 border-t border-pulse-line p-4 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section aria-labelledby="token-signals-title">
            <div className="flex items-center gap-2"><ShieldAlert aria-hidden="true" className="size-4 text-pulse-accent" /><h3 id="token-signals-title" className="text-sm font-semibold">Observed transfer signals</h3></div>
            <p className="mt-2 text-xs leading-5 text-pulse-muted">These rules describe the scanned event window only. They are not a safety score or a probability of loss.</p>
            {assessment.signals.length ? (
              <ul className="mt-4 flex flex-col gap-3">
                {assessment.signals.map((signal) => (
                  <li key={signal.id} className={`rounded-xl border p-3.5 ${severityClass[signal.severity]}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]">{signal.severity} · {signal.title}</p>
                    <p className="mt-1.5 text-xs leading-5 opacity-90">{signal.evidence}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-xl border border-pulse-line bg-pulse-bg/70 p-4 text-sm text-pulse-muted"><Info aria-hidden="true" className="mb-2 size-4 text-sky-200" />No configured transfer flags were found in this window. This does not mean the token is safe.</div>
            )}
          </section>

          <section aria-labelledby="recent-transfers-title" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 id="recent-transfers-title" className="text-sm font-semibold">Recent on-chain transfers</h3><p className="mt-1 text-xs text-pulse-muted">Up to 20 events, newest first</p></div>
              <span className="text-xs text-pulse-muted">{number(coverage.fromBlock)}–{number(coverage.toBlock)}</span>
            </div>
            {coverage.truncated ? <p className="mt-3 rounded-lg border border-amber-200/20 bg-amber-200/5 px-3 py-2 text-xs text-amber-100">The RPC returned more events than the analysis cap. Metrics use the most recent {number(coverage.transferEventsAnalyzed)} valid events.</p> : null}
            {coverage.invalidEvents > 0 ? <p className="mt-2 text-xs text-amber-100">{number(coverage.invalidEvents)} malformed event records were excluded.</p> : null}
            <div className="mt-3 overflow-x-auto rounded-xl border border-pulse-line">
              <table className="w-full min-w-[620px] border-collapse text-left text-xs">
                <thead className="bg-pulse-bg text-[10px] uppercase tracking-[0.14em] text-pulse-muted"><tr><th className="px-3 py-3 font-medium">Type</th><th className="px-3 py-3 font-medium">Amount</th><th className="px-3 py-3 font-medium">From → To</th><th className="px-3 py-3 font-medium">Block</th><th className="px-3 py-3 font-medium">Transaction</th></tr></thead>
                <tbody>
                  {transfers.map((transfer) => (
                    <tr key={`${transfer.transactionHash}-${transfer.logIndex}`} className="border-t border-pulse-line/70">
                      <td className="px-3 py-3"><span className="rounded-md border border-pulse-line px-2 py-1 capitalize text-pulse-muted">{transfer.type}</span></td>
                      <td className="px-3 py-3 font-mono tabular-nums">{transfer.amount ?? `${transfer.amountRaw} raw`}</td>
                      <td className="px-3 py-3"><div className="flex max-w-64 items-center gap-1.5"><ExplorerLink address={transfer.from}>{shortAddress(transfer.from)}</ExplorerLink><ArrowUpRight aria-hidden="true" className="size-3 shrink-0 text-pulse-muted" /><ExplorerLink address={transfer.to}>{shortAddress(transfer.to)}</ExplorerLink></div></td>
                      <td className="px-3 py-3 font-mono">{number(transfer.blockNumber)}</td>
                      <td className="px-3 py-3"><ExplorerLink address={transfer.transactionHash} type="tx">{shortAddress(transfer.transactionHash)}</ExplorerLink></td>
                    </tr>
                  ))}
                  {!transfers.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-pulse-muted">No Transfer events were returned in the scanned block window.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4 border-t border-pulse-line bg-pulse-bg/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0 text-xs leading-5 text-pulse-muted">
            <p className="font-medium text-pulse-bone">Coverage and limitations</p>
            <p className="mt-1">Blocks {number(coverage.fromBlock)}–{number(coverage.toBlock)} · {number(coverage.blockCount)} blocks · {number(coverage.transferEventsObserved)} returned · scanned {timestamp(scannedAt)}</p>
            <p className="mt-1">{assessment.note} Total supply: {token.totalSupply ?? 'not returned by this contract'}.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onScanContract}><FileCode2 data-icon="inline-start" />Profile this contract</Button>
        </div>
      </div>
    </section>
  )
}

function Property({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-pulse-line bg-pulse-bg/70 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pulse-muted">{label}</p>
      <div className="break-words text-sm font-medium text-pulse-bone">{value}</div>
      {detail ? <p className="text-xs leading-5 text-pulse-muted">{detail}</p> : null}
    </div>
  )
}

export function ContractScanResults({ result, historical, onScanToken }: { result: ContractScan; historical: boolean; onScanToken: () => void }) {
  const contract = result.contract
  const owner = contract.ownerStatus === 'active'
    ? <ExplorerLink address={contract.ownerAddress!}>{shortAddress(contract.ownerAddress!)}</ExplorerLink>
    : contract.ownerStatus === 'renounced' ? 'Zero address returned' : 'Not exposed by owner()'
  const proxyLabel = {
    eip1967: 'EIP-1967 storage pattern detected',
    eip1167: 'EIP-1167 clone pattern detected',
    none_detected: 'No supported proxy pattern detected',
    unknown: 'Proxy status unknown',
  }[contract.proxy.kind]

  return (
    <section className="flex flex-col gap-5" aria-labelledby="contract-result-title">
      <SnapshotNotice historical={historical} historySaved={result.historySaved} />
      <div className="rounded-2xl border border-pulse-line bg-pulse-panel">
        <div className="flex flex-col justify-between gap-4 border-b border-pulse-line p-4 sm:flex-row sm:items-start sm:p-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-pulse-accent"><FileCode2 aria-hidden="true" className="size-4" />Contract profile · {result.network.name}</p>
            <h2 id="contract-result-title" className="mt-2 text-2xl font-semibold tracking-tight">Live contract evidence</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"><ExplorerLink address={contract.address}>{shortAddress(contract.address)}</ExplorerLink><span className="text-xs text-pulse-muted">Chain ID {result.network.chainId} · Block {number(result.coverage.blockNumber)}</span></div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-3 py-1.5 text-xs text-emerald-100"><CheckCircle2 aria-hidden="true" className="size-3.5" />Bytecode confirmed · {number(contract.bytecodeBytes)} bytes</span>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          <Property label="Native USDC balance" value={`${contract.nativeBalance} USDC`} detail="Balance returned at the scanned block" />
          <Property label="Token-like interface" value={contract.token.isTokenLike ? 'Read methods responded' : 'Not confirmed'} detail="Based on live totalSupply() and decimals() reads" />
          <Property label="Name / symbol" value={`${contract.token.name ?? 'Not returned'} / ${contract.token.symbol ?? 'Not returned'}`} />
          <Property label="Decimals / supply" value={`${contract.token.decimals ?? 'Not returned'} / ${contract.token.totalSupply ?? 'Not returned'}`} />
          <Property label="owner()" value={owner} detail={contract.ownerStatus === 'active' ? 'One ownership getter only; this is not a complete role inventory.' : contract.ownerStatus === 'renounced' ? 'Does not rule out other roles or a proxy admin.' : 'No owner() value was returned; other access-control patterns may exist.'} />
          <Property label="paused()" value={contract.pauseStatus === 'paused' ? 'Paused' : contract.pauseStatus === 'not_paused' ? 'Not paused' : 'Not exposed'} detail="Only this common getter is checked." />
          <Property label="Proxy detection" value={proxyLabel} detail="Checks EIP-1967 slots and an exact EIP-1167 runtime pattern." />
          <Property label="Implementation" value={contract.proxy.implementation ? <ExplorerLink address={contract.proxy.implementation}>{shortAddress(contract.proxy.implementation)}</ExplorerLink> : 'Not returned'} detail={contract.proxy.implementationBytecodeBytes === null ? 'Implementation bytecode size not confirmed.' : `${number(contract.proxy.implementationBytecodeBytes)} runtime bytes at the implementation address.`} />
          <Property label="Proxy admin / beacon" value={`${contract.proxy.admin ? shortAddress(contract.proxy.admin) : 'No admin slot'} / ${contract.proxy.beacon ? shortAddress(contract.proxy.beacon) : 'No beacon slot'}`} />
        </div>

        <div className="grid gap-4 border-t border-pulse-line p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
          <section aria-labelledby="contract-observations-title">
            <div className="flex items-center gap-2"><ShieldAlert aria-hidden="true" className="size-4 text-pulse-accent" /><h3 id="contract-observations-title" className="text-sm font-semibold">Observed properties</h3></div>
            <ul className="mt-3 flex flex-col gap-2">
              {result.observations.map((observation) => (
                <li key={observation.id} className={`flex items-start gap-3 rounded-xl border p-3 ${observation.severity === 'review' ? 'border-amber-200/20 bg-amber-200/5' : 'border-pulse-line bg-pulse-bg/70'}`}>
                  {observation.severity === 'review' ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-100" /> : <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-sky-200" />}
                  <div><p className="text-xs font-semibold">{observation.title}</p><p className="mt-1 text-xs leading-5 text-pulse-muted">{observation.detail}</p></div>
                </li>
              ))}
            </ul>
          </section>
          <aside className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Info aria-hidden="true" className="size-4 text-pulse-accent" />What this does not check</p>
            <ul className="mt-3 flex flex-col gap-2 text-xs leading-5 text-pulse-muted">{result.limitations.map((limitation) => <li key={limitation} className="flex gap-2"><span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-pulse-muted" />{limitation}</li>)}</ul>
          </aside>
        </div>

        <div className="flex flex-col gap-3 border-t border-pulse-line bg-pulse-bg/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-xs leading-5 text-pulse-muted">Snapshot at block {number(result.coverage.blockNumber)} · {timestamp(result.coverage.scannedAt)} · RPC-only observations are not an audit or a safety verdict.</p>
          {contract.token.isTokenLike ? <Button type="button" variant="outline" size="sm" onClick={onScanToken}><ArrowUpRight data-icon="inline-start" />Scan token activity</Button> : null}
        </div>
      </div>
    </section>
  )
}
