export const STRING_COUNT = 6

export interface Tuning {
  id: string
  name: string
  /** MIDI pitch of each open string, lowest-pitched string first. */
  open: readonly number[]
  flats?: boolean
}

export const TUNINGS = [
  { id: 'standard', name: 'Standard', open: [40, 45, 50, 55, 59, 64] },
  { id: 'drop-d', name: 'Drop D', open: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', name: 'DADGAD', open: [38, 45, 50, 55, 57, 62] },
  { id: 'open-g', name: 'Open G', open: [38, 43, 50, 55, 59, 62] },
  { id: 'open-d', name: 'Open D', open: [38, 45, 50, 54, 57, 62] },
  { id: 'half-down', name: 'Half-step down', open: [39, 44, 49, 54, 58, 63], flats: true },
] as const satisfies readonly Tuning[]

export type TuningId = (typeof TUNINGS)[number]['id']

export const DEFAULT_TUNING_ID: TuningId = 'standard'

export function isTuningId(value: unknown): value is TuningId {
  return TUNINGS.some((tuning) => tuning.id === value)
}

export function tuningById(id: TuningId): Tuning {
  return TUNINGS.find((tuning) => tuning.id === id) ?? TUNINGS[0]
}
