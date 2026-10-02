/** Stops the browser from reacting to long presses, drags and iOS pinch gestures on the instrument. */
export function suppressBrowserGestures(): void {
  for (const type of ['contextmenu', 'dragstart', 'selectstart', 'gesturestart']) {
    document.addEventListener(type, (event) => event.preventDefault())
  }
}
