export const MIN_FIRST_FRET = 1
export const MAX_FIRST_FRET = 13
export const OPEN_FRET = 0

const SINGLE_DOT_FRETS = [3, 5, 7, 9, 15, 17, 19]
const DOUBLE_DOT_FRET = 12

export function clampFirstFret(fret: number): number {
  if (!Number.isFinite(fret)) return MIN_FIRST_FRET
  return Math.min(MAX_FIRST_FRET, Math.max(MIN_FIRST_FRET, Math.round(fret)))
}

export function pitchAt(open: readonly number[], stringIndex: number, fret: number): number {
  return (open[stringIndex] ?? 0) + fret
}

/** Every pitch playable with the given fret window, open strings included. */
export function reachablePitches(
  open: readonly number[],
  firstFret: number,
  fretCount: number,
): number[] {
  const pitches = new Set<number>()
  for (const openPitch of open) {
    pitches.add(openPitch)
    for (let i = 0; i < fretCount; i++) pitches.add(openPitch + firstFret + i)
  }
  return [...pitches].sort((a, b) => a - b)
}

export function inlayDots(fret: number): 0 | 1 | 2 {
  if (fret === DOUBLE_DOT_FRET) return 2
  return SINGLE_DOT_FRETS.includes(fret) ? 1 : 0
}
