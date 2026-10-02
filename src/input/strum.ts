export const MIN_PLUCK_VELOCITY = 0.45
export const MAX_PLUCK_VELOCITY = 1
export const TAP_VELOCITY = 0.7
/** A finger landing beside the picking zone has this long to show that it is strumming. */
export const STRUM_DECISION_MS = 45

const SLOW_STRINGS_PER_SECOND = 5
const FAST_STRINGS_PER_SECOND = 50
// Travel across the strings, in string spacings, that gives a strum away.
const STRUM_TRAVEL = 0.3

type Side = -1 | 0 | 1

export interface Strum {
  /** Which side of each string line the finger is on; 0 = not decided yet. */
  sides: readonly Side[]
  /** String sounded by the initial touch, if the finger landed on one. */
  tapped: number | null
}

export interface StrumStep {
  strum: Strum
  /** Strings crossed since the previous position, in crossing order. */
  crossed: number[]
}

function sideOf(y: number, lineY: number, deadZone: number, previous: Side): Side {
  if (y < lineY - deadZone) return -1
  if (y > lineY + deadZone) return 1
  return previous
}

export function beginStrum(lineYs: readonly number[], y: number, tapRadius: number): Strum {
  let tapped: number | null = null
  let nearest = tapRadius
  for (const [index, lineY] of lineYs.entries()) {
    const distance = Math.abs(y - lineY)
    if (distance <= nearest) {
      nearest = distance
      tapped = index
    }
  }
  return {
    tapped,
    sides: lineYs.map((lineY, index) => (index === tapped ? 0 : sideOf(y, lineY, 0, 0))),
  }
}

/**
 * A string is crossed when the finger changes side of its line. The side only
 * flips once the finger is `hysteresis` past the line, so a finger resting on a
 * string does not retrigger it; the string sounded by the initial tap is not
 * re-plucked while the finger is still leaving the tap radius.
 */
export function advanceStrum(
  strum: Strum,
  lineYs: readonly number[],
  y: number,
  hysteresis: number,
  tapRadius: number,
): StrumStep {
  const crossed: number[] = []
  let movedDown = false
  const sides = lineYs.map((lineY, index) => {
    const previous = strum.sides[index] ?? 0
    const leavingTap = previous === 0 && index === strum.tapped
    const side = sideOf(y, lineY, leavingTap ? tapRadius : hysteresis, previous)
    if (previous !== 0 && side !== previous) {
      crossed.push(index)
      movedDown = side === 1
    }
    return side
  })
  if (!movedDown) crossed.reverse()
  return { strum: { sides, tapped: strum.tapped }, crossed }
}

/** Whether a finger that has moved this far since it landed is sweeping the strings rather than pressing one. */
export function isStrumming(across: number, along: number, stringSpacing: number): boolean {
  return Math.abs(across) >= stringSpacing * STRUM_TRAVEL && Math.abs(across) > Math.abs(along)
}

export function strumVelocity(stringsPerSecond: number): number {
  const t =
    (stringsPerSecond - SLOW_STRINGS_PER_SECOND) /
    (FAST_STRINGS_PER_SECOND - SLOW_STRINGS_PER_SECOND)
  const velocity = MIN_PLUCK_VELOCITY + (MAX_PLUCK_VELOCITY - MIN_PLUCK_VELOCITY) * t
  return Math.min(MAX_PLUCK_VELOCITY, Math.max(MIN_PLUCK_VELOCITY, velocity))
}
