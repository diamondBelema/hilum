import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, RotateCcw } from "lucide-react";
import type { ActivityComponent, ActivitySpec, Confidence } from "../api.ts";
import { CONFIDENCE_LABELS } from "../lib/activity.ts";
import { Chip } from "./ui.tsx";

type Props = {
  activityId: string;
  spec: ActivitySpec;
  values: unknown[];
  onChange: (index: number, value: unknown) => void;
  disabled?: boolean;
  onOpenNote: (path: string, anchor?: string) => void;
  onRenderError: (activityId: string, message: string) => void;
};

export function ActivityRenderer({ activityId, spec, values, onChange, disabled, onOpenNote, onRenderError }: Props) {
  return (
    <div className="space-y-4">
      {spec.title && <h2 className="text-xl font-semibold tracking-tight">{spec.title}</h2>}
      {spec.instructions && <p className="reading text-sm text-text-muted">{spec.instructions}</p>}
      {spec.components.map((component, index) => (
        <div key={`${component.type}-${index}`} className="rounded-panel border border-border-subtle bg-surface p-4">
          <ComponentView
            activityId={activityId}
            component={component}
            value={values[index]}
            onChange={(value) => onChange(index, value)}
            disabled={disabled}
            onOpenNote={onOpenNote}
            onRenderError={onRenderError}
          />
        </div>
      ))}
      {spec.cites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {spec.cites.map((cite, index) => (
            <button
              key={`${cite.note}-${index}`}
              type="button"
              onClick={() => onOpenNote(cite.note, cite.anchor)}
              className="inline-flex min-h-11 items-center rounded-chip border border-border-subtle bg-surface px-3 py-2 text-[13px] text-text-muted hover:border-primary/40 hover:text-text"
              title={cite.quote}
            >
              {cite.note.split("/").slice(-1)[0]}
              {cite.anchor ? `#${cite.anchor}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComponentView({
  activityId,
  component,
  value,
  onChange,
  disabled,
  onOpenNote,
  onRenderError,
}: {
  activityId: string;
  component: ActivityComponent;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  onOpenNote: (path: string, anchor?: string) => void;
  onRenderError: (activityId: string, message: string) => void;
}) {
  switch (component.type) {
    case "flashcard":
      return <Flashcard front={component.front ?? ""} back={component.back ?? ""} />;
    case "cloze":
      return (
        <Cloze
          text={component.text ?? ""}
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
          disabled={disabled}
          explanation={component.explanation}
        />
      );
    case "mcq_single":
      return (
        <Mcq
          stem={component.stem ?? ""}
          options={component.options ?? []}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "tf_multi":
      return (
        <TrueFalse
          stem={component.stem ?? ""}
          statements={component.statements ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "theory":
      return (
        <Theory
          prompt={component.prompt ?? ""}
          marks={component.marks ?? 0}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "worked_example_stepper":
      return <Stepper title={component.title ?? "Worked example"} steps={component.steps ?? []} />;
    case "predict_reveal":
      return (
        <Predict
          prompt={component.prompt ?? ""}
          reveal={component.reveal ?? ""}
          hint={component.hint}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "compare_table":
      return (
        <div>
          {component.caption && <p className="mb-2 text-sm font-medium">{component.caption}</p>}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {(component.columns ?? []).map((column) => (
                    <th key={column} className="border-b border-border-subtle px-3 py-2 text-left font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(component.rows ?? []).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border-b border-border-subtle px-3 py-2 align-top text-text-muted">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "mermaid_diagram":
      return (
        <Mermaid
          activityId={activityId}
          code={component.code ?? ""}
          caption={component.caption}
          onRenderError={onRenderError}
        />
      );
    case "confidence_rating":
      return (
        <ConfidenceRating
          prompt={component.prompt ?? "How confident are you?"}
          value={typeof value === "string" ? (value as Confidence) : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "think_aloud":
      return (
        <ThinkAloud
          prompt={component.prompt ?? "Talk me through your reasoning."}
          minWords={component.min_words ?? 10}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}

function Flashcard({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Flashcard</p>
      <p className="reading mt-3 text-lg">{front}</p>
      {flipped && <p className="reading mt-3 border-t border-border-subtle pt-3 text-base text-text-muted">{back}</p>}
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium hover:bg-surface-2"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {flipped ? "Hide answer" : "Show answer"}
      </button>
    </div>
  );
}

function Cloze({
  text,
  value,
  onChange,
  disabled,
  explanation,
}: {
  text: string;
  value: string[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
  explanation?: string;
}) {
  const parts = text.split(/(\{\{[^{}]+\}\})/g);
  let blank = -1;
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Fill the blanks</p>
      <div className="reading mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 text-base leading-8">
        {parts.map((part, index) => {
          const match = /^\{\{([^{}]+)\}\}$/.exec(part);
          if (!match) return <span key={index}>{part}</span>;
          blank += 1;
          const current = blank;
          return (
            <input
              key={index}
              value={value[current] ?? ""}
              onChange={(event) => {
                const next = [...value];
                while (next.length < (text.match(/\{\{[^{}]+\}\}/g)?.length ?? 0)) next.push("");
                next[current] = event.target.value;
                onChange(next);
              }}
              disabled={disabled}
              aria-label={`Blank ${current + 1}`}
              className="min-h-10 w-40 rounded-control border border-border bg-bg px-2 text-base focus:border-primary focus:outline-none"
            />
          );
        })}
      </div>
      {explanation && <p className="mt-3 text-sm text-text-muted">{explanation}</p>}
    </div>
  );
}

function Mcq({
  stem,
  options,
  value,
  onChange,
  disabled,
}: {
  stem: string;
  options: string[];
  value: number | null;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const group = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="reading text-base font-medium">{stem}</legend>
      <div className="mt-3 space-y-2">
        {options.map((option, index) => (
          <label
            key={index}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border px-3 py-2 text-sm ${
              value === index ? "border-primary bg-primary-soft" : "border-border-subtle hover:bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name={group}
              checked={value === index}
              onChange={() => onChange(index)}
              className="mt-1 accent-[var(--color-primary)]"
            />
            <span>
              <span className="mr-2 font-mono text-xs text-text-muted">{String.fromCharCode(65 + index)}</span>
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TrueFalse({
  stem,
  statements,
  value,
  onChange,
  disabled,
}: {
  stem: string;
  statements: { text: string }[];
  value: unknown[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="reading text-base font-medium">{stem}</legend>
      <p className="mt-1 text-xs text-text-muted">Mark every statement.</p>
      <ol className="mt-3 space-y-2">
        {statements.map((statement, index) => (
          <li
            key={index}
            className="flex flex-col gap-2 rounded-control border border-border-subtle p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="reading text-sm">{statement.text}</span>
            <div className="flex shrink-0 gap-1">
              {[true, false].map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  onClick={() => {
                    const next = [...value];
                    next[index] = option;
                    onChange(next);
                  }}
                  aria-pressed={value[index] === option}
                  className={`min-h-10 min-w-16 rounded-control border px-3 text-sm font-medium ${
                    value[index] === option
                      ? option
                        ? "border-correct bg-correct-soft text-correct"
                        : "border-incorrect bg-incorrect-soft text-incorrect"
                      : "border-border-subtle hover:bg-surface-2"
                  }`}
                >
                  {option ? "True" : "False"}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

function Theory({
  prompt,
  marks,
  value,
  onChange,
  disabled,
}: {
  prompt: string;
  marks: number;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="reading text-base font-medium">{prompt}</p>
        {marks > 0 && <Chip>{marks} marks</Chip>}
      </div>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        className="reading mt-3 w-full rounded-control border border-border bg-bg p-3 text-sm focus:border-primary focus:outline-none"
        placeholder="Write your answer…"
      />
    </div>
  );
}

function Stepper({ title, steps }: { title: string; steps: { title: string; body: string }[] }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const last = step >= steps.length - 1;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Worked example</p>
          <h3 className="mt-1 text-base font-semibold">{title}</h3>
        </div>
        <Chip>
          Step {step + 1} of {steps.length}
        </Chip>
      </div>
      {current && (
        <div className="mt-4 rounded-control bg-surface-2 p-3">
          <p className="text-sm font-semibold">{current.title}</p>
          <p className="reading mt-1 whitespace-pre-wrap text-sm text-text-muted">{current.body}</p>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          className="inline-flex min-h-10 items-center gap-1 rounded-control border border-border-subtle px-3 text-sm disabled:opacity-40"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
          className="inline-flex min-h-10 items-center gap-1 rounded-control bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-40"
        >
          Next <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Predict({
  prompt,
  reveal,
  hint,
  value,
  onChange,
  disabled,
}: {
  prompt: string;
  reveal: string;
  hint?: string;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <p className="reading text-base font-medium">{prompt}</p>
      {hint && !shown && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      <textarea
        value={value}
        disabled={disabled || shown}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder="Commit to a prediction first…"
        className="reading mt-3 w-full rounded-control border border-border bg-bg p-3 text-sm focus:border-primary focus:outline-none"
      />
      {shown ? (
        <div className="reading mt-3 rounded-control border border-correct/30 bg-correct-soft p-3 text-sm text-text">
          {reveal}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium hover:bg-surface-2"
        >
          <Eye aria-hidden="true" className="size-4" /> Reveal
        </button>
      )}
    </div>
  );
}

function ConfidenceRating({
  prompt,
  value,
  onChange,
  disabled,
}: {
  prompt: string;
  value?: Confidence;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium">{prompt}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(CONFIDENCE_LABELS) as Confidence[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`min-h-10 rounded-control border px-3 text-sm ${
              value === option ? "border-primary bg-primary-soft font-semibold" : "border-border-subtle hover:bg-surface-2"
            }`}
          >
            {CONFIDENCE_LABELS[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ThinkAloud({
  prompt,
  minWords,
  value,
  onChange,
  disabled,
}: {
  prompt: string;
  minWords: number;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <div>
      <p className="text-sm font-medium">{prompt}</p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="reading mt-2 w-full rounded-control border border-border bg-bg p-3 text-sm focus:border-primary focus:outline-none"
        placeholder="Say what you notice, what you rule out, and why…"
      />
      <p className={`mt-1 text-xs ${words < minWords ? "text-text-muted" : "text-correct"}`}>
        {words} / {minWords} words
      </p>
    </div>
  );
}

function Mermaid({
  activityId,
  code,
  caption,
  onRenderError,
}: {
  activityId: string;
  code: string;
  caption?: string;
  onRenderError: (activityId: string, message: string) => void;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = `mermaid-${rawId}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reported = useRef(false);
  const dark = useIsDark();

  useEffect(() => {
    let cancelled = false;
    reported.current = false;
    setSvg("");
    setError(null);
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
          suppressErrorRendering: true,
          fontFamily: "Atkinson Hyperlegible Next, sans-serif",
        });
        const rendered = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message.split("\n")[0] ?? "Invalid diagram");
        if (!reported.current) {
          reported.current = true;
          onRenderError(activityId, message);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, dryRunKey(dark), id, activityId]);

  if (error) {
    return (
      <div className="rounded-control border border-incorrect/40 bg-incorrect-soft p-3 text-sm text-incorrect">
        This activity could not be displayed. The agent has been told.
      </div>
    );
  }
  if (!svg) return <div className="h-24 animate-pulse rounded-control bg-surface-2" aria-label="Rendering diagram" />;
  return (
    <figure>
      <div className="mermaid-svg overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      {caption && <figcaption className="mt-2 text-center text-xs text-text-muted">{caption}</figcaption>}
    </figure>
  );
}

function dryRunKey(dark: boolean): string {
  return dark ? "dark" : "light";
}

function useIsDark(): boolean {
  const read = () =>
    typeof document !== "undefined" &&
    (document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches));
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  return dark;
}
