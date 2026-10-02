import { createGuitarAudio } from './audio/engine'
import { withAudioSpy } from './debug/audioSpy'
import { createInstrument } from './input/instrument'
import { advanceScroll } from './input/neckScroll'
import { attachPointerController, type PlayingField } from './input/pointerController'
import { computeNeckGeometry, visibleFretRange } from './layout/neckGeometry'
import { clientToLocal } from './layout/pointerMapping'
import { TOOLBAR_SIZE, computeStageLayout } from './layout/stageLayout'
import { MAX_FIRST_FRET, MIN_FIRST_FRET, clampFirstFret, reachablePitches } from './music/fretboard'
import { tuningById } from './music/tunings'
import {
  fullscreenActive,
  fullscreenAvailable,
  isImmersive,
  keepFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from './platform/fullscreen'
import { absorbBackGesture, suppressBrowserGestures } from './platform/gestures'
import { buzz, pulseMs } from './platform/haptics'
import { keepScreenAwake } from './platform/wakeLock'
import { loadSettings, saveSettings, type Settings } from './settings'
import { button, el, px } from './ui/dom'
import { ICONS } from './ui/icons'
import { createNeckView } from './ui/neckView'
import { createSettingsPanel } from './ui/settingsPanel'
import { createToolbar } from './ui/toolbar'

const MAX_SCROLL = MAX_FIRST_FRET - MIN_FIRST_FRET
// A stalled frame must not make the neck jump several frets at once.
const MAX_FRAME_SECONDS = 0.05

export function startApp(root: HTMLElement): void {
  let settings = loadSettings()
  let field: PlayingField | null = null
  let prewarmed = ''
  let layoutQueued = false
  let scrolling = false
  let lastFrame = 0
  let toolbarOpen = false

  const audio = withAudioSpy(createGuitarAudio())
  audio.setVolume(settings.volume)

  const surface = el('div', 'surface')
  const neck = createNeckView(surface)
  const instrument = createInstrument(audio, instrumentConfig(), {
    heldFretsChanged: neck.showHeldFrets,
    stringSounded(stringIndex, velocity) {
      neck.vibrate(stringIndex, velocity)
      if (settings.haptics) buzz(pulseMs(stringIndex, velocity))
    },
  })
  const pointers = attachPointerController(surface, () => field, instrument, wakeScroll)

  const panel = createSettingsPanel(changeSettings)
  const toolbar = createToolbar({
    shiftPosition: (delta) => changeSettings({ firstFret: clampFirstFret(settings.firstFret + delta) }),
    openSettings: panel.open,
    toggleFullscreen,
  })
  const handle = button('toolbar-handle', 'Show toolbar', () => showToolbar(true))
  handle.innerHTML = ICONS.more
  const stage = el('div', 'stage', toolbar.element, surface, handle, panel.element)
  stage.style.setProperty('--toolbar-top', px(TOOLBAR_SIZE.top))
  stage.style.setProperty('--toolbar-side', px(TOOLBAR_SIZE.side))
  root.replaceChildren(stage)

  function instrumentConfig() {
    return { open: tuningById(settings.tuning).open, hammerOn: settings.hammerOn }
  }

  function changeSettings(patch: Partial<Settings>) {
    settings = { ...settings, ...patch }
    saveSettings(settings)
    audio.setVolume(settings.volume)
    // Neither changes the neck, and rebuilding it would cut ringing notes.
    if (Object.keys(patch).every((key) => key === 'volume' || key === 'haptics')) {
      panel.update(settings)
      return
    }
    instrument.configure(instrumentConfig())
    layout()
  }

  function showToolbar(open: boolean) {
    toolbarOpen = open
    stage.classList.toggle('stage--toolbar-open', open)
  }

  function layout() {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const stageLayout = computeStageLayout(viewport, settings.neckWidthMm, !isImmersive())

    stage.style.width = px(stageLayout.width)
    stage.style.height = px(stageLayout.height)
    stage.style.transform = stageLayout.rotated
      ? `translateX(${px(viewport.width)}) rotate(90deg)`
      : ''
    stage.className = [
      'stage',
      `stage--toolbar-${stageLayout.toolbar}`,
      stageLayout.rotated ? 'stage--rotated' : '',
      settings.leftHanded ? 'stage--left-handed' : '',
      settings.neckPlacement === 'top' ? 'stage--neck-top' : '',
      toolbarOpen ? 'stage--toolbar-open' : '',
    ].join(' ')

    pointers.releaseAll()
    const geometry = computeNeckGeometry({
      width: surface.clientWidth,
      height: surface.clientHeight,
      neckWidthMm: settings.neckWidthMm,
      fretWidthMm: settings.fretWidthMm,
      pickZoneMm: settings.pickZoneMm,
      neckPlacement: settings.neckPlacement,
      leftHanded: settings.leftHanded,
      lowStringOnTop: settings.lowStringOnTop,
    })
    const box = surface.getBoundingClientRect()
    field = {
      geometry,
      scroll: settings.firstFret - MIN_FIRST_FRET,
      autocorrect: settings.autocorrect,
      toLocal: (clientX, clientY) => clientToLocal(box, stageLayout.rotated, clientX, clientY),
    }

    neck.render(geometry, { tuning: tuningById(settings.tuning), noteLabels: settings.noteLabels })
    neck.setScroll(field.scroll)
    panel.update(settings)
    refreshToolbar()
    prewarmWindow(field)
  }

  function prewarmWindow({ geometry, scroll }: PlayingField) {
    const { first, last } = visibleFretRange(geometry, scroll)
    // One fret further, so a scrolling neck never meets an unrendered note.
    const pitches = reachablePitches(tuningById(settings.tuning).open, first, last - first + 2)
    if (pitches.join() === prewarmed) return
    prewarmed = pitches.join()
    audio.prewarm(pitches)
  }

  function scrollNeck(scroll: number) {
    if (!field) return
    field.scroll = scroll
    neck.setScroll(scroll)
    pointers.refresh()

    const firstFret = Math.floor(scroll) + MIN_FIRST_FRET
    if (firstFret === settings.firstFret) return
    settings = { ...settings, firstFret }
    saveSettings(settings)
    refreshToolbar()
    prewarmWindow(field)
  }

  function scrollFrame(now: number) {
    // A frame's timestamp can predate the event that woke the loop: such a frame only starts the clock.
    const seconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrame) / 1000))
    lastFrame = now
    const scroll = field?.scroll ?? 0
    const next = advanceScroll(scroll, pointers.push(), pointers.isFretting(), seconds, MAX_SCROLL)
    if (next === scroll && seconds > 0) {
      scrolling = false
      return
    }
    if (next !== scroll) scrollNeck(next)
    requestAnimationFrame(scrollFrame)
  }

  function wakeScroll() {
    if (scrolling) return
    scrolling = true
    lastFrame = performance.now()
    requestAnimationFrame(scrollFrame)
  }

  function refreshToolbar() {
    toolbar.update({
      firstFret: settings.firstFret,
      tuningName: tuningById(settings.tuning).name,
      fullscreenAvailable: fullscreenAvailable(),
      fullscreenActive: fullscreenActive(),
    })
  }

  function queueLayout() {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(() => {
      layoutQueued = false
      layout()
    })
  }

  window.addEventListener('resize', queueLayout)
  window.addEventListener('blur', pointers.releaseAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pointers.releaseAll()
  })
  // Some browsers only let audio start once the first touch has ended.
  for (const type of ['pointerdown', 'pointerup']) {
    document.addEventListener(type, () => void audio.unlock().catch(() => {}), { capture: true })
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (toolbarOpen && !toolbar.element.contains(event.target as Node)) showToolbar(false)
    },
    { capture: true },
  )
  onFullscreenChange(() => {
    showToolbar(false)
    queueLayout()
  })
  suppressBrowserGestures()
  absorbBackGesture()
  keepFullscreen()
  keepScreenAwake()
  layout()
}
