import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Course } from "../api.ts";
import { Button } from "./Button.tsx";
import { CoursePicker } from "./CoursePicker.tsx";
import { SegmentedControl } from "./SegmentedControl.tsx";

export type ComposerMode = "teach" | "practice";

export type ComposerIntent =
  | { kind: "need-course"; message: string }
  | { kind: "empty" }
  | { kind: "start"; goal: string };

export function startIntent(
  goal: string,
  courses: Course[],
  selectedCourse: Course | null,
  mode: ComposerMode,
): ComposerIntent {
  if (!selectedCourse) {
    return {
      kind: "need-course",
      message:
        courses.length === 0
          ? "There are no courses yet. Add a course to the vault, then reload."
          : "Choose a course before starting.",
    };
  }
  const text = goal.trim();
  if (!text) return { kind: "empty" };
  return { kind: "start", goal: mode === "practice" ? `Practice: ${text}` : text };
}

export function Composer({
  courses,
  selectedCourse,
  onSelectCourse,
  onStart,
}: {
  courses: Course[];
  selectedCourse: Course | null;
  onSelectCourse: (course: Course) => void;
  onStart: (course: Course, goal: string, mode: ComposerMode) => void;
}) {
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<ComposerMode>("teach");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 9 * 24)}px`;
  }, [goal]);

  const start = useCallback(() => {
    const intent = startIntent(goal, courses, selectedCourse, mode);
    if (intent.kind === "need-course") {
      setPickerOpen(true);
      setMessage(intent.message);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    if (intent.kind === "empty") return;
    setMessage(null);
    onStart(selectedCourse!, intent.goal, mode);
  }, [courses, goal, mode, onStart, selectedCourse]);

  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <label htmlFor="composer-goal" className="type-label block text-text-muted">
        Your goal
      </label>
      <textarea
        ref={textareaRef}
        id="composer-goal"
        value={goal}
        onChange={(event) => {
          setGoal(event.target.value);
          if (message) setMessage(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            start();
          }
        }}
        rows={2}
        placeholder="For example: explain how the loop of Henle concentrates urine"
        className="type-body mt-2 min-h-24 w-full resize-none rounded-control border border-border-strong bg-surface px-3 py-2.5 text-text placeholder:text-text-muted"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CoursePicker
          courses={courses}
          value={selectedCourse}
          onSelect={(course) => {
            onSelectCourse(course);
            setMessage(null);
          }}
          open={pickerOpen}
          onOpenChange={(open) => {
            setPickerOpen(open);
            if (open) setMessage(null);
          }}
        />
        <SegmentedControl<ComposerMode>
          label="Session type"
          value={mode}
          onChange={setMode}
          options={[
            { value: "teach", label: "Teach" },
            { value: "practice", label: "Practice" },
          ]}
          className="shrink-0"
        />
        <Button type="submit" variant="primary" className="ml-auto" disabled={!goal.trim()}>
          <ArrowRight aria-hidden="true" className="size-4" />
          Start
        </Button>
      </div>

      {message && (
        <p role="alert" className="type-body-sm mt-2 text-incorrect">
          {message}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="type-meta text-text-muted">Enter starts. Shift+Enter adds a line.</p>
        {mode === "practice" && (
          <p className="type-meta text-text-muted">Practice uses banked questions in this course.</p>
        )}
      </div>
    </form>
  );
}
