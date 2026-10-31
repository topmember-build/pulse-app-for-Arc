import type { Metadata, Viewport } from 'next'
import { PrivyAppProvider } from './privy-provider'
import { getPaymentConfig } from '@/lib/payment-config'
import './globals.css'

export const dynamic = 'force-dynamic'

// Applies the saved theme before first paint so the page never flashes the wrong colours.
const THEME_SCRIPT = "try{var t=localStorage.getItem('pulse-theme');document.documentElement.className=t==='light'?'light':'dark'}catch(e){}"

export const metadata: Metadata = {
  title: 'Pulse for Arc Mainnet — Live Token and Contract Analysis',
  description: 'Scan live Arc Mainnet transfer events and contract properties with authenticated, database-backed history and transparent evidence coverage.',
  applicationName: 'Pulse for Arc',
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#140a13',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const payment = getPaymentConfig()
  const paymentChain = { chainId: payment.chainId, chainName: payment.chainName, rpcUrl: payment.rpcUrl, explorerUrl: payment.explorerUrl }
  return <html lang="en" className="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head><body><PrivyAppProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID} paymentChain={paymentChain}>{children}</PrivyAppProvider></body></html>
}
