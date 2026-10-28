import type { Metadata, Viewport } from 'next'
import { PrivyAppProvider } from './privy-provider'
import './globals.css'

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
  return <html lang="en" className="dark"><body><PrivyAppProvider>{children}</PrivyAppProvider></body></html>
}
