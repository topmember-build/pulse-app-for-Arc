'use client'

import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect } from 'react'

const ARC_TESTNET_CHAIN_ID = 5042002

function PulseWalletBridge() {
  const { login, logout, authenticated, user, ready } = usePrivy()
  const { wallets } = useWallets()

  useEffect(() => {
    const wallet = wallets.find((item) => item.walletClientType === 'privy') ?? wallets[0]
    window.__pulsePrivyConnect = login
    window.__pulsePrivySendUsdc = async () => {
      throw new Error('USDC settlement is not enabled until the payment contract is configured')
    }
    window.__pulsePrivySwitchToArc = async () => {
      if (!wallet) throw new Error('Connect a wallet first')
      await wallet.switchChain(ARC_TESTNET_CHAIN_ID)
    }
    return () => { delete window.__pulsePrivyConnect; delete window.__pulsePrivySendUsdc; delete window.__pulsePrivySwitchToArc }
  }, [login, wallets])

  useEffect(() => {
    if (!ready) return

    window.__pulsePrivyLogin = login
    window.__pulsePrivyConnect = login
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
    } else {
      delete window.__pulsePrivyAccount
      window.dispatchEvent(new CustomEvent('pulse:privy-signed-out'))
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
        embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
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
    __pulsePrivyConnect?: () => void
    __pulsePrivyLogout?: () => void
    __pulsePrivySwitchToArc?: () => Promise<void>
    __pulsePrivySendUsdc?: (to: string, amount: number) => Promise<string>
    __pulsePrivyAccount?: {
      authenticated: boolean
      email?: string
      address?: string
      walletType?: string
    }
  }
}
