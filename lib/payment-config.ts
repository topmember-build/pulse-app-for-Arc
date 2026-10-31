// Deep-scan payment settings. Everything comes from environment variables so the
// network, token and price can change without code edits. Defaults target Arc Testnet.
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type PaymentConfig = {
  enabled: boolean
  chainId: number
  chainName: string
  rpcUrl: string
  explorerUrl: string
  usdc: string
  receiver: string | null
  // When set, deep scans are paid through the PulseScanPayments contract (native USDC, one transaction).
  contract: string | null
  priceUnits: string
  // Price in the 18-decimal native USDC view (what the contract's msg.value uses).
  priceNativeUnits: string
  priceDisplay: string
}

// Parses a decimal USDC amount (up to 6 places) into 6-decimal base units.
export function parseUsdcUnits(value: string): bigint | null {
  const match = value.trim().match(/^(\d{1,9})(?:\.(\d{1,6}))?$/)
  if (!match) return null
  return BigInt(match[1]) * BigInt(1_000_000) + BigInt((match[2] ?? '').padEnd(6, '0') || '0')
}

export function formatUsdcUnits(units: bigint): string {
  const whole = units / BigInt(1_000_000)
  const fraction = (units % BigInt(1_000_000)).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function getPaymentConfig(): PaymentConfig {
  const receiverRaw = process.env.PULSE_RECEIVING_ADDRESS?.trim() ?? ''
  const receiver = ADDRESS.test(receiverRaw) && receiverRaw.toLowerCase() !== ZERO_ADDRESS ? receiverRaw.toLowerCase() : null
  const chainId = Number.parseInt(process.env.PULSE_PAYMENT_CHAIN_ID ?? '5042002', 10)
  const usdcRaw = process.env.PULSE_PAYMENT_USDC_ADDRESS?.trim() || '0x3600000000000000000000000000000000000000'
  const price = parseUsdcUnits(process.env.PULSE_DEEP_SCAN_PRICE_USDC ?? '0.001')
  const usdc = ADDRESS.test(usdcRaw) ? usdcRaw.toLowerCase() : null
  const contractRaw = process.env.PULSE_PAYMENT_CONTRACT?.trim() ?? ''
  const contract = ADDRESS.test(contractRaw) && contractRaw.toLowerCase() !== ZERO_ADDRESS ? contractRaw.toLowerCase() : null

  return {
    enabled: Boolean(receiver && usdc && price && price > BigInt(0) && Number.isSafeInteger(chainId) && chainId > 0),
    chainId: Number.isSafeInteger(chainId) && chainId > 0 ? chainId : 5042002,
    chainName: process.env.PULSE_PAYMENT_CHAIN_NAME?.trim() || 'Arc Testnet',
    rpcUrl: process.env.PULSE_PAYMENT_RPC_URL?.trim() || 'https://rpc.testnet.arc.io',
    explorerUrl: (process.env.PULSE_PAYMENT_EXPLORER_URL?.trim() || 'https://explorer.testnet.arc.io').replace(/\/+$/, ''),
    usdc: usdc ?? '0x3600000000000000000000000000000000000000',
    receiver,
    contract,
    priceUnits: (price ?? BigInt(0)).toString(),
    // 6-decimal ERC-20 units to 18-decimal native units (x 10^12).
    priceNativeUnits: ((price ?? BigInt(0)) * BigInt(1_000_000_000_000)).toString(),
    priceDisplay: formatUsdcUnits(price ?? BigInt(0)),
  }
}
