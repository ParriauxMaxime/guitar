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

describe('instrument barre', () => {
  const strum = (instrument: ReturnType<typeof setup>['instrument']) => {
    for (let stringIndex = 0; stringIndex < 6; stringIndex++) instrument.pluck(stringIndex, 0.8)
  }
  const pitches = (calls: unknown[][]) =>
    calls.filter(([method]) => method === 'pluck').map(([, , midi]) => midi)

  it('frets all six strings of an F chord from a single-point barre finger', () => {
    const { instrument, calls, held } = setup(false)
    instrument.hold(1, 0, 1)
    instrument.hold(2, 1, 3)
    instrument.hold(3, 2, 3)
    instrument.hold(4, 3, 2)
    expect(calls).toEqual([])
    expect(held.get(4)).toEqual([1])
    expect(held.get(5)).toEqual([1])

    strum(instrument)
    expect(pitches(calls)).toEqual([41, 48, 53, 57, 60, 65])
  })

  it('sounds the barred strings once the chord is certain when hammer-ons are on', () => {
    const { instrument, calls } = setup(true)
    instrument.hold(1, 0, 1)
    instrument.hold(2, 1, 3)
    instrument.hold(3, 2, 3)
    expect(pitches(calls)).toEqual([41, 48, 53])

    instrument.hold(4, 3, 2)
    expect(calls.slice(3)).toEqual([
      ['pluck', 3, 57, HAMMER_VELOCITY],
      ['pluck', 4, 60, HAMMER_VELOCITY],
      ['pluck', 5, 65, HAMMER_VELOCITY],
    ])
  })

  it('keeps a power chord to its three notes until it is strummed', () => {
    const { instrument, calls } = setup(true)
    instrument.hold(1, 0, 3)
    instrument.hold(2, 1, 5)
    instrument.hold(3, 2, 5)
    expect(pitches(calls)).toEqual([43, 50, 55])

    calls.length = 0
    strum(instrument)
    expect(pitches(calls)).toEqual([43, 50, 55, 58, 62, 67])
  })

  it('leaves an open C chord alone', () => {
    const { instrument, calls } = setup(false)
    instrument.hold(1, 1, 3)
    instrument.hold(2, 2, 2)
    instrument.hold(3, 4, 1)
    strum(instrument)
    expect(pitches(calls)).toEqual([40, 48, 52, 55, 60, 64])
  })

  it('lifts the barre with the chord shape and damps the strings it was fretting', () => {
    const { instrument, calls, held } = setup(false)
    instrument.hold(1, 0, 1)
    instrument.hold(2, 1, 3)
    instrument.hold(3, 2, 3)
    strum(instrument)
    calls.length = 0

    instrument.release(3)
    expect(held.get(5)).toEqual([])
    expect(calls).toEqual([
      ['damp', 2],
      ['damp', 3],
      ['damp', 4],
      ['damp', 5],
    ])
  })

  it('keeps the barre while its own finger moves to another string', () => {
    const { instrument, calls, held } = setup(false)
    instrument.hold(1, 0, 1)
    instrument.hold(2, 1, 3)
    instrument.hold(3, 2, 3)
    strum(instrument)
    calls.length = 0

    instrument.hold(1, 3, 1)
    expect(held.get(5)).toEqual([1])
    expect(calls).toEqual([])
  })
})
