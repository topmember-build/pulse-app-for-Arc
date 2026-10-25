import type { Metadata, Viewport } from 'next'
import { PrivyAppProvider } from './privy-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse for Arc — Token Activity and Contract Checks',
  description: 'Review recent Arc testnet token transfers and basic contract facts, with evidence, coverage, and limitations made clear.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#09090d',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PrivyAppProvider>{children}</PrivyAppProvider></body></html>
}
