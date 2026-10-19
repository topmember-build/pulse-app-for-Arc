import type { Metadata } from 'next'
import { PrivyAppProvider } from './privy-provider'

export const metadata: Metadata = {
  title: 'Pulse for Arc',
  description: 'Check a token or contract on Arc before you trust it.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PrivyAppProvider>{children}</PrivyAppProvider></body></html>
}
