'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { drawHeart, HEART_PORTS } from '@/components/pulse-heart-drawing'
import { heartUnit, placeCells, type PlacedCell } from '@/lib/heart-layout'
import type { TokenScan } from '@/lib/schemas'

type Holders = NonNullable<NonNullable<TokenScan['deep']>['holders']>

// Same palette as the Pulse heart: coral arteries, blue veins, amber for review signals.
const ARTERY = '#ff5a45'
const VEIN = '#4fb5e6'
const AMBER = '#f5b83d'

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`
const pctText = (value: number | null) => (value === null ? 'n/a' : `${value.toFixed(2)}%`)
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function HolderHeart({ holders }: { holders: Holders }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellsRef = useRef<PlacedCell[]>([])
  const startRef = useRef(0)
  const hoverRef = useRef<number | null>(null)
  const selectedRef = useRef<number | null>(null)
  const [size, setSize] = useState({ width: 0, height: 400 })
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const bubbles = holders.bubbles
  const reduceMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  // Only reduced-motion users need an explicit redraw on interaction; otherwise the loop redraws every frame.
  const redrawKey = reduceMotion ? `${selected}|${hovered?.index ?? ''}` : ''

  const { adjacency, resolvedLinks } = useMemo(() => {
    const index = new Map(bubbles.map((bubble, i) => [bubble.address, i]))
    const map = new Map<number, Set<number>>()
    const resolved: Array<{ a: number; b: number; kind: 'transfer' | 'funding'; count: number }> = []
    for (const link of holders.links) {
      const a = index.get(link.source)
      const b = index.get(link.target)
      if (a === undefined || b === undefined) continue
      resolved.push({ a, b, kind: link.kind, count: link.transferCount })
      map.set(a, (map.get(a) ?? new Set()).add(b))
      map.set(b, (map.get(b) ?? new Set()).add(a))
    }
    return { adjacency: map, resolvedLinks: resolved }
  }, [bubbles, holders.links])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      const width = Math.floor(el.clientWidth)
      const height = width < 560 ? Math.round(width * 1.15) : Math.round(Math.min(580, Math.max(380, width * 0.62)))
      setSize({ width, height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (size.width < 120) return
    cellsRef.current = placeCells(bubbles.map((bubble) => ({ id: bubble.address, share: bubble.share, cluster: bubble.clusterId })), size.width, size.height)
    startRef.current = performance.now()
  }, [bubbles, size])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let frame = 0
    let visible = true
    let last = 0
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }, { threshold: 0.05 })
    observer.observe(wrap)

    const curve = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
      // Quadratic curve bowed toward the heart, like a vessel leaving it.
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      return { qx: mx + (cx - mx) * 0.3, qy: my + (cy - my) * 0.3 }
    }
    const at = (ax: number, ay: number, qx: number, qy: number, bx: number, by: number, t: number) => ({
      x: (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * qx + t * t * bx,
      y: (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * qy + t * t * by,
    })

    const render = (time: number) => {
      if (visible && time - last >= 33) {
        last = time
        const cells = cellsRef.current
        const { width, height } = size
        const ctx = canvas.getContext('2d')
        if (ctx && cells.length === bubbles.length && width > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr)
            canvas.height = Math.round(height * dpr)
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, width, height)

          const cx = width / 2
          const cy = height / 2
          const u = heartUnit(width, height)
          const beat = reduceMotion ? 0 : Math.max(0, Math.sin((time % 1500) / 1500 * Math.PI * 2)) ** 12
          const out = { x: cx + HEART_PORTS.outflow[0] * u, y: cy + u * 0.06 + HEART_PORTS.outflow[1] * u }
          const focus = selectedRef.current ?? hoverRef.current
          const neighbours = focus === null ? null : adjacency.get(focus) ?? new Set<number>()
          const lit = (i: number) => focus === null || i === focus || Boolean(neighbours?.has(i))
          const elapsed = reduceMotion ? 10_000 : time - startRef.current

          // Where each cell is right now: it is pumped out of the aorta and eases into place.
          const pos = cells.map((cell, i) => {
            const t = Math.min(1, Math.max(0, (elapsed - i * 34) / 900))
            const e = easeOutCubic(t)
            return { x: out.x + (cell.x - out.x) * e, y: out.y + (cell.y - out.y) * e, t }
          })

          // Soft pulse ring leaving the heart on every beat.
          if (!reduceMotion) {
            const ring = (time % 1500) / 1500
            ctx.beginPath()
            ctx.arc(cx, cy, u * 1.5 + ring * Math.min(width, height) * 0.38, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(255,90,69,${0.16 * (1 - ring)})`
            ctx.lineWidth = 1.5
            ctx.stroke()
          }

          // Vascular beds: wallets in the same cluster are threaded by one amber vessel.
          const byCluster = new Map<number, number[]>()
          cells.forEach((cell, i) => { if (cell.cluster !== null) byCluster.set(cell.cluster, [...(byCluster.get(cell.cluster) ?? []), i]) })
          byCluster.forEach((members) => {
            if (members.length < 2) return
            const sorted = [...members].sort((a, b) => cells[a].angle - cells[b].angle)
            const glow = focus === null || sorted.includes(focus)
            ctx.beginPath()
            sorted.forEach((index, k) => { if (k === 0) ctx.moveTo(pos[index].x, pos[index].y); else ctx.lineTo(pos[index].x, pos[index].y) })
            ctx.strokeStyle = `rgba(245,184,61,${glow ? 0.38 : 0.08})`
            ctx.lineWidth = 2.2
            ctx.lineJoin = 'round'
            ctx.stroke()
          })

          // Faint capillaries from the aorta to every wallet.
          cells.forEach((_, i) => {
            if (pos[i].t <= 0) return
            const { qx, qy } = curve(out.x, out.y, pos[i].x, pos[i].y, cx, cy)
            ctx.beginPath()
            ctx.moveTo(out.x, out.y)
            ctx.quadraticCurveTo(qx, qy, pos[i].x, pos[i].y)
            ctx.strokeStyle = `rgba(255,90,69,${focus === i ? 0.55 : lit(i) ? 0.07 : 0.025})`
            ctx.lineWidth = focus === i ? 1.6 : 0.8
            ctx.stroke()
          })

          // Wallet-to-wallet flow: coral = funding, blue = transfers. Moving cells show direction.
          resolvedLinks.forEach((link, k) => {
            const a = pos[link.a]
            const b = pos[link.b]
            if (Math.min(a.t, b.t) < 1) return
            const on = focus === null || link.a === focus || link.b === focus
            const color = link.kind === 'funding' ? ARTERY : VEIN
            const { qx, qy } = curve(a.x, a.y, b.x, b.y, cx, cy)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.quadraticCurveTo(qx, qy, b.x, b.y)
            ctx.strokeStyle = `${color}${on ? '88' : '14'}`
            ctx.lineWidth = link.kind === 'funding' ? 1.5 : Math.min(2.2, 0.7 + Math.log2(1 + link.count) * 0.3)
            ctx.stroke()
            if (!reduceMotion && on) {
              const length = Math.hypot(b.x - a.x, b.y - a.y)
              const tt = ((time / (1800 + length * 5)) + k * 0.137) % 1
              const p = at(a.x, a.y, qx, qy, b.x, b.y, tt)
              ctx.beginPath()
              ctx.arc(p.x, p.y, link.kind === 'funding' ? 2.6 : 2, 0, Math.PI * 2)
              ctx.fillStyle = color
              ctx.fill()
            }
          })

          // The heart itself, beating at the token's activity level, flushed amber when linked wallets exist.
          const activity = Math.min(1, 0.35 + bubbles.length / 80)
          const attention = Math.min(1, holders.clusters.length / 4)
          drawHeart(ctx, cx, cy + u * 0.06, u, beat * activity, attention * 0.8, time)

          // Blood cells: one per wallet, biggest holders largest. Contracts are blue, wallets coral.
          cells.forEach((cell, i) => {
            const p = pos[i]
            if (p.t <= 0) return
            const bubble = bubbles[i]
            const base = bubble.isContract ? VEIN : ARTERY
            const r = cell.r * Math.min(1, 0.3 + p.t * 0.7) * (1 + beat * 0.05)
            ctx.globalAlpha = lit(i) ? 1 : 0.2
            const fill = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r)
            fill.addColorStop(0, `${base}ff`)
            fill.addColorStop(1, `${base}99`)
            ctx.beginPath()
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
            ctx.fillStyle = fill
            ctx.fill()
            // Biconcave dimple, like a red blood cell.
            ctx.beginPath()
            ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(20,0,8,0.28)'
            ctx.fill()
            ctx.beginPath()
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
            ctx.lineWidth = i === focus ? 2.5 : cell.cluster !== null ? 1.8 : 1
            ctx.strokeStyle = i === focus ? '#f1eee7' : cell.cluster !== null ? AMBER : 'rgba(40,6,14,0.8)'
            ctx.stroke()
            if (r >= 16 && bubble.pct !== null) {
              ctx.fillStyle = '#f9efe9'
              ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(`${bubble.pct >= 10 ? bubble.pct.toFixed(1) : bubble.pct.toFixed(2)}%`, p.x, p.y)
            }
            ctx.globalAlpha = 1
          })
        }
      }
      if (!reduceMotion) frame = requestAnimationFrame(render)
    }

    if (reduceMotion) render(0)
    else frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [adjacency, bubbles, holders.clusters.length, reduceMotion, resolvedLinks, size, redrawKey])

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const hitTest = (x: number, y: number) => {
    const cells = cellsRef.current
    for (let i = cells.length - 1; i >= 0; i -= 1) {
      if (Math.hypot(cells[i].x - x, cells[i].y - y) <= Math.max(cells[i].r, 10)) return i
    }
    return null
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const { x, y } = pointFromEvent(event)
    const hit = hitTest(x, y)
    hoverRef.current = hit
    setHovered(hit === null ? null : { index: hit, x, y })
  }
  const onPointerUp = (event: React.PointerEvent) => {
    const { x, y } = pointFromEvent(event)
    const hit = hitTest(x, y)
    const next = hit === selectedRef.current ? null : hit
    selectedRef.current = next
    setSelected(next)
  }
  const onPointerLeave = () => { hoverRef.current = null; setHovered(null) }
  const clearSelection = () => { selectedRef.current = null; setSelected(null) }

  const clusterIds = [...new Set(bubbles.map((bubble) => bubble.clusterId).filter((id): id is number => id !== null))].sort((a, b) => a - b)
  const tip = hovered ? bubbles[hovered.index] : null
  const picked = selected !== null ? bubbles[selected] : null
  const pickedLinks = selected !== null ? adjacency.get(selected)?.size ?? 0 : 0

  if (bubbles.length === 0) return <p className="mt-3 text-xs text-pulse-muted">No wallets with a balance were found, so there is nothing to map.</p>

  return (
    <div className="mt-4">
      <div ref={wrapRef} className="relative overflow-hidden rounded-2xl border border-pulse-line bg-[radial-gradient(ellipse_at_center,rgba(255,90,69,0.09),transparent_68%)]" style={{ height: size.height }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Heart map of the ${bubbles.length} largest wallets. The heart is the token. Each blood cell is a wallet, sized by balance. Amber rings and vessels mark linked clusters. Coral flows show funding and blue flows show transfers between wallets. The wallet list below has the same data as text.`}
          style={{ width: size.width, height: size.height, touchAction: 'pan-y', cursor: hovered ? 'pointer' : 'default' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
        {tip && hovered ? (
          <div className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-pulse-line bg-pulse-bg/95 px-3 py-2 text-xs shadow-xl" style={{ left: Math.min(hovered.x + 14, Math.max(0, size.width - 230)), top: Math.max(4, hovered.y - 56) }}>
            <p className="font-mono">{short(tip.address)}</p>
            <p className="mt-1 tabular-nums"><span className="font-semibold">{pctText(tip.pct)}</span> <span className="text-pulse-muted">{tip.balance}</span></p>
            <p className="mt-0.5 text-pulse-muted">{tip.isContract ? 'Contract' : tip.isContract === false ? 'Wallet' : 'Type unknown'}{tip.clusterId ? ` · Cluster ${tip.clusterId}` : ''}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-pulse-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: ARTERY }} />Wallet</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: VEIN }} />Contract</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2" style={{ borderColor: AMBER }} />Linked cluster{clusterIds.length > 0 ? ` (${clusterIds.length})` : ''}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2" style={{ borderColor: ARTERY }} />Funding</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2" style={{ borderColor: VEIN }} />Transfers</span>
      </div>
      <p className="mt-1.5 text-[11px] text-pulse-muted">The heart is the token. Tap a cell to isolate its connections.</p>

      {picked ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pulse-line bg-pulse-bg/70 p-3 text-xs" role="status">
          <div className="min-w-0">
            <a href={`https://explorer.arc.io/address/${picked.address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono underline decoration-pulse-line underline-offset-4 hover:text-pulse-bone">{short(picked.address)}<ExternalLink aria-hidden="true" className="size-3" /></a>
            <p className="mt-1 tabular-nums text-pulse-muted"><span className="font-semibold text-pulse-bone">{pctText(picked.pct)}</span> of supply · {picked.balance} · {pickedLinks} connection{pickedLinks === 1 ? '' : 's'}{picked.isContract ? ' · contract' : ''}{picked.clusterId ? ` · cluster ${picked.clusterId}` : ''}</p>
          </div>
          <button type="button" onClick={clearSelection} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-pulse-line px-3 text-pulse-muted transition hover:text-pulse-bone"><X aria-hidden="true" className="size-3.5" />Clear</button>
        </div>
      ) : null}
    </div>
  )
}
