import { describe, expect, it } from 'vitest'
import { computeNeckGeometry } from '../layout/neckGeometry'
import { advanceScroll, edgePush } from './neckScroll'

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

describe('edgePush', () => {
  it('is zero on the fretboard', () => {
    expect(edgePush(neck, neck.boardStart + 20)).toBe(0)
    expect(edgePush(neck, (neck.boardStart + neck.boardEnd) / 2)).toBe(0)
    expect(edgePush(neck, neck.boardEnd - 20)).toBe(0)
  })

  it('grows towards the bridge edge of the screen', () => {
    const justPast = edgePush(neck, neck.boardEnd)
    const deeper = edgePush(neck, neck.boardEnd + 50)
    expect(justPast).toBeGreaterThan(0)
    expect(deeper).toBeGreaterThan(justPast)
    expect(edgePush(neck, neck.width)).toBe(1)
    expect(edgePush(neck, neck.width + 40)).toBe(1)
  })

  it('grows, negative, towards the headstock edge', () => {
    const justPast = edgePush(neck, neck.boardStart)
    expect(justPast).toBeLessThan(0)
    expect(edgePush(neck, 10)).toBeLessThan(justPast)
    expect(edgePush(neck, 0)).toBe(-1)
    expect(edgePush(neck, -30)).toBe(-1)
  })
})

describe('advanceScroll', () => {
  it('stays put without a push while fingers are down, even between two frets', () => {
    expect(advanceScroll(3.4, 0, true, 0.016, 12)).toBe(3.4)
  })

  it('moves faster the harder the push, in its direction', () => {
    const gentle = advanceScroll(3, 0.1, true, 0.1, 12) - 3
    const hard = advanceScroll(3, 1, true, 0.1, 12) - 3
    expect(gentle).toBeGreaterThan(0.2)
    expect(hard).toBeGreaterThan(gentle)
    expect(hard).toBeCloseTo(0.7)
    expect(advanceScroll(3, -1, true, 0.1, 12)).toBeCloseTo(3 - hard)
  })

  it('stops at the nut and at the last position', () => {
    expect(advanceScroll(0.1, -1, true, 1, 12)).toBe(0)
    expect(advanceScroll(11.9, 1, true, 1, 12)).toBe(12)
    expect(advanceScroll(12, 1, true, 0.016, 12)).toBe(12)
  })

  it('settles on the nearest whole fret once every finger has lifted', () => {
    expect(advanceScroll(3.4, 0, false, 0.016, 12)).toBeLessThan(3.4)
    expect(advanceScroll(3.6, 0, false, 0.016, 12)).toBeGreaterThan(3.6)
    expect(advanceScroll(3.4, 0, false, 1, 12)).toBe(3)
    expect(advanceScroll(3.6, 0, false, 1, 12)).toBe(4)
    expect(advanceScroll(4, 0, false, 0.016, 12)).toBe(4)
  })
})
