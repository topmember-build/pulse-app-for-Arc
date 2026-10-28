'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import useSWR from 'swr'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FileCode2,
  LoaderCircle,
  LogOut,
  Network,
  RefreshCw,
  Search,
  Shield,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  contractScanRequestSchema,
  contractScanSchema,
  scanHistoryResponseSchema,
  tokenScanRequestSchema,
  tokenScanSchema,
  type ContractScan,
  type ScanHistoryEntry,
  type TokenScan,
} from '@/lib/schemas'
import { ContractScanResults, TokenScanResults } from '@/components/scan-results'
import { ScanHistory } from '@/components/scan-history'

type ScanType = 'token' | 'contract'
type HealthResponse = {
  status: 'ok' | 'degraded'
  services: { database: 'ok' | 'unavailable'; arcRpc: 'ok' | 'unavailable' | 'wrong_network' }
  checkedAt: string
  requestId: string
}

type ApiErrorCode =
  | 'authentication_required'
  | 'wallet_not_linked'
  | 'auth_unavailable'
  | 'rate_limited'
  | 'service_unavailable'
  | 'invalid_input'
  | 'wrong_network'
  | 'not_a_contract'
  | 'arc_rpc_unavailable'
  | 'history_unavailable'
  | 'unknown'

class PulseApiError extends Error {
  constructor(readonly code: ApiErrorCode, readonly retryAfter?: number) {
    super(code)
  }
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

async function fetchHealth(url: string): Promise<HealthResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!body || (body.status !== 'ok' && body.status !== 'degraded')) throw new Error('health_unavailable')
  return body as HealthResponse
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const code = typeof body?.error === 'string' ? body.error as ApiErrorCode : 'unknown'
    throw new PulseApiError(code, typeof body?.retryAfter === 'number' ? body.retryAfter : undefined)
  }
  if (!body) throw new PulseApiError('unknown')
  return body as T
}

function friendlyError(error: unknown) {
  if (!(error instanceof PulseApiError)) return 'The request could not be completed. Check service status and try again.'
  switch (error.code) {
    case 'authentication_required': return 'Your Privy session expired. Reconnect your wallet and try again.'
    case 'wallet_not_linked': return 'This wallet is not linked to the signed-in Privy account.'
    case 'auth_unavailable': return 'Privy authentication is temporarily unavailable.'
    case 'rate_limited': return `Too many requests. Try again in ${error.retryAfter ?? 1} seconds.`
    case 'service_unavailable': return 'The scan service is unavailable because a required backend service is not ready.'
    case 'invalid_input': return 'Enter a valid EVM contract address.'
    case 'wrong_network': return 'The configured RPC did not report Arc Mainnet. No result was saved as a completed scan.'
    case 'not_a_contract': return 'No contract bytecode was found at that address on Arc Mainnet.'
    case 'arc_rpc_unavailable': return 'Arc Mainnet RPC could not complete this scan. Try again shortly.'
    case 'history_unavailable': return 'Scan history is temporarily unavailable.'
    default: return 'The request could not be completed. Try again.'
  }
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function StatusDot({ state }: { state: 'ok' | 'down' | 'checking' }) {
  const colors = {
    ok: 'bg-emerald-400',
    down: 'bg-rose-400',
    checking: 'bg-amber-300',
  }
  return <span aria-hidden="true" className={`inline-block size-2 rounded-full ${colors[state]}`} />
}

function HealthSummary({ health, loading }: { health?: HealthResponse; loading: boolean }) {
  const databaseState = health?.services.database === 'ok' ? 'ok' : health ? 'down' : 'checking'
  const rpcState = health?.services.arcRpc === 'ok' ? 'ok' : health ? 'down' : 'checking'
  const networkLabel = health?.services.arcRpc === 'wrong_network' ? 'RPC network mismatch' : health?.services.arcRpc === 'ok' ? 'Arc RPC online' : loading ? 'Checking Arc RPC' : 'Arc RPC offline'
  const databaseLabel = health?.services.database === 'ok' ? 'History database online' : loading ? 'Checking database' : 'History database offline'

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-pulse-muted" aria-label="Service status">
      <span className="inline-flex items-center gap-2"><StatusDot state={rpcState} />{networkLabel}</span>
      <span className="inline-flex items-center gap-2"><StatusDot state={databaseState} />{databaseLabel}</span>
    </div>
  )
}

