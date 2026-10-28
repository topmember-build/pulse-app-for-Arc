'use client'

import { useEffect, useRef } from 'react'
import { drawHeart } from '@/components/pulse-heart-drawing'

type PulseHeartProps = {
  activityLevel?: number
  attentionLevel?: number
  label?: string
  className?: string
}

export function PulseHeart({
  activityLevel = 0.28,
  attentionLevel = 0,
  label = 'Anatomical heart illustration for Pulse on Arc',
  className = '',
}: PulseHeartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activity = Math.min(1, Math.max(0, activityLevel))
  const attention = Math.min(1, Math.max(0, attentionLevel))

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let lastFrame = 0

    const drawFrame = (time: number) => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.max(1, Math.round(bounds.width * pixelRatio))
      const nextHeight = Math.max(1, Math.round(bounds.height * pixelRatio))

      if (nextWidth !== canvas.width || nextHeight !== canvas.height) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, bounds.width, bounds.height)
      const beatPhase = reducedMotion ? 0 : Math.max(0, Math.sin((time % 1500) / 1500 * Math.PI * 2)) ** 12
      const unit = Math.min(bounds.width, bounds.height) / 3.25
      drawHeart(context, bounds.width / 2, bounds.height / 2 + unit * 0.06, unit, beatPhase * activity, attention * 0.8, time)

    }

    const animate = (time: number) => {
      if (time - lastFrame >= 40) {
        lastFrame = time
        drawFrame(time)
      }
      if (!reducedMotion) frame = window.requestAnimationFrame(animate)
    }

    if (reducedMotion) drawFrame(0)
    else frame = window.requestAnimationFrame(animate)

    const observer = new ResizeObserver(() => drawFrame(lastFrame))
    observer.observe(canvas)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [activity, attention])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={className}
    />
  )
}
