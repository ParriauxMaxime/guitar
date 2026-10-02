import { describe, expect, it } from 'vitest'
import {
  HAMMER_VELOCITY,
  IDLE_STRING,
  LEGATO_VELOCITY,
  holdFret,
  pluckString,
  releaseFret,
  soundingFret,
  type StringEffect,
  type StringState,
  type StringStep,
} from './stringState'

type Action = (state: StringState) => StringStep

function run(actions: Action[], initial = IDLE_STRING): { state: StringState; effects: StringEffect[] } {
  let state = initial
  const effects = actions.map((action) => {
    const step = action(state)
    state = step.state
    return step.effect
  })
  return { state, effects }
}

const hold = (pointerId: number, fret: number, hammerOn = true): Action => (state) =>
  holdFret(state, pointerId, fret, hammerOn)
const release = (pointerId: number): Action => (state) => releaseFret(state, pointerId)
const pluck = (velocity = 0.8): Action => (state) => pluckString(state, velocity)

const hammer = (fret: number) => ({ kind: 'pluck', fret, velocity: HAMMER_VELOCITY })
const legato = (fret: number) => ({ kind: 'pluck', fret, velocity: LEGATO_VELOCITY })
const damp = { kind: 'damp' }

describe('soundingFret', () => {
  it('is open with no holds and the highest held fret otherwise', () => {
    expect(soundingFret(IDLE_STRING)).toBe(0)
    expect(soundingFret(run([hold(1, 3), hold(2, 5), hold(3, 4)]).state)).toBe(5)
  })
})

describe('picking', () => {
  it('plucks the open pitch when nothing is held', () => {
    expect(run([pluck(0.9)]).effects).toEqual([{ kind: 'pluck', fret: 0, velocity: 0.9 }])
  })

  it('plucks the highest held fret', () => {
    const { effects } = run([hold(1, 2, false), hold(2, 4, false), pluck(0.6)])
    expect(effects).toEqual([null, null, { kind: 'pluck', fret: 4, velocity: 0.6 }])
  })

  it('lets a plucked open string ring out', () => {
    expect(run([pluck()]).state.ringing).toBe(true)
  })
})

describe('hammer-on enabled', () => {
  it('sounds a pressed fret softly', () => {
    expect(run([hold(1, 3)]).effects).toEqual([hammer(3)])
  })

  it('sounds a higher fret but stays silent for a lower one', () => {
    expect(run([hold(1, 3), hold(2, 5), hold(3, 2)]).effects).toEqual([hammer(3), hammer(5), null])
  })

  it('damps when the only fretting finger lifts', () => {
    const { state, effects } = run([hold(1, 3), release(1)])
    expect(effects).toEqual([hammer(3), damp])
    expect(state.ringing).toBe(false)
    expect(state.holds.size).toBe(0)
  })

  it('pulls off to a lower fret that is still held', () => {
    const { state, effects } = run([hold(1, 2), hold(2, 4), release(2)])
    expect(effects).toEqual([hammer(2), hammer(4), legato(2)])
    expect(state.ringing).toBe(true)
  })

  it('ignores the release of a finger behind the sounding fret', () => {
    expect(run([hold(1, 2), hold(2, 4), release(1)]).effects).toEqual([hammer(2), hammer(4), null])
  })

  it('keeps sounding while another finger holds the same fret', () => {
    expect(run([hold(1, 4), hold(2, 4), release(1)]).effects).toEqual([hammer(4), null, null])
  })

  it('re-sounds softly when the finger slides to another fret', () => {
    expect(run([hold(1, 3), hold(1, 4), hold(1, 2)]).effects).toEqual([
      hammer(3),
      legato(4),
      legato(2),
    ])
  })

  it('does not re-sound a slide hidden behind a higher held fret', () => {
    expect(run([hold(1, 5), hold(2, 2), hold(2, 3)]).effects).toEqual([hammer(5), null, null])
  })
})

describe('hammer-on disabled', () => {
  const off = false

  it('keeps the fretboard silent', () => {
    const { state, effects } = run([hold(1, 3, off), hold(2, 5, off), release(2), release(1)])
    expect(effects).toEqual([null, null, null, null])
    expect(state.ringing).toBe(false)
  })

  it('damps a picked note when its fretting finger lifts', () => {
    expect(run([hold(1, 3, off), pluck(), release(1)]).effects).toEqual([
      null,
      { kind: 'pluck', fret: 3, velocity: 0.8 },
      damp,
    ])
  })

  it('still slides and pulls off a ringing string', () => {
    const { effects } = run([
      hold(1, 2, off),
      hold(2, 4, off),
      pluck(),
      hold(2, 5, off),
      release(2),
    ])
    expect(effects.slice(3)).toEqual([legato(5), legato(2)])
  })

  it('does not sound a slide on a silent string', () => {
    expect(run([hold(1, 3, off), hold(1, 4, off)]).effects).toEqual([null, null])
  })

  it('damps a ringing string when a new fret changes its pitch', () => {
    const { state, effects } = run([pluck(), hold(1, 3, off)])
    expect(effects[1]).toEqual(damp)
    expect(state.ringing).toBe(false)
  })
})

describe('release', () => {
  it('ignores pointers that hold nothing', () => {
    const { state } = run([pluck()])
    expect(releaseFret(state, 99)).toEqual({ state, effect: null })
  })

  it('damps a hammered-on open string when the finger lifts', () => {
    expect(run([pluck(), hold(1, 3), release(1)]).effects).toEqual([
      { kind: 'pluck', fret: 0, velocity: 0.8 },
      hammer(3),
      damp,
    ])
  })
})
