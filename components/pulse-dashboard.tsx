'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import useSWR, { mutate as mutateCache } from 'swr'
import {
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
  Sparkles,
  Wallet,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { PulseLogo } from '@/components/pulse-logo'
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
import { PulseHeart } from '@/components/pulse-heart'
import { ScanStats } from '@/components/scan-stats'
import { fetchPaymentConfig, PaymentRejectedError, sendUsdcPayment, signPaymentMessage } from '@/lib/payment-client'
import { paymentMessage } from '@/lib/payment-message'

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
  | 'payment_required'
  | 'payment_pending'
  | 'payment_invalid'
  | 'payment_already_used'
  | 'payment_in_progress'
  | 'payment_unavailable'
  | 'payment_signature_invalid'
  | 'unknown'

class PulseApiError extends Error {
  constructor(readonly code: ApiErrorCode, readonly retryAfter?: number) {
    super(code)
  }
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

// Pasted text (especially on mobile) can carry spaces, zero-width characters or a label.
// Extract a single standalone 0x + 40 hex address; longer hex strings such as tx hashes are rejected.
function normalizeAddress(raw: string): string {
  const cleaned = raw.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '')
  const match = cleaned.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/)
  return match ? match[0] : cleaned
}

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
    case 'payment_required': return 'A deep scan needs a USDC payment first.'
    case 'payment_pending': return 'The payment is still confirming onchain. Press Deep scan again in a moment; you will not be charged twice.'
    case 'payment_invalid': return 'The payment could not be verified: it failed, went to a different recipient, or was too small.'
    case 'payment_already_used': return 'That payment was already used for a deep scan. Start a new deep scan to pay again.'
    case 'payment_in_progress': return 'A deep scan is already running for this payment. Wait a moment and try again.'
    case 'payment_signature_invalid': return 'The payment could not be matched to your signature. Approve the signature request in your wallet and try again; you will not be charged twice.'
    case 'payment_unavailable': return 'Deep scan payments are not available right now.'
    default: return 'The request could not be completed. Try again.'
  }
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function StatusDot({ state }: { state: 'ok' | 'down' | 'checking' }) {
  const colors = {
    ok: 'bg-pulse-venous',
    down: 'bg-pulse-accent',
    checking: 'bg-pulse-amber',
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
        <PulseLogo className="size-8" />
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
  const [deepStatus, setDeepStatus] = useState('')
  const { data: paymentConfig } = useSWR('/api/payment/config', () => fetchPaymentConfig(), { revalidateOnFocus: false })
  const [copied, setCopied] = useState(false)

  const wallet = wallets.find((item) => item.address.toLowerCase() === selectedAddress.toLowerCase())
    ?? wallets.find((item) => item.walletClientType === 'privy')
    ?? wallets[0]
  const walletAddress = wallet?.address
  const userId = user?.id
  const historyKey = authenticated && userId ? ['/api/history', userId] as const : null

  const { data: historyData, error: historyError, isLoading: historyLoading, mutate: refreshHistory } = useSWR(
    historyKey,
    async ([path]) => {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new PulseApiError('authentication_required')
      const response = await fetch(path, {
        headers: { authorization: `Bearer ${accessToken}` },
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

  async function postScan(endpoint: string, headers: Record<string, string>, payload: unknown) {
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store' })
    return parseApiResponse<unknown>(response)
  }

  async function payAndScan(endpoint: string, headers: Record<string, string>, target: string) {
    if (!wallet || !paymentConfig?.enabled) throw new PulseApiError('payment_unavailable')
    const storageKey = `pulse:deep-payment:${paymentConfig.chainId}:${paymentConfig.contract ?? 'direct'}:${scanType}:${target.toLowerCase()}:${wallet.address.toLowerCase()}`
    let saved: { txHash?: string; signature?: string } = {}
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) saved = raw.startsWith('{') ? JSON.parse(raw) : { txHash: raw }
    } catch {
      saved = {}
    }
    const remember = () => window.localStorage.setItem(storageKey, JSON.stringify(saved))

    // 1. Pay. The connected wallet only pays; it does not need to be linked to the account.
    if (!saved.txHash) {
      setDeepStatus('Approve the USDC payment in your wallet')
      saved.txHash = await sendUsdcPayment(wallet, paymentConfig, { scanType, target })
      remember()
    }
    // 2. Sign once so the payment is tied to this account and this scan.
    if (!saved.signature) {
      setDeepStatus('Sign to confirm this payment is yours (free, no gas)')
      saved.signature = await signPaymentMessage(wallet, paymentMessage({ txHash: saved.txHash, scanType, target, chainId: paymentConfig.chainId }))
      remember()
    }
    // 3. The server verifies the payment onchain, then runs the scan.
    setDeepStatus('Verifying the payment onchain')
    for (let attempt = 0; attempt < 25; attempt += 1) {
      try {
        const body = await postScan(endpoint, headers, { address: target, deep: true, paymentTxHash: saved.txHash, paymentSignature: saved.signature })
        window.localStorage.removeItem(storageKey)
        return body
      } catch (error) {
        if (error instanceof PulseApiError && error.code === 'payment_pending') {
          await new Promise((resolve) => window.setTimeout(resolve, 2000))
          continue
        }
        if (error instanceof PulseApiError && (error.code === 'payment_already_used' || error.code === 'payment_invalid')) window.localStorage.removeItem(storageKey)
        throw error
      }
    }
    throw new PulseApiError('payment_pending')
  }

  async function runScan(deep: boolean) {
    setScanError('')
    setDeepStatus('')
    setResult(null)
    setResultType(null)
    setIsHistorical(false)

    const target = normalizeAddress(address)
    if (!ADDRESS_PATTERN.test(target)) {
      setScanError('Enter a valid 42-character EVM contract address.')
      return
    }
    if (deep) {
      if (!ready) {
        setScanError('Privy is still initializing. Try again in a moment.')
        return
      }
      if (!authenticated || wallets.length === 0) {
        setScanError('Connect a wallet to pay for the deep scan.')
        login()
        return
      }
      if (!wallet) {
        setScanError('Connect a wallet to pay for the deep scan.')
        return
      }
      if (!paymentConfig?.enabled) {
        setScanError('Deep scans are not enabled on this deployment yet.')
        return
      }
    }

    setScanning(true)
    try {
      const endpoint = scanType === 'token' ? '/api/scan/token' : '/api/scan/contract'
      const requestSchema = scanType === 'token' ? tokenScanRequestSchema : contractScanRequestSchema
      const validation = requestSchema.safeParse({ address: target })
      if (!validation.success) throw new PulseApiError('invalid_input')

      // Basic scans are open to everyone. Signing in only adds saved history.
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (ready && authenticated) {
        const accessToken = await getAccessToken()
        if (!accessToken) throw new PulseApiError('authentication_required')
        headers.authorization = `Bearer ${accessToken}`
        if (walletAddress) headers['x-pulse-wallet'] = walletAddress
      }

      const body = deep ? await payAndScan(endpoint, headers, target) : await postScan(endpoint, headers, validation.data)
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
      if (authenticated) void refreshHistory().catch(() => undefined)
      void mutateCache((key) => (Array.isArray(key) && key[0] === '/api/stats') || key === '/api/stats/overview')
    } catch (error) {
      if (error instanceof PaymentRejectedError) setScanError('The payment was cancelled. Nothing was charged.')
      else setScanError(error instanceof PulseApiError ? friendlyError(error) : error instanceof Error ? error.message : friendlyError(error))
    } finally {
      setScanning(false)
      setDeepStatus('')
    }
  }

  function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runScan(false)
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
            <PulseLogo className="size-8" />
            <span className="font-serif text-xl font-semibold tracking-tight">Pulse<span className="ml-2 font-sans text-xs font-medium text-pulse-muted">for Arc</span></span>
          </a>
          <div className="hidden items-center gap-5 md:flex"><HealthSummary health={health} loading={healthLoading} /></div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {authenticated && walletAddress ? (
              <div className="hidden items-center gap-1.5 rounded-lg border border-pulse-line bg-pulse-panel px-2 py-1 sm:flex">
                {wallets.length > 1 ? (
                  <label className="sr-only" htmlFor="wallet-select">Select a connected wallet</label>
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
        <section id="top" className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)] lg:items-center">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-pulse-accent"><span className="size-1.5 rounded-full bg-pulse-accent" />Pulse · Arc Mainnet</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Check a token or contract on Arc before you trust it.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-pulse-muted sm:text-base">Pulse draws token movement as a living heart. Blue veins bring transfers in, coral arteries carry them out, and amber means look twice. Read the plain-language signal first, then open the evidence.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="#scanner" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-pulse-accent bg-pulse-accent px-5 text-sm font-semibold text-pulse-bg transition hover:brightness-110">Start a live scan</a>
              <span className="text-xs text-pulse-muted">Free scans read-only · deep scans ask for a small payment</span>
            </div>
          </div>
          <div className="pulse-heart-stage overflow-hidden rounded-xl border border-pulse-line px-4 pt-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div><p className="font-serif text-lg font-semibold">Arc is alive</p><p className="mt-1 text-xs text-pulse-muted">Chain ID 5042 · read-only evidence</p></div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${rpcOnline ? 'border-pulse-venous/35 bg-pulse-venous/10 text-pulse-venous' : 'border-pulse-amber/35 bg-pulse-amber/10 text-pulse-amber'}`}>{rpcOnline ? 'RPC connected' : 'Checking'}</span>
            </div>
            <PulseHeart
              activityLevel={tokenResult ? Math.min(1, tokenResult.metrics.transferCount / 80) : 0.22}
              attentionLevel={tokenResult ? Math.min(1, tokenResult.assessment.signals.length / 4) : contractResult ? Math.min(1, contractResult.observations.filter((item) => item.severity === 'review').length / 3) : 0}
              label="Pulse’s anatomical heart illustration, with blue veins and coral arteries"
              className="mx-auto block aspect-square w-full max-w-[350px]"
            />
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-pulse-line/70 py-3 text-xs text-pulse-muted">
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-pulse-venous" />Transfers in</span>
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-pulse-accent" />Transfers out</span>
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-pulse-amber" />Review signal</span>
            </div>
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
                  <input id="contract-address" name="address" type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder="0x followed by 40 hex characters" value={address} onChange={(event) => { setAddress(event.target.value); if (scanError) setScanError('') }} onKeyDown={handleInputKeyDown} aria-invalid={Boolean(scanError) && !ADDRESS_PATTERN.test(normalizeAddress(address))} aria-describedby="scan-guidance scan-feedback" aria-errormessage="scan-feedback" className="min-h-12 min-w-0 flex-1 rounded-xl border border-pulse-line bg-pulse-bg px-4 font-mono text-sm text-pulse-bone placeholder:text-pulse-muted/65 outline-none transition focus:border-pulse-accent focus:ring-2 focus:ring-pulse-accent/20 aria-invalid:border-rose-300/70" />
                  <Button type="submit" size="lg" disabled={scanning} className="min-h-12 gap-2 px-5">
                    {scanning ? <><LoaderCircle className="animate-spin" data-icon="inline-start" />Scanning Arc</> : <><Search data-icon="inline-start" />Run live scan</>}
                  </Button>
                </div>
                <p id="scan-guidance" className="text-xs leading-5 text-pulse-muted">{scanType === 'token' ? 'Reads recent ERC-20 transfers, then checks for shared-source fan-out, matching amounts, same-block bursts, and circular movement.' : 'Reads bytecode, token metadata, ownership/pause getters, proxy storage slots, and native balance when exposed.'} A connected Privy wallet is required to run scans and save private history.</p>
                <div id="scan-feedback" role="status" aria-live="polite" className="min-h-5 text-sm text-rose-200">{scanError}</div>
              </div>
            </form>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-pulse-line bg-pulse-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium"><Sparkles aria-hidden="true" className="size-4 text-pulse-accent" />Deep scan</p>
                <p className="mt-1 text-xs leading-5 text-pulse-muted">
                  {scanType === 'token'
                    ? 'Looks back 10,000 blocks instead of 2,500, maps whale wallets and linked wallet clusters, and reviews the token bytecode for mint, pause, blacklist and upgrade controls.'
                    : 'Reviews the contract bytecode, and its implementation if it is a proxy, for mint, pause, blacklist, upgrade and role controls.'}
                </p>
                <p className="mt-1 text-xs leading-5 text-pulse-muted">
                  {paymentConfig?.enabled
                    ? paymentConfig.contract && paymentConfig.receiver ? `Costs ${paymentConfig.priceDisplay} USDC on ${paymentConfig.chainName}, plus network gas. You pay the Pulse payment contract (${shortAddress(paymentConfig.contract)}), which passes it straight on to ${shortAddress(paymentConfig.receiver)}. Requires a connected wallet.` : `Costs ${paymentConfig.priceDisplay} USDC on ${paymentConfig.chainName}, plus network gas, paid to ${paymentConfig.receiver ? shortAddress(paymentConfig.receiver) : 'the Pulse wallet'}. Requires a connected wallet.`
                    : 'Deep scans are not enabled on this deployment yet.'}
                </p>
              </div>
              <Button type="button" variant="outline" size="lg" onClick={() => { void runScan(true) }} disabled={scanning || !paymentConfig?.enabled} className="min-h-12 shrink-0 gap-2 px-5">
                {scanning && deepStatus ? <><LoaderCircle className="animate-spin" data-icon="inline-start" />Working</> : <><Sparkles data-icon="inline-start" />{authenticated || !paymentConfig?.enabled ? `Deep scan${paymentConfig?.enabled ? ` · ${paymentConfig.priceDisplay} USDC` : ''}` : 'Connect wallet to deep scan'}</>}
              </Button>
            </div>
            {deepStatus ? <p role="status" className="mt-2 flex items-center gap-2 text-xs text-pulse-bone"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-pulse-accent" />{deepStatus}</p> : null}
            {authenticated && walletAddress ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-pulse-muted"><Shield aria-hidden="true" className="size-3.5 text-emerald-300" />Basic scans are read-only and saved to your history. A deep scan asks you to approve one USDC transfer, nothing else.</p>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-xs text-pulse-muted"><Wallet aria-hidden="true" className="size-3.5 text-pulse-accent" />Basic scans work without an account. Connect a wallet to save your history and unlock deep scans.</p>
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
          <TokenScanResults result={tokenResult} historical={isHistorical} onDeepScan={() => { void runScan(true) }} onScanContract={() => { setScanType('contract'); setAddress(tokenResult.token.address); setResult(null); setResultType(null); setIsHistorical(false); document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
        ) : null}
        {contractResult ? (
          <ContractScanResults result={contractResult} historical={isHistorical} onDeepScan={() => { void runScan(true) }} onScanToken={() => { setScanType('token'); setAddress(contractResult.contract.address); setResult(null); setResultType(null); setIsHistorical(false); document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
        ) : null}

        <ScanStats
          enabled={authenticated}
          userKey={userId}
          getAccessToken={getAccessToken}
          onSelectTarget={(target, type) => { setScanType(type); setAddress(target); setResult(null); setResultType(null); setIsHistorical(false); setScanError(''); document.getElementById('scanner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
        />

        <ScanHistory
          entries={historyData?.scans ?? []}
          loading={historyLoading}
          error={historyError ? friendlyError(historyError) : ''}
          enabled={authenticated}
          onOpen={openHistoryEntry}
          onRefresh={() => { void refreshHistory() }}
        />

        <footer className="flex flex-col gap-3 border-t border-pulse-line pt-5 text-xs text-pulse-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Pulse for Arc · Arc Mainnet · Chain ID 5042 · <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer" className="underline decoration-pulse-line underline-offset-4 transition hover:text-pulse-bone">Built with Arc Studio</a></p>
          <p className="flex items-center gap-2"><Clock3 aria-hidden="true" className="size-3.5" />Scans read public Arc data. Free scans never ask for a signature; a deep scan asks you to approve one small USDC payment.</p>
        </footer>
      </div>
    </main>
  )
}

export function PulseDashboard({ privyConfigured }: { privyConfigured: boolean }) {
  const hasPrivyAppId = privyConfigured
  const { data: health, isLoading: healthLoading, error: healthError } = useSWR('/api/health', fetchHealth, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  })

  if (!hasPrivyAppId) return <PrivySetupNotice />

  return <PulseDashboardContent health={health} healthLoading={healthLoading} healthError={healthError} />
}
