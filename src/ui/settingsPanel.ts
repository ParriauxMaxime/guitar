import { TUNINGS } from '../music/tunings'
import { FRET_WIDTH_MM, NECK_WIDTH_MM, type Settings } from '../settings'
import { button, el } from './dom'
import { ICONS } from './icons'
import { createSlider, type SliderOptions } from './slider'

export interface SettingsPanel {
  element: HTMLElement
  open(): void
  close(): void
  update(settings: Settings): void
}

interface Choice<T> {
  value: T
  label: string
}

interface Field {
  row: HTMLElement
  sync(settings: Settings): void
}

const ON_OFF: Choice<boolean>[] = [
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
]

export function createSettingsPanel(onChange: (patch: Partial<Settings>) => void): SettingsPanel {
  function row(label: string, wide: boolean, ...controls: HTMLElement[]): HTMLElement {
    return el(
      'div',
      wide ? 'setting setting--wide' : 'setting',
      el('span', 'setting__label', label),
      ...controls,
    )
  }

  function choiceField<K extends keyof Settings>(
    label: string,
    key: K,
    choices: Choice<Settings[K]>[],
    wide = false,
  ): Field {
    const buttons = choices.map((choice) => {
      const node = button('choice', choice.label, () => onChange({ [key]: choice.value }))
      node.textContent = choice.label
      return node
    })
    const group = el('div', 'choices', ...buttons)
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', label)
    return {
      row: row(label, wide, group),
      sync(settings) {
        buttons.forEach((node, index) => {
          node.setAttribute('aria-pressed', String(choices[index]?.value === settings[key]))
        })
      },
    }
  }

  function sliderField(
    options: SliderOptions,
    unit: string,
    read: (settings: Settings) => number,
    write: (value: number) => Partial<Settings>,
  ): Field {
    const readout = el('span', 'setting__value')
    const show = (value: number) => {
      readout.textContent = `${value}${unit}`
    }
    const slider = createSlider(options, (value) => {
      show(value)
      onChange(write(value))
    })
    return {
      row: row(options.label, false, slider.element, readout),
      sync(settings) {
        slider.set(read(settings))
        show(read(settings))
      },
    }
  }

  const fields: Field[] = [
    choiceField(
      'Tuning',
      'tuning',
      TUNINGS.map((tuning) => ({ value: tuning.id, label: tuning.name })),
      true,
    ),
    sliderField(
      { label: 'Neck width', ...NECK_WIDTH_MM },
      ' mm',
      (settings) => settings.neckWidthMm,
      (neckWidthMm) => ({ neckWidthMm }),
    ),
    sliderField(
      { label: 'Fret width', ...FRET_WIDTH_MM },
      ' mm',
      (settings) => settings.fretWidthMm,
      (fretWidthMm) => ({ fretWidthMm }),
    ),
    choiceField('Neck placement', 'neckPlacement', [
      { value: 'top', label: 'Top' },
      { value: 'center', label: 'Center' },
      { value: 'bottom', label: 'Bottom' },
    ]),
    choiceField('Hand', 'leftHanded', [
      { value: false, label: 'Right' },
      { value: true, label: 'Left' },
    ]),
    choiceField('Low string', 'lowStringOnTop', [
      { value: false, label: 'Bottom' },
      { value: true, label: 'Top' },
    ]),
    choiceField('Hammer-on', 'hammerOn', ON_OFF),
    choiceField('Note names', 'noteLabels', ON_OFF),
    sliderField(
      { label: 'Volume', min: 0, max: 100, step: 1 },
      '%',
      (settings) => Math.round(settings.volume * 100),
      (percent) => ({ volume: percent / 100 }),
    ),
  ]

  const close = () => {
    element.hidden = true
  }
  const closeButton = button('tool', 'Close settings', close)
  closeButton.innerHTML = ICONS.close

  const sheet = el(
    'div',
    'sheet',
    el('div', 'sheet__header', el('h2', 'sheet__title', 'Settings'), closeButton),
    el('div', 'sheet__body', ...fields.map((field) => field.row)),
  )
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-label', 'Settings')

  const element = el('div', 'sheet-backdrop', sheet)
  element.hidden = true
  element.addEventListener('click', (event) => {
    if (event.target === element) close()
  })

  return {
    element,
    open() {
      element.hidden = false
    },
    close,
    update(settings) {
      fields.forEach((field) => field.sync(settings))
    },
  }
}
