let wanted = false

function isStandalone(): boolean {
  return ['standalone', 'fullscreen'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  )
}

export function fullscreenAvailable(): boolean {
  return Boolean(document.fullscreenEnabled) && !isStandalone()
}

export function fullscreenActive(): boolean {
  return document.fullscreenElement !== null
}

/** The page has the whole screen to itself: fullscreen, or installed and launched as an app. */
export function isImmersive(): boolean {
  return fullscreenActive() || isStandalone()
}

function enterFullscreen(): void {
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
}

export function toggleFullscreen(): void {
  wanted = !fullscreenActive()
  if (wanted) enterFullscreen()
  else document.exitFullscreen().catch(() => {})
}

/**
 * Android's back swipe also ends fullscreen, and a page cannot stop it. Fullscreen is meant to
 * be left through the toolbar only, so the next touch brings it back.
 */
export function keepFullscreen(): void {
  document.addEventListener(
    'pointerup',
    (event) => {
      if (wanted && event.pointerType === 'touch' && !fullscreenActive()) enterFullscreen()
    },
    { capture: true },
  )
}

export function onFullscreenChange(listener: () => void): void {
  document.addEventListener('fullscreenchange', listener)
}
