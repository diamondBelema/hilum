# DESIGN.md — Hilum UI

Read this before writing UI code. It describes the current shell: what it looks
like, how it behaves and which tokens and components to reuse. If this file and
SPEC.md disagree about UI, this file wins. For everything else SPEC.md wins.

**Priority order when choices conflict:** 1. Usability and legibility under
fatigue and time pressure. 2. Speed on a low-end Android phone. 3.
Consistency. 4. Visual identity.

## 1. Who and where

- **User:** a medical student studying for hours, often at night, often on a
  mid-range Android phone, sometimes on a laptop.
- **Conditions:** bright daylight, dark rooms, unreliable power, no guaranteed
  internet.
- **Primary job:** the live teaching session. The Library (notes, exams,
  questions, progress, graph) is secondary and quiet.

## 2. Design rationale

- **The session is the home screen.** The first thing on `/` is a composer, not
  a dashboard. Recent sessions and courses appear only when they exist.
- **Identity from restraint.** A quiet clinical blue provides the visual cue
  without competing with study content or mastery state.
- **One memorable element:** the mastery ring, a three-arc ring used wherever a
  concept appears. Everything else stays quiet.
- **Meaning never depends on color alone.** Every state also has an icon,
  shape or text label.
- **One focus style.** Controls rely on the global `:focus-visible` outline.
  Do not add rings, offsets or `outline-none` per component.

## 3. Tokens

All colors, type sizes, radii and shadows live in `src/ui/tokens.css`. Tailwind
maps them in `src/ui/styles.css`. Never hard-code a hex value in a component.

### 3.1 Color

`light-dark()` pairs plus a `data-theme` override. The system preference is the
default; Settings can pin Light or Dark and remembers the choice.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f6fb` | `#141414` | page |
| `--surface` | `#ffffff` | `#1c1c1c` | panels, inputs |
| `--surface-2` | `#eeedf6` | `#252525` | sunken areas, hover |
| `--border-subtle` | `#e2e0ee` | `#434343` | dividers |
| `--border-strong` | `#8a88a6` | `#686868` | control outlines |
| `--text` | `#1b1b2e` | `#e6e6e6` | body |
| `--text-muted` | `#4f4e6b` | `#8d8d8d` | metadata |
| `--primary` | `#315f87` | `#9bc2e3` | actions, selection |
| `--on-primary` | `#ffffff` | `#141414` | text on primary |
| `--primary-soft` | `#e6f0f8` | `#1d2b38` | selected row, active tab |
| `--accent` | `#315f87` | `#9bc2e3` | citations, emphasis |
| `--correct` | `#17703f` | `#6fd59a` | correct |
| `--incorrect` | `#b3261e` | `#f08a80` | incorrect |
| `--warning` | `#8a5100` | `#e2b566` | waiting, warning |
| `--focus` | `#315f87` | `#9bc2e3` | focus outline |

Contrast is tested in `tests/contrast.test.ts` (4.5:1 text, 3:1 boundaries and
focus). The test is the authority; adjust the token, not the requirement.

**Rules**

- Dark theme is tinted dark, never pure black, and never pure white text.
- Correct and incorrect always carry an icon and a word.
- No gradients, glows, colored shadows or backdrop blur.
- No opacity modifier on text color. Use a text token.

### 3.2 Typography (D1)

**Decision D1:** JetBrains Mono Variable is the UI face; Source Sans 3 Variable
is used only for prose. Both are self-hosted through `@fontsource-variable`,
Latin subset only, weights 400/500/600, `font-display: swap`. Ligatures are off
outside code and contextual in code.

Every text node in the shell uses one role utility. Do not use arbitrary
`text-[…]`, inline `fontSize`/`fontFamily`, or `font-[…]`.

| Role | Face | Size / line height | Weight | Use |
|---|---|---|---|---|
| `type-display` | UI mono | 30px / 1.25 | 600 | Home title on wide screens |
| `type-title` | UI mono | 24px / 1.3 | 600 | Screen titles |
| `type-heading` | UI mono | 20px / 1.4 | 600 | Section titles, dialog titles |
| `type-body` | UI mono | 16px / 1.5 | 400 | Default UI text, inputs |
| `type-body-sm` | UI mono | 14px / 1.45 | 400 | Secondary UI text, buttons |
| `type-meta` | UI mono | 13px / 1.4 | 400 | Metadata, timers, status |
| `type-label` | UI mono | 13px / 1.4 | 500 | Labels only; uppercase |
| `type-prose` | Source Sans 3 | 17px / 1.65 | 400 | Notes, agent prose, long answers |
| `type-code` | UI mono | 14px / 1.45 | 400 | Code, endpoints, paths |

- Uppercase is for `type-label` only. No all-caps body text, no tracked
  eyebrows.
- Nothing below 13px.
- Sizes are in `rem` so 200% zoom and the reader preference work.
- Prose is left-aligned, ragged right, max 68ch. Never justified.
- Timers and numeric columns use tabular figures.

### 3.3 Spacing, shape, elevation

- **Spacing:** 4px base: 4, 8, 12, 16, 24, 32, 48, 64.
- **Radius ladder:** controls 8px (`rounded-control`), panels 12px
  (`rounded-panel`), dialogs/sheets 16px (`rounded-dialog`), chips 999px
  (`rounded-chip`). Do not invent intermediate radii.
