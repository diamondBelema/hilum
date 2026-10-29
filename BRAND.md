# Brand — Hilum

- **App:** Hilum — local-first study and teaching harness for medical students.
- **Default port:** `4747` (overridable with `PORT`). `4317` is reserved for the
  OpenTelemetry collector default and is intentionally avoided to prevent
  clashes. The UX shell develops and tests on `4749`.
- **Bind address:** `127.0.0.1` by default (`HOST=0.0.0.0` for LAN).
- **MCP endpoint:** `http://127.0.0.1:4747/mcp` (streamable HTTP). The top-bar
  agent chip shows the endpoint for the running origin and can copy it.
- **Icon:** `public/icon.svg` (color, final). Derived assets:
  - `public/icon-mono.svg` — mono (currentColor) version.
  - `public/favicon-16x16.png`, `public/favicon-32x32.png` — page favicon.
  - `public/apple-touch-icon-180x180.png` — touch icon.
  - `public/icon-192x192.png`, `public/icon-512x512.png` — manifest "any" icons.
  - `public/icon-maskable-192x192.png`, `public/icon-maskable-512x512.png` —
    manifest "maskable" icons (artwork kept inside the safe zone).

## Typeface decision (D1)

The owner chose the new shell's look for D1: **JetBrains Mono Variable** is the
UI face for chrome, labels, metadata, timers and code. **Source Sans 3
Variable** is the prose face and is used only through `--font-prose` for notes,
agent messages and long answers. Atkinson Hyperlegible is no longer used and
its packages are removed.

Both faces are self-hosted through `@fontsource-variable` and only the Latin
WOFF2 subsets are declared in `src/ui/styles.css`. The build output contains
exactly two font files. Weights are limited to 400, 500 and 600. Ligatures are
off outside code and contextual inside code.

## Palette (H&E histology)

The palette is defined once in `src/ui/tokens.css` as `light-dark()` pairs and
overridden by `data-theme`. Key values:

- Hematoxylin primary: light `#4338a8`, dark `#8a82ff`
- Eosin accent: light `#b3345f`, dark `#d48db0`
- Page: light `#f7f6fb`, dark `#141414`
- Surface: light `#ffffff`, dark `#1c1c1c`
- Text: light `#1b1b2e`, dark `#e6e6e6`
- Muted text: light `#4f4e6b`, dark `#8d8d8d`

Contrast is tested in `tests/contrast.test.ts`; adjust the token, never the
requirement.

## Do not

Use gradients, glows, colored shadows, backdrop blur, Google Fonts, CDN
requests, or emoji as icons (Lucide 20px, 1.75px stroke). Do not use text below
13px or touch targets below 44px.
