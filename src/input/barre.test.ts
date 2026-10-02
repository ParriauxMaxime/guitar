import { describe, expect, it } from 'vitest'
import { inferBarre, type FretTouch } from './barre'

/** Fingers from a chord diagram, lowest string first; `x` and `0` are untouched strings. */
function chord(diagram: string): FretTouch[] {
  return [...diagram].flatMap((symbol, stringIndex) =>
    symbol === 'x' || symbol === '0' ? [] : [{ stringIndex, fret: Number(symbol) }],
  )
}

/** A barre chord as a touchscreen sees it: the flat finger is one point, on its lowest string. */
function barred(diagram: string): FretTouch[] {
  const touches = chord(diagram)
  const barreFret = Math.min(...touches.map((touch) => touch.fret))
  const [flatFinger] = touches.filter((touch) => touch.fret === barreFret)
  return [...touches.filter((touch) => touch.fret > barreFret), ...(flatFinger ? [flatFinger] : [])]
}

describe('inferBarre', () => {
  it.each([
    ['F', '133211', 1, true],
    ['Fm', '133111', 1, false],
    ['F7', '131211', 1, false],
    ['Fmaj7', '132211', 1, true],
    ['F#m', '244222', 2, false],
    ['G', '355433', 3, true],
    ['Bb', 'x13331', 1, true],
    ['Bm', 'x24432', 2, true],
    ['B7', 'x24242', 2, false],
    ['Bm7', 'x24232', 2, false],
    ['Cmaj7', 'x35453', 3, true],
  ])('reads the barre of %s (%s)', (_name, diagram, fret, certain) => {
    expect(inferBarre(barred(diagram))).toEqual({ fret, certain })
  })

  it('does not care which string reports the flat finger', () => {
    const shape = chord('x332xx')
    for (let stringIndex = 0; stringIndex < 6; stringIndex++) {
      expect(inferBarre([...shape, { stringIndex, fret: 1 }])).toEqual({ fret: 1, certain: true })
    }
  })

  it.each([
    ['C', 'x32010'],
    ['G', '320003'],
    ['G with four fingers', '320033'],
    ['D', 'xx0232'],
    ['Dm', 'xx0231'],
    ['A', 'x02220'],
    ['Am', 'x02210'],
    ['E', '022100'],
    ['Em', '022000'],
    ['E7', '020100'],
    ['A7', 'x02020'],
    ['B7', 'x21202'],
    ['C7', 'x32310'],
    ['D7', 'xx0212'],
    ['G7', '320001'],
    ['Dsus2', 'xx0230'],
    ['Dsus4', 'xx0233'],
    ['Em7', '022030'],
    ['Cadd9', 'x32030'],
    ['Fmaj7', 'xx3210'],
    ['small F', 'xx3211'],
  ])('leaves the open chord %s (%s) alone', (_name, diagram) => {
    expect(inferBarre(chord(diagram))).toBeNull()
  })

  it('treats a power chord as an uncertain barre, since a minor barre chord looks the same', () => {
    expect(inferBarre(chord('355xxx'))).toEqual({ fret: 3, certain: false })
    expect(inferBarre(chord('x355xx'))).toEqual({ fret: 3, certain: false })
  })

  it('needs fingers above the barre', () => {
    expect(inferBarre([])).toBeNull()
    expect(inferBarre(chord('1xxxxx'))).toBeNull()
    expect(inferBarre(chord('x33xxx'))).toBeNull()
    expect(inferBarre(chord('x332xx'))).toBeNull()
  })
})
