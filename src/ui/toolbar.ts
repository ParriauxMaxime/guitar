import { MAX_FIRST_FRET, MIN_FIRST_FRET } from '../music/fretboard'
import { button, el } from './dom'
import { ICONS } from './icons'

export interface ToolbarActions {
  shiftPosition(delta: number): void
  openSettings(): void
  toggleFullscreen(): void
}

export interface ToolbarState {
  firstFret: number
  tuningName: string
  fullscreenAvailable: boolean
  fullscreenActive: boolean
}

export interface Toolbar {
  element: HTMLElement
  update(state: ToolbarState): void
}

export function createToolbar(actions: ToolbarActions): Toolbar {
  const down = button('tool stepper__button', 'Move down the neck', () => actions.shiftPosition(-1))
  down.innerHTML = ICONS.minus
  const up = button('tool stepper__button', 'Move up the neck', () => actions.shiftPosition(1))
  up.innerHTML = ICONS.plus
  const position = el('span', 'stepper__number')
  const stepper = el(
    'div',
    'stepper',
    down,
    el('div', 'stepper__value', el('span', 'stepper__caption', 'Fret'), position),
    up,
  )
  stepper.setAttribute('role', 'group')
  stepper.setAttribute('aria-label', 'Neck position')

  const tuning = button('tool tool--tuning', 'Tuning', actions.openSettings)
  const fullscreen = button('tool', 'Toggle fullscreen', actions.toggleFullscreen)
  const settings = button('tool', 'Settings', actions.openSettings)
  settings.innerHTML = ICONS.settings

  const element = el(
    'div',
    'toolbar',
    stepper,
    tuning,
    el('div', 'toolbar__spacer'),
    fullscreen,
    settings,
  )

  return {
    element,
    update(state) {
      position.textContent = String(state.firstFret)
      down.disabled = state.firstFret <= MIN_FIRST_FRET
      up.disabled = state.firstFret >= MAX_FIRST_FRET
      tuning.textContent = state.tuningName
      tuning.setAttribute('aria-label', `Tuning: ${state.tuningName}`)
      fullscreen.hidden = !state.fullscreenAvailable
      fullscreen.innerHTML = state.fullscreenActive ? ICONS.exitFullscreen : ICONS.enterFullscreen
    },
  }
}
