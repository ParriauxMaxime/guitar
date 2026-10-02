/** Holds a screen wake lock whenever the page is visible; a no-op where unsupported (e.g. plain HTTP). */
export function keepScreenAwake(): void {
  if (!('wakeLock' in navigator)) return

  const acquire = () => {
    if (document.visibilityState !== 'visible') return
    // The browser drops the lock when the page is hidden and may refuse it (battery saver).
    navigator.wakeLock.request('screen').catch(() => {})
  }
  document.addEventListener('visibilitychange', acquire)
  acquire()
}
