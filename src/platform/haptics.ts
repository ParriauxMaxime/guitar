import { STRING_COUNT } from '../music/tunings'

export function hapticsAvailable(): boolean {
  return typeof navigator.vibrate === 'function'
}

/** Buzz length for a sounded string: heavier strings and harder plucks last longer. */
export function pulseMs(stringIndex: number, velocity: number): number {
  const weight = 1 - (0.5 * stringIndex) / (STRING_COUNT - 1)
  return Math.round(6 + 16 * velocity * weight)
}

export function buzz(milliseconds: number): void {
  // Chrome refuses to vibrate, with a console warning, until the page has been touched once.
  const touched = navigator.userActivation?.hasBeenActive ?? true
  if (hapticsAvailable() && touched) navigator.vibrate(milliseconds)
}
