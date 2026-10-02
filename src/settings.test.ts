import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings'

describe('sanitizeSettings', () => {
  it('falls back to defaults for missing or malformed data', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(
      sanitizeSettings({
        neckWidthMm: 'wide',
        fretWidthMm: null,
        pickZoneMm: {},
        neckPlacement: 'sideways',
        haptics: 'yes',
        tuning: 'banjo',
        volume: 'loud',
      }),
    ).toEqual(DEFAULT_SETTINGS)
  })

  it('defaults to a 46 mm neck with 27 mm frets and a 16 mm picking zone, hammer-on, vibration, right-handed', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      neckWidthMm: 46,
      fretWidthMm: 27,
      pickZoneMm: 16,
      neckPlacement: 'center',
      leftHanded: false,
      lowStringOnTop: false,
      tuning: 'standard',
      hammerOn: true,
      haptics: true,
      firstFret: 1,
    })
  })

  it('round-trips valid settings', () => {
    const settings: Settings = {
      neckWidthMm: 52,
      fretWidthMm: 33,
      pickZoneMm: 30,
      neckPlacement: 'bottom',
      leftHanded: true,
      lowStringOnTop: true,
      tuning: 'dadgad',
      hammerOn: false,
      noteLabels: false,
      haptics: false,
      volume: 0.35,
      firstFret: 7,
    }
    expect(sanitizeSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
  })

  it('clamps out-of-range numbers', () => {
    expect(sanitizeSettings({ volume: 4, firstFret: 40 })).toMatchObject({ volume: 1, firstFret: 13 })
    expect(sanitizeSettings({ volume: -1, firstFret: -3 })).toMatchObject({
      volume: 0,
      firstFret: 1,
    })
  })

  it('keeps the neck dimensions on whole millimetres inside the slider ranges', () => {
    expect(sanitizeSettings({ neckWidthMm: 12, fretWidthMm: 5, pickZoneMm: 2 })).toMatchObject({
      neckWidthMm: 38,
      fretWidthMm: 18,
      pickZoneMm: 10,
    })
    expect(
      sanitizeSettings({ neckWidthMm: 200, fretWidthMm: 99, pickZoneMm: 400 }),
    ).toMatchObject({
      neckWidthMm: 70,
      fretWidthMm: 40,
      pickZoneMm: 60,
    })
    expect(sanitizeSettings({ neckWidthMm: 45.4, fretWidthMm: 26.6 })).toMatchObject({
      neckWidthMm: 45,
      fretWidthMm: 27,
    })
  })

  it('loads settings stored by the first build, dropping its fret count', () => {
    const firstBuild = {
      fretCount: 7,
      leftHanded: true,
      lowStringOnTop: true,
      tuning: 'open-g',
      hammerOn: false,
      noteLabels: false,
      volume: 0.5,
      firstFret: 5,
    }
    const { fretCount: _dropped, ...kept } = firstBuild
    for (const fretCount of [7, 'auto']) {
      const loaded = sanitizeSettings(JSON.parse(JSON.stringify({ ...firstBuild, fretCount })))
      expect(loaded).toEqual({
        ...kept,
        neckWidthMm: 46,
        fretWidthMm: 27,
        pickZoneMm: 16,
        neckPlacement: 'center',
        haptics: true,
      })
      expect(loaded).not.toHaveProperty('fretCount')
    }
  })
})
