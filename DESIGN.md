# DESIGN.md: Exam Harness UI

Read this before writing any UI code. It is the single source for look, layout and behavior. If this file and SPEC.md disagree about UI, this file wins. For everything else SPEC.md wins.

**Priority order when choices conflict:** 1. Usability and legibility under fatigue and time pressure. 2. Speed on a low-end Android phone. 3. Consistency. 4. Visual identity.

## 1. Who and where

- **User:** a medical student studying for hours, often at night, often on a mid-range Android phone, sometimes on a laptop. Sessions are long and tiring. Exam practice is timed and stressful.
- **Conditions:** bright daylight glare outdoors, dark rooms at night, unreliable power (battery matters), no guaranteed internet. The app is local-first and works offline.
- **Primary jobs, in order:** (1) take a timed exam simulation, (2) read and cite notes, (3) answer activities in a live teaching session, (4) see what to study next, (5) review results and the knowledge graph.

## 2. Design rationale (what we chose and what we avoided)

- **Identity from the subject.** The palette comes from H&E histology staining: hematoxylin (blue-violet) and eosin (pink). It is calm, clinical and specific to anatomy and physiology students. We avoided cream paper with a terracotta accent, near-black with a neon accent, and the grid-of-identical-rounded-cards dashboard.
- **One memorable element:** the **mastery ring** (section 6.1), a three-arc ring that appears everywhere a concept appears. Everything else stays quiet.
- **Legibility over style.** The typeface was designed to keep look-alike characters distinct (I, l, 1, O, 0), which matters for medical terms, doses and numbered options.
- **Meaning never depends on color alone.** Every state also has an icon, a shape or a text label.

## 3. Design tokens

Implement these exactly in `src/styles/tokens.css` as CSS variables. Tailwind maps to the variables (section 3.5). No hard-coded hex values in components.

### 3.1 Color

Light theme (`:root`) and dark theme (`@media (prefers-color-scheme: dark)` plus `[data-theme="dark"]`; `[data-theme="light"]` forces light). Follow the system by default; a manual toggle in Settings overrides it and is remembered.

```css
:root {
  --bg: #F6F5FB;            /* page */
  --surface: #FFFFFF;       /* panels, inputs */
  --surface-2: #EEEDF6;     /* sunken areas, table headers */
  --border-subtle: #E2E0EE; /* dividers */
  --border-strong: #8E8CAA; /* input and control outlines (3:1 or better) */
  --text: #1B1B2E;
  --text-muted: #4F4E6B;
  --primary: #4338A8;       /* hematoxylin */
  --on-primary: #FFFFFF;
  --primary-soft: #E6E3FA;  /* selected row, active tab */
  --accent: #B3345F;        /* eosin: flags, emphasis, citations highlight */
  --accent-soft: #FBE4EC;
  --correct: #17703F;   --correct-soft: #E3F4EA;
  --incorrect: #B3261E; --incorrect-soft: #FBE6E4;
  --warning: #8A5100;   --warning-soft: #FFF0D6;
  --focus: #4338A8;
}
[data-theme="dark"], @media dark {
  --bg: #12111C;  --surface: #1B1A2A;  --surface-2: #25243A;
  --border-subtle: #2F2E47;  --border-strong: #6F6D91;
  --text: #ECEBF5;  --text-muted: #B4B2CB;
  --primary: #A9A3FF;  --on-primary: #12111C;  --primary-soft: #2B2860;
  --accent: #F08CB0;   --accent-soft: #3A1F2D;
  --correct: #6FD59A;  --correct-soft: #17301F;
  --incorrect: #FF8A80; --incorrect-soft: #3A1A18;
  --warning: #F2B544;  --warning-soft: #36290B;
  --focus: #A9A3FF;
}
```

(The `@media dark` line above is shorthand: write it as a real `@media (prefers-color-scheme: dark)` block guarded by `:root:not([data-theme="light"])`.)

**Contrast requirements (tested in `bun run verify`):** body text 4.5:1 or better, large text and UI component boundaries 3:1 or better, in both themes. The values above were checked by hand and should pass (text on page is about 15:1, muted text about 8:1, primary on surface about 8:1 in both themes). The automated test is the authority: if a token fails, adjust the token, not the requirement.

**Rules**
- Dark theme uses tinted dark, never pure black, and never pure white text. It must feel restful at night.
- Correct and incorrect always carry an icon (check, cross) and a word ("Correct", "Incorrect").
- Do not use gradients, glows or colored shadows.

