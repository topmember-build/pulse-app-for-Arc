// Places wallet "cells" around the heart. Pure functions with no DOM access.
// Wallets that belong to the same cluster share an angular sector (a vascular bed); bigger
// holders sit on the inner rings. A short relaxation step removes overlaps and keeps every
// cell out of the heart itself.

export type HeartCell = { id: string; share: number; cluster: number | null }
export type PlacedCell = { id: string; x: number; y: number; ax: number; ay: number; r: number; angle: number; cluster: number | null }

export function heartUnit(width: number, height: number) {
  return Math.min(width, height) / 7.2
}

export function cellRadius(share: number, width: number, height: number) {
  const min = Math.max(5, Math.min(width, height) * 0.017)
  const max = Math.min(width, height) * 0.082
  return min + (max - min) * Math.sqrt(Math.max(0, Math.min(1, share)))
}

export function placeCells(cells: HeartCell[], width: number, height: number): PlacedCell[] {
  const n = cells.length
  const cx = width / 2
  const cy = height / 2
  const keepOut = heartUnit(width, height) * 1.75
  const rx = width / 2 - 8
  const ry = height / 2 - 8

  // Sector order: clusters first (grouped), then unlinked wallets.
  const order = cells
    .map((cell, rank) => ({ cell, rank }))
    .sort((a, b) => {
      const ca = a.cell.cluster ?? Number.MAX_SAFE_INTEGER
      const cb = b.cell.cluster ?? Number.MAX_SAFE_INTEGER
      return ca - cb || a.rank - b.rank
    })

  const placed: PlacedCell[] = new Array(n)
  order.forEach(({ cell, rank }, slot) => {
    const angle = -Math.PI / 2 + ((slot + 0.5) / Math.max(1, n)) * Math.PI * 2
    const band = rank < 8 ? 0.56 : rank < 24 ? 0.76 : rank % 2 === 0 ? 0.9 : 0.97
    const ax = cx + Math.cos(angle) * rx * band
    const ay = cy + Math.sin(angle) * ry * band
    placed[rank] = { id: cell.id, x: ax, y: ay, ax, ay, r: cellRadius(cell.share, width, height), angle, cluster: cell.cluster }
  })

  relax(placed, width, height, keepOut, 140)
  return placed
}

export function relax(cells: PlacedCell[], width: number, height: number, keepOut: number, iterations: number) {
  const cx = width / 2
  const cy = height / 2
  for (let pass = 0; pass < iterations; pass += 1) {
    const spring = pass < iterations - 40 ? 0.04 : 0
    for (const cell of cells) {
      cell.x += (cell.ax - cell.x) * spring
      cell.y += (cell.ay - cell.y) * spring
    }
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]
        const b = cells[j]
        const dx = b.x - a.x || 0.01
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.01
        const minDist = a.r + b.r + 3
        if (dist >= minDist) continue
        const push = (minDist - dist) / 2
        a.x -= (dx / dist) * push
        a.y -= (dy / dist) * push
        b.x += (dx / dist) * push
        b.y += (dy / dist) * push
      }
    }
    for (const cell of cells) {
      const dx = cell.x - cx
      const dy = cell.y - cy
      const dist = Math.hypot(dx, dy) || 0.01
      const min = keepOut + cell.r
      if (dist < min) {
        cell.x = cx + (dx / dist) * min
        cell.y = cy + (dy / dist) * min
      }
      cell.x = Math.min(width - cell.r - 2, Math.max(cell.r + 2, cell.x))
      cell.y = Math.min(height - cell.r - 2, Math.max(cell.r + 2, cell.y))
    }
  }
}
