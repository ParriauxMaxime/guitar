import {
  HEAD_WIDTH,
  NUT_WIDTH,
  cellCenter,
  gapCenter,
  spanOnSurface,
  type NeckGeometry,
} from '../layout/neckGeometry'
import { inlayDots, pitchAt } from '../music/fretboard'
import { noteName } from '../music/notes'
import type { Tuning } from '../music/tunings'
import { el, px } from './dom'

export interface NeckModel {
  tuning: Tuning
  firstFret: number
  noteLabels: boolean
}

export interface NeckView {
  render(geometry: NeckGeometry, model: NeckModel): void
  showHeldFrets(stringIndex: number, frets: readonly number[]): void
  vibrate(stringIndex: number, velocity: number): void
}

const STRING_THICKNESS = [5.5, 4.6, 3.7, 2.5, 2, 1.6]
const WOUND_STRINGS = 3
const FRET_WIRE_WIDTH = 5
const BRIDGE_WIDTH = 16
const BRIDGE_INSET = 8
const FRET_NUMBER_HEIGHT = 15
const VIBRATION_SHAPE = [0, 1, -0.85, 0.65, -0.5, 0.36, -0.24, 0.14, -0.06, 0]
const VIBRATION_MS = 420

export function createNeckView(surface: HTMLElement): NeckView {
  let strings: HTMLElement[] = []
  let cells: HTMLElement[][] = []
  let vibrations: (Animation | undefined)[] = []
  let firstFret = 1

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
    const openLength = bridgeStart - geometry.boardEnd

    const hole = el('div', 'soundhole')
    const diameter = Math.min(openLength * 0.74, geometry.neckHeight * 0.82)
    hole.style.width = hole.style.height = px(diameter)
    placeAt(
      hole,
      geometry,
      geometry.boardEnd + openLength / 2,
      geometry.neckTop + geometry.neckHeight / 2,
    )

    const bridge = neckBand('bridge', geometry, bridgeStart, bridgeStart + BRIDGE_WIDTH)
    return [node, hole, bridge]
  }

  // Numbers sit beside the neck, on whichever side has room; a neck filling the whole height keeps them on its edge.
  function fretNumberTop(geometry: NeckGeometry) {
    const neckBottom = geometry.neckTop + geometry.neckHeight
    if (geometry.neckTop >= FRET_NUMBER_HEIGHT) return geometry.neckTop - FRET_NUMBER_HEIGHT
    if (geometry.height - neckBottom >= FRET_NUMBER_HEIGHT) return neckBottom + 4
    return geometry.neckTop
  }

  function fretDecorations(geometry: NeckGeometry, cell: number) {
    const fret = firstFret + cell
    const center = cellCenter(geometry, cell)
    const nodes: HTMLElement[] = []

    const wire = neckBand('fret-wire', geometry, 0, FRET_WIRE_WIDTH)
    placeAt(wire, geometry, geometry.boardStart + geometry.fretWidth * (cell + 1), geometry.neckTop)
    nodes.push(wire)

    const number = el('div', 'fret-number', String(fret))
    placeAt(number, geometry, center, fretNumberTop(geometry))
    nodes.push(number)

    const dots = inlayDots(fret)
    const dotGaps = dots === 2 ? [1, 3] : dots === 1 ? [2] : []
    for (const row of dotGaps) {
      const dot = el('div', 'inlay')
      placeAt(dot, geometry, center, gapCenter(geometry, row))
      nodes.push(dot)
    }
    return nodes
  }

  function stringLine(geometry: NeckGeometry, row: number, stringIndex: number) {
    const wound = stringIndex < WOUND_STRINGS
    const node = el('div', `string ${wound ? 'string--wound' : 'string--plain'}`)
    const thickness = STRING_THICKNESS[stringIndex] ?? 2
    node.style.height = px(thickness)
    node.style.top = px((geometry.stringYs[row] ?? 0) - thickness / 2)
    return node
  }

  function render(geometry: NeckGeometry, model: NeckModel) {
    firstFret = model.firstFret
    const { tuning } = model
    const markerSize = Math.min(geometry.stringSpacing * 0.66, geometry.fretWidth * 0.56, 48)
    surface.style.setProperty('--marker-size', px(markerSize))
    surface.classList.toggle('surface--labels', model.noteLabels)

    const nodes: HTMLElement[] = [
      ...body(geometry),
      neckBand('board', geometry, 0, geometry.boardEnd),
      neckBand('head', geometry, 0, HEAD_WIDTH),
      neckBand(
        firstFret === 1 ? 'nut' : 'nut nut--shifted',
        geometry,
        HEAD_WIDTH,
        HEAD_WIDTH + NUT_WIDTH,
      ),
    ]
    for (let cell = 0; cell < geometry.fretCount; cell++) {
      nodes.push(...fretDecorations(geometry, cell))
    }

    strings = []
    cells = []
    geometry.stringOfRow.forEach((stringIndex, row) => {
      const y = geometry.stringYs[row] ?? 0
      const line = stringLine(geometry, row, stringIndex)
      strings[stringIndex] = line
      nodes.push(line)

      const openLabel = el('div', 'open-label', noteName(pitchAt(tuning.open, stringIndex, 0), tuning.flats))
      placeAt(openLabel, geometry, HEAD_WIDTH / 2, y)
      nodes.push(openLabel)

      cells[stringIndex] = Array.from({ length: geometry.fretCount }, (_, cell) => {
        const pitch = pitchAt(tuning.open, stringIndex, firstFret + cell)
        const node = el(
          'div',
          'cell',
          el('span', 'cell__marker'),
          el('span', 'cell__label', noteName(pitch, tuning.flats)),
        )
        placeAt(node, geometry, cellCenter(geometry, cell), y)
        nodes.push(node)
        return node
      })
    })

    vibrations = []
    surface.replaceChildren(...nodes)
  }

  return {
    render,
    showHeldFrets(stringIndex, frets) {
      cells[stringIndex]?.forEach((cell, index) => {
        cell.classList.toggle('is-held', frets.includes(firstFret + index))
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
