import { getPaymentConfig } from '@/lib/payment-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public payment settings the browser needs to build the deep-scan USDC transfer.
export function GET() {
  const { enabled, chainId, chainName, rpcUrl, explorerUrl, usdc, receiver, contract, priceUnits, priceNativeUnits, priceDisplay } = getPaymentConfig()
  return Response.json(
    { enabled, chainId, chainName, rpcUrl, explorerUrl, usdc, receiver: enabled ? receiver : null, contract: enabled ? contract : null, priceUnits, priceNativeUnits, priceDisplay },
    { headers: { 'cache-control': 'no-store' } },
  )
}
