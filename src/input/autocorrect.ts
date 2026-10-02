import type { NeckGeometry } from '../layout/neckGeometry'

export const AUTOCORRECT_LEVELS = ['off', 'light', 'full'] as const
export type Autocorrect = (typeof AUTOCORRECT_LEVELS)[number]

/** String row and fret another finger already holds. */
export interface HeldSpot {
  row: number
  fret: number
}

// How much farther than a taken string, in string spacings, a free one may be and still win.
const SAME_FRET_TWICE = 1.5
const TAKEN: Record<Exclude<Autocorrect, 'off'>, number> = { light: 0.5, full: 1.5 }

/**
 * String row a landing finger is most likely aiming for. Glass has no strings to feel, so a
 * finger often lands between two: one that another finger already holds then gives way to its
 * free neighbour. Pressing the same fret of a string twice is never meant, so that is always
 * corrected; `full` allows a single finger per string, `light` only settles the close calls.
 */
export function aimedRow(
  geometry: NeckGeometry,
  y: number,
  fret: number,
  taken: readonly HeldSpot[],
  level: Autocorrect,
): number {
  const { stringYs, stringSpacing } = geometry
  const last = stringYs.length - 1
  const nearest = Math.min(last, Math.max(0, Math.round((y - (stringYs[0] ?? 0)) / stringSpacing)))
  if (level === 'off') return nearest

  const reluctance = (row: number) => {
    const others = taken.filter((spot) => spot.row === row)
    if (others.length === 0) return 0
    return others.some((spot) => spot.fret === fret) ? SAME_FRET_TWICE : TAKEN[level]
  }

  let aimed = nearest
  let lowestCost = Infinity
  for (const row of [nearest, nearest - 1, nearest + 1]) {
    const lineY = stringYs[row]
    if (lineY === undefined) continue
    const cost = Math.abs(y - lineY) / stringSpacing + reluctance(row)
    if (cost < lowestCost) {
      aimed = row
      lowestCost = cost
    }
  }
  return aimed
}
