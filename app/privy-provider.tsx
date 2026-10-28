'use client'

import { PrivyProvider } from '@privy-io/react-auth'

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!appId) return children

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
        appearance: {
          theme: 'dark',
          accentColor: '#ff735d',
          landingHeader: 'Connect to Pulse',
          walletList: ['detected_ethereum_wallets', 'coinbase_wallet', 'metamask'],
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
