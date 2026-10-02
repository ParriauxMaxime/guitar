export interface GuitarAudio {
  /** Must be called from a user gesture; resumes the AudioContext. Safe to call repeatedly. */
  unlock(): Promise<void>
  /** Pluck one string. Replaces whatever that string was sounding. velocity is 0..1. */
  pluck(stringIndex: number, midi: number, velocity: number): void
  /** Quickly silence one string (finger lifted / palm mute). */
  damp(stringIndex: number): void
  dampAll(): void
  /** Master volume, 0..1. */
  setVolume(volume: number): void
  /** Pre-render the given pitches so the first pluck has no hitch. */
  prewarm(midis: readonly number[]): void
}
