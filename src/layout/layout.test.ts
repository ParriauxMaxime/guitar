import { describe, expect, it } from 'vitest'
import {
  HEAD_WIDTH,
  NUT_WIDTH,
  PX_PER_MM,
  computeNeckGeometry,
  fittingFrets,
  fretAt,
  fretCenter,
  gapCenter,
  isOnNeck,
  nearPickZone,
  nearestRow,
  spanOnSurface,
  toNeckAxis,
  visibleFretRange,
  zoneAt,
} from './neckGeometry'
import { clientToLocal } from './pointerMapping'
import { TOOLBAR_SIZE, computeStageLayout, type Viewport } from './stageLayout'

const NECK_WIDTH_MM = 46
const FRET_WIDTH_MM = 27
const PICK_ZONE_MM = 16
const TARGET_VIEWPORTS: [number, number][] = [
  [892, 412],
  [412, 892],
  [832, 750],
  [750, 832],
  [667, 375],
]

function surfaceOf(viewport: Viewport, neckWidthMm = NECK_WIDTH_MM) {
  const stage = computeStageLayout(viewport, neckWidthMm)
  return {
    width: stage.width - (stage.toolbar === 'side' ? TOOLBAR_SIZE.side : 0),
    height: stage.height - (stage.toolbar === 'top' ? TOOLBAR_SIZE.top : 0),
  }
}

function neckFor(
  viewport: Viewport,
  neckWidthMm = NECK_WIDTH_MM,
  fretWidthMm = FRET_WIDTH_MM,
  pickZoneMm = PICK_ZONE_MM,
) {
  return computeNeckGeometry({
    ...surfaceOf(viewport, neckWidthMm),
    neckWidthMm,
    fretWidthMm,
    pickZoneMm,
    neckPlacement: 'center',
    leftHanded: false,
    lowStringOnTop: false,
  })
}

describe('computeStageLayout', () => {
  it('keeps landscape phones unrotated', () => {
    expect(computeStageLayout({ width: 892, height: 412 }, NECK_WIDTH_MM)).toEqual({
      rotated: false,
      width: 892,
      height: 412,
      toolbar: 'top',
    })
  })

  it('rotates narrow portrait phones so the neck runs along the long axis', () => {
    expect(computeStageLayout({ width: 412, height: 892 }, NECK_WIDTH_MM)).toEqual({
      rotated: true,
      width: 892,
      height: 412,
      toolbar: 'top',
    })
  })

  it('does not rotate wide portrait screens', () => {
    expect(computeStageLayout({ width: 750, height: 832 }, NECK_WIDTH_MM).rotated).toBe(false)
    expect(computeStageLayout({ width: 832, height: 750 }, NECK_WIDTH_MM).rotated).toBe(false)
  })

  it.each(TARGET_VIEWPORTS)('%ix%i has the toolbar on top with the default neck', (width, height) => {
    expect(computeStageLayout({ width, height }, NECK_WIDTH_MM).toolbar).toBe('top')
  })

  it('hides the toolbar when it is not docked, whatever the neck', () => {
    expect(computeStageLayout({ width: 892, height: 412 }, NECK_WIDTH_MM, false).toolbar).toBe('hidden')
    expect(computeStageLayout({ width: 892, height: 412 }, 70, false).toolbar).toBe('hidden')
    expect(TOOLBAR_SIZE.hidden).toBe(0)
  })

  it('moves the toolbar to the side when the requested neck does not fit under it', () => {
    expect(computeStageLayout({ width: 892, height: 412 }, 64).toolbar).toBe('top')
    expect(computeStageLayout({ width: 892, height: 412 }, 65).toolbar).toBe('side')
    expect(computeStageLayout({ width: 412, height: 892 }, 70).toolbar).toBe('side')
    expect(computeStageLayout({ width: 832, height: 750 }, 70).toolbar).toBe('top')
  })
})

