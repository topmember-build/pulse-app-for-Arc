import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { contractScanRequestSchema, contractScanSchema } from '@/lib/schemas'

export const runtime = 'nodejs'

const ARC_RPC_URL = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID = 5042002

type RpcResponse = { result?: unknown; error?: { message?: string } }

function response(requestId: string, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId, ...headers } })
}

async function rpc(method: string, params: unknown[]) {
  const result = await fetch(ARC_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (!result.ok) throw new Error('arc_rpc_http_error')
  const payload = await result.json() as RpcResponse
  if (payload.error || !('result' in payload)) throw new Error('arc_rpc_method_error')
  return payload.result
}

async function saveHistory(wallet: string | null, address: string, status: 'complete' | 'failed', summary: Record<string, unknown>) {
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return
  await db.execute(sql`
    INSERT INTO pulse_scan_history (wallet_address, scan_type, target_address, status, summary)
    VALUES (${wallet.toLowerCase()}, 'contract', ${address.toLowerCase()}, ${status}, ${JSON.stringify(summary)}::jsonb)
  `)
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const startedAt = Date.now()
  try {
    const rateLimit = await checkRateLimit(request, 'contract-scan', 20, 60)
    if (!rateLimit.allowed) {
      console.info(JSON.stringify({ event: 'pulse.api.rate_limited', route: 'contract-scan', requestId }))
      return response(requestId, { error: 'rate_limited', retryAfter: rateLimit.retryAfter }, 429, { 'retry-after': String(rateLimit.retryAfter) })
    }
  } catch {
    console.error(JSON.stringify({ event: 'pulse.api.rate_limit_unavailable', route: 'contract-scan', requestId }))
    return response(requestId, { error: 'service_unavailable' }, 503)
  }

  const parsed = contractScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return response(requestId, { error: 'invalid_input' }, 400)

  const address = parsed.data.address.toLowerCase()
  const wallet = request.headers.get('x-pulse-wallet')
  try {
    const [chainId, code, balance] = await Promise.all([
      rpc('eth_chainId', []),
      rpc('eth_getCode', [address, 'latest']),
      rpc('eth_getBalance', [address, 'latest']),
    ])
    if (typeof chainId !== 'string' || Number.parseInt(chainId, 16) !== ARC_CHAIN_ID) {
      return response(requestId, { error: 'wrong_network' }, 502)
    }
    if (typeof code !== 'string' || typeof balance !== 'string' || !/^0x[0-9a-f]+$/i.test(balance)) {
      throw new Error('arc_rpc_invalid_response')
    }

    const isContract = code !== '0x'
    const bytecodeBytes = Math.max(0, (code.length - 2) / 2)
    const nativeBalance = Number.parseInt(balance, 16) / 1e18
    const findings = [
      {
        sev: isContract ? 'ok' : 'high', short: isContract ? 'Contract bytecode found' : 'No contract at address',
        plain: isContract ? 'This address has executable code on Arc testnet.' : 'This address is not a deployed contract on Arc testnet.',
        title: isContract ? 'Runtime bytecode exists' : 'Externally owned account or missing deployment',
        detail: isContract ? `The live runtime bytecode is ${bytecodeBytes.toLocaleString()} bytes.` : 'The RPC returned empty runtime bytecode.',
        where: 'Arc testnet · latest block',
      },
    ] as const
    const result = contractScanSchema.parse({
      id: address,
      name: `${address.slice(0, 6)}…${address.slice(-4)}`,
      kind: isContract ? 'Live Arc contract' : 'Address without bytecode',
      addr: address,
      headline: isContract ? 'Live bytecode was found on Arc testnet.' : 'No deployed contract was found at this address.',
      beat: { every: 2, jitter: 0.2 }, flow: { dep: 0, wd: 0, fail: 0 },
      owner: { type: 'unknown', label: 'Not inferred from RPC-only scan', dots: 0, lit: 0, last: 'No owner analysis yet' },
      facts: [['Network', 'Arc testnet'], ['Runtime bytecode', `${bytecodeBytes.toLocaleString()} bytes`], ['Native balance', `${nativeBalance.toFixed(6)} ETH equivalent`]],
      powers: [], findings,
    })

    await saveHistory(wallet, address, 'complete', { headline: result.headline, findings: result.findings.length }).catch((error) => {
      console.warn(JSON.stringify({ event: 'pulse.scan_history.write_failed', route: 'contract-scan', requestId, errorName: error instanceof Error ? error.name : 'unknown' }))
    })
    console.info(JSON.stringify({ event: 'pulse.contract_scan.completed', requestId, durationMs: Date.now() - startedAt, isContract, bytecodeBytes }))
    return response(requestId, result)
  } catch (error) {
    await saveHistory(wallet, address, 'failed', { error: 'arc_rpc_unavailable' }).catch(() => undefined)
    console.error(JSON.stringify({ event: 'pulse.contract_scan.failed', requestId, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : 'unknown' }))
    return response(requestId, { error: 'arc_rpc_unavailable' }, 502)
  }
}
