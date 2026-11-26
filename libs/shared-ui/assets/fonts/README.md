# Owner-Supplied Font Assets

Place the licensed `.woff2` font files in this directory (excluded from Git via `.gitignore`):

- `Knockout-Welterweight.woff2` (Headings — `Knockout Welterweight`)
- `Marjari-Regular.woff2` (Body 400 — `Marjari`)
- `Marjari-Bold.woff2` (Body 700 — `Marjari`)

When present, Angular copies `*.woff2` to `/assets/fonts/` at build/serve time, matching `libs/shared-ui/styles/_fonts.scss`. Until placed, the UI uses `system-ui, -apple-system, sans-serif` fallbacks.