describe('fittingFrets', () => {
  it.each([
    [892, 412, 4.92],
    [412, 892, 4.92],
    [832, 750, 4.53],
    [750, 832, 3.99],
    [667, 375, 3.46],
  ])('%ix%i shows %f default frets, the last one cut', (width, height, expected) => {
    expect(neckFor({ width, height }).visibleFrets).toBeCloseTo(expected, 1)
  })

  it('follows the fret width', () => {
    const viewport = { width: 892, height: 412 }
    expect(neckFor(viewport, NECK_WIDTH_MM, 18).visibleFrets).toBe(7)
    expect(neckFor(viewport, NECK_WIDTH_MM, 40).visibleFrets).toBeCloseTo(3.32, 1)
  })

  it('gives up frets to a wider picking zone', () => {
    const viewport = { width: 892, height: 412 }
    expect(neckFor(viewport, NECK_WIDTH_MM, FRET_WIDTH_MM, 60).visibleFrets).toBeCloseTo(3.29, 1)
  })

  it('loses length to a side toolbar', () => {
    const underTopBar = neckFor({ width: 832, height: 320 }).visibleFrets
    const besideSideBar = neckFor({ width: 832, height: 300 }).visibleFrets
    expect(underTopBar - besideSideBar).toBeCloseTo(TOOLBAR_SIZE.side / (27 * PX_PER_MM))
  })

  it('stays between 2 and 7', () => {
    expect(fittingFrets(300, 154, 91)).toBe(2)
    expect(fittingFrets(4000, 154, 91)).toBe(7)
  })
})

