import { STRING_COUNT } from '../music/tunings'

/**
 * Physical scale of the neck. Measured on a Pixel 7 Pro (5.77) and a Galaxy Z Fold
 * inner screen (5.5); the CSS `mm` unit is not physical on phones.
 */
export const PX_PER_MM = 5.7
export const HEAD_WIDTH = 34
export const NUT_WIDTH = 10
export const MIN_FRET_COUNT = 2
export const MAX_FRET_COUNT = 7
export const NECK_PLACEMENTS = ['top', 'center', 'bottom'] as const
export type NeckPlacement = (typeof NECK_PLACEMENTS)[number]

const STRING_EDGE_INSET_MM = 3.5
const MIN_PICK_ZONE = 140
const FREE_HEIGHT_ABOVE_NECK: Record<NeckPlacement, number> = { top: 0, center: 0.5, bottom: 1 }

export interface NeckOptions {
  width: number
  height: number
  neckWidthMm: number
  fretWidthMm: number
  neckPlacement: NeckPlacement
  leftHanded: boolean
  lowStringOnTop: boolean
}

/**
 * Surface-local geometry. Lengths along the neck are expressed on a "neck axis"
 * that always starts at the headstock (0) and ends at the bridge (width),
 * whatever the handedness; `toNeckAxis` converts a surface x to it.
 */
export interface NeckGeometry {
  width: number
  height: number
  fretCount: number
  leftHanded: boolean
  stringSpacing: number
  neckTop: number
  neckHeight: number
  /** y of each string line, by visual row (0 = top). */
  stringYs: readonly number[]
  /** Audio string index (0 = lowest pitch) shown on each visual row. */
  stringOfRow: readonly number[]
  boardStart: number
  boardEnd: number
  fretWidth: number
}

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM
}

/** As many whole frets as fit once the headstock and a minimal picking zone are set aside. */
export function visibleFretCount(surfaceWidth: number, fretWidth: number): number {
  const fitting = Math.floor((surfaceWidth - HEAD_WIDTH - NUT_WIDTH - MIN_PICK_ZONE) / fretWidth)
  return Math.min(MAX_FRET_COUNT, Math.max(MIN_FRET_COUNT, fitting))
}

export function computeNeckGeometry(options: NeckOptions): NeckGeometry {
  const { width, height, leftHanded, lowStringOnTop } = options
  const neckHeight = Math.min(mmToPx(options.neckWidthMm), height)
  const neckTop = (height - neckHeight) * FREE_HEIGHT_ABOVE_NECK[options.neckPlacement]
  const edgeInset = mmToPx(STRING_EDGE_INSET_MM)
  const stringSpacing = (neckHeight - 2 * edgeInset) / (STRING_COUNT - 1)
  const fretWidth = mmToPx(options.fretWidthMm)
  const fretCount = visibleFretCount(width, fretWidth)
  const rows = Array.from({ length: STRING_COUNT }, (_, row) => row)
  const boardStart = HEAD_WIDTH + NUT_WIDTH

  return {
    width,
    height,
    fretCount,
    leftHanded,
    stringSpacing,
    neckTop,
    neckHeight,
    stringYs: rows.map((row) => neckTop + edgeInset + stringSpacing * row),
    stringOfRow: rows.map((row) => (lowStringOnTop ? row : STRING_COUNT - 1 - row)),
    boardStart,
    boardEnd: boardStart + fretWidth * fretCount,
    fretWidth,
  }
}

export function toNeckAxis(geometry: NeckGeometry, x: number): number {
  return geometry.leftHanded ? geometry.width - x : x
}

/** CSS left/width of a neck-axis span, mirrored for left-handed layouts. */
export function spanOnSurface(
  geometry: NeckGeometry,
  from: number,
  to: number,
): { left: number; width: number } {
  return { left: geometry.leftHanded ? geometry.width - to : from, width: to - from }
}

export type Zone = 'head' | 'fret' | 'pick'

export function zoneAt(geometry: NeckGeometry, neckAxis: number): Zone {
  if (neckAxis >= geometry.boardEnd) return 'pick'
  return neckAxis >= geometry.boardStart ? 'fret' : 'head'
}

/** Fret cell under a neck-axis position, clamped to the visible window. */
export function cellAt(geometry: NeckGeometry, neckAxis: number): number {
  const cell = Math.floor((neckAxis - geometry.boardStart) / geometry.fretWidth)
  return Math.min(geometry.fretCount - 1, Math.max(0, cell))
}

export function cellCenter(geometry: NeckGeometry, cell: number): number {
  return geometry.boardStart + geometry.fretWidth * (cell + 0.5)
}

/** y halfway between a string row and the next one. */
export function gapCenter(geometry: NeckGeometry, row: number): number {
  return (geometry.stringYs[0] ?? 0) + geometry.stringSpacing * (row + 0.5)
}

export function nearestRow(geometry: NeckGeometry, y: number): number {
  const row = Math.round((y - (geometry.stringYs[0] ?? 0)) / geometry.stringSpacing)
  return Math.min(STRING_COUNT - 1, Math.max(0, row))
}

export function isOnNeck(geometry: NeckGeometry, y: number): boolean {
  return y >= geometry.neckTop && y <= geometry.neckTop + geometry.neckHeight
}
