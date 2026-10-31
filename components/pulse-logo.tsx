// The Pulse logo: a heart with a heartbeat line through it. Colours follow the active theme.
const HEART = 'M256 428 C150 344 86 282 86 204 C86 150 128 110 178 110 C212 110 242 128 256 158 C270 128 300 110 334 110 C384 110 426 150 426 204 C426 282 362 344 256 428 Z'

export function PulseLogo({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 512 512" className={className} fill="none">
      <path d={HEART} fill="var(--pulse-accent)" fillOpacity="0.14" />
      <path d={HEART} stroke="var(--pulse-accent)" strokeWidth="30" strokeLinejoin="round" />
      <polyline points="60,266 172,266 204,216 238,340 282,148 322,292 346,266 452,266" stroke="var(--pulse-bone)" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="452" cy="266" r="16" fill="var(--pulse-amber)" />
    </svg>
  )
}