- **Borders:** one weight, 1px. Express hierarchy with tonal surfaces and
  `--border-subtle` vs `--border-strong`.
- **Elevation:** only popovers, menus and dialogs get `--shadow-popover`.
  Sidebars, lists and panels use borders.
- **Touch targets:** at least 44 by 44px. Minimum 8px between neighbors.
- **Focus:** `outline: 3px solid var(--focus); outline-offset: 2px` from the
  global rule. Never remove it and never replace it with a local ring.

### 3.4 Motion

Motion only answers an action. 120–180ms, ease-out. No page-load animations,
no scroll-triggered effects, no blinking. Respect `prefers-reduced-motion`.

## 4. Layout and navigation

| Width | Layout |
|---|---|
| Under 1024px | Single column. The sidebar is an overlay `Drawer` with a scrim (no blur). |
| 1024px and up | The sidebar is docked at 240px, always visible. |

- **Routes:** `/` (home composer), `/sessions/:id`, `/library` and
  `/library/:section`, `/settings`. `src/ui/lib/router.ts` owns `useRoute`,
  `navigate` and `Link`; back/forward restore the same screen.
- **Top bar:** mobile menu button below 1024px, breadcrumb, agent status chip.
  The chip opens a popover with the MCP endpoint and a copy action.
- **Sidebar:** wordmark, New session, search, Teaching / Practice / All filter,
  session rows, then Library and Settings in the footer. Rows are two lines:
  the goal (practice prefix removed) and a meta line with course, relative
  time and a short text status (`Waiting`, `Working`, `Connected`, `No agent`,
  `Ended`).
- **Drawer:** focus trap, Escape closes, focus returns to the menu button,
  navigating closes it, and it is not in the tab order when closed.
- **No horizontal page scroll at 360px.** Tables, code and diagrams scroll in
  their own container.
- Content is left-aligned. Do not center body copy.

## 5. Screens

### 5.1 Home (`/`)

- Title: “What do you want to learn?”
- One-line explanation of teaching vs practice.
- `Composer`: goal textarea, visible label, `CoursePicker` chip, Teach /
  Practice `SegmentedControl`, Start button.
- Quick starts only from real data: up to three recent sessions and the real
  course list. No fabricated suggestions.
- Enter starts, Shift+Enter adds a line. Sending with no course opens the
  picker and shows an inline message.
- The last course is remembered; with exactly one course it is preselected.

### 5.2 Session (`/sessions/:id`)

- Header with the real goal, course and a back control with an accessible name.
- Agent status strip with text plus icon.
- Transcript of real activity components; answered items are read-only.
- Composer pinned at the bottom for messages to the agent.
- Session chrome is owned by the transcript workstream; the shell must not
  duplicate its activity logic.

### 5.3 Library (`/library`)

One quiet entry with sections for Notes, Exams, Questions, Progress and Graph.
Each section is reachable now; the working screens replace the placeholders
without changing the routes. Library never appears on the home screen.

### 5.4 Settings (`/settings`)

Theme (System / Light / Dark) applies immediately and is remembered. The MCP
endpoint and vault path are shown read-only with a copy action. Wider settings
(token, LAN) belong here but are not part of this shell pass.

## 6. Components

Use the shared components in `src/ui/components/`:

- **Button / IconButton:** 44px minimum, primary/secondary/outline/ghost/
  destructive/link, visible loading text.
- **Input / Textarea / Select:** visible labels, 44px minimum, global focus
  outline, no placeholder-only labels.
- **SegmentedControl:** radiogroup with 44px segments; used for session type,
  sidebar filter and theme.
- **Composer:** the only place a session is started. Reused by the home screen.
- **CoursePicker:** real button chip, `aria-haspopup="listbox"`; the popover
  has a search field, Arrow/Home/End navigation, Enter to select, Escape to
  close and return focus, and click-outside to close. Last course is stored.
- **Popover:** non-modal, left/right aligned, Escape and outside click close,
  no trap, no blur.
- **Drawer:** modal navigation panel with scrim, focus trap, Escape and focus
  return.
- **Sheet:** centered dialog, no blur, focus trap, Escape and focus return.
- **AgentStatus:** text plus icon chip; endpoint popover with copy.
- **Chip, Banner, EmptyState, ProgressBar, Skeleton:** status is always text
  plus icon, never color alone.

## 7. Accessibility

- Full keyboard operation for every flow, including the drawer and course
  picker. Logical focus order and a skip link to `#main`.
- Landmarks and headings are real (`nav`, `main`, `h1`–`h3`). Form fields have
  labels. Dynamic states use polite live regions or `role="alert"`.
- Works at 200% zoom and 360px with no loss of function.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Do not rely on hover. Every hover affordance also works on focus and tap.

## 8. Anti-patterns

- A dashboard of identical rounded cards, gradient washes, glows, colored
  shadows or backdrop blur.
- All-caps tracked labels outside `type-label`, or numbering without a
  sequence.
- Color as the only signal. Icon-only primary actions. Placeholder text used
  as a label.
- Modals for information that does not need a decision; toasts for errors that
  need action; spinners with no text.
- Tap targets under 44px, text under 13px, body text wider than 68ch or
  justified.
- Animations that run without a user action. Anything that blinks.
- Arbitrary `text-[…]` sizes, inline font styles, local focus rings or
  `outline-none`.
