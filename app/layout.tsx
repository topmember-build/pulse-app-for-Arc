import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pulse for Arc',
  description: 'Check a token or contract on Arc before you trust it.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
