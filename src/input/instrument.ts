import type { GuitarAudio } from '../audio/types'
import { pitchAt } from '../music/fretboard'
import { STRING_COUNT } from '../music/tunings'
import { inferBarre, type Barre, type FretTouch } from './barre'
import {
  HAMMER_VELOCITY,
  IDLE_STRING,
  holdFret,
  pluckString,
  releaseFret,
  soundingFret,
  type StringEffect,
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

const BARRE_POINTER = -1

export function createInstrument(
  audio: GuitarAudio,
  initialConfig: InstrumentConfig,
  listener: InstrumentListener,
): Instrument {
  let config = initialConfig
  let strings: StringState[] = idleStrings()
  const stringOfPointer = new Map<number, number>()
  const outcomes = new Map<number, NonNullable<StringEffect>>()
  let barre: Barre | null = null

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
    if (effect) outcomes.set(stringIndex, effect)
  }

  // One gesture can touch a string several times (a finger lifts, then the barre goes): only
  // where the string ends up is heard, never the steps in between.
  function sound() {
    for (const [stringIndex, effect] of outcomes) {
      if (effect.kind === 'pluck') {
        audio.pluck(stringIndex, pitchAt(config.open, stringIndex, effect.fret), effect.velocity)
        listener.stringSounded(stringIndex, effect.velocity)
      } else {
        audio.damp(stringIndex)
      }
    }
    outcomes.clear()
  }

  function liftFinger(pointerId: number) {
    const stringIndex = stringOfPointer.get(pointerId)
    if (stringIndex === undefined) return
    stringOfPointer.delete(pointerId)
    apply(stringIndex, (state) => releaseFret(state, pointerId))
  }

  function fingerTouches(): FretTouch[] {
    return strings.flatMap((state, stringIndex) =>
      [...state.holds]
        .filter(([pointerId]) => pointerId !== BARRE_POINTER)
        .map(([, fret]) => ({ stringIndex, fret })),
    )
  }

  function settleBarre() {
    const next = inferBarre(fingerTouches())
    const hammer = config.hammerOn && (next?.certain ?? false)
    if (next?.fret !== barre?.fret) {
      strings.forEach((_, stringIndex) =>
        apply(stringIndex, (state) =>
          next
            ? holdFret(state, BARRE_POINTER, next.fret, hammer)
            : releaseFret(state, BARRE_POINTER),
        ),
      )
    } else if (next && hammer && !barre?.certain) {
      // The chord just became certain: sound the barred strings that were held back.
      strings.forEach((state, stringIndex) => {
        if (state.ringing || soundingFret(state) !== next.fret) return
        apply(stringIndex, (silent) => pluckString(silent, HAMMER_VELOCITY))
      })
    }
    barre = next
  }

  function releaseAll() {
    stringOfPointer.clear()
    outcomes.clear()
    barre = null
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
      if (previousString !== undefined && previousString !== stringIndex) liftFinger(pointerId)
      stringOfPointer.set(pointerId, stringIndex)
      apply(stringIndex, (state) => holdFret(state, pointerId, fret, config.hammerOn))
      settleBarre()
      sound()
    },
    release(pointerId) {
      liftFinger(pointerId)
      settleBarre()
      sound()
    },
    pluck(stringIndex, velocity) {
      apply(stringIndex, (state) => pluckString(state, velocity))
      sound()
    },
    releaseAll,
  }
}
