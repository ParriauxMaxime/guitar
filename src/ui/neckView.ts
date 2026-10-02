import {
  HEAD_WIDTH,
  NUT_WIDTH,
  gapCenter,
  spanOnSurface,
  type NeckGeometry,
} from '../layout/neckGeometry'
import { LAST_FRET, inlayDots, pitchAt } from '../music/fretboard'
import { noteName } from '../music/notes'
import type { Tuning } from '../music/tunings'
import { el, px } from './dom'

export interface NeckModel {
  tuning: Tuning
  noteLabels: boolean
}

export interface NeckView {
  render(geometry: NeckGeometry, model: NeckModel): void
  /** Slides the frets under the strings; `scroll` is in frets past the nut. */
  setScroll(scroll: number): void
  showHeldFrets(stringIndex: number, frets: readonly number[]): void
  vibrate(stringIndex: number, velocity: number): void
}

const STRING_THICKNESS = [5.5, 4.6, 3.7, 2.5, 2, 1.6]
const WOUND_STRINGS = 3
const FRET_WIRE_WIDTH = 5
const BRIDGE_WIDTH = 16
const BRIDGE_INSET = 8
const FRET_NUMBER_HEIGHT = 15
// Below this share of the neck width a sound hole reads as a stray dot.
const MIN_SOUNDHOLE_RATIO = 0.4
const VIBRATION_SHAPE = [0, 1, -0.85, 0.65, -0.5, 0.36, -0.24, 0.14, -0.06, 0]
const VIBRATION_MS = 420

