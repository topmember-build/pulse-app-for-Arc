'use client'

import { PrivyProvider } from '@privy-io/react-auth'

export type PaymentChain = { chainId: number; chainName: string; rpcUrl: string; explorerUrl: string }

export function PrivyAppProvider({ children, appId, paymentChain }: { children: React.ReactNode; appId?: string; paymentChain?: PaymentChain }) {
  // The payment network must be known to Privy so wallets can switch to it for deep-scan payments.
  const supportedChains = paymentChain
    ? [{
        id: paymentChain.chainId,
        name: paymentChain.chainName,
        network: paymentChain.chainName.toLowerCase().replace(/\s+/g, '-'),
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: { default: { http: [paymentChain.rpcUrl] } },
        blockExplorers: { default: { name: 'Explorer', url: paymentChain.explorerUrl } },
      }]
    : undefined

  if (!appId) return children

  return (
    <PrivyProvider
      appId={appId}
      config={{
        ...(supportedChains ? { supportedChains } : {}),
        // Pulse only needs a wallet connection to pay for deep scans. No email login and no
        // Privy-created wallet: the user brings the wallet they already have.
        loginMethods: ['wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'off' } },
        appearance: {
          theme: 'dark',
          accentColor: '#ff5a45',
          landingHeader: 'Connect to Pulse',
          walletList: ['detected_ethereum_wallets', 'coinbase_wallet', 'metamask'],
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
