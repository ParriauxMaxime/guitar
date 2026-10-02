import { createGuitarAudio } from './audio/engine'
import { withAudioSpy } from './debug/audioSpy'
import { createInstrument } from './input/instrument'
import { attachPointerController, type PlayingField } from './input/pointerController'
import { computeNeckGeometry } from './layout/neckGeometry'
import { clientToLocal } from './layout/pointerMapping'
import { TOOLBAR_SIZE, computeStageLayout } from './layout/stageLayout'
import { clampFirstFret, reachablePitches } from './music/fretboard'
import { tuningById } from './music/tunings'
import {
  fullscreenActive,
  fullscreenAvailable,
  onFullscreenChange,
  toggleFullscreen,
} from './platform/fullscreen'
import { suppressBrowserGestures } from './platform/gestures'
import { keepScreenAwake } from './platform/wakeLock'
import { loadSettings, saveSettings, type Settings } from './settings'
import { el, px } from './ui/dom'
import { createNeckView } from './ui/neckView'
import { createSettingsPanel } from './ui/settingsPanel'
import { createToolbar } from './ui/toolbar'

export function startApp(root: HTMLElement): void {
  let settings = loadSettings()
  let field: PlayingField | null = null
  let prewarmed = ''
  let layoutQueued = false

  const audio = withAudioSpy(createGuitarAudio())
  audio.setVolume(settings.volume)

  const surface = el('div', 'surface')
  const neck = createNeckView(surface)
  const instrument = createInstrument(audio, instrumentConfig(), {
    heldFretsChanged: neck.showHeldFrets,
    stringSounded: neck.vibrate,
  })
  const pointers = attachPointerController(surface, () => field, instrument)

  const panel = createSettingsPanel(changeSettings)
  const toolbar = createToolbar({
    shiftPosition: (delta) => changeSettings({ firstFret: clampFirstFret(settings.firstFret + delta) }),
    openSettings: panel.open,
    toggleFullscreen,
  })
  const stage = el('div', 'stage', toolbar.element, surface, panel.element)
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
    // Dragging the volume slider must not rebuild the neck or cut ringing notes.
    if (Object.keys(patch).every((key) => key === 'volume')) return
    instrument.configure(instrumentConfig())
    layout()
  }

  function layout() {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const stageLayout = computeStageLayout(viewport, settings.neckWidthMm)
    const tuning = tuningById(settings.tuning)

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
    ].join(' ')

    pointers.releaseAll()
    const geometry = computeNeckGeometry({
      width: surface.clientWidth,
      height: surface.clientHeight,
      neckWidthMm: settings.neckWidthMm,
      fretWidthMm: settings.fretWidthMm,
      neckPlacement: settings.neckPlacement,
      leftHanded: settings.leftHanded,
      lowStringOnTop: settings.lowStringOnTop,
    })
    const box = surface.getBoundingClientRect()
    field = {
      geometry,
      firstFret: settings.firstFret,
      toLocal: (clientX, clientY) => clientToLocal(box, stageLayout.rotated, clientX, clientY),
    }

    neck.render(geometry, {
      tuning,
      firstFret: settings.firstFret,
      noteLabels: settings.noteLabels,
    })
    panel.update(settings)
    refreshToolbar()

    const pitches = reachablePitches(tuning.open, settings.firstFret, geometry.fretCount)
    if (pitches.join() !== prewarmed) {
      prewarmed = pitches.join()
      audio.prewarm(pitches)
    }
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
  document.addEventListener('pointerdown', () => void audio.unlock().catch(() => {}), {
    capture: true,
  })
  onFullscreenChange(refreshToolbar)
  suppressBrowserGestures()
  keepScreenAwake()
  layout()
}
