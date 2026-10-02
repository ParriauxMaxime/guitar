import { el } from './dom'

export interface SliderOptions {
  label: string
  min: number
  max: number
  step: number
}

export interface Slider {
  element: HTMLElement
  set(value: number): void
}

/**
 * A stepped slider driven by pointer events. The native range input does not
 * follow a finger once the stage is rotated a quarter turn.
 */
export function createSlider(options: SliderOptions, onInput: (value: number) => void): Slider {
  const { min, max, step } = options
  const track = el('div', 'slider__track', el('div', 'slider__fill'))
  const element = el('div', 'slider', track, el('div', 'slider__thumb'))
  let value = min
  element.tabIndex = 0
  element.setAttribute('role', 'slider')
  element.setAttribute('aria-label', options.label)
  element.setAttribute('aria-valuemin', String(min))
  element.setAttribute('aria-valuemax', String(max))

  function set(next: number) {
    const snapped = min + Math.round((next - min) / step) * step
    value = Math.min(max, Math.max(min, snapped))
    element.style.setProperty('--value', String((value - min) / (max - min)))
    element.setAttribute('aria-valuenow', String(value))
  }

  function input(next: number) {
    const previous = value
    set(next)
    if (value !== previous) onInput(value)
  }

  function valueAt(event: PointerEvent): number {
    const box = track.getBoundingClientRect()
    // On a rotated stage the track runs down the screen instead of across it.
    const ratio =
      box.height > box.width
        ? (event.clientY - box.top) / box.height
        : (event.clientX - box.left) / box.width
    return min + ratio * (max - min)
  }

  element.addEventListener('pointerdown', (event) => {
    element.setPointerCapture(event.pointerId)
    input(valueAt(event))
  })
  element.addEventListener('pointermove', (event) => {
    if (element.hasPointerCapture(event.pointerId)) input(valueAt(event))
  })
  element.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') input(value + step)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') input(value - step)
  })

  return { element, set }
}
