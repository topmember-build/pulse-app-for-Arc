import { randomUUID } from 'node:crypto'
import { ARC_NETWORK } from './arc-network'

export const ARC_RPC_URL = process.env.ARC_RPC_URL?.trim() || ARC_NETWORK.rpcUrl

const RETRYABLE_RPC_CODES = new Set([-32005, -32014, -32016, -32603])
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

// The public Arc RPC answers HTTP 429 after a short burst (about five requests in a row), so every
// request in this process is spaced out. Batching many calls into one request keeps scans fast.
// A dedicated provider allows far more; set ARC_RPC_MIN_GAP_MS (for example 20) to speed scans up.
const MIN_REQUEST_GAP_MS = Math.max(0, Number.parseInt(process.env.ARC_RPC_MIN_GAP_MS ?? '', 10) || 230)
const MAX_ATTEMPTS = 5


// Alchemy's free plan only allows eth_getLogs over 10 blocks, which is too small for scans. Log reads
// therefore go to ARC_LOGS_RPC_URL (the public Arc RPC by default) and everything else to ARC_RPC_URL.
export const ARC_LOGS_RPC_URL = process.env.ARC_LOGS_RPC_URL?.trim() || ARC_NETWORK.rpcUrl
const gapFor = (url: string) => (url === ARC_RPC_URL ? MIN_REQUEST_GAP_MS : 230)
const nextSlots = new Map<string, number>()

async function takeSlot(url: string) {
  const now = Date.now()
  const slot = Math.max(now, nextSlots.get(url) ?? 0)
  nextSlots.set(url, slot + gapFor(url))
  if (slot > now) await pause(slot - now)
}

function retryDelay(response: Response | null, attempt: number) {
  const header = Number(response?.headers.get('retry-after'))
  if (Number.isFinite(header) && header > 0) return Math.min(4000, header * 1000)
  return Math.min(4000, 400 * 2 ** attempt)
}

type RpcResponse = {
  id?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

async function post(body: unknown, url: string = ARC_RPC_URL): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await takeSlot(url)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        if (attempt < MAX_ATTEMPTS - 1 && (response.status === 429 || response.status >= 500)) {
          await pause(retryDelay(response, attempt))
          continue
        }
        throw new Error(`arc_rpc_http_error_${response.status}`)
      }
      return await response.json()
    } catch (error) {
      const retryable = error instanceof TypeError
        || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      if (attempt < MAX_ATTEMPTS - 1 && retryable) {
        await pause(retryDelay(null, attempt))
        continue
      }
      throw error
    }
  }
  throw new Error('arc_rpc_unavailable')
}

export async function callArcRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const payload = await post({ jsonrpc: '2.0', id: randomUUID(), method, params }, method === 'eth_getLogs' ? ARC_LOGS_RPC_URL : ARC_RPC_URL) as RpcResponse
    if (payload.error) {
      if (attempt < MAX_ATTEMPTS - 1 && RETRYABLE_RPC_CODES.has(payload.error.code ?? 0)) {
        await pause(retryDelay(null, attempt))
        continue
      }
      throw new Error('arc_rpc_method_error')
    }
    if (!('result' in payload)) throw new Error('arc_rpc_invalid_response')
    return payload.result as T
  }
  throw new Error('arc_rpc_unavailable')
}

// Sends many calls in one HTTP request. Results line up with the input; a call that failed is null.
export async function callArcRpcBatch<T = unknown>(calls: Array<{ method: string; params: unknown[] }>, chunkSize = 50): Promise<Array<T | null>> {
  const out: Array<T | null> = new Array(calls.length).fill(null)
  for (let start = 0; start < calls.length; start += chunkSize) {
    const slice = calls.slice(start, start + chunkSize)
    try {
      const payload = await post(slice.map((call, index) => ({ jsonrpc: '2.0', id: index, method: call.method, params: call.params })))
      if (!Array.isArray(payload)) continue
      for (const item of payload as RpcResponse[]) {
        const index = typeof item.id === 'number' ? item.id : -1
        if (index >= 0 && index < slice.length && !item.error && 'result' in item) out[start + index] = item.result as T
      }
    } catch {
      // Leave this chunk as nulls; callers treat missing values as "not available".
    }
  }
  return out
}

export async function optionalEthCall(address: string, data: string, blockTag = 'latest') {
  try {
    const result = await callArcRpc<unknown>('eth_call', [{ to: address, data }, blockTag])
    return typeof result === 'string' ? result : null
  } catch {
    return null
  }
}

export function parseRpcQuantity(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null
  const parsed = Number.parseInt(value, 16)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function parseRpcBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

export function decodeAbiString(value: string | null): string | null {
  if (!value || !/^0x[0-9a-f]*$/i.test(value)) return null
  const data = value.slice(2)
  if (data.length < 64) return null

  try {
    const firstWord = BigInt(`0x${data.slice(0, 64)}`)
    let start = 0
    let length = 32

    if (firstWord === BigInt(32) && data.length >= 128) {
      const dynamicLength = Number(BigInt(`0x${data.slice(64, 128)}`))
      if (!Number.isSafeInteger(dynamicLength) || dynamicLength < 0 || dynamicLength > 1024) return null
      start = 128
      length = dynamicLength
    }

    const decoded = Buffer.from(data.slice(start, start + length * 2), 'hex')
      .toString('utf8')
      .replace(/\0+$/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
    return decoded ? decoded.slice(0, 64) : null
  } catch {
    return null
  }
}

export function decodeAbiAddress(value: string | null): string | null {
  if (!value || !/^0x[0-9a-f]{64,}$/i.test(value)) return null
  const word = value.slice(2, 66)
  if (!/^0{24}$/i.test(word.slice(0, 24))) return null
  return `0x${word.slice(-40).toLowerCase()}`
}

export function decodeAbiBoolean(value: string | null): boolean | null {
  if (!value || !/^0x[0-9a-f]{64}$/i.test(value)) return null
  try {
    const word = BigInt(value)
    if (word === BigInt(0)) return false
    if (word === BigInt(1)) return true
    return null
  } catch {
    return null
  }
}

export function decodeStorageAddress(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) return null
  const address = value.slice(-40).toLowerCase()
  if (/^0{40}$/.test(address)) return null
  return `0x${address}`
}
