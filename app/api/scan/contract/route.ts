import { contractScanRequestSchema, contractScanSchema } from '@/lib/schemas'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

const ARC_RPC_URL = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID = 5042002

const requestCounts = new Map<string, { count: number; resetAt: number }>()

async function rpc(method: string, params: unknown[], attempt = 0): Promise<string> {
  const response = await fetch(ARC_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    cache: 'no-store',
  })
  if (!response.ok) {
    if (attempt < 2) return rpc(method, params, attempt + 1)
    throw new Error(`Arc RPC returned ${response.status}`)
  }
  const body = await response.json()
  if (body.error) throw new Error(body.error.message ?? 'Arc RPC error')
  return body.result as string
}

export async function POST(request: Request) {
  const parsed = contractScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now(), current = requestCounts.get(key)
  if (!current || current.resetAt <= now) requestCounts.set(key, { count: 1, resetAt: now + 60_000 })
  else if (current.count >= 20) return Response.json({ error: 'rate_limited', retryAfter: Math.ceil((current.resetAt - now) / 1000) }, { status: 429 })
  else current.count += 1

  try {
    const [chainId, code, balance] = await Promise.all([
      rpc('eth_chainId', []),
      rpc('eth_getCode', [parsed.data.address, 'latest']),
      rpc('eth_getBalance', [parsed.data.address, 'latest']),
    ])
    if (Number.parseInt(chainId, 16) !== ARC_CHAIN_ID) {
      return Response.json({ error: 'wrong_network' }, { status: 502 })
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
        where: `${ARC_RPC_URL} · latest`,
      },
    ] as const
    const result = {
      id: parsed.data.address,
      name: `${parsed.data.address.slice(0, 6)}…${parsed.data.address.slice(-4)}`,
      kind: isContract ? 'Live Arc contract' : 'Address without bytecode',
      addr: parsed.data.address,
      headline: isContract ? 'Live bytecode was found on Arc testnet.' : 'No deployed contract was found at this address.',
      beat: { every: 2, jitter: 0.2 }, flow: { dep: 0, wd: 0, fail: 0 },
      owner: { type: 'unknown', label: 'Not inferred from RPC-only scan', dots: 0, lit: 0, last: 'No owner analysis yet' },
      facts: [['Network', 'Arc testnet'], ['Runtime bytecode', `${bytecodeBytes.toLocaleString()} bytes`], ['Native balance', `${nativeBalance.toFixed(6)} ETH equivalent`]],
      powers: [], findings,
    }
    const parsedResult = contractScanSchema.parse(result)
    const wallet = request.headers.get('x-pulse-wallet')
    if (wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      await db.execute(sql`INSERT INTO pulse_scan_history (wallet_address, scan_type, target_address, status, summary) VALUES (${wallet}, 'contract', ${parsed.data.address}, 'complete', ${JSON.stringify({ headline: parsedResult.headline, findings: parsedResult.findings.length })}::jsonb)`)
    }
    return Response.json(parsedResult, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('[pulse] Arc scan failed', error)
    return Response.json({ error: 'arc_rpc_unavailable' }, { status: 502 })
  }
}