export function createNeckView(surface: HTMLElement): NeckView {
  let strings: HTMLElement[] = []
  let cells: HTMLElement[][] = []
  let vibrations: (Animation | undefined)[] = []
  let strips: HTMLElement[] = []
  let nut: HTMLElement | null = null
  let pxPerFret = 0

  function place(node: HTMLElement, geometry: NeckGeometry, from: number, to: number) {
    const { left, width } = spanOnSurface(geometry, from, to)
    node.style.left = px(left)
    node.style.width = px(width)
  }

  function placeAt(node: HTMLElement, geometry: NeckGeometry, neckAxis: number, y: number) {
    node.style.left = px(spanOnSurface(geometry, neckAxis, neckAxis).left)
    node.style.top = px(y)
  }

  function neckBand(className: string, geometry: NeckGeometry, from: number, to: number) {
    const node = el('div', className)
    place(node, geometry, from, to)
    node.style.top = px(geometry.neckTop)
    node.style.height = px(geometry.neckHeight)
    return node
  }

  function body(geometry: NeckGeometry) {
    const node = el('div', 'body')
    place(node, geometry, geometry.boardEnd, geometry.width)
    const bridgeStart = geometry.width - BRIDGE_INSET - BRIDGE_WIDTH
    const bridge = neckBand('bridge', geometry, bridgeStart, bridgeStart + BRIDGE_WIDTH)

    const openLength = bridgeStart - geometry.boardEnd
    const diameter = Math.min(openLength * 0.74, geometry.neckHeight * 0.82)
    if (diameter < geometry.neckHeight * MIN_SOUNDHOLE_RATIO) return [node, bridge]

    const hole = el('div', 'soundhole')
    hole.style.width = hole.style.height = px(diameter)
    placeAt(
      hole,
      geometry,
      geometry.boardEnd + openLength / 2,
      geometry.neckTop + geometry.neckHeight / 2,
    )
    return [node, hole, bridge]
  }

  // Numbers sit beside the neck, on whichever side has room; a neck filling the whole height keeps them on its edge.
  function fretNumberTop(geometry: NeckGeometry) {
    const neckBottom = geometry.neckTop + geometry.neckHeight
    if (geometry.neckTop >= FRET_NUMBER_HEIGHT) return geometry.neckTop - FRET_NUMBER_HEIGHT
    if (geometry.height - neckBottom >= FRET_NUMBER_HEIGHT) return neckBottom + 4
    return geometry.neckTop
  }

  /** Every fret of the neck laid out in a row, seen through a window the size of the visible board. */
  function fretStrip(geometry: NeckGeometry, children: HTMLElement[]) {
    const strip = el('div', 'fret-strip', ...children)
    strip.style.width = px(geometry.fretWidth * LAST_FRET)
    strip.style[geometry.leftHanded ? 'right' : 'left'] = '0'
    strips.push(strip)

    const window = el('div', 'fretboard', strip)
    place(window, geometry, geometry.boardStart, geometry.boardEnd)
    return window
  }

  function render(geometry: NeckGeometry, model: NeckModel) {
    const { tuning } = model
    const { fretWidth } = geometry
    const stripLength = fretWidth * LAST_FRET
    const frets = Array.from({ length: LAST_FRET }, (_, index) => index + 1)
    const markerSize = Math.min(geometry.stringSpacing * 0.66, fretWidth * 0.56, 48)
    surface.style.setProperty('--marker-size', px(markerSize))
    surface.classList.toggle('surface--labels', model.noteLabels)

    function onStrip(node: HTMLElement, fromNut: number, y: number) {
      node.style.left = px(geometry.leftHanded ? stripLength - fromNut : fromNut)
      node.style.top = px(y)
      return node
    }

    const decorations = frets.flatMap((fret) => {
      const center = fretWidth * (fret - 0.5)
      const wire = el('div', 'fret-wire')
      wire.style.width = px(FRET_WIRE_WIDTH)
      wire.style.height = px(geometry.neckHeight)
      const dots = inlayDots(fret)
      const dotGaps = dots === 2 ? [1, 3] : dots === 1 ? [2] : []
      return [
        onStrip(wire, fretWidth * fret, geometry.neckTop),
        onStrip(el('div', 'fret-number', String(fret)), center, fretNumberTop(geometry)),
        ...dotGaps.map((row) => onStrip(el('div', 'inlay'), center, gapCenter(geometry, row))),
      ]
    })

    strings = []
    cells = []
    const openLabels: HTMLElement[] = []
    geometry.stringOfRow.forEach((stringIndex, row) => {
      const y = geometry.stringYs[row] ?? 0
      const wound = stringIndex < WOUND_STRINGS
      const line = el('div', `string ${wound ? 'string--wound' : 'string--plain'}`)
      const thickness = STRING_THICKNESS[stringIndex] ?? 2
      line.style.height = px(thickness)
      line.style.top = px(y - thickness / 2)
      strings[stringIndex] = line

      const openLabel = el('div', 'open-label', noteName(pitchAt(tuning.open, stringIndex, 0), tuning.flats))
      placeAt(openLabel, geometry, HEAD_WIDTH / 2, y)
      openLabels.push(openLabel)

      cells[stringIndex] = frets.map((fret) => {
        const name = noteName(pitchAt(tuning.open, stringIndex, fret), tuning.flats)
        const cell = el('div', 'cell', el('span', 'cell__marker'), el('span', 'cell__label', name))
        return onStrip(cell, fretWidth * (fret - 0.5), y)
      })
    })

    strips = []
    vibrations = []
    pxPerFret = geometry.leftHanded ? -fretWidth : fretWidth
    nut = neckBand('nut', geometry, HEAD_WIDTH, HEAD_WIDTH + NUT_WIDTH)
    surface.replaceChildren(
      ...body(geometry),
      neckBand('board', geometry, 0, geometry.boardEnd),
      fretStrip(geometry, decorations),
      neckBand('head', geometry, 0, HEAD_WIDTH),
      nut,
      ...strings,
      fretStrip(geometry, cells.flat()),
      ...openLabels,
    )
  }

  return {
    render,
    setScroll(scroll) {
      const shift = `translateX(${px(-scroll * pxPerFret)})`
      for (const strip of strips) strip.style.transform = shift
      nut?.classList.toggle('nut--shifted', scroll > 0)
    },
    showHeldFrets(stringIndex, frets) {
      cells[stringIndex]?.forEach((cell, index) => {
        cell.classList.toggle('is-held', frets.includes(index + 1))
      })
    },
    vibrate(stringIndex, velocity) {
      const line = strings[stringIndex]
      if (!line) return
      vibrations[stringIndex]?.cancel()
      const amplitude = 1.5 + 3.5 * velocity
      vibrations[stringIndex] = line.animate(
        VIBRATION_SHAPE.map((k) => ({ transform: `translateY(${px(k * amplitude)})` })),
        { duration: VIBRATION_MS, easing: 'linear' },
      )
    },
  }
}
