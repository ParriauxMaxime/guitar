import { NECK_PLACEMENTS, type NeckPlacement } from './layout/neckGeometry'
import { MIN_FIRST_FRET, clampFirstFret } from './music/fretboard'
import { DEFAULT_TUNING_ID, isTuningId, type TuningId } from './music/tunings'

export interface Settings {
  neckWidthMm: number
  fretWidthMm: number
  pickZoneMm: number
  neckPlacement: NeckPlacement
  leftHanded: boolean
  lowStringOnTop: boolean
  tuning: TuningId
  hammerOn: boolean
  noteLabels: boolean
  haptics: boolean
  volume: number
  firstFret: number
}

export interface MillimetreRange {
  min: number
  max: number
  step: number
}

export const NECK_WIDTH_MM: MillimetreRange = { min: 38, max: 70, step: 1 }
export const FRET_WIDTH_MM: MillimetreRange = { min: 18, max: 40, step: 1 }
export const PICK_ZONE_MM: MillimetreRange = { min: 10, max: 60, step: 1 }

export const DEFAULT_SETTINGS: Settings = {
  neckWidthMm: 46,
  fretWidthMm: 27,
  pickZoneMm: 16,
  neckPlacement: 'center',
  leftHanded: false,
  lowStringOnTop: false,
  tuning: DEFAULT_TUNING_ID,
  hammerOn: true,
  noteLabels: true,
  haptics: true,
  volume: 0.8,
  firstFret: MIN_FIRST_FRET,
}

const STORAGE_KEY = 'guitar.settings.v1'

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function millimetresOr(value: unknown, range: MillimetreRange, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const snapped = range.min + Math.round((value - range.min) / range.step) * range.step
  return Math.min(range.max, Math.max(range.min, snapped))
}

export function sanitizeSettings(raw: unknown): Settings {
  const stored: Partial<Record<keyof Settings, unknown>> =
    typeof raw === 'object' && raw !== null ? raw : {}
  const volume =
    typeof stored.volume === 'number' && Number.isFinite(stored.volume)
      ? Math.min(1, Math.max(0, stored.volume))
      : DEFAULT_SETTINGS.volume

  return {
    neckWidthMm: millimetresOr(stored.neckWidthMm, NECK_WIDTH_MM, DEFAULT_SETTINGS.neckWidthMm),
    fretWidthMm: millimetresOr(stored.fretWidthMm, FRET_WIDTH_MM, DEFAULT_SETTINGS.fretWidthMm),
    pickZoneMm: millimetresOr(stored.pickZoneMm, PICK_ZONE_MM, DEFAULT_SETTINGS.pickZoneMm),
    neckPlacement:
      NECK_PLACEMENTS.find((placement) => placement === stored.neckPlacement) ??
      DEFAULT_SETTINGS.neckPlacement,
    leftHanded: booleanOr(stored.leftHanded, DEFAULT_SETTINGS.leftHanded),
    lowStringOnTop: booleanOr(stored.lowStringOnTop, DEFAULT_SETTINGS.lowStringOnTop),
    tuning: isTuningId(stored.tuning) ? stored.tuning : DEFAULT_SETTINGS.tuning,
    hammerOn: booleanOr(stored.hammerOn, DEFAULT_SETTINGS.hammerOn),
    noteLabels: booleanOr(stored.noteLabels, DEFAULT_SETTINGS.noteLabels),
    haptics: booleanOr(stored.haptics, DEFAULT_SETTINGS.haptics),
    volume,
    firstFret:
      typeof stored.firstFret === 'number'
        ? clampFirstFret(stored.firstFret)
        : DEFAULT_SETTINGS.firstFret,
  }
}

// Storage can be unavailable or throw (private mode, quota): settings then simply don't persist.
export function loadSettings(): Settings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    return
  }
}
