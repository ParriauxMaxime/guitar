# Guitar

A playable guitar for touch phones: fret with one hand, strum with the other. Installable, works offline.

[![Deploy](https://github.com/ParriauxMaxime/guitar/actions/workflows/deploy.yml/badge.svg)](https://github.com/ParriauxMaxime/guitar/actions/workflows/deploy.yml)
[![Live demo](https://img.shields.io/badge/live-demo-e58f2c)](https://parriauxmaxime.github.io/guitar/)

## Install on a phone

1. Open <https://parriauxmaxime.github.io/guitar/> in Chrome.
2. Menu → **Install app** (or **Add to Home screen**).
3. Launch it from the home screen and hold the phone in landscape.

## Development

```sh
npm install
npm run dev        # http://localhost:5173, also served on the LAN
npm test
npm run typecheck
npm run build      # output in dist/
npm run preview    # serve the production build on port 4173
npm run icons      # regenerate the PNG icons from public/favicon.svg (needs Google Chrome)
```

The dev server is reachable from a phone at `http://<your-LAN-IP>:5173`. Installing and offline support
need a secure context, so they only work on the GitHub Pages URL (or `localhost`), not over LAN HTTP.

## Deploy

Every push to `main` runs the tests, builds, and publishes `dist/` to GitHub Pages through
`.github/workflows/deploy.yml`. The repository's Pages source must be set to **GitHub Actions**
(Settings → Pages).
