'use client'

import { useEffect, useRef } from 'react'
function PulseFrame() {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.data?.type === 'pulse:login') window.__pulsePrivyLogin?.()
      if (event.data?.type === 'pulse:logout') window.__pulsePrivyLogout?.()
    }
    const forwardAccount = (event: Event) => frameRef.current?.contentWindow?.postMessage({ type: 'pulse:account', detail: (event as CustomEvent).detail }, location.origin)
    const forwardSignOut = () => frameRef.current?.contentWindow?.postMessage({ type: 'pulse:signed-out' }, location.origin)
    window.addEventListener('message', onMessage)
    window.addEventListener('pulse:privy-authenticated', forwardAccount)
    window.addEventListener('pulse:privy-signed-out', forwardSignOut)
    return () => { window.removeEventListener('message', onMessage); window.removeEventListener('pulse:privy-authenticated', forwardAccount); window.removeEventListener('pulse:privy-signed-out', forwardSignOut) }
  }, [])

  return <iframe ref={frameRef} title="Pulse for Arc scanner" src="/pulse/index.html" onLoad={() => { if (window.__pulsePrivyAccount) frameRef.current?.contentWindow?.postMessage({ type: 'pulse:account', detail: window.__pulsePrivyAccount }, location.origin) }} className="h-screen w-full border-0 bg-[#090909]" />
}

export default function PulsePage() {
  return <PulseFrame />
}
