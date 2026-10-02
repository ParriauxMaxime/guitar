import type { GuitarAudio } from '../audio/types'
import { pitchAt } from '../music/fretboard'
import { STRING_COUNT } from '../music/tunings'
import {
  IDLE_STRING,
  holdFret,
  pluckString,
  releaseFret,
  type StringState,
  type StringStep,
} from './stringState'

export interface InstrumentConfig {
  open: readonly number[]
  hammerOn: boolean
}

export interface InstrumentListener {
  heldFretsChanged(stringIndex: number, frets: readonly number[]): void
  stringSounded(stringIndex: number, velocity: number): void
}

export interface Instrument {
  configure(config: InstrumentConfig): void
  /** Press or move a fretting finger; a pointer holds at most one string at a time. */
  hold(pointerId: number, stringIndex: number, fret: number): void
  release(pointerId: number): void
  pluck(stringIndex: number, velocity: number): void
  releaseAll(): void
}

export function createInstrument(
  audio: GuitarAudio,
  initialConfig: InstrumentConfig,
  listener: InstrumentListener,
): Instrument {
  let config = initialConfig
  let strings: StringState[] = idleStrings()
  const stringOfPointer = new Map<number, number>()

  function idleStrings(): StringState[] {
    return Array.from({ length: STRING_COUNT }, () => IDLE_STRING)
  }

  function apply(stringIndex: number, step: (state: StringState) => StringStep) {
    const before = strings[stringIndex]
    if (!before) return
    const { state, effect } = step(before)
    strings[stringIndex] = state
    if (state.holds !== before.holds) {
      listener.heldFretsChanged(stringIndex, [...state.holds.values()])
    }
    if (effect?.kind === 'pluck') {
      audio.pluck(stringIndex, pitchAt(config.open, stringIndex, effect.fret), effect.velocity)
      listener.stringSounded(stringIndex, effect.velocity)
    } else if (effect?.kind === 'damp') {
      audio.damp(stringIndex)
    }
  }

  function release(pointerId: number) {
    const stringIndex = stringOfPointer.get(pointerId)
    if (stringIndex === undefined) return
    stringOfPointer.delete(pointerId)
    apply(stringIndex, (state) => releaseFret(state, pointerId))
  }

  function releaseAll() {
    stringOfPointer.clear()
    strings.forEach((state, stringIndex) => {
      if (state.holds.size > 0) listener.heldFretsChanged(stringIndex, [])
    })
    strings = idleStrings()
    audio.dampAll()
  }

  return {
    configure(next) {
      config = next
    },
    hold(pointerId, stringIndex, fret) {
      const previousString = stringOfPointer.get(pointerId)
      if (previousString === stringIndex && strings[stringIndex]?.holds.get(pointerId) === fret) {
        return
      }
      if (previousString !== undefined && previousString !== stringIndex) release(pointerId)
      stringOfPointer.set(pointerId, stringIndex)
      apply(stringIndex, (state) => holdFret(state, pointerId, fret, config.hammerOn))
    },
    release,
    pluck(stringIndex, velocity) {
      apply(stringIndex, (state) => pluckString(state, velocity))
    },
    releaseAll,
  }
}
