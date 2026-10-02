export interface FretTouch {
  stringIndex: number
  fret: number
}

export interface Barre {
  fret: number
  /** Enough fingers shape the chord to rule out a power chord, so the barre may sound by itself. */
  certain: boolean
}

type Shape = readonly (readonly [stringIndex: number, fretsAboveBarre: number])[]

// Fingers that give away a movable chord shape. String 0 is the lowest-pitched one.
const BARRE_SHAPES: readonly Shape[] = [
  [[1, 2], [2, 2]], // E shape: minor, major, sus4
  [[1, 2], [3, 1]], // E shape: 7
  [[1, 2], [2, 1], [3, 1]], // E shape: maj7
  [[2, 2], [3, 2]], // A shape: major, minor, sus2
  [[2, 2], [4, 2]], // A shape: 7
  [[2, 2], [4, 1]], // A shape: m7
  [[2, 2], [3, 1], [4, 2]], // A shape: maj7
]
const CERTAIN_FINGERS = 3

/**
 * A touchscreen reports a finger laid across the strings as a single point, so the barre is
 * read from the other fingers: when they form a movable chord shape above the lowest held
 * fret, that fret is barred.
 */
export function inferBarre(touches: readonly FretTouch[]): Barre | null {
  if (touches.length === 0) return null
  const fret = Math.min(...touches.map((touch) => touch.fret))
  const fingers = new Set(
    touches
      .filter((touch) => touch.fret > fret)
      .map((touch) => `${touch.stringIndex}:${touch.fret - fret}`),
  )
  const shaped = BARRE_SHAPES.some((shape) =>
    shape.every(([stringIndex, above]) => fingers.has(`${stringIndex}:${above}`)),
  )
  return shaped ? { fret, certain: fingers.size >= CERTAIN_FINGERS } : null
}
