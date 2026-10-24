import { tokenScanRequestSchema, tokenScanSchema } from '@/lib/schemas'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

const RPC = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const counts = new Map<string, { count: number; resetAt: number }>()

async function rpc(method: string, params: unknown[], attempt = 0): Promise<any> {
  const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }), cache: 'no-store' })
  if (!response.ok) { if (attempt < 2) return rpc(method, params, attempt + 1); throw new Error(`Arc RPC returned ${response.status}`) }
  const body = await response.json()
  if (body.error) throw new Error(body.error.message ?? 'Arc RPC error')
  return body.result
}
const word = (value: string) => Buffer.from(value.replace(/^0x/, '').slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim()
const call = (to: string, data: string) => rpc('eth_call', [{ to, data }, 'latest'])

export async function POST(request: Request) {
  const parsed = tokenScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now(), current = counts.get(key)
  if (!current || current.resetAt <= now) counts.set(key, { count: 1, resetAt: now + 60_000 })
  else if (current.count >= 10) return Response.json({ error: 'rate_limited', retryAfter: Math.ceil((current.resetAt - now) / 1000) }, { status: 429 })
  else current.count += 1
  try {
    const address = parsed.data.address
    const [chainId, code, latest, symbolHex, nameHex, decimalsHex, supplyHex] = await Promise.all([
      rpc('eth_chainId', []), rpc('eth_getCode', [address, 'latest']), rpc('eth_blockNumber', []), call(address, '0x95d89b41'), call(address, '0x06fdde03'), call(address, '0x313ce567'), call(address, '0x18160ddd'),
    ])
    if (Number.parseInt(chainId, 16) !== 5042002) return Response.json({ error: 'wrong_network' }, { status: 502 })
    if (code === '0x') return Response.json({ error: 'not_a_contract' }, { status: 422 })
    const latestBlock = Number.parseInt(latest, 16), fromBlock = Math.max(0, latestBlock - 499)
    const logs = await rpc('eth_getLogs', [{ address, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: 'latest', topics: [TRANSFER_TOPIC] }])
    const ids = ['P', 'BUYERS', 'SELLERS', 'OTHER']
    const names = { P: 'Token contract', BUYERS: 'Recent recipients', SELLERS: 'Recent senders', OTHER: 'Other holders' }
    const blocks = Array.from({ length: Math.max(1, Math.min(140, logs.length || 1)) }, () => []) as Record<string, unknown>[][]
    logs.slice(-140).forEach((log: any, index: number) => {
      const from = `0x${log.topics[1].slice(-40)}`, to = `0x${log.topics[2].slice(-40)}`
      blocks[index].push({ from: from === '0x0000000000000000000000000000000000000000' ? 'P' : 'OTHER', to: to === '0x0000000000000000000000000000000000000000' ? 'P' : 'BUYERS', type: from.includes('0000') ? 'mint' : 'transfer', af: from, at: to, usd: 0, pts: Number.parseInt(log.data, 16) || 0, blk: Number.parseInt(log.blockNumber, 16) })
    })
    const states = blocks.map((_, index) => ({ hold: { P: 0, BUYERS: 0, SELLERS: 0, OTHER: 1 }, wallets: { P: 1, BUYERS: 0, SELLERS: 0, OTHER: 0 }, usdBuy: { P: 0, BUYERS: 0, SELLERS: 0, OTHER: 0 }, usdSell: { P: 0, BUYERS: 0, SELLERS: 0, OTHER: 0 }, edgeVol: {}, last: {}, flags: [], ev: { A: [], B: [] }, conf: { A: 0, B: 0 }, block: index }))
    const result = { N: blocks.length, ids, names, blocks, states, appear: { P: 0, BUYERS: 0, SELLERS: 0, OTHER: 0 }, cnt: blocks.map((b) => b.length), tcCum: blocks.map((_, i) => logs.slice(0, i + 1).length), pcCum: blocks.map((_, i) => Math.min(logs.slice(0, i + 1).length, 3)) }
    const output = tokenScanSchema.parse(result)
    const wallet = request.headers.get('x-pulse-wallet')
    if (wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet)) await db.execute(sql`INSERT INTO pulse_scan_history (wallet_address, scan_type, target_address, status, summary) VALUES (${wallet}, 'token', ${address}, 'complete', ${JSON.stringify({ symbol: word(symbolHex), name: word(nameHex), transfers: logs.length })}::jsonb)`)
    return Response.json({ ...output, meta: { address, symbol: word(symbolHex) || 'TOKEN', name: word(nameHex) || 'Unnamed token', decimals: Number.parseInt(decimalsHex, 16) || 18, totalSupply: supplyHex, latestBlock, transferCount: logs.length } }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('[pulse] token scan failed', error)
    return Response.json({ error: 'arc_rpc_unavailable' }, { status: 502 })
  }
}
