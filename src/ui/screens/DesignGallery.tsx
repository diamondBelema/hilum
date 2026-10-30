import { useState, type ReactNode } from "react";
import { BookOpen, Search, Settings2 } from "lucide-react";
import { Button, IconButton } from "../components/Button.tsx";
import { MasteryRing, type MasteryState } from "../components/MasteryRing.tsx";
import { Banner, Chip, EmptyState, ProgressBar } from "../components/ui.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { ThemeChoice } from "./Reader.tsx";
import { useTheme } from "../theme.ts";

const colorTokens = [
  ["bg", "Page"],
  ["surface", "Surface"],
  ["surface-2", "Sunken"],
  ["primary", "Primary"],
  ["primary-soft", "Primary soft"],
  ["accent", "Accent"],
  ["accent-soft", "Accent soft"],
  ["correct", "Correct"],
  ["incorrect", "Incorrect"],
  ["warning", "Warning"],
  ["border-strong", "Border strong"],
  ["text", "Text"],
  ["text-muted", "Text muted"],
] as const;

const states: MasteryState[] = ["unseen", "familiar", "understood", "mastered", "decayed"];

export function DesignGallery() {
  const { theme, setTheme } = useTheme();
  const [sheet, setSheet] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <p className="font-mono text-xs text-text-muted">/_design</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Design gallery</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every shared component in one place. Check at 360 px and 1280 px in both themes.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <ThemeChoice theme={theme} setTheme={setTheme} />
        </div>
      </header>

      <Section title="Typography">
        <div className="space-y-3">
          <p className="text-2xl font-semibold">Result score 84 / 100</p>
          <p className="text-xl font-semibold">Screen title</p>
          <p className="text-lg font-semibold">Question stem or section title</p>
          <p className="text-base">UI default. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-read reading">Reading text at 17 px, capped at 68 characters for comfortable lines.</p>
          <p className="text-sm text-text-muted">Secondary text at 14 px.</p>
          <p className="text-xs text-text-muted">Metadata at 13 px, the minimum.</p>
          <p className="font-mono tabular-nums">24:10 · 1,204 · Il1 O0</p>
        </div>
      </Section>

      <Section title="Color roles">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {colorTokens.map(([token, label]) => (
            <li key={token} className="rounded-panel border border-border-subtle p-2">
              <div
                className="h-12 rounded-control border border-border-subtle"
                style={{ backgroundColor: `var(--${token})` }}
              />
              <p className="mt-1.5 text-xs font-semibold">{label}</p>
              <p className="font-mono text-xs text-text-muted">--{token}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Start exam</Button>
          <Button variant="secondary">Review answers</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="primary" loading loadingLabel="Saving…">
            Saving
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <IconButton label="Settings">
            <Settings2 aria-hidden="true" className="size-5" />
          </IconButton>
        </div>
      </Section>

      <Section title="Chips and banners">
        <div className="flex flex-wrap gap-2">
          <Chip>renal</Chip>
          <Chip>nephron</Chip>
          <Chip>sodium</Chip>
        </div>
        <div className="mt-4 space-y-2">
          <Banner tone="info">Saved on this device.</Banner>
          <Banner tone="warning">This rubric is still a draft.</Banner>
          <Banner tone="error">Could not save. Your answer is stored on this device.</Banner>
          <Banner tone="success">Grade submitted.</Banner>
        </div>
      </Section>

      <Section title="Mastery ring">
        <div className="flex flex-wrap items-end gap-6">
          {states.map((state) => (
            <div key={state} className="flex flex-col items-center gap-2">
              <MasteryRing state={state} size={40} />
              <span className="text-xs text-text-muted">{state}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <MasteryRing state="understood" size={24} /> 24 px
            <MasteryRing state="mastered" size={16} /> 16 px
          </div>
        </div>
      </Section>

      <Section title="Progress and empty state">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <ProgressBar label="Section A" value={6} max={10} />
            <ProgressBar label="Topics mastered" value={3} max={9} />
          </div>
          <EmptyState
            title="No questions yet"
            action={
              <Button variant="secondary">
                <BookOpen aria-hidden="true" className="size-4" />
                Open notes
              </Button>
            }
          >
            Convert your slides, then ask the agent to write questions from them.
          </EmptyState>
        </div>
      </Section>

      <Section title="Inputs and sheet">
        <label className="relative block max-w-sm">
          <span className="sr-only">Search notes</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            placeholder="Search notes"
            className="min-h-11 w-full rounded-control border border-border-strong bg-surface pr-3 pl-9 text-sm placeholder:text-text-muted focus:border-primary"
          />
        </label>
        <div className="mt-3">
          <Button onClick={() => setSheet(true)} aria-haspopup="dialog">
            Open sheet
          </Button>
        </div>
        <Sheet open={sheet} title="Sample sheet" onClose={() => setSheet(false)}>
          <p className="text-sm">Sheets rise from the bottom on a phone and centre on wider screens.</p>
        </Sheet>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-border-subtle pt-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
