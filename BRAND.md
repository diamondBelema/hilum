# Brand — Hilum

- **App:** Hilum — local-first study and exam-simulation harness for medical students.
- **Default port:** `4747` (overridable with `PORT`). `4317` is reserved for the OpenTelemetry collector default and is intentionally avoided to prevent clashes.
- **Bind address:** `127.0.0.1` by default (`HOST=0.0.0.0` for LAN).
- **MCP endpoint:** `http://127.0.0.1:4747/mcp` (streamable HTTP).
- **Icon:** `public/icon.svg` (color, final). Derived assets:
  - `public/icon-mono.svg` — mono (currentColor) version.
  - `public/favicon-16x16.png`, `public/favicon-32x32.png` — page favicon.
  - `public/apple-touch-icon-180x180.png` — touch icon.
  - `public/icon-192x192.png`, `public/icon-512x512.png` — manifest "any" icons.
  - `public/icon-maskable-192x192.png`, `public/icon-maskable-512x512.png` — manifest "maskable" icons (artwork kept inside the safe zone).
- **Palette (H&E histology):** hematoxylin `#4338A8` (primary), eosin `#F08CB0` (accent), page `#F6F5FB` (light bg), near-black `#0A0A0C` (Black/dark bg).
- **Fonts:** Atkinson Hyperlegible Next / Mono, self-hosted under `public/fonts/`, WOFF2, Latin subsets only.
- **Do not:** use gradients, glows, colored shadows, Google Fonts, CDN requests, or emoji as icons (Lucide 20px, 1.75px stroke).
