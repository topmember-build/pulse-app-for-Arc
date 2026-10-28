import { randomUUID } from 'node:crypto'
import { ARC_NETWORK } from './arc-network'

export const ARC_RPC_URL = process.env.ARC_RPC_URL?.trim() || ARC_NETWORK.rpcUrl

const RETRYABLE_RPC_CODES = new Set([-32005, -32014, -32016, -32603])
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

type RpcResponse = {
  result?: unknown
  error?: { code?: number; message?: string }
}

export async function callArcRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(ARC_RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      })

      if (!response.ok) {
        if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
          await pause(150 * (attempt + 1))
          continue
        }
        throw new Error('arc_rpc_http_error')
      }

      const payload = await response.json() as RpcResponse
      if (payload.error) {
        if (attempt < 2 && RETRYABLE_RPC_CODES.has(payload.error.code ?? 0)) {
          await pause(150 * (attempt + 1))
          continue
        }
        throw new Error('arc_rpc_method_error')
      }
      if (!('result' in payload)) throw new Error('arc_rpc_invalid_response')
      return payload.result as T
    } catch (error) {
      const retryable = error instanceof TypeError
        || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      if (attempt < 2 && retryable) {
        await pause(150 * (attempt + 1))
        continue
      }
      throw error
    }
  }

  throw new Error('arc_rpc_unavailable')
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
