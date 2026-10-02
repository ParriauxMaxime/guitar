import { describe, expect, it } from 'vitest'
import {
  MAX_PLUCK_VELOCITY,
  MIN_PLUCK_VELOCITY,
  advanceStrum,
  beginStrum,
  strumVelocity,
  type Strum,
} from './strum'

const LINES = [30, 90, 150, 210, 270, 330]
const HYSTERESIS = 3
const TAP_RADIUS = 20

function drag(strum: Strum, ys: number[]): number[][] {
  let current = strum
  return ys.map((y) => {
    const step = advanceStrum(current, LINES, y, HYSTERESIS, TAP_RADIUS)
    current = step.strum
    return step.crossed
  })
}

describe('beginStrum', () => {
  it('taps the string the finger lands on or near', () => {
    expect(beginStrum(LINES, 150, TAP_RADIUS).tapped).toBe(2)
    expect(beginStrum(LINES, 165, TAP_RADIUS).tapped).toBe(2)
    expect(beginStrum(LINES, 75, TAP_RADIUS).tapped).toBe(1)
  })

  it('taps nothing when landing between strings or outside them', () => {
    expect(beginStrum(LINES, 120, TAP_RADIUS).tapped).toBeNull()
    expect(beginStrum(LINES, 0, TAP_RADIUS).tapped).toBeNull()
    expect(beginStrum(LINES, 400, TAP_RADIUS).tapped).toBeNull()
  })
})

describe('advanceStrum', () => {
  it('plucks every string crossed in one fast downward move, top first', () => {
    expect(drag(beginStrum(LINES, 0, TAP_RADIUS), [360])).toEqual([[0, 1, 2, 3, 4, 5]])
  })

  it('plucks in reverse order on an upward move', () => {
    expect(drag(beginStrum(LINES, 360, TAP_RADIUS), [0])).toEqual([[5, 4, 3, 2, 1, 0]])
  })

  it('plucks strings one by one on a slow strum and again on the way back', () => {
    const crossed = drag(beginStrum(LINES, 0, TAP_RADIUS), [40, 100, 120, 160, 100, 20])
    expect(crossed).toEqual([[0], [1], [], [2], [2], [1, 0]])
  })

  it('does not retrigger for a finger jittering on a string line', () => {
    const crossed = drag(beginStrum(LINES, 60, TAP_RADIUS), [88, 91, 89, 92, 90, 88, 91])
    expect(crossed.flat()).toEqual([])
  })

  it('retriggers only after moving clearly past the line', () => {
    const crossed = drag(beginStrum(LINES, 60, TAP_RADIUS), [92, 94, 91, 85])
    expect(crossed).toEqual([[], [1], [], [1]])
  })

  it('does not double-trigger the tapped string while leaving the tap radius', () => {
    const strum = beginStrum(LINES, 80, TAP_RADIUS)
    expect(strum.tapped).toBe(1)
    expect(drag(strum, [86, 95, 108, 160, 100, 60])).toEqual([[], [], [], [2], [2], [1]])
  })

  it('never plucks without movement', () => {
    const strum = beginStrum(LINES, 150, TAP_RADIUS)
    expect(drag(strum, [150, 150, 150]).flat()).toEqual([])
  })
})

describe('strumVelocity', () => {
  it('stays within the musical range', () => {
    expect(strumVelocity(0)).toBe(MIN_PLUCK_VELOCITY)
    expect(strumVelocity(1000)).toBe(MAX_PLUCK_VELOCITY)
  })

  it('grows with crossing speed', () => {
    expect(strumVelocity(30)).toBeGreaterThan(strumVelocity(12))
    expect(strumVelocity(30)).toBeLessThan(MAX_PLUCK_VELOCITY)
  })
})
