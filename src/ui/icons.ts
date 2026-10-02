const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

export const ICONS = {
  enterFullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFullscreen: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  settings: svg(
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  minus: svg('<path d="M6 12h12"/>'),
  more: svg('<path d="M5 12h.01M12 12h.01M19 12h.01"/>'),
  plus: svg('<path d="M6 12h12M12 6v12"/>'),
}
