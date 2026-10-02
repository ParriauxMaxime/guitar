import { describe, expect, it } from 'vitest'
import { computeNeckGeometry } from '../layout/neckGeometry'
import { aimedRow, type HeldSpot } from './autocorrect'

const neck = computeNeckGeometry({
  width: 892,
  height: 368,
  neckWidthMm: 46,
  fretWidthMm: 27,
  pickZoneMm: 16,
  neckPlacement: 'center',
  leftHanded: false,
  lowStringOnTop: false,
})

/** y of a point `offset` string spacings below the string of `row`. */
const at = (row: number, offset = 0) => neck.stringYs[row]! + offset * neck.stringSpacing

describe('aimedRow', () => {
  it('is the nearest string when nothing is held, at every level', () => {
    for (const level of ['off', 'light', 'full'] as const) {
      expect(aimedRow(neck, at(2), 2, [], level)).toBe(2)
      expect(aimedRow(neck, at(2, 0.4), 2, [], level)).toBe(2)
      expect(aimedRow(neck, at(2, 0.6), 2, [], level)).toBe(3)
      expect(aimedRow(neck, at(0, -3), 2, [], level)).toBe(0)
      expect(aimedRow(neck, at(5, 3), 2, [], level)).toBe(5)
    }
  })

  it('never corrects when it is off', () => {
    const taken: HeldSpot[] = [{ row: 2, fret: 2 }]
    expect(aimedRow(neck, at(2, 0.1), 2, taken, 'off')).toBe(2)
    expect(aimedRow(neck, at(2, 0.4), 3, taken, 'off')).toBe(2)
  })

  it('moves a finger off a string already pressed at that very fret, towards the side it leans', () => {
    const taken: HeldSpot[] = [{ row: 2, fret: 2 }]
    for (const level of ['light', 'full'] as const) {
      expect(aimedRow(neck, at(2, 0.1), 2, taken, level)).toBe(3)
      expect(aimedRow(neck, at(2, -0.1), 2, taken, level)).toBe(1)
    }
  })

  it('finds the only free neighbour of two strings pressed side by side', () => {
    const aChordSoFar: HeldSpot[] = [
      { row: 2, fret: 2 },
      { row: 3, fret: 2 },
    ]
    expect(aimedRow(neck, at(2, 0.1), 2, aChordSoFar, 'light')).toBe(1)
    expect(aimedRow(neck, at(3, -0.1), 2, aChordSoFar, 'light')).toBe(4)
  })

  it('stays put when both neighbours are pressed at that fret too', () => {
    const taken: HeldSpot[] = [1, 2, 3].map((row) => ({ row, fret: 2 }))
    expect(aimedRow(neck, at(2, 0.1), 2, taken, 'full')).toBe(2)
  })

  it('light settles only the close calls against a string held at another fret', () => {
    const taken: HeldSpot[] = [{ row: 2, fret: 3 }]
    expect(aimedRow(neck, at(2, 0.2), 2, taken, 'light')).toBe(2)
    expect(aimedRow(neck, at(2, 0.3), 2, taken, 'light')).toBe(3)
    expect(aimedRow(neck, at(2, -0.3), 2, taken, 'light')).toBe(1)
  })

  it('full allows a single finger per string', () => {
    const taken: HeldSpot[] = [{ row: 2, fret: 3 }]
    expect(aimedRow(neck, at(2, 0.05), 2, taken, 'full')).toBe(3)
    expect(aimedRow(neck, at(2, -0.05), 5, taken, 'full')).toBe(1)
  })

  it('has nowhere to go past the outer strings', () => {
    expect(aimedRow(neck, at(0, -0.2), 2, [{ row: 0, fret: 2 }], 'full')).toBe(1)
    expect(aimedRow(neck, at(5, 0.2), 2, [{ row: 5, fret: 2 }], 'full')).toBe(4)
  })
})
