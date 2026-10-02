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

export function toggleFullscreen(): void {
  const request = fullscreenActive()
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  request.catch(() => {})
}

export function onFullscreenChange(listener: () => void): void {
  document.addEventListener('fullscreenchange', listener)
}
