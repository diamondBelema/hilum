import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, RotateCcw } from "lucide-react";
import type { ActivityComponent, ActivitySpec, Confidence } from "../api.ts";
import { CONFIDENCE_LABELS } from "../lib/activity.ts";
import { Chip } from "./ui.tsx";

type Props = {
  activityId: string;
  spec: ActivitySpec;
  values: unknown[];
  onChange?: (index: number, value: unknown) => void;
  disabled?: boolean;
  onOpenNote?: (path: string, anchor?: string) => void;
  onRenderError?: (activityId: string, message: string) => void;
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
            onChange={(value) => {
              if (onChange) onChange(index, value);
            }}
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
              onClick={() => onOpenNote?.(cite.note, cite.anchor)}
              className="inline-flex min-h-11 items-center rounded-chip border border-border-subtle bg-surface px-3 py-2 type-meta text-text-muted hover:border-primary/40 hover:text-text"
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
  onOpenNote?: (path: string, anchor?: string) => void;
  onRenderError?: (activityId: string, message: string) => void;
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
    case "short_answer":
      return (
        <ShortAnswer
          stem={component.stem ?? ""}
          answer={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
          modelAnswer={component.model_answer}
        />
      );
    case "matching":
      return (
        <Matching
          pairs={component.pairs ?? []}
          value={typeof value === "object" && value !== null ? (value as Record<string, string>) : {}}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "ordering":
      return (
        <Ordering
          items={component.items ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "mcq_multi":
      return (
        <McqMulti
          stem={component.stem ?? ""}
          options={component.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "calculation":
      return (
        <Calculation
          stem={component.stem ?? ""}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
          disabled={disabled}
          tolerance={component.tolerance}
          answer={typeof component.answer === "number" || typeof component.answer === "string" ? component.answer : undefined}
        />
      );
    case "spot_the_error":
      return (
        <SpotTheError
          text={component.text ?? ""}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
          errors={component.errors}
        />
      );
    case "teach_back":
      return (
        <TeachBack
          prompt={component.prompt ?? "Explain this in your own words."}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
          minWords={component.min_words}
        />
      );
    case "case_vignette":
      return (
        <CaseVignette
          stem={component.stem ?? ""}
          questions={component.questions ?? []}
          value={typeof value === "object" && value !== null ? (value as Record<string, string>) : {}}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "concept_map":
      return (
        <ConceptMap
          nodes={component.nodes ?? []}
          edges={component.edges ?? []}
          caption={component.caption}
        />
      );
    case "label_diagram":
      return (
        <LabelDiagram
          image={component.image}
          labels={component.labels ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "timeline":
      return (
        <Timeline
          events={component.events ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "annotated_image":
      return (
        <AnnotatedImage
          image={component.image}
          annotations={component.annotations ?? []}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "spotter_station":
      return (
        <SpotterStation
          image={component.image}
          question={component.question ?? "Identify the highlighted structure."}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "muddy_point":
      return (
        <MuddyPoint
          prompt={component.prompt ?? "What is still confusing?"}
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
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium hover:bg-surface-2"
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
              className="min-h-10 w-40 rounded-control border border-border-subtle bg-bg px-2 text-base"
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
        className="reading mt-3 w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
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
          className="inline-flex min-h-11 items-center gap-1 rounded-control border border-border-subtle px-3 text-sm disabled:opacity-40"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
          className="inline-flex min-h-11 items-center gap-1 rounded-control bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-40"
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
        className="reading mt-3 w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
      />
      {shown ? (
        <div className="reading mt-3 rounded-control border border-correct/30 bg-correct-soft p-3 text-sm text-text">
          {reveal}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium hover:bg-surface-2"
        >
          <Eye aria-hidden="true" className="size-4" /> Reveal
        </button>
      )}
    </div>
  );
}

function ShortAnswer({
  stem,
  answer,
  onChange,
  disabled,
  modelAnswer,
}: {
  stem: string;
  answer: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  modelAnswer?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div>
      <p className="reading text-base font-medium">{stem}</p>
      <textarea
        value={answer}
        disabled={disabled || revealed}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder="Type your answer…"
        className="reading mt-3 w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
      />
      {revealed && modelAnswer && (
        <div className="mt-3 rounded-control border border-correct/30 bg-correct-soft p-3 text-sm text-text">
          <p className="text-xs font-semibold text-correct mb-1">Model answer</p>
          <p>{modelAnswer}</p>
        </div>
      )}
      {!revealed && !disabled && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium hover:bg-surface-2"
        >
          <Eye aria-hidden="true" className="size-4" /> Show answer
        </button>
      )}
    </div>
  );
}

function Matching({
  pairs,
  value,
  onChange,
  disabled,
}: {
  pairs: { left: string; right: string }[];
  value: Record<string, string>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const rightIds = pairs.map((p) => p.right);
  const setMatch = (leftId: string, rightId: string) => {
    const next = { ...value };
    if (rightId === "") delete next[leftId];
    else next[leftId] = rightId;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Match each item</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-muted mb-2">Left</p>
          {pairs.map((pair) => (
            <div key={pair.left} className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface p-2 text-sm">
              <span>{pair.left}</span>
              <select
                value={value[pair.left] ?? ""}
                onChange={(event) => setMatch(pair.left, event.target.value)}
                disabled={disabled}
                className="min-h-10 flex-1 rounded-control border border-border-strong bg-surface px-2 text-sm"
              >
                <option value="">—</option>
                {rightIds.map((rightId) => (
                  <option key={rightId} value={rightId}>
                    {pairs.find((p) => p.right === rightId)?.right}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-text-muted mb-2">Right</p>
          {pairs.map((pair) => (
            <div key={pair.right} className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface p-2 text-sm">
              <span>{pair.right}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ordering({
  items,
  value,
  onChange,
  disabled,
}: {
  items: { id: string; text: string }[];
  value: string[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const ordered = value.length > 0 ? value : items.map((item) => item.id);
  const move = (id: string, delta: number) => {
    const index = ordered.indexOf(id);
    if (index === -1) return;
    const next = [...ordered];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    next.splice(index, 1);
    next.splice(target, 0, id);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Put in order</p>
      {ordered.map((id, index) => {
        const item = items.find((i) => i.id === id);
        if (!item) return null;
        return (
          <div
            key={id}
            className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface p-2 text-sm"
          >
            <span className="min-w-4 text-center font-mono text-text-muted">{index + 1}</span>
            <span className="flex-1">{item.text}</span>
            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={index === 0}
                  className="min-h-11 min-w-11 rounded-control border border-border-subtle hover:bg-surface-2 disabled:opacity-40"
                  aria-label="Move up"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={index === ordered.length - 1}
                  className="min-h-11 min-w-11 rounded-control border border-border-subtle hover:bg-surface-2 disabled:opacity-40"
                  aria-label="Move down"
                >
                  <ArrowRight className="size-5" />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function McqMulti({
  stem,
  options,
  value,
  onChange,
  disabled,
}: {
  stem: string;
  options: string[];
  value: number[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const group = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="reading text-base font-medium">{stem}</legend>
      <p className="mt-1 text-xs text-text-muted">Select all that apply.</p>
      <div className="mt-3 space-y-2">
        {options.map((option, index) => {
          const selected = value.includes(index);
          return (
            <label
              key={index}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border px-3 py-2 text-sm ${
                selected ? "border-primary bg-primary-soft" : "border-border-subtle hover:bg-surface-2"
              }`}
            >
              <input
                type="checkbox"
                name={group}
                checked={selected}
                onChange={() => {
                  const next = selected ? value.filter((i) => i !== index) : [...value, index];
                  onChange(next);
                }}
                className="mt-1 accent-[var(--color-primary)]"
              />
              <span>
                <span className="mr-2 font-mono text-xs text-text-muted">{String.fromCharCode(65 + index)}</span>
                {option}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Calculation({
  stem,
  value,
  onChange,
  disabled,
  tolerance,
  answer,
}: {
  stem: string;
  value: number | null;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  tolerance?: number;
  answer?: number | string;
}) {
  const [revealed, setRevealed] = useState(false);
  const numeric = typeof answer === "number" ? answer : answer ? Number(answer) : null;
  return (
    <div>
      <p className="reading text-base font-medium">{stem}</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
          disabled={disabled || revealed}
          placeholder="0"
          className="min-h-10 w-48 rounded-control border border-border-subtle bg-bg px-2 text-sm"
        />
        {tolerance !== undefined && numeric !== null && (
          <span className="text-xs text-text-muted">± {tolerance}</span>
        )}
      </div>
      {revealed && numeric !== null && (
        <div className="mt-3 rounded-control border border-correct/30 bg-correct-soft p-3 text-sm text-text">
          <p className="text-xs font-semibold text-correct mb-1">Answer</p>
          <p>{numeric.toString()}</p>
        </div>
      )}
      {!revealed && !disabled && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium hover:bg-surface-2"
        >
          <Eye aria-hidden="true" className="size-4" /> Show answer
        </button>
      )}
    </div>
  );
}

function SpotTheError({
  text,
  value,
  onChange,
  disabled,
  errors,
}: {
  text: string;
  value: unknown[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
  errors?: number[];
}) {
  const lines = text.split("\n");
  const selected = new Set(value as number[]);
  return (
    <div className="space-y-2">
      <p className="reading text-base font-medium">Find the error(s)</p>
      {lines.map((line, index) => (
        <button
          key={index}
          type="button"
          onClick={() => {
            const next = new Set(selected);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            onChange([...next]);
          }}
          disabled={disabled}
          aria-pressed={selected.has(index)}
          className={`flex items-center gap-2 rounded-control border px-3 py-2 text-sm ${
            selected.has(index)
              ? "border-correct bg-correct-soft text-correct"
              : "border-border-subtle hover:bg-surface-2"
          }`}
        >
          <span className="text-xs font-mono text-text-muted">{index + 1}</span>
          <span className="flex-1 whitespace-pre-wrap">{line}</span>
        </button>
      ))}
      {disabled && errors && errors.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Marked lines: {errors.map((e) => e + 1).join(", ")}
        </p>
      )}
    </div>
  );
}

function TeachBack({
  prompt,
  value,
  onChange,
  disabled,
  minWords,
}: {
  prompt: string;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  minWords?: number;
}) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const target = minWords ?? 20;
  return (
    <div>
      <p className="reading text-base font-medium">{prompt}</p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        placeholder="Explain as if teaching a peer…"
        className="reading mt-3 w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
      />
      <p className={`mt-1 text-xs ${words < target ? "text-text-muted" : "text-correct"}`}>
        {words} / {target} words
      </p>
    </div>
  );
}

function CaseVignette({
  stem,
  questions,
  value,
  onChange,
  disabled,
}: {
  stem: string;
  questions: string[];
  value: Record<string, string>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="reading text-base font-medium">{stem}</p>
      </div>
      {questions.map((question, index) => (
        <div key={index} className="rounded-control border border-border-subtle bg-surface p-3">
          <p className="text-sm font-medium mb-2">{question}</p>
          <textarea
            value={value[index] ?? ""}
            disabled={disabled}
            onChange={(event) => {
              const next = { ...value };
              next[index] = event.target.value;
              onChange(next);
            }}
            rows={3}
            placeholder="Your answer…"
            className="w-full rounded-control border border-border-subtle bg-bg p-2 text-sm"
          />
        </div>
      ))}
    </div>
  );
}

function ConceptMap({ nodes, edges, caption }: { nodes: unknown[]; edges: unknown[]; caption?: string }) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface p-4 min-h-[300px] flex items-center justify-center">
      <p className="text-sm text-text-muted">
        {nodes.length === 0 ? "No concept map data." : `${nodes.length} nodes, ${edges.length} connections`}
      </p>
      {caption && <p className="mt-2 text-center text-xs text-text-muted">{caption}</p>}
    </div>
  );
}

function LabelDiagram({
  image,
  labels,
  value,
  onChange,
  disabled,
}: {
  image?: string;
  labels: string[];
  value: unknown[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      {image && (
        <div className="relative rounded-control border border-border-subtle overflow-hidden">
          <img src={`/api/asset?path=${encodeURIComponent(image)}`} alt="Diagram" className="block max-w-full h-auto" />
        </div>
      )}
      {labels.map((label, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="min-w-[3rem] text-xs font-mono text-text-muted">Label {index + 1}</span>
          <input
            value={typeof value[index] === "string" ? value[index] : ""}
            onChange={(event) => {
              const next = [...value];
              next[index] = event.target.value;
              onChange(next);
            }}
            disabled={disabled}
            placeholder={label}
            className="flex-1 min-h-10 rounded-control border border-border-subtle bg-bg px-2 text-sm"
          />
        </div>
      ))}
    </div>
  );
}

function Timeline({
  events,
  value,
  onChange,
  disabled,
}: {
  events: unknown[];
  value: unknown[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Order the events</p>
      {events.map((event, index) => (
        <div key={index} className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface p-2 text-sm">
          <span className="min-w-4 text-center font-mono text-text-muted">{index + 1}</span>
          <span className="flex-1 whitespace-pre-wrap">
            {typeof event === "string" ? event : String(event)}
          </span>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = [...value];
                  if (index > 0) [next[index], next[index - 1]] = [next[index - 1], next[index]];
                  onChange(next);
                }}
                disabled={index === 0}
                className="min-h-11 min-w-11 rounded-control border border-border-subtle hover:bg-surface-2 disabled:opacity-40"
                aria-label="Move up"
              >
                <ArrowLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = [...value];
                  if (index < value.length - 1) [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  onChange(next);
                }}
                disabled={index === value.length - 1}
                className="min-h-11 min-w-11 rounded-control border border-border-subtle hover:bg-surface-2 disabled:opacity-40"
                aria-label="Move down"
              >
                <ArrowRight className="size-5" />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function AnnotatedImage({
  image,
  annotations,
  value,
  onChange,
  disabled,
}: {
  image?: string;
  annotations: unknown[];
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      {image && (
        <div className="relative rounded-control border border-border-subtle overflow-hidden">
          <img src={`/api/asset?path=${encodeURIComponent(image)}`} alt="Image" className="block max-w-full h-auto" />
        </div>
      )}
      <p className="reading text-base font-medium">Your annotation</p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="Describe what you see…"
        className="reading w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
      />
    </div>
  );
}

function SpotterStation({
  image,
  question,
  value,
  onChange,
  disabled,
}: {
  image?: string;
  question: string;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      {image && (
        <div className="relative rounded-control border border-border-subtle overflow-hidden aspect-video">
          <img src={`/api/asset?path=${encodeURIComponent(image)}`} alt="Specimen" className="block w-full h-full object-cover" />
        </div>
      )}
      <p className="reading text-base font-medium">{question}</p>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Name the structure…"
        className="min-h-10 w-full rounded-control border border-border-subtle bg-surface px-3 text-sm"
      />
    </div>
  );
}

function MuddyPoint({
  prompt,
  value,
  onChange,
  disabled,
}: {
  prompt: string;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="reading text-base font-medium">{prompt}</p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="What don't you understand yet?…"
        className="reading w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
      />
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
            className={`min-h-11 rounded-control border px-3 text-sm ${
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
        className="reading mt-2 w-full rounded-control border border-border-subtle bg-bg p-3 text-sm"
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
  onRenderError?: (activityId: string, message: string) => void;
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
          onRenderError?.(activityId, message);
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