### 3.2 Typography

- **UI and reading:** **Atkinson Hyperlegible Next** (SIL OFL). If unavailable, use Atkinson Hyperlegible, then the fallback stack.
- **Code, frontmatter, timers and numeric columns:** **Atkinson Hyperlegible Mono**, or **JetBrains Mono** if the Atkinson mono face is unavailable.
- **Self-host fonts** as WOFF2 under `public/fonts/`, Latin and Latin-Extended subsets only (medical terms need diacritics), `font-display: swap`. No Google Fonts or CDN requests. Total font payload at most 150 KB.
- **Fallback stack:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- Use only weights 400, 600 and 700.

| Token | Size | Line height | Use |
|---|---|---|---|
| `--text-xs` | 0.8125rem (13px) | 1.4 | Minimum size, metadata only |
| `--text-sm` | 0.875rem (14px) | 1.45 | Secondary text, table cells |
| `--text-base` | 1rem (16px) | 1.5 | UI default |
| `--text-read` | 1.0625rem (17px) | 1.65 | Notes and long answers |
| `--text-lg` | 1.25rem (20px) | 1.4 | Question stems, section titles |
| `--text-xl` | 1.5rem (24px) | 1.3 | Screen titles |
| `--text-2xl` | 1.875rem (30px) | 1.25 | Result score |

- Sizes in `rem` so user font-size settings and 200% zoom work. Nothing below 13px, ever.
- **Line length:** notes and theory answers max 68 characters (`max-width: 68ch`). Left-aligned, ragged right. No justified text.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows.
- Timers, scores and any column of numbers use tabular figures or the mono face so digits do not jump.

### 3.3 Spacing, shape, elevation

- **Spacing scale (4px base):** 4, 8, 12, 16, 24, 32, 48, 64. Page padding 16px on phone, 24px tablet, 32px desktop.
- **Radius by role, not one value everywhere:** controls 8px, panels 12px, dialogs and sheets 16px, chips and badges 999px. Inputs and buttons share 8px.
- **Elevation:** use borders and tonal surfaces. Only popovers, menus and dialogs get one shadow: `0 8px 24px rgb(0 0 0 / 0.18)` (light) or a 1px `--border-strong` outline with no shadow (dark). No shadows on lists or panels.
- **Touch targets:** at least 44x44 px for anything tappable, with 8px minimum gap between neighbors. Exam option rows are at least 56px tall.
- **Focus:** every interactive element shows `outline: 3px solid var(--focus); outline-offset: 2px`. Never remove outlines.

### 3.4 Motion

- Motion only answers an action (opening a sheet, expanding a row, confirming a save). 120 to 180 ms, ease-out. No page-load animations, no scroll-triggered effects, no hover transitions on every item.
- Respect `prefers-reduced-motion`: remove all non-essential motion.
- Never flash or pulse. Timer warnings change text, icon and color, not blink.

### 3.5 Tailwind mapping

```js
// tailwind.config: theme.extend
colors: {
  bg: "var(--bg)", surface: "var(--surface)", "surface-2": "var(--surface-2)",
  text: "var(--text)", muted: "var(--text-muted)",
  primary: "var(--primary)", "on-primary": "var(--on-primary)", "primary-soft": "var(--primary-soft)",
  accent: "var(--accent)", "accent-soft": "var(--accent-soft)",
  correct: "var(--correct)", incorrect: "var(--incorrect)", warning: "var(--warning)",
},
borderColor: { subtle: "var(--border-subtle)", strong: "var(--border-strong)" },
fontFamily: { sans: ["Atkinson Hyperlegible Next", "system-ui", "sans-serif"], mono: ["Atkinson Hyperlegible Mono", "JetBrains Mono", "ui-monospace", "monospace"] },
```

## 4. Layout

| Width | Layout |
|---|---|
| Under 640px (phone) | Single column. Bottom navigation with 4 items: Study, Exams, Notes, Progress. Sheets rise from the bottom. |
| 640 to 1023px (tablet) | Single column with a left icon rail. Side panels open as sheets. |
| 1024px and up (desktop) | Left sidebar 240px, main column, optional right context panel 320px (citations, concept details). |

