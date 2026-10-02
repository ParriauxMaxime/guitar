import {
  fretAt,
  isOnNeck,
  nearestRow,
  toNeckAxis,
  zoneAt,
  type NeckGeometry,
} from '../layout/neckGeometry'
import type { Point } from '../layout/pointerMapping'
import type { Instrument } from './instrument'
import { SLIDE_TRAVEL, edgePush } from './neckScroll'
import { TAP_VELOCITY, advanceStrum, beginStrum, strumVelocity, type Strum } from './strum'

export interface PlayingField {
  geometry: NeckGeometry
  /** Frets scrolled past the nut; fractional while the neck moves. */
  scroll: number
  toLocal(clientX: number, clientY: number): Point
}

export interface PointerController {
  releaseAll(): void
  /** Re-reads what every fretting finger holds, once the neck has moved under it. */
  refresh(): void
  /** How hard sliding fingers push an end of the fretboard: -1 (headstock) to 1 (bridge). */
  push(): number
  isFretting(): boolean
}

interface FrettingPointer {
  point: Point
  /** Neck-axis position where the finger landed. */
  origin: number
  slid: boolean
}

interface PickingPointer {
  strum: Strum
  y: number
  time: number
  stringsPerSecond: number
}

const TAP_RADIUS_RATIO = 0.35
const HYSTERESIS_RATIO = 0.06
/** A finger that paused is treated as having started moving at most this long ago. */
const MAX_SEGMENT_MS = 32
const SPEED_SMOOTHING = 0.5

export function attachPointerController(
  surface: HTMLElement,
  field: () => PlayingField | null,
  instrument: Instrument,
  frettingChanged: () => void,
): PointerController {
  const fretting = new Map<number, FrettingPointer>()
  const picking = new Map<number, PickingPointer>()

  function fretUnder(current: PlayingField, point: Point) {
    const { geometry, scroll } = current
    const row = nearestRow(geometry, point.y)
    return {
      stringIndex: geometry.stringOfRow[row] ?? 0,
      fret: fretAt(geometry, scroll, toNeckAxis(geometry, point.x)),
    }
  }

  function holdAt(current: PlayingField, pointerId: number, point: Point) {
    const { stringIndex, fret } = fretUnder(current, point)
    instrument.hold(pointerId, stringIndex, fret)
  }

  function slideTo(current: PlayingField, pointerId: number, pointer: FrettingPointer, point: Point) {
    const { geometry } = current
    const travel = Math.abs(toNeckAxis(geometry, point.x) - pointer.origin)
    pointer.slid ||= travel >= geometry.fretWidth * SLIDE_TRAVEL
    pointer.point = point
    holdAt(current, pointerId, point)
  }

  function pluckRows(geometry: NeckGeometry, rows: number[], velocity: number) {
    for (const row of rows) {
      const stringIndex = geometry.stringOfRow[row]
      if (stringIndex !== undefined) instrument.pluck(stringIndex, velocity)
    }
  }

  function strumTo(geometry: NeckGeometry, pointer: PickingPointer, y: number, time: number) {
    const spacing = geometry.stringSpacing
    const elapsed = Math.min(MAX_SEGMENT_MS, Math.max(1, time - pointer.time))
    const speed = (Math.abs(y - pointer.y) / spacing / elapsed) * 1000
    pointer.stringsPerSecond += (speed - pointer.stringsPerSecond) * SPEED_SMOOTHING

    const step = advanceStrum(
      pointer.strum,
      geometry.stringYs,
      y,
      spacing * HYSTERESIS_RATIO,
      spacing * TAP_RADIUS_RATIO,
    )
    pointer.strum = step.strum
    pointer.y = y
    pointer.time = time
    pluckRows(geometry, step.crossed, strumVelocity(pointer.stringsPerSecond))
  }

  function onDown(event: PointerEvent) {
    const current = field()
    if (!current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const { geometry } = current
    const point = current.toLocal(event.clientX, event.clientY)
    const neckAxis = toNeckAxis(geometry, point.x)
    const zone = zoneAt(geometry, neckAxis)

    if (zone === 'pick') {
      const strum = beginStrum(geometry.stringYs, point.y, geometry.stringSpacing * TAP_RADIUS_RATIO)
      picking.set(event.pointerId, { strum, y: point.y, time: event.timeStamp, stringsPerSecond: 0 })
      if (strum.tapped !== null) pluckRows(geometry, [strum.tapped], TAP_VELOCITY)
    } else if (zone === 'fret' && isOnNeck(geometry, point.y)) {
      fretting.set(event.pointerId, { point, origin: neckAxis, slid: false })
      holdAt(current, event.pointerId, point)
      frettingChanged()
    } else {
      return
    }
    // Touch pointers are captured implicitly; this keeps mouse drags consistent with them.
    if (event.pointerType === 'mouse') surface.setPointerCapture(event.pointerId)
  }

  function onMove(event: PointerEvent) {
    const current = field()
    if (!current) return
    const picker = picking.get(event.pointerId)
    const fretter = fretting.get(event.pointerId)
    if (!picker && !fretter) return

    const coalesced = event.getCoalescedEvents?.() ?? []
    for (const sample of coalesced.length > 0 ? coalesced : [event]) {
      const point = current.toLocal(sample.clientX, sample.clientY)
      if (picker) strumTo(current.geometry, picker, point.y, sample.timeStamp)
      else if (fretter) slideTo(current, event.pointerId, fretter, point)
    }
    if (fretter) frettingChanged()
  }

  function onEnd(event: PointerEvent) {
    picking.delete(event.pointerId)
    if (!fretting.delete(event.pointerId)) return
    instrument.release(event.pointerId)
    frettingChanged()
  }

  surface.addEventListener('pointerdown', onDown)
  surface.addEventListener('pointermove', onMove)
  surface.addEventListener('pointerup', onEnd)
  surface.addEventListener('pointercancel', onEnd)
  surface.addEventListener('lostpointercapture', onEnd)

  return {
    releaseAll() {
      picking.clear()
      fretting.clear()
      instrument.releaseAll()
    },
    refresh() {
      const current = field()
      if (!current) return
      for (const [pointerId, pointer] of fretting) holdAt(current, pointerId, pointer.point)
    },
    push() {
      const current = field()
      if (!current) return 0
      const { geometry } = current
      let total = 0
      for (const pointer of fretting.values()) {
        if (pointer.slid) total += edgePush(geometry, toNeckAxis(geometry, pointer.point.x))
      }
      return Math.min(1, Math.max(-1, total))
    },
    isFretting: () => fretting.size > 0,
  }
}
