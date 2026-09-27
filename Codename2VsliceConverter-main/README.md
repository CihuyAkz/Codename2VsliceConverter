# Chart Converter — Refactored

The original single HTML file is split into three layers:

- `index.html` — UI markup only.
- `css/app.css` — all presentation/styling.
- `js/converter.js` — chart conversion and note-type parsing logic; no DOM access.
- `js/ui.js` — DOM events, state collection, file handling, and download orchestration.

The converter still produces `chart-converted.json` in the browser. Open `index.html` directly in a modern browser.

Camera zoom events supported by the converter include `Add Camera Zoom`, `Set Default Cam Zoom`, and `Change Stage Zoom`. `Set Default Cam Zoom` is converted to an immediate V-Slice `ZoomCamera` event, normalized against the configured Default Stage Zoom value.