- No horizontal page scroll at 360px width. Tables, code and diagrams scroll inside their own container.
- Content is left-aligned. Do not center body content.
- Use lists with dividers and sectioned layouts. Do not tile content into identical cards. A bordered panel is allowed only when it groups one self-contained object (a question, a result, a concept).
- Density: comfortable by default; a compact option for desktop tables.

## 5. Voice and copy

- Plain verbs, sentence case, active voice. Name things the way the student thinks.
- A button says what happens: "Start exam", "Submit answers", "Keep this question", "Open note". The same action keeps the same name in the toast: "Kept".
- Errors say what happened and what to do, with no apology: "Could not save. Your answer is stored on this device. Check the server and try again."
- Empty states invite action: "No questions yet. Convert your slides, then ask the agent to write questions from them."
- Waiting states say what is happening and for how long (section 7.3).
- UI vocabulary: concept shows as "topic" where the student would say topic; banked shows as "practice bank"; mastery states are Not seen, Familiar, Understood, Mastered.

## 6. Signature components

### 6.1 Mastery ring (the one memorable element)

A circle made of three arcs. States are shape-coded, so color is a bonus, not the signal:

- **Not seen:** empty ring (outline only).
- **Familiar:** one arc filled.
- **Understood:** two arcs filled.
- **Mastered:** full disc with a check.
- **Overdue for review (decayed):** the ring's outline becomes dashed.

Fill color ramps from `--primary-soft` to `--primary` in lightness, so it also reads in grayscale. Sizes: 16px (inline), 24px (lists), 40px (headers). Always paired with a text label somewhere on the screen (tooltip, row text or legend). Used in the topic tree, concept drawer, graph nodes, dashboard and results.

### 6.2 Citation chip

Inline in notes and activities. A pill with a small note icon and a short label (note title and slide, e.g. "Lecture 5, slide 7"). Tap or click opens the note at the anchor with the cited quote highlighted (`--accent-soft` background and a 3px `--accent` left bar). On phone it opens a bottom sheet preview first, with an "Open note" action. An invalid citation shows a warning icon and the text "Source not found".

### 6.3 Option row (MCQ and true/false)

Full-width row, at least 56px tall, with a letter badge (A to E) on the left, text, and a selection indicator on the right. Selected state: `--primary-soft` background, 2px `--primary` border and a check icon. After marking: correct shows check and "Correct", incorrect shows cross and "Incorrect", and the right answer is outlined. Tapping anywhere in the row selects. True/false statements are rows with a two-segment True | False control, each segment at least 44px wide.

### 6.4 Timer

Mono face, tabular figures, in the sticky header. Normal state is `--text`. Under 10 minutes: no change. Under 5 minutes: `--warning` color, a clock icon and the label "5 min left" announced once to screen readers. Under 1 minute: `--incorrect` color and "1 min left" announced once. Never announce every second. Time-up shows a blocking dialog with a clear message and an auto-submit countdown.

## 7. Key screens

### 7.1 Exam runner (highest priority)

Principle: remove everything that is not the question, the clock and navigation.

```
Phone                                    Desktop (1024+)
+--------------------------+             +----------------------------------------------+
| B . MCQ         24:10    |  sticky     | Section B . MCQ                   24:10  Flag |
| Question 7 of 30   Flag  |             +-------------------------------+--------------+
+--------------------------+             | Which segment of the nephron  | Questions    |
| Which segment of the     |             | reabsorbs most filtered Na+?  | 1 2 3 4 5 6  |
| nephron reabsorbs most   |             |                               | 7* 8 9 10 .. |
| filtered Na+?            |             | (A) Proximal tubule      [x]  | answered     |
|                          |             | (B) Loop of Henle             | flagged      |
| (A) Proximal tubule  [x] |             | (C) Distal tubule             | not answered |
| (B) Loop of Henle        |             | (D) Collecting duct           |              |
| (C) Distal tubule        |             |                               | Pace: on     |
| (D) Collecting duct      |             | [ Back ]               [ Next ]| track        |
+--------------------------+             +-------------------------------+--------------+
| [Back]   [Grid]   [Next] |  sticky     | Saved                                        |
| Saved                    |             +----------------------------------------------+
+--------------------------+
```

