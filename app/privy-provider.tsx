'use client'

import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect } from 'react'

function PulseWalletBridge() {
  const { login, logout, authenticated, user, ready } = usePrivy()
  const { wallets } = useWallets()

  useEffect(() => {
    if (!ready) return

    window.__pulsePrivyLogin = login
    window.__pulsePrivyLogout = logout

    if (authenticated && user) {
      const wallet = wallets.find((item) => item.walletClientType === 'privy') ?? wallets[0]
      window.__pulsePrivyAccount = {
        authenticated: true,
        email: user.email?.address,
        address: wallet?.address,
        walletType: wallet?.walletClientType,
      }
      window.dispatchEvent(new CustomEvent('pulse:privy-authenticated', { detail: window.__pulsePrivyAccount }))
    }

    return () => {
      delete window.__pulsePrivyLogin
      delete window.__pulsePrivyLogout
    }
  }, [authenticated, login, logout, ready, user, wallets])

  return null
}

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!appId) return children

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: { createOnLogin: 'all-users' },
        appearance: {
          theme: 'dark',
          accentColor: '#ff5a45',
          landingHeader: 'Connect to Pulse',
          walletList: ['detected_ethereum_wallets', 'coinbase_wallet', 'metamask'],
        },
      }}
    >
      <PulseWalletBridge />
      {children}
    </PrivyProvider>
  )
}

declare global {
  interface Window {
    __pulsePrivyLogin?: () => void
    __pulsePrivyLogout?: () => void
    __pulsePrivyAccount?: {
      authenticated: boolean
      email?: string
      address?: string
      walletType?: string
    }
  }
}
