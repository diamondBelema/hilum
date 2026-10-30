# Accessibility debt (WP7)

Source: audit findings F8 (code side), F9, F11 (fonts). Every violation below is traced to `src/ui/` with file and line.

## 1. `outline-none` without a replacement (fails AC3)

The global `:focus-visible` outline (3px `var(--focus)`) is present in `styles.css:101`, but these controls cancel it with `focus:outline-none` and install no replacement that is at least 3:1 against the background.

| File | Line | Control |
|------|------|---------|
| `src/ui/screens/Study.tsx` | 173 | student answer input |
| `src/ui/screens/Study.tsx` | 441 | student answer input |
| `src/ui/screens/Notes.tsx` | 82 | note search input |
| `src/ui/screens/Config.tsx` | 210 | course config input |
| `src/ui/screens/Config.tsx` | 218 | course config input |
| `src/ui/screens/Config.tsx` | 227 | course config input |
| `src/ui/screens/Config.tsx` | 235 | course config input |
| `src/ui/screens/Config.tsx` | 360 | config editor |
| `src/ui/screens/Config.tsx` | 381 | course config input |
| `src/ui/screens/Config.tsx` | 392 | config editor |
| `src/ui/screens/Config.tsx` | 412 | config editor |
| `src/ui/screens/Live.tsx` | 528 | exam answer input |
| `src/ui/screens/Live.tsx` | 552 | exam answer input |
| `src/ui/screens/DesignGallery.tsx` | 152 | gallery input |
| `src/ui/screens/Editor.tsx` | 223 | editor input |
| `src/ui/screens/Editor.tsx` | 231 | editor input |
| `src/ui/screens/Editor.tsx` | 239 | editor input |
| `src/ui/screens/Editor.tsx` | 247 | editor input |

## 2. Icons under 20px where they are the only label (fails AC2)

Icons must be at least 20px when they are the sole accessible label.

| File | Line | Icon | Size |
|------|------|------|------|
| `src/ui/components/ActivityRenderer.tsx` | 751 | `ArrowLeft` (prev) | `size-3` (12px) |
| `src/ui/components/ActivityRenderer.tsx` | 760 | `ArrowRight` (next) | `size-3` (12px) |
| `src/ui/components/ActivityRenderer.tsx` | 1079 | `ArrowLeft` (prev) | `size-3` (12px) |
| `src/ui/components/ActivityRenderer.tsx` | 1092 | `ArrowRight` (next) | `size-3` (12px) |

## 3. Text under 13px (fails AC2)

The type scale floor is `--text-xs = 0.8125rem = 13px` (`tokens.css:39`). `type-meta` and `type-label` use `text-xs`, which sits exactly at the floor — acceptable, not a violation. No `text-[12px]` or smaller inline size was found in `src/ui/screens/` or `src/ui/components/`.

## 4. Opacity modifier on `text-muted` (fails AC4)

No `text-text-muted`/`text-muted` token is combined with an opacity modifier (e.g. `text-text-muted/50`) in `src/ui/`. Backgrounds use opacity (`bg-black/50`, `bg-surface/90`) which is permitted; the restriction applies to text only.

## 5. Focus outline visible on every control (AC3)

`:focus-visible` in `styles.css:101` draws a 3px `var(--focus)` outline with 2px offset. Once the `focus:outline-none` overrides in section 1 are removed, every control inherits this visible focus indicator.

## Fonts (F11)

Fonts are self-hosted as Latin-subset WOFF2 variable faces in `styles.css:7-21` (`@fontsource-variable/jetbrains-mono` and `source-sans-3` Latin files). No `@fontsource` `index.css` (which would pull Cyrillic/Greek/Vietnamese/Latin-ext). No network font requests in `tokens.css`/`styles.css`.