- One question per screen on phone. Question text at `--text-lg`.
- The **question grid** shows each question's state with icon plus fill: answered (filled), flagged (flag icon), not answered (empty), current (outlined bold). Opens as a sheet on phone, sits in the right panel on desktop.
- **Saved** indicator: shows "Saved" after every answer. If saving fails, it becomes a persistent banner: "Not saved. Your answers are kept in this tab. Retry."
- **Pace indicator:** text, not a chart: "On track", "2 behind", "5 ahead".
- **Submit:** a dialog listing unanswered and flagged counts with "Review" and "Submit now". No dialogs during the exam other than time-up and submit.
- **Theory questions:** a plain, auto-growing text area at `--text-read`, max 68ch wide, with a word count. Spellcheck and autocorrect are off in exam mode and on in practice mode. A marks-and-time hint sits above it: "10 marks, about 12 minutes". The answer-structure checklist (from the rubric headings) is available in practice mode only.
- **Keyboard (desktop):** A to E select, T and F for true/false, N or Right arrow next, P or Left arrow back, G open grid, L flag. Show the shortcuts in a help sheet.
- Spotter stations (SPEC 11.2): image large and zoomable, station timer visible, one answer field, auto-advance at zero with a short warning.

### 7.2 Notes reader

```
+--------------------------------------------------+
| Renal physiology > Lecture 5      [Search] [Aa]  |
+--------------------------------------------------+
| Tubular transport of sodium                      |
| (body text, 17px, max 68ch, left aligned)        |
|                                                  |
| [Figure 3: nephron segments]  (tap to zoom)      |
| (ordinary table in its own scroll container)     |
|                                                  |
| Cited by 3 questions, 2 sessions   [Show]        |
+--------------------------------------------------+
```

- Reading column max 68ch, headings with visible anchors, table of contents in the right panel (desktop) or a sheet (phone).
- Images: pinch and tap to zoom with a close button, alt text shown as caption.
- Mermaid diagrams scale to the container width and can be opened full screen.
- "Aa" controls: font size (3 steps), line spacing, theme. Remembered.
- Backlinks ("Cited by") at the end of each note.

### 7.3 Live teaching session

```
+--------------------------------------------------+
| Agent: connected          Topic: PCT sodium      |   status strip
+--------------------------------------------------+
|  (the activity renders here: question, stepper,  |
|   diagram, compare table, think-aloud box ...)   |
|                                                  |
|  How sure are you?  ( ) Guessing ( ) Fairly ( ) Sure |
|  [ Submit answer ]                               |
+--------------------------------------------------+
| Keep this question          Ask the agent        |
+--------------------------------------------------+
```

- **Agent status strip** is always visible with three states: "Agent connected", "Agent is preparing the next activity" (with elapsed seconds), "Agent not connected". After 20 seconds of waiting it adds: "Still working. You can read the note or practice saved questions meanwhile." with two buttons. Free models can be slow, so the wait must never feel like a frozen app.
- The confidence selector and the think-aloud box appear only when the activity asks for them.
- "Ask the agent" opens a small sheet with quick requests: "Explain this", "Quiz me", "I am confused". It queues the request for the agent.
- Render errors (for example an invalid diagram) show "This activity could not be displayed. The agent has been told." and the agent receives the error.

### 7.4 Dashboard (Study)

A ranked list, not a grid of tiles:

1. **Next up:** the top 3 frontier topics, each with the mastery ring, a one-line reason ("Prerequisites done, high exam weight") and one primary button "Study this".
2. **Due for review:** count with a button "Start review".
3. **Exams:** next exam per course with a countdown and "Take a mock exam".
4. **Courses:** a list with a progress line per course (percent of high-weight topics mastered, as text and a thin bar).

One primary action per row. The most important button on the screen is "Study this" for the first item.

### 7.5 Topic tree and graph

- **Tree (default):** indented rows with the mastery ring, title, subtree rollup as text ("4 of 9 mastered"), expand and collapse chevrons at 44px hit area.
- **Graph, neighborhood mode (default for the graph):** selected topic at the center, everything within 2 hops. Show node labels always (maximum about 25 nodes). Node fill is the mastery ring; node size shows exam weight in three steps; edge styles: parent solid thin, prerequisite dashed with an arrowhead, related dotted, contrasts-with solid with a small crossbar. Tap a node to recenter. A legend button is always visible.
- **Overview mode:** labels hidden until zoomed or hovered, node cap about 300, collapsed subtrees, a search box that focuses a node.
- **Concept drawer:** definition, citation chips, evidence timeline (each entry links to its session), practice-bank items, a "Study this" button.

### 7.6 Results and debrief

