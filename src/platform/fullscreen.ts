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

export function toggleFullscreen(): void {
  const request = fullscreenActive()
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  request.catch(() => {})
}

export function onFullscreenChange(listener: () => void): void {
  document.addEventListener('fullscreenchange', listener)
}
