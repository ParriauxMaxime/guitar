import { describe, expect, it } from 'vitest'
import type { GuitarAudio } from '../audio/types'
import { tuningById } from '../music/tunings'
import { createInstrument } from './instrument'
import { HAMMER_VELOCITY, LEGATO_VELOCITY } from './stringState'

function setup(hammerOn: boolean) {
  const calls: unknown[][] = []
  const held = new Map<number, readonly number[]>()
  const audio: GuitarAudio = {
    unlock: async () => {},
    pluck: (...args) => calls.push(['pluck', ...args]),
    damp: (...args) => calls.push(['damp', ...args]),
    dampAll: () => calls.push(['dampAll']),
    setVolume: () => {},
    prewarm: () => {},
  }
  const instrument = createInstrument(
    audio,
    { open: tuningById('standard').open, hammerOn },
    {
      heldFretsChanged: (stringIndex, frets) => held.set(stringIndex, frets),
      stringSounded: () => {},
    },
  )
  return { instrument, calls, held }
}

describe('instrument', () => {
  it('strums an open E minor chord with the fretted pitches', () => {
    const { instrument, calls } = setup(false)
    instrument.hold(1, 1, 2)
    instrument.hold(2, 2, 2)
    for (let stringIndex = 0; stringIndex < 6; stringIndex++) instrument.pluck(stringIndex, 0.8)
    expect(calls).toEqual([
      ['pluck', 0, 40, 0.8],
      ['pluck', 1, 47, 0.8],
      ['pluck', 2, 52, 0.8],
      ['pluck', 3, 55, 0.8],
      ['pluck', 4, 59, 0.8],
      ['pluck', 5, 64, 0.8],
    ])
  })

  it('hammers on, then damps on release', () => {
    const { instrument, calls, held } = setup(true)
    instrument.hold(1, 5, 3)
    expect(held.get(5)).toEqual([3])
    instrument.release(1)
    expect(held.get(5)).toEqual([])
    expect(calls).toEqual([
      ['pluck', 5, 67, HAMMER_VELOCITY],
      ['damp', 5],
    ])
  })

  it('moves a finger to another string by releasing the first one', () => {
    const { instrument, calls, held } = setup(true)
    instrument.hold(1, 2, 2)
    instrument.hold(1, 3, 2)
    expect(held.get(2)).toEqual([])
    expect(held.get(3)).toEqual([2])
    expect(calls).toEqual([
      ['pluck', 2, 52, HAMMER_VELOCITY],
      ['damp', 2],
      ['pluck', 3, 57, HAMMER_VELOCITY],
    ])
  })

  it('slides along a string and ignores repeated positions', () => {
    const { instrument, calls } = setup(true)
    instrument.hold(1, 0, 3)
    instrument.hold(1, 0, 3)
    instrument.hold(1, 0, 5)
    expect(calls).toEqual([
      ['pluck', 0, 43, HAMMER_VELOCITY],
      ['pluck', 0, 45, LEGATO_VELOCITY],
    ])
  })

  it('releases every finger and silences everything', () => {
    const { instrument, calls, held } = setup(false)
    instrument.hold(1, 1, 2)
    instrument.hold(2, 2, 2)
    instrument.pluck(1, 0.9)
    instrument.releaseAll()
    expect(held.get(1)).toEqual([])
    expect(held.get(2)).toEqual([])
    expect(calls.at(-1)).toEqual(['dampAll'])

    calls.length = 0
    instrument.release(1)
    instrument.pluck(1, 0.9)
    expect(calls).toEqual([['pluck', 1, 45, 0.9]])
  })
})