Score first, large (`--text-2xl`, mono), then section scores as rows (not charts by default), time per question as a sortable list, mistakes grouped by type (knowledge gap, misread, structure, time, careless) with counts and a "Review these" button. Each wrong item shows the student's answer, the correct answer, the explanation and citation chips.

### 7.7 Past-paper verification

Two panes: original photo (zoomable) on the left, parsed questions as editable fields on the right, with a "Mark verified" button per question and a progress count ("12 of 30 verified"). Unverified questions show a warning badge with text. Keyboard friendly.

## 8. Components checklist (implement as a small shared library in `src/ui/`)

Button (primary, secondary, ghost, destructive; 44px minimum height, loading and disabled states with text), IconButton (always with an accessible name), TextField and TextArea (visible label above, never placeholder-only), Select, Segmented control, Checkbox and Radio (24px), OptionRow, TrueFalseControl, Chip, CitationChip, MasteryRing, Badge (icon plus text), Banner (info, warning, error, with action), Toast (4 seconds, polite live region, errors persist and have an action), Dialog and Sheet (focus trap, Escape closes, return focus), Tabs, Tree row, Table (sticky header, scroll container), Timer, ProgressBar (with text), EmptyState, Tooltip (also on focus, not hover-only).

Use one icon set: **Lucide**, 20px, 1.75px stroke, always with a text label on primary actions. No emoji as icons.

## 9. Accessibility

- Contrast and non-color signals as in section 3.1.
- Full keyboard operation for every flow, including the exam runner. Logical focus order. Skip link to main content.
- Landmarks and headings used properly. Form fields have labels. Dynamic changes (saved, graded, agent connected) use polite live regions; the timer announces only at thresholds.
- Works at 200% zoom and at 360px width with no loss of function.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Do not rely on hover. Every hover affordance also works on focus and tap.

## 10. Performance and offline (usability on low-end phones)

- Initial JavaScript at most 250 KB gzipped. Lazy-load the graph library, Mermaid and the 3D viewer only on the screens that use them.
- No external requests at runtime. Service worker caches the app shell, fonts, notes and banked items for offline reading and practice.
- No `backdrop-filter`, large blurs or animated gradients (they are costly on cheap GPUs and drain the battery).
- Images lazy-loaded with width and height set to avoid layout shift. Timer updates a single text node once per second.
- Target: first screen interactive in under 2.5 seconds on a mid-range Android phone over the local network.

## 11. Anti-patterns (reject in review)

- A dashboard made of identical rounded cards, gradient washes as decoration, or the same shadow on everything.
- All-caps tracked labels, eyebrows above every heading, or numbering where there is no sequence.
- Color as the only signal. Icons without labels on key actions. Placeholder text used as a label.
- Modals for information that does not need a decision. Toasts for errors that need action. Spinners with no text.
- Tap targets under 44px. Text under 13px. Body text wider than 68ch or justified.
- Animations that run without a user action. Anything that blinks.

## 12. Acceptance criteria for the UI (added to `bun run verify`)

1. A design gallery route `/_design` renders every component in both themes at 360px and 1280px.
2. Automated contrast test passes for all token pairs in both themes (4.5:1 text, 3:1 UI boundaries).
3. Automated accessibility scan (axe through Playwright) reports no serious or critical issues on: dashboard, notes reader, exam runner, results, live session, topic tree.
4. No horizontal page scroll at 360px on any screen.
5. All tappable elements are at least 44x44 px (tested by script on the gallery and the exam runner).
6. Exam runner: complete a 10-question mixed paper using only the keyboard; reload mid-exam restores answers and the timer; the "Not saved" banner appears when the API is stopped.
7. Fonts are served locally and the app makes zero external network requests (checked in the smoke test).
8. Reduced-motion mode removes all non-essential animation.
9. Human checkpoint: Diamond opens the exam runner on his phone in a dark room and in daylight and confirms the text is comfortable to read.

## 13. How the build agent should work

1. Create `tokens.css`, the Tailwind mapping and the font setup first. Commit.
2. Build the shared components with the gallery route. Run the contrast and accessibility checks before building screens.
3. Build screens in this order: exam runner, notes reader, results, dashboard, live session, topic tree and graph, past-paper verification.
4. Take screenshots of each screen at 360px and 1280px in both themes (Playwright) and review them against sections 3 to 7 before marking a milestone done.
5. Do not add visual features not described here. If something is unspecified, choose the plainest option that follows the principles and note it in `DECISIONS.md`.
