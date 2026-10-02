import { describe, expect, it } from 'vitest'
import {
  HEAD_WIDTH,
  NUT_WIDTH,
  PX_PER_MM,
  cellAt,
  cellCenter,
  computeNeckGeometry,
  gapCenter,
  isOnNeck,
  nearestRow,
  spanOnSurface,
  toNeckAxis,
  visibleFretCount,
  zoneAt,
} from './neckGeometry'
import { clientToLocal } from './pointerMapping'
import { TOOLBAR_SIZE, computeStageLayout, type Viewport } from './stageLayout'

const NECK_WIDTH_MM = 46
const FRET_WIDTH_MM = 27
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

function neckFor(viewport: Viewport, neckWidthMm = NECK_WIDTH_MM, fretWidthMm = FRET_WIDTH_MM) {
  return computeNeckGeometry({
    ...surfaceOf(viewport, neckWidthMm),
    neckWidthMm,
    fretWidthMm,
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

  it('moves the toolbar to the side when the requested neck does not fit under it', () => {
    expect(computeStageLayout({ width: 892, height: 412 }, 64).toolbar).toBe('top')
    expect(computeStageLayout({ width: 892, height: 412 }, 65).toolbar).toBe('side')
    expect(computeStageLayout({ width: 412, height: 892 }, 70).toolbar).toBe('side')
    expect(computeStageLayout({ width: 832, height: 750 }, 70).toolbar).toBe('top')
  })
})

describe('visibleFretCount', () => {
  it.each([
    [892, 412, 4],
    [412, 892, 4],
    [832, 750, 4],
    [750, 832, 3],
    [667, 375, 3],
  ])('%ix%i shows %i default frets', (width, height, expected) => {
    expect(neckFor({ width, height }).fretCount).toBe(expected)
  })

  it('follows the fret width', () => {
    const viewport = { width: 892, height: 412 }
    expect(neckFor(viewport, NECK_WIDTH_MM, 18).fretCount).toBe(6)
    expect(neckFor(viewport, NECK_WIDTH_MM, 40).fretCount).toBe(3)
  })

  it('loses length to a side toolbar', () => {
    expect(neckFor({ width: 832, height: 320 }).fretCount).toBe(4)
    expect(neckFor({ width: 832, height: 300 }).fretCount).toBe(3)
  })

  it('stays between 2 and 7', () => {
    expect(visibleFretCount(300, 154)).toBe(2)
    expect(visibleFretCount(4000, 154)).toBe(7)
  })
})

describe('computeNeckGeometry', () => {
  const options = {
    width: 892,
    height: 368,
    neckWidthMm: NECK_WIDTH_MM,
    fretWidthMm: FRET_WIDTH_MM,
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
    expect(neck.width - neck.boardEnd).toBeGreaterThanOrEqual(140)
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

  it('splits the length into head, equal frets and picking zone', () => {
    expect(phone.boardStart).toBe(HEAD_WIDTH + NUT_WIDTH)
    expect(phone.boardEnd).toBeCloseTo(phone.boardStart + 4 * 27 * PX_PER_MM)
    expect(zoneAt(phone, 10)).toBe('head')
    expect(zoneAt(phone, phone.boardStart + 1)).toBe('fret')
    expect(zoneAt(phone, phone.boardEnd - 1)).toBe('fret')
    expect(zoneAt(phone, phone.boardEnd)).toBe('pick')
  })

  it('maps positions to fret cells, clamped to the window', () => {
    expect(cellAt(phone, phone.boardStart + 1)).toBe(0)
    expect(cellAt(phone, cellCenter(phone, 2))).toBe(2)
    expect(cellAt(phone, phone.boardStart + phone.fretWidth * 3 + 1)).toBe(3)
    expect(cellAt(phone, 0)).toBe(0)
    expect(cellAt(phone, phone.width)).toBe(3)
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
