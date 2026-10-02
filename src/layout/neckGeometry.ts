import { STRING_COUNT } from '../music/tunings'

/**
 * Physical scale of the neck. Measured on a Pixel 7 Pro (5.77) and a Galaxy Z Fold
 * inner screen (5.5); the CSS `mm` unit is not physical on phones.
 */
export const PX_PER_MM = 5.7
export const HEAD_WIDTH = 34
export const NUT_WIDTH = 10
export const MIN_VISIBLE_FRETS = 2
export const MAX_VISIBLE_FRETS = 7
export const NECK_PLACEMENTS = ['top', 'center', 'bottom'] as const
export type NeckPlacement = (typeof NECK_PLACEMENTS)[number]

const STRING_EDGE_INSET_MM = 3.5
const STRUM_OVERSHOOT_MM = 40
// Glass gives no feel for where a string or fret ends: a finger keeps the one it holds until it is
// this far past the boundary (in string spacings, in fret widths), or a slip would cut its note.
const HELD_STRING_SLACK = 0.2
const HELD_FRET_SLACK = 0.12
// Keeps float noise from turning a whole number of frets into one more.
const EPSILON = 1e-6
const FREE_HEIGHT_ABOVE_NECK: Record<NeckPlacement, number> = { top: 0, center: 0.5, bottom: 1 }

export interface NeckOptions {
  width: number
  height: number
  neckWidthMm: number
  fretWidthMm: number
  pickZoneMm: number
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
  /** Frets showing between the nut and the picking zone; the last one may be cut. */
  visibleFrets: number
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

/** Frets that fit between the headstock and the picking zone; a fraction is a cut last fret. */
export function fittingFrets(surfaceWidth: number, fretWidth: number, pickZone: number): number {
  const fitting = (surfaceWidth - HEAD_WIDTH - NUT_WIDTH - pickZone) / fretWidth
  return Math.min(MAX_VISIBLE_FRETS, Math.max(MIN_VISIBLE_FRETS, fitting))
}

export function computeNeckGeometry(options: NeckOptions): NeckGeometry {
  const { width, height, leftHanded, lowStringOnTop } = options
  const neckHeight = Math.min(mmToPx(options.neckWidthMm), height)
  const neckTop = (height - neckHeight) * FREE_HEIGHT_ABOVE_NECK[options.neckPlacement]
  const edgeInset = mmToPx(STRING_EDGE_INSET_MM)
  const stringSpacing = (neckHeight - 2 * edgeInset) / (STRING_COUNT - 1)
  const fretWidth = mmToPx(options.fretWidthMm)
  const visibleFrets = fittingFrets(width, fretWidth, mmToPx(options.pickZoneMm))
  const rows = Array.from({ length: STRING_COUNT }, (_, row) => row)
  const boardStart = HEAD_WIDTH + NUT_WIDTH

  return {
    width,
    height,
    visibleFrets,
    leftHanded,
    stringSpacing,
    neckTop,
    neckHeight,
    stringYs: rows.map((row) => neckTop + edgeInset + stringSpacing * row),
    stringOfRow: rows.map((row) => (lowStringOnTop ? row : STRING_COUNT - 1 - row)),
    boardStart,
    boardEnd: boardStart + fretWidth * visibleFrets,
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

/** Whether a spot of the fretboard is close enough to the picking zone for a strum to land there for lack of room. */
export function nearPickZone(geometry: NeckGeometry, neckAxis: number): boolean {
  return neckAxis >= geometry.boardEnd - mmToPx(STRUM_OVERSHOOT_MM)
}

export type Zone = 'head' | 'fret' | 'pick'

export function zoneAt(geometry: NeckGeometry, neckAxis: number): Zone {
  if (neckAxis >= geometry.boardEnd) return 'pick'
  return neckAxis >= geometry.boardStart ? 'fret' : 'head'
}

/** Frets at least partly inside the window of a neck scrolled `scroll` frets past the nut. */
export function visibleFretRange(
  geometry: NeckGeometry,
  scroll: number,
): { first: number; last: number } {
  return {
    first: Math.floor(scroll + EPSILON) + 1,
    last: Math.ceil(scroll + geometry.visibleFrets - EPSILON),
  }
}

/** Fret under a neck-axis position, clamped to the visible window; a finger already on `held` tends to stay there. */
export function fretAt(
  geometry: NeckGeometry,
  scroll: number,
  neckAxis: number,
  held?: number,
): number {
  const { first, last } = visibleFretRange(geometry, scroll)
  const fromNut = scroll + (neckAxis - geometry.boardStart) / geometry.fretWidth
  const stays =
    held !== undefined && fromNut > held - 1 - HELD_FRET_SLACK && fromNut < held + HELD_FRET_SLACK
  return Math.min(last, Math.max(first, stays ? held : Math.floor(fromNut + EPSILON) + 1))
}

/** Neck-axis position of the middle of a fret. */
export function fretCenter(geometry: NeckGeometry, scroll: number, fret: number): number {
  return geometry.boardStart + geometry.fretWidth * (fret - 0.5 - scroll)
}

/** y halfway between a string row and the next one. */
export function gapCenter(geometry: NeckGeometry, row: number): number {
  return (geometry.stringYs[0] ?? 0) + geometry.stringSpacing * (row + 0.5)
}

/** String row nearest to `y`; a finger already on `held` tends to stay there. */
export function nearestRow(geometry: NeckGeometry, y: number, held?: number): number {
  const exact = (y - (geometry.stringYs[0] ?? 0)) / geometry.stringSpacing
  if (held !== undefined && Math.abs(exact - held) <= 0.5 + HELD_STRING_SLACK) return held
  return Math.min(STRING_COUNT - 1, Math.max(0, Math.round(exact)))
}

export function isOnNeck(geometry: NeckGeometry, y: number): boolean {
  return y >= geometry.neckTop && y <= geometry.neckTop + geometry.neckHeight
}
