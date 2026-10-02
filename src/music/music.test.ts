import { describe, expect, it } from 'vitest'
import { clampFirstFret, inlayDots, pitchAt, reachablePitches } from './fretboard'
import { noteName } from './notes'
import { STRING_COUNT, TUNINGS, isTuningId, tuningById } from './tunings'

describe('tunings', () => {
  it('lists six strings per preset, lowest first', () => {
    for (const tuning of TUNINGS) {
      expect(tuning.open).toHaveLength(STRING_COUNT)
      expect([...tuning.open].sort((a, b) => a - b)).toEqual([...tuning.open])
    }
  })

  it('spells each preset correctly', () => {
    const spell = (id: Parameters<typeof tuningById>[0]) => {
      const tuning = tuningById(id)
      return tuning.open.map((midi) => noteName(midi, tuning.flats)).join(' ')
    }
    expect(spell('standard')).toBe('E A D G B E')
    expect(spell('drop-d')).toBe('D A D G B E')
    expect(spell('dadgad')).toBe('D A D G A D')
    expect(spell('open-g')).toBe('D G D G B D')
    expect(spell('open-d')).toBe('D A D F♯ A D')
    expect(spell('half-down')).toBe('E♭ A♭ D♭ G♭ B♭ E♭')
  })

  it('validates ids', () => {
    expect(isTuningId('open-g')).toBe(true)
    expect(isTuningId('banjo')).toBe(false)
    expect(isTuningId(undefined)).toBe(false)
  })
})

describe('noteName', () => {
  it('names pitch classes across octaves', () => {
    expect(noteName(40)).toBe('E')
    expect(noteName(60)).toBe('C')
    expect(noteName(61)).toBe('C♯')
    expect(noteName(61, true)).toBe('D♭')
    expect(noteName(-1)).toBe('B')
  })
})

describe('fretboard', () => {
  const standard = tuningById('standard').open

  it('adds the fret to the open pitch', () => {
    expect(pitchAt(standard, 0, 0)).toBe(40)
    expect(pitchAt(standard, 0, 3)).toBe(43)
    expect(pitchAt(standard, 5, 12)).toBe(76)
  })

  it('collects open strings plus the visible window, without duplicates', () => {
    const pitches = reachablePitches(standard, 1, 5)
    expect(pitches).toEqual([...new Set(pitches)].sort((a, b) => a - b))
    expect(pitches).toContain(40)
    expect(pitches).toContain(64 + 5)
    expect(pitches).not.toContain(64 + 6)
    expect(pitches).toHaveLength(30)
  })

  it('keeps open pitches reachable when the window is shifted', () => {
    const pitches = reachablePitches(standard, 7, 7)
    expect(pitches).toContain(40)
    expect(pitches).not.toContain(41)
    expect(pitches).toContain(40 + 7)
    expect(pitches).toContain(64 + 13)
  })

  it('clamps the neck position', () => {
    expect(clampFirstFret(0)).toBe(1)
    expect(clampFirstFret(14)).toBe(13)
    expect(clampFirstFret(4.4)).toBe(4)
    expect(clampFirstFret(Number.NaN)).toBe(1)
  })

  it('places inlay dots', () => {
    const single = [3, 5, 7, 9, 15, 17, 19]
    for (let fret = 1; fret <= 19; fret++) {
      const expected = fret === 12 ? 2 : single.includes(fret) ? 1 : 0
      expect(inlayDots(fret)).toBe(expected)
    }
  })
})
