import {
  cellAt,
  isOnNeck,
  nearestRow,
  toNeckAxis,
  zoneAt,
  type NeckGeometry,
} from '../layout/neckGeometry'
import type { Point } from '../layout/pointerMapping'
import type { Instrument } from './instrument'
import { TAP_VELOCITY, advanceStrum, beginStrum, strumVelocity, type Strum } from './strum'

export interface PlayingField {
  geometry: NeckGeometry
  firstFret: number
  toLocal(clientX: number, clientY: number): Point
}

export interface PointerController {
  releaseAll(): void
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
): PointerController {
  const fretting = new Set<number>()
  const picking = new Map<number, PickingPointer>()

  function fretUnder(current: PlayingField, point: Point) {
    const { geometry, firstFret } = current
    const row = nearestRow(geometry, point.y)
    return {
      stringIndex: geometry.stringOfRow[row] ?? 0,
      fret: firstFret + cellAt(geometry, toNeckAxis(geometry, point.x)),
    }
  }

  function holdAt(current: PlayingField, pointerId: number, point: Point) {
    const { stringIndex, fret } = fretUnder(current, point)
    instrument.hold(pointerId, stringIndex, fret)
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
    const zone = zoneAt(geometry, toNeckAxis(geometry, point.x))

    if (zone === 'pick') {
      const strum = beginStrum(geometry.stringYs, point.y, geometry.stringSpacing * TAP_RADIUS_RATIO)
      picking.set(event.pointerId, { strum, y: point.y, time: event.timeStamp, stringsPerSecond: 0 })
      if (strum.tapped !== null) pluckRows(geometry, [strum.tapped], TAP_VELOCITY)
    } else if (zone === 'fret' && isOnNeck(geometry, point.y)) {
      fretting.add(event.pointerId)
      holdAt(current, event.pointerId, point)
    } else {
      return
    }
    // Touch pointers are captured implicitly; this keeps mouse drags consistent with them.
    if (event.pointerType === 'mouse') surface.setPointerCapture(event.pointerId)
  }

  function onMove(event: PointerEvent) {
    const current = field()
    if (!current) return
    const pointer = picking.get(event.pointerId)
    if (!pointer && !fretting.has(event.pointerId)) return

    const coalesced = event.getCoalescedEvents?.() ?? []
    for (const sample of coalesced.length > 0 ? coalesced : [event]) {
      const point = current.toLocal(sample.clientX, sample.clientY)
      if (pointer) strumTo(current.geometry, pointer, point.y, sample.timeStamp)
      else holdAt(current, event.pointerId, point)
    }
  }

  function onEnd(event: PointerEvent) {
    picking.delete(event.pointerId)
    if (fretting.delete(event.pointerId)) instrument.release(event.pointerId)
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
  }
}