function HealthNotice({ health, error, loading }: { health?: HealthResponse; error?: unknown; loading: boolean }) {
  if (loading && !health && !error) return null
  if (!error && health?.status === 'ok') return null
  const message = error
    ? 'Live service status could not be checked. Scans may be unavailable.'
    : 'One or more live services are degraded. Results may not be available until they recover.'
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100" role="status">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  )
}

function PrivySetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-pulse-bg px-5 py-10 text-pulse-bone">
      <section className="w-full max-w-lg rounded-2xl border border-pulse-line bg-pulse-panel p-7 sm:p-9">
        <Activity aria-hidden="true" className="size-7 text-pulse-accent" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-pulse-muted">Pulse · Arc Mainnet</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Wallet sign-in is not configured</h1>
        <p className="mt-3 text-sm leading-6 text-pulse-muted">Pulse requires a Privy app to verify wallet ownership before saving private scan history. Live scanning is disabled until the app authentication configuration is available.</p>
        <a className="mt-6 inline-flex text-sm font-medium text-pulse-accent underline-offset-4 hover:underline" href="https://www.privy.io/" target="_blank" rel="noreferrer">Privy setup <ExternalLink data-icon="inline-end" /></a>
      </section>
    </main>
  )
}

function PulseDashboardContent({ health, healthLoading, healthError }: { health?: HealthResponse; healthLoading: boolean; healthError?: unknown }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [selectedAddress, setSelectedAddress] = useState('')
  const [scanType, setScanType] = useState<ScanType>('token')
  const [address, setAddress] = useState('')
  const [result, setResult] = useState<TokenScan | ContractScan | null>(null)
  const [resultType, setResultType] = useState<ScanType | null>(null)
  const [isHistorical, setIsHistorical] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)

  const wallet = wallets.find((item) => item.address.toLowerCase() === selectedAddress.toLowerCase())
    ?? wallets.find((item) => item.walletClientType === 'privy')
    ?? wallets[0]
  const walletAddress = wallet?.address
  const userId = user?.id
  const historyKey = authenticated && walletAddress && userId
    ? ['/api/history', userId, walletAddress.toLowerCase()] as const
    : null

  const { data: historyData, error: historyError, isLoading: historyLoading, mutate: refreshHistory } = useSWR(
    historyKey,
    async ([path, _userId, addressKey]) => {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new PulseApiError('authentication_required')
      const response = await fetch(`${path}?wallet=${encodeURIComponent(addressKey)}`, {
        headers: { authorization: `Bearer ${accessToken}`, 'x-pulse-wallet': addressKey },
        cache: 'no-store',
      })
      const body = await parseApiResponse<unknown>(response)
      return scanHistoryResponseSchema.parse(body)
    },
    { revalidateOnFocus: true, revalidateOnReconnect: true, dedupingInterval: 15_000 },
  )

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
  }

  async function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setScanError('')
    setResult(null)
    setResultType(null)
    setIsHistorical(false)

    if (!ADDRESS_PATTERN.test(address.trim())) {
      setScanError('Enter a valid 42-character EVM contract address.')
      return
    }
    if (!ready) {
      setScanError('Privy is still initializing. Try again in a moment.')
      return
    }
    if (!authenticated) {
      setScanError('Connect a wallet before starting a scan.')
      login()
      return
    }
    if (!walletAddress) {
      setScanError('No linked EVM wallet is available for this Privy account yet.')
      return
    }

    setScanning(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new PulseApiError('authentication_required')
      const endpoint = scanType === 'token' ? '/api/scan/token' : '/api/scan/contract'
      const requestSchema = scanType === 'token' ? tokenScanRequestSchema : contractScanRequestSchema
      const validation = requestSchema.safeParse({ address: address.trim() })
      if (!validation.success) throw new PulseApiError('invalid_input')
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-pulse-wallet': walletAddress,
        },
        body: JSON.stringify(validation.data),
        cache: 'no-store',
      })
      const body = await parseApiResponse<unknown>(response)
      if (scanType === 'token') {
        const parsed = tokenScanSchema.safeParse(body)
        if (!parsed.success) throw new Error('The token scan response was incomplete. No result was displayed.')
        setResult(parsed.data)
      } else {
        const parsed = contractScanSchema.safeParse(body)
        if (!parsed.success) throw new Error('The contract scan response was incomplete. No result was displayed.')
        setResult(parsed.data)
      }
      setResultType(scanType)
      void refreshHistory().catch(() => undefined)
    } catch (error) {
      setScanError(error instanceof PulseApiError ? friendlyError(error) : error instanceof Error ? error.message : friendlyError(error))
    } finally {
      setScanning(false)
    }
  }

  async function copyWallet() {
    if (!walletAddress) return
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setScanError('Clipboard access is unavailable in this browser.')
    }
  }

  function openHistoryEntry(entry: ScanHistoryEntry) {
    const snapshot = entry.summary.snapshot
    if (entry.scanType === 'token') {
      const parsed = tokenScanSchema.safeParse(snapshot)
      if (parsed.success) {
        setScanType('token')
        setAddress(entry.targetAddress)
        setResult(parsed.data)
        setResultType('token')
        setIsHistorical(true)
        setScanError('')
        document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    } else {
      const parsed = contractScanSchema.safeParse(snapshot)
      if (parsed.success) {
        setScanType('contract')
        setAddress(entry.targetAddress)
        setResult(parsed.data)
        setResultType('contract')
        setIsHistorical(true)
        setScanError('')
        document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }

    setScanType(entry.scanType)
    setAddress(entry.targetAddress)
    setResult(null)
    setResultType(null)
    setIsHistorical(false)
    setScanError(entry.status === 'failed' ? 'This scan did not complete. Review the address and run it again.' : entry.status === 'pending' ? 'This scan is still marked pending and has no completed evidence snapshot.' : 'This older scan has no saved evidence snapshot. Run a fresh scan to see current chain data.')
    document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const rpcOnline = health?.services.arcRpc === 'ok'
  const tokenResult = resultType === 'token' && result && 'token' in result ? result : null
  const contractResult = resultType === 'contract' && result && 'contract' in result ? result : null

  return (
    <main className="min-h-screen bg-pulse-bg text-pulse-bone">
      <header className="sticky top-0 z-20 border-b border-pulse-line/80 bg-pulse-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" className="inline-flex items-center gap-2.5" aria-label="Pulse home">
            <span className="grid size-9 place-items-center rounded-xl border border-pulse-line bg-pulse-panel text-pulse-accent"><Activity aria-hidden="true" className="size-5" /></span>
            <span className="text-base font-semibold tracking-tight">pulse<span className="ml-1.5 text-xs font-medium uppercase tracking-[0.16em] text-pulse-muted">for Arc</span></span>
          </a>
          <div className="hidden items-center gap-5 md:flex"><HealthSummary health={health} loading={healthLoading} /></div>
          <div className="flex items-center gap-2">
            {authenticated && walletAddress ? (
              <div className="hidden items-center gap-1.5 rounded-lg border border-pulse-line bg-pulse-panel px-2 py-1 sm:flex">
                {wallets.length > 1 ? (
                  <label className="sr-only" htmlFor="wallet-select">Select a linked wallet</label>
                ) : null}
                {wallets.length > 1 ? (
                  <select id="wallet-select" value={walletAddress} onChange={(event) => setSelectedAddress(event.target.value)} className="max-w-36 bg-transparent px-1 py-1 text-xs text-pulse-bone outline-none" aria-label="Select linked wallet">
                    {wallets.map((item) => <option key={item.address} value={item.address} className="bg-pulse-panel">{shortAddress(item.address)} · {item.walletClientType}</option>)}
                  </select>
                ) : <span className="px-1 py-1 font-mono text-xs text-pulse-muted">{shortAddress(walletAddress)}</span>}
                <Button type="button" variant="ghost" size="icon-xs" aria-label={copied ? 'Wallet address copied' : 'Copy wallet address'} onClick={copyWallet}>{copied ? <Check /> : <Copy />}</Button>
              </div>
            ) : null}
            <Button type="button" variant={authenticated ? 'outline' : 'default'} size="sm" onClick={authenticated ? logout : login} disabled={!ready}>
              {authenticated ? <><LogOut data-icon="inline-start" />Sign out</> : <><Wallet data-icon="inline-start" />{ready ? 'Connect wallet' : 'Loading Privy'}</>}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
        <section id="top" className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-pulse-accent"><span className="size-1.5 rounded-full bg-pulse-accent" />Live Arc Mainnet evidence</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-6xl">Analyze the evidence.<br className="hidden sm:block" /> Not the hype.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-pulse-muted sm:text-base">Read recent ERC-20 transfer activity and observable contract properties directly from Arc Mainnet. Every result carries its scan window, source, and limitations.</p>
          </div>
          <div className="rounded-2xl border border-pulse-line bg-pulse-panel/70 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Network aria-hidden="true" className="size-4 text-pulse-accent" />Arc Mainnet</div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${rpcOnline ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-100'}`}>{rpcOnline ? 'Connected' : 'Checking'}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-pulse-line pt-4 text-xs">
              <div><p className="text-pulse-muted">Chain ID</p><p className="mt-1 font-mono text-pulse-bone">5042</p></div>
              <div><p className="text-pulse-muted">Access mode</p><p className="mt-1 text-pulse-bone">Read-only RPC</p></div>
            </div>
            <div className="mt-3 md:hidden"><HealthSummary health={health} loading={healthLoading} /></div>
          </div>
        </section>

        <HealthNotice health={health} error={healthError} loading={healthLoading} />

        <section id="scanner" className="scroll-mt-24 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="rounded-2xl border border-pulse-line bg-pulse-panel p-4 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-muted">Live scanner</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Start with a contract address</h2>
              </div>
              <div className="inline-flex rounded-xl border border-pulse-line bg-pulse-bg p-1" role="group" aria-label="Choose scan type">
                <button type="button" aria-pressed={scanType === 'token'} onClick={() => { setScanType('token'); setScanError(''); setResult(null); setResultType(null); setIsHistorical(false) }} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${scanType === 'token' ? 'bg-pulse-panel text-pulse-bone shadow-sm' : 'text-pulse-muted hover:text-pulse-bone'}`}>Token activity</button>
                <button type="button" aria-pressed={scanType === 'contract'} onClick={() => { setScanType('contract'); setScanError(''); setResult(null); setResultType(null); setIsHistorical(false) }} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${scanType === 'contract' ? 'bg-pulse-panel text-pulse-bone shadow-sm' : 'text-pulse-muted hover:text-pulse-bone'}`}>Contract profile</button>
              </div>
            </div>

            <form onSubmit={handleScan} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="contract-address" className="text-sm font-medium">{scanType === 'token' ? 'ERC-20 token address' : 'Smart contract address'}</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input id="contract-address" name="address" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="0x followed by 40 hex characters" value={address} onChange={(event) => { setAddress(event.target.value); if (scanError) setScanError('') }} onKeyDown={handleInputKeyDown} aria-invalid={Boolean(scanError) && !ADDRESS_PATTERN.test(address.trim())} aria-describedby="scan-guidance scan-feedback" aria-errormessage="scan-feedback" className="min-h-12 min-w-0 flex-1 rounded-xl border border-pulse-line bg-pulse-bg px-4 font-mono text-sm text-pulse-bone placeholder:text-pulse-muted/65 outline-none transition focus:border-pulse-accent focus:ring-2 focus:ring-pulse-accent/20 aria-invalid:border-rose-300/70" />
                  <Button type="submit" size="lg" disabled={scanning || !ready} className="min-h-12 gap-2 px-5">
                    {scanning ? <><LoaderCircle className="animate-spin" data-icon="inline-start" />Scanning Arc</> : <><Search data-icon="inline-start" />{authenticated ? 'Run live scan' : 'Connect wallet'}</>}
                  </Button>
                </div>
                <p id="scan-guidance" className="text-xs leading-5 text-pulse-muted">{scanType === 'token' ? 'Reads ERC-20 Transfer logs across the latest 500 blocks and returns up to 20 recent events.' : 'Reads bytecode, token metadata, ownership/pause getters, proxy storage slots, and native balance when exposed.'} A connected Privy wallet is required to run scans and save private history.</p>
                <div id="scan-feedback" role="status" aria-live="polite" className="min-h-5 text-sm text-rose-200">{scanError}</div>
              </div>
            </form>
            {authenticated && walletAddress ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-pulse-muted"><Shield aria-hidden="true" className="size-3.5 text-emerald-300" />Read-only scan. Pulse never asks for a seed phrase, signs a message, or submits a transaction.</p>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-xs text-pulse-muted"><Wallet aria-hidden="true" className="size-3.5 text-pulse-accent" />Connect with Privy to associate scans with your account.</p>
            )}
          </div>

          <aside className="flex flex-col gap-4 rounded-2xl border border-pulse-line bg-pulse-panel/60 p-4 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold"><FileCode2 aria-hidden="true" className="size-4 text-pulse-accent" />What the scanner actually reads</div>
            <div className="grid gap-3">
              <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold"><ArrowDownRight aria-hidden="true" className="size-4 text-sky-200" />Token activity</div>
                <p className="mt-2 text-xs leading-5 text-pulse-muted">On-chain Transfer logs, event counts, unique addresses, mint/burn flow, and exact observed block coverage.</p>
              </div>
              <div className="rounded-xl border border-pulse-line bg-pulse-bg/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold"><ArrowUpRight aria-hidden="true" className="size-4 text-pulse-accent" />Contract profile</div>
                <p className="mt-2 text-xs leading-5 text-pulse-muted">Runtime bytecode, common read-only getters, EIP-1967 storage slots, and native USDC balance where the RPC exposes them.</p>
              </div>
            </div>
            <div className="mt-auto border-t border-pulse-line pt-4">
              <p className="text-xs font-semibold text-pulse-bone">No automated safety verdict</p>
              <p className="mt-1.5 text-xs leading-5 text-pulse-muted">A transfer flag or contract property is evidence to review—not a probability of loss, audit, or proof that an asset is safe.</p>
            </div>
          </aside>
        </section>

        {tokenResult ? (
          <TokenScanResults result={tokenResult} historical={isHistorical} onScanContract={() => { setScanType('contract'); setAddress(tokenResult.token.address); setResult(null); setResultType(null); setIsHistorical(false); document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
        ) : null}
        {contractResult ? (
          <ContractScanResults result={contractResult} historical={isHistorical} onScanToken={() => { setScanType('token'); setAddress(contractResult.contract.address); setResult(null); setResultType(null); setIsHistorical(false); document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
        ) : null}

        <ScanHistory
          entries={historyData?.scans ?? []}
          loading={historyLoading}
          error={historyError ? friendlyError(historyError) : ''}
          enabled={authenticated && Boolean(walletAddress)}
          onOpen={openHistoryEntry}
          onRefresh={() => { void refreshHistory() }}
        />

        <footer className="flex flex-col gap-3 border-t border-pulse-line pt-5 text-xs text-pulse-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Pulse for Arc · Arc Mainnet · Chain ID 5042</p>
          <p className="flex items-center gap-2"><Clock3 aria-hidden="true" className="size-3.5" />Read-only public chain data. No transaction signing.</p>
        </footer>
      </div>
    </main>
  )
}

export function PulseDashboard() {
  const hasPrivyAppId = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID)
  const { data: health, isLoading: healthLoading, error: healthError } = useSWR('/api/health', fetchHealth, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  })

  if (!hasPrivyAppId) return <PrivySetupNotice />

  return <PulseDashboardContent health={health} healthLoading={healthLoading} healthError={healthError} />
}
