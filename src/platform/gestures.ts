/** Stops the browser from reacting to long presses, drags and iOS pinch gestures on the instrument. */
export function suppressBrowserGestures(): void {
  for (const type of ['contextmenu', 'dragstart', 'selectstart', 'gesturestart']) {
    document.addEventListener(type, (event) => event.preventDefault())
  }
}

/**
 * Android's back gesture is an inward swipe from a screen edge, easily made while playing, and
 * a page cannot switch it off: it is given a throwaway history entry to consume instead.
 */
export function absorbBackGesture(): void {
  // Chrome skips entries pushed without a user gesture, so the entry is renewed on real touches.
  document.addEventListener(
    'pointerup',
    () => {
      if (history.state?.absorbsBack !== true) history.pushState({ absorbsBack: true }, '')
    },
    { capture: true },
  )
}
