# Chart Converter — Refactored

The original single HTML file is split into three layers:

- `index.html` — UI markup only.
- `css/app.css` — all presentation/styling.
- `js/converter.js` — chart conversion and note-type parsing logic; no DOM access.
- `js/ui.js` — DOM events, state collection, file handling, and download orchestration.

The converter still produces `chart-converted.json` in the browser. Open `index.html` directly in a modern browser.
