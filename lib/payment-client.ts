import type { ConnectedWallet } from '@privy-io/react-auth'
import { encodeFunctionData, toHex } from 'viem'

export type PublicPaymentConfig = {
  enabled: boolean
  chainId: number
  chainName: string
  rpcUrl: string
  explorerUrl: string
  usdc: string
  receiver: string | null
  contract: string | null
  priceUnits: string
  priceNativeUnits: string
  priceDisplay: string
}

export async function fetchPaymentConfig(): Promise<PublicPaymentConfig> {
  const response = await fetch('/api/payment/config', { cache: 'no-store' })
  if (!response.ok) throw new Error('payment_config_unavailable')
  return await response.json() as PublicPaymentConfig
}

// ERC-20 transfer(address,uint256) calldata.
function encodeTransfer(receiver: string, units: bigint) {
  return `0xa9059cbb${receiver.slice(2).toLowerCase().padStart(64, '0')}${units.toString(16).padStart(64, '0')}`
}

export class PaymentRejectedError extends Error {}

// Sends the exact deep-scan price in USDC (ERC-20 view, 6 decimals) from the connected wallet.
const PAY_ABI = [{
  type: 'function',
  name: 'pay',
  stateMutability: 'payable',
  inputs: [{ name: 'scanType', type: 'uint8' }, { name: 'target', type: 'address' }],
  outputs: [],
}] as const

export async function sendUsdcPayment(wallet: ConnectedWallet, config: PublicPaymentConfig, scan: { scanType: 'token' | 'contract'; target: string }): Promise<string> {
  if (!config.enabled || !config.receiver) throw new Error('payment_unavailable')
  try {
    await wallet.switchChain(config.chainId)
    const provider = await wallet.getEthereumProvider()
    // With the payment contract: one transaction that carries the price as native USDC and names the scan.
    const transaction = config.contract
      ? {
          from: wallet.address,
          to: config.contract,
          value: toHex(BigInt(config.priceNativeUnits)),
          data: encodeFunctionData({ abi: PAY_ABI, functionName: 'pay', args: [scan.scanType === 'token' ? 0 : 1, scan.target as `0x${string}`] }),
        }
      : { from: wallet.address, to: config.usdc, data: encodeTransfer(config.receiver, BigInt(config.priceUnits)) }
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] })
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('payment_unavailable')
    return hash
  } catch (error) {
    const code = (error as { code?: number } | null)?.code
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (code === 4001 || message.includes('reject') || message.includes('denied') || message.includes('cancel')) throw new PaymentRejectedError('rejected')
    throw error
  }
}

// Asks the paying wallet to sign the payment message. This proves the wallet that paid is
// the one claiming the scan; it costs no gas and moves no funds.
export async function signPaymentMessage(wallet: ConnectedWallet, message: string): Promise<string> {
  try {
    const provider = await wallet.getEthereumProvider()
    const hex = `0x${Array.from(new TextEncoder().encode(message)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
    const signature = await provider.request({ method: 'personal_sign', params: [hex, wallet.address] })
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('payment_signature_invalid')
    return signature
  } catch (error) {
    const code = (error as { code?: number } | null)?.code
    const message_ = error instanceof Error ? error.message.toLowerCase() : ''
    if (code === 4001 || message_.includes('reject') || message_.includes('denied') || message_.includes('cancel')) throw new PaymentRejectedError('rejected')
    throw error
  }
}
