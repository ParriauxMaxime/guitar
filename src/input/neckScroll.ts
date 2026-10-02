import type { NeckGeometry } from '../layout/neckGeometry'

/** A finger counts as sliding once it has travelled this far along the neck, in frets. */
export const SLIDE_TRAVEL = 0.5

const PUSH_INSET = 12
const PUSH_FRETS_PER_SECOND = { gentle: 2.5, hard: 7 }
const SETTLE_FRETS_PER_SECOND = 8

/**
 * How hard a finger at `neckAxis` pushes an end of the visible fretboard: 0 on the board,
 * up to 1 towards the bridge edge of the screen, down to -1 towards the headstock edge.
 */
export function edgePush(geometry: NeckGeometry, neckAxis: number): number {
  const bridgeEdge = geometry.boardEnd - PUSH_INSET
  const headEdge = geometry.boardStart + PUSH_INSET
  if (neckAxis > bridgeEdge) return Math.min(1, (neckAxis - bridgeEdge) / (geometry.width - bridgeEdge))
  if (neckAxis < headEdge) return -Math.min(1, (headEdge - neckAxis) / headEdge)
  return 0
}

/**
 * Neck position (in frets past the nut) after `seconds`: sliding fingers pushing an end
 * drag the neck along, and once every fretting finger has lifted it settles on a whole fret.
 */
export function advanceScroll(
  scroll: number,
  push: number,
  fretting: boolean,
  seconds: number,
  maxScroll: number,
): number {
  if (push !== 0) {
    const { gentle, hard } = PUSH_FRETS_PER_SECOND
    const speed = gentle + (hard - gentle) * Math.abs(push)
    return Math.min(maxScroll, Math.max(0, scroll + Math.sign(push) * speed * seconds))
  }
  if (fretting) return scroll
  const target = Math.round(scroll)
  const step = SETTLE_FRETS_PER_SECOND * seconds
  return Math.abs(target - scroll) <= step ? target : scroll + Math.sign(target - scroll) * step
}
