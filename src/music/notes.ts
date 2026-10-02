const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

export function noteName(midi: number, flats = false): string {
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pitchClass] ?? ''
}
