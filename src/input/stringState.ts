import { OPEN_FRET } from '../music/fretboard'

export const HAMMER_VELOCITY = 0.5
export const LEGATO_VELOCITY = 0.4

export interface StringState {
  /** Fret held by each pointer currently pressing this string. */
  holds: ReadonlyMap<number, number>
  ringing: boolean
}

export type StringEffect =
  | { kind: 'pluck'; fret: number; velocity: number }
  | { kind: 'damp' }
  | null

export interface StringStep {
  state: StringState
  effect: StringEffect
}

export const IDLE_STRING: StringState = { holds: new Map(), ringing: false }

export function soundingFret(state: StringState): number {
  return Math.max(OPEN_FRET, ...state.holds.values())
}

/** A pointer presses a fret, or slides to another fret if it already holds one. */
export function holdFret(
  state: StringState,
  pointerId: number,
  fret: number,
  hammerOn: boolean,
): StringStep {
  const sliding = state.holds.has(pointerId)
  const holds = new Map(state.holds).set(pointerId, fret)
  const next = { holds, ringing: state.ringing }
  const sounding = soundingFret(next)
  if (sounding === soundingFret(state)) return { state: next, effect: null }

  if (hammerOn || (sliding && state.ringing)) {
    const velocity = sliding ? LEGATO_VELOCITY : HAMMER_VELOCITY
    return { state: { holds, ringing: true }, effect: { kind: 'pluck', fret: sounding, velocity } }
  }
  // The ringing pitch no longer matches the fretted one and the fretboard must stay silent.
  if (state.ringing) return { state: { holds, ringing: false }, effect: { kind: 'damp' } }
  return { state: next, effect: null }
}

export function releaseFret(state: StringState, pointerId: number): StringStep {
  if (!state.holds.has(pointerId)) return { state, effect: null }
  const holds = new Map(state.holds)
  holds.delete(pointerId)
  const next = { holds, ringing: state.ringing }
  const sounding = soundingFret(next)
  if (!state.ringing || sounding === soundingFret(state)) return { state: next, effect: null }

  if (sounding === OPEN_FRET) return { state: { holds, ringing: false }, effect: { kind: 'damp' } }
  return {
    state: next,
    effect: { kind: 'pluck', fret: sounding, velocity: LEGATO_VELOCITY },
  }
}

export function pluckString(state: StringState, velocity: number): StringStep {
  return {
    state: { holds: state.holds, ringing: true },
    effect: { kind: 'pluck', fret: soundingFret(state), velocity },
  }
}
