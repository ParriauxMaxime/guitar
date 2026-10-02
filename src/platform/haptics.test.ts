import { describe, expect, it } from 'vitest'
import { pulseMs } from './haptics'

describe('pulseMs', () => {
  it('buzzes longer for heavier strings and harder plucks', () => {
    expect(pulseMs(0, 1)).toBeGreaterThan(pulseMs(5, 1))
    expect(pulseMs(2, 1)).toBeGreaterThan(pulseMs(2, 0.4))
  })

  it('stays a short tick', () => {
    for (let stringIndex = 0; stringIndex < 6; stringIndex++) {
      expect(pulseMs(stringIndex, 0.4)).toBeGreaterThanOrEqual(8)
      expect(pulseMs(stringIndex, 1)).toBeLessThanOrEqual(22)
    }
  })
})