describe('computeNeckGeometry', () => {
  const options = {
    width: 892,
    height: 368,
    neckWidthMm: NECK_WIDTH_MM,
    fretWidthMm: FRET_WIDTH_MM,
    pickZoneMm: PICK_ZONE_MM,
    neckPlacement: 'center',
    leftHanded: false,
    lowStringOnTop: false,
  } as const
  const phone = computeNeckGeometry(options)

  it.each(TARGET_VIEWPORTS)('%ix%i gets a neck with physical dimensions', (width, height) => {
    const neck = neckFor({ width, height })
    expect(neck.neckHeight).toBeCloseTo(46 * PX_PER_MM)
    expect(neck.fretWidth).toBeCloseTo(27 * PX_PER_MM)
    expect(neck.stringSpacing).toBeCloseTo(7.8 * PX_PER_MM)
    expect(neck.neckTop).toBeCloseTo((neck.height - neck.neckHeight) / 2)
    expect(neck.width - neck.boardEnd).toBeCloseTo(16 * PX_PER_MM)
  })

  it('insets the outer strings 3.5 mm from the neck edges', () => {
    expect(phone.stringYs[0]! - phone.neckTop).toBeCloseTo(3.5 * PX_PER_MM)
    expect(phone.neckTop + phone.neckHeight - phone.stringYs[5]!).toBeCloseTo(3.5 * PX_PER_MM)
    expect(phone.stringYs[3]! - phone.stringYs[2]!).toBeCloseTo(phone.stringSpacing)
  })

  it('follows the neck width whatever the viewport height', () => {
    const wide = computeNeckGeometry({ ...options, height: 706, neckWidthMm: 60 })
    expect(wide.neckHeight).toBeCloseTo(342)
    expect(wide.neckTop).toBeCloseTo(182)
    expect(wide.stringSpacing).toBeCloseTo(((60 - 7) / 5) * PX_PER_MM)
  })

  it('places the neck against the top or bottom edge on request', () => {
    const top = computeNeckGeometry({ ...options, neckPlacement: 'top' })
    const bottom = computeNeckGeometry({ ...options, neckPlacement: 'bottom' })
    expect(top.neckTop).toBe(0)
    expect(top.stringYs[0]).toBeCloseTo(3.5 * PX_PER_MM)
    expect(bottom.neckTop + bottom.neckHeight).toBeCloseTo(options.height)
    expect(bottom.stringYs[5]).toBeCloseTo(options.height - 3.5 * PX_PER_MM)
    expect(top.neckHeight).toBe(phone.neckHeight)
    expect(bottom.stringSpacing).toBe(phone.stringSpacing)
  })

  it('clamps a neck that cannot fit to the available space', () => {
    const clamped = computeNeckGeometry({ ...options, height: 300, neckWidthMm: 70 })
    expect(clamped.neckHeight).toBe(300)
    expect(clamped.neckTop).toBe(0)
    expect(clamped.stringYs[0]).toBeCloseTo(3.5 * PX_PER_MM)
    expect(clamped.stringYs[5]).toBeCloseTo(300 - 3.5 * PX_PER_MM)
  })

  it('puts the low string at the bottom by default and on top when flipped', () => {
    expect(phone.stringOfRow).toEqual([5, 4, 3, 2, 1, 0])
    expect(computeNeckGeometry({ ...options, lowStringOnTop: true }).stringOfRow).toEqual([
      0, 1, 2, 3, 4, 5,
    ])
  })

  it('splits the length into head, frets and picking zone', () => {
    expect(phone.boardStart).toBe(HEAD_WIDTH + NUT_WIDTH)
    expect(phone.boardEnd).toBeCloseTo(892 - 16 * PX_PER_MM)
    expect(zoneAt(phone, 10)).toBe('head')
    expect(zoneAt(phone, phone.boardStart + 1)).toBe('fret')
    expect(zoneAt(phone, phone.boardEnd - 1)).toBe('fret')
    expect(zoneAt(phone, phone.boardEnd)).toBe('pick')
  })

  it('maps positions to frets, clamped to the window', () => {
    expect(fretAt(phone, 0, phone.boardStart + 1)).toBe(1)
    expect(fretAt(phone, 0, fretCenter(phone, 0, 3))).toBe(3)
    expect(fretAt(phone, 0, phone.boardStart + phone.fretWidth * 3 + 1)).toBe(4)
    expect(fretAt(phone, 0, phone.boardEnd - 1)).toBe(5)
    expect(fretAt(phone, 0, 0)).toBe(1)
    expect(fretAt(phone, 0, phone.width)).toBe(5)
  })

  it('follows the neck as it scrolls under the window', () => {
    expect(visibleFretRange(phone, 0)).toEqual({ first: 1, last: 5 })
    expect(visibleFretRange(phone, 3)).toEqual({ first: 4, last: 8 })
    expect(visibleFretRange(phone, 3.5)).toEqual({ first: 4, last: 9 })
    expect(fretAt(phone, 3, phone.boardStart + 1)).toBe(4)
    expect(fretAt(phone, 3.5, phone.boardStart + 1)).toBe(4)
    expect(fretAt(phone, 3.5, phone.boardStart + phone.fretWidth / 2 + 1)).toBe(5)
    expect(fretAt(phone, 3, phone.width)).toBe(8)
    expect(fretCenter(phone, 3, 4)).toBeCloseTo(phone.boardStart + phone.fretWidth / 2)
  })

  it('keeps a held fret until the finger is clearly past its wire', () => {
    const wire = phone.boardStart + phone.fretWidth * 2
    const slack = phone.fretWidth * 0.12
    expect(fretAt(phone, 0, wire + slack - 1, 2)).toBe(2)
    expect(fretAt(phone, 0, wire + slack + 1, 2)).toBe(3)
    expect(fretAt(phone, 0, wire - slack + 1, 3)).toBe(3)
    expect(fretAt(phone, 0, wire - slack - 1, 3)).toBe(2)
    expect(fretAt(phone, 0, wire + 1)).toBe(3)
  })

  it('lets go of a held fret that scrolled out of the window', () => {
    expect(fretAt(phone, 3, phone.width, 5)).toBe(8)
    expect(fretAt(phone, 3, 0, 5)).toBe(4)
  })

  it('does not let float noise add a fret to a whole number of them', () => {
    const fourFrets = HEAD_WIDTH + NUT_WIDTH + (4 * 27 + 16) * PX_PER_MM
    const whole = computeNeckGeometry({ ...options, width: fourFrets })
    expect(whole.visibleFrets).toBeCloseTo(4)
    expect(visibleFretRange(whole, 0)).toEqual({ first: 1, last: 4 })
    expect(visibleFretRange(whole, 2)).toEqual({ first: 3, last: 6 })
    expect(fretAt(whole, 0, whole.width)).toBe(4)
  })

  it('expects strums to overshoot onto the 40 mm of fretboard next to the picking zone', () => {
    expect(nearPickZone(phone, phone.boardEnd - 1)).toBe(true)
    expect(nearPickZone(phone, phone.boardEnd - 39 * PX_PER_MM)).toBe(true)
    expect(nearPickZone(phone, phone.boardEnd - 41 * PX_PER_MM)).toBe(false)
    expect(nearPickZone(phone, fretCenter(phone, 0, 1))).toBe(false)
    expect(nearPickZone(phone, fretCenter(phone, 0, 3))).toBe(false)
    expect(nearPickZone(phone, fretCenter(phone, 0, 5))).toBe(true)
  })

  it('maps y to the nearest string row, clamped', () => {
    const half = phone.stringSpacing / 2
    expect(nearestRow(phone, -20)).toBe(0)
    expect(nearestRow(phone, phone.neckTop)).toBe(0)
    expect(nearestRow(phone, phone.stringYs[2]! + half - 1)).toBe(2)
    expect(nearestRow(phone, phone.stringYs[2]! + half + 1)).toBe(3)
    expect(nearestRow(phone, phone.stringYs[4]! - half + 1)).toBe(4)
    expect(nearestRow(phone, 9999)).toBe(5)
  })

  it('keeps a held string until the finger is clearly nearer another one', () => {
    const spacing = phone.stringSpacing
    expect(nearestRow(phone, phone.stringYs[2]! + spacing * 0.65, 2)).toBe(2)
    expect(nearestRow(phone, phone.stringYs[2]! + spacing * 0.75, 2)).toBe(3)
    expect(nearestRow(phone, phone.stringYs[2]! - spacing * 0.65, 2)).toBe(2)
    expect(nearestRow(phone, phone.stringYs[2]! - spacing * 0.75, 2)).toBe(1)
    expect(nearestRow(phone, phone.stringYs[2]! + spacing * 0.65)).toBe(3)
  })

  it('only frets on the neck, not on the background around it', () => {
    expect(isOnNeck(phone, phone.neckTop - 1)).toBe(false)
    expect(isOnNeck(phone, phone.neckTop + 1)).toBe(true)
    expect(isOnNeck(phone, phone.height / 2)).toBe(true)
    expect(isOnNeck(phone, phone.neckTop + phone.neckHeight + 1)).toBe(false)
  })

  it('centres the gaps between strings for the inlays', () => {
    expect(gapCenter(phone, 2)).toBeCloseTo(phone.height / 2)
    expect(gapCenter(phone, 1)).toBeCloseTo((phone.stringYs[1]! + phone.stringYs[2]!) / 2)
  })

  it('mirrors the neck axis for left-handed players', () => {
    const lefty = computeNeckGeometry({ ...options, leftHanded: true })
    expect(toNeckAxis(phone, 100)).toBe(100)
    expect(toNeckAxis(lefty, 100)).toBe(792)
    expect(zoneAt(lefty, toNeckAxis(lefty, 20))).toBe('pick')
    expect(spanOnSurface(phone, 0, 34)).toEqual({ left: 0, width: 34 })
    expect(spanOnSurface(lefty, 0, 34)).toEqual({ left: 858, width: 34 })
  })
})

describe('clientToLocal', () => {
  it('subtracts the box origin when not rotated', () => {
    const box = { left: 56, top: 0, right: 892 }
    expect(clientToLocal(box, false, 156, 40)).toEqual({ x: 100, y: 40 })
  })

  it('swaps the axes under a 90° clockwise rotation', () => {
    // A 836x412 surface whose local origin sits at the top-right of a 412x892 screen,
    // 56px down (side toolbar).
    const box = { left: 0, top: 56, right: 412 }
    expect(clientToLocal(box, true, 412, 56)).toEqual({ x: 0, y: 0 })
    expect(clientToLocal(box, true, 0, 892)).toEqual({ x: 836, y: 412 })
    expect(clientToLocal(box, true, 300, 156)).toEqual({ x: 100, y: 112 })
  })
})
