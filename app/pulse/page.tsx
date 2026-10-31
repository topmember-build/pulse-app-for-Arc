import { PulseDashboard } from '@/components/pulse-dashboard'

export const dynamic = 'force-dynamic'

export default function PulsePage() {
  return <PulseDashboard privyConfigured={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID)} />
}
