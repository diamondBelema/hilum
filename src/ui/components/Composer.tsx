import { uuid } from "../lib/uuid.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, GraduationCap, ListChecks, Loader2, RotateCcw } from "lucide-react";
import type { Course } from "../api.ts";
import { api } from "../api.ts";
import { Button } from "./Button.tsx";
import { CoursePicker } from "./CoursePicker.tsx";
import { SegmentedControl } from "./SegmentedControl.tsx";
import { cn } from "../lib/cn.ts";

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

/** One pill, used for home, live session and ended session so the dock never changes shape. */
const PILL =
  "w-full rounded-[28px] border border-border-strong bg-surface-2 px-4 pt-3 pb-2 focus-within:border-primary";

const CHIP =
  "type-meta inline-flex min-h-8 items-center gap-1.5 rounded-chip border border-border-subtle px-2.5 text-text-muted";

type ComposerView = "home" | "session";

export function Composer({
  view,
  courses,
  onStart,
  currentCourse,
  sessionMode,
  onSend,
  contextLabel,
  onClearContext,
  sending = false,
  ended = false,
  onResume,
  resuming = false,
  draftKey,
}: {
  view: ComposerView;
  courses: Course[];
  onStart?: (course: Course, goal: string) => void;
  currentCourse?: Course | null;
  /** Course code, used when the full Course object has not loaded yet. */
  sessionCourseCode?: string;
  sessionMode?: ComposerMode;
  onSend?: (text: string, clientId: string) => void | Promise<void>;
  contextLabel?: string | null;
  onClearContext?: () => void;
  sending?: boolean;
  ended?: boolean;
  onResume?: () => void | Promise<void>;
  resuming?: boolean;
  draftKey?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [homeMode, setHomeMode] = useState<ComposerMode>("teach");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const storageKey = draftKey ? `hilum:draft:${draftKey}` : null;

  // Course memory for the home screen.
  useEffect(() => {
    if (view !== "home" || selectedCourse || courses.length === 0) return;
    const remembered = chooseInitialCourse(courses, readLastCourse());
    if (remembered) setSelectedCourse(remembered);
  }, [view, courses, selectedCourse]);

  useEffect(() => {
    if (view === "home" && selectedCourse) writeLastCourse(selectedCourse.code);
  }, [view, selectedCourse]);

  // Restore a saved draft once per key; persist on change; empty removes it.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      setDraft(stored ?? "");
    } catch {
      /* storage blocked */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    const id = window.setTimeout(() => {
      try {
        if (draft) localStorage.setItem(storageKey, draft);
        else localStorage.removeItem(storageKey);
      } catch {
        /* storage blocked */
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [storageKey, draft]);

  // Auto-grow 1 to 6 lines.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 24;
    const max = lineHeight * 6;
    node.style.height = `${Math.min(node.scrollHeight, max)}px`;
    node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
  }, [draft, ended]);

  useEffect(() => {
    if (!ended) textareaRef.current?.focus();
  }, [ended, view]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSendError(null);

    if (view === "home") {
      const intent = startIntent(text, courses, selectedCourse, homeMode);
      if (intent.kind === "need-course") {
        setSendError(intent.message);
        setPickerOpen(true);
        return;
      }
      if (intent.kind === "empty") return;
      setDraft("");
      try {
        await onStart?.(selectedCourse!, intent.goal);
      } catch (err) {
        setDraft(text);
        setSendError(err instanceof Error ? err.message : "Could not start the session. Try again.");
      }
      return;
    }

    setDraft("");
    try {
      await onSend?.(text, uuid());
    } catch (err) {
      setDraft(text);
      setSendError(err instanceof Error ? err.message : "Message not sent. Your text is back in the box.");
    }
  }, [draft, sending, view, courses, selectedCourse, homeMode, onStart, onSend]);

  if (view === "session" && ended) {
    return (
      <div className={view === "session" ? "w-full max-w-4xl" : "mx-auto w-full max-w-[760px]"}>
        <div className={`${PILL} flex items-center justify-between gap-3`}>
          <p className="type-body min-w-0 flex-1 py-1 text-text-muted">
            This session has ended. Resume it to keep going.
          </p>
          <Button
            variant="primary"
            className="rounded-full"
            onClick={() => void onResume?.()}
            loading={resuming}
            loadingLabel="Resuming…"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Resume
          </Button>
        </div>
        {sendError && <p role="alert" className="type-body-sm mt-2 px-2 text-incorrect">{sendError}</p>}
      </div>
    );
  }

  const practice = view === "home" ? homeMode === "practice" : sessionMode === "practice";
  const courseLabel = currentCourse?.code ?? "";
  const canSend = draft.trim().length > 0 && !sending;

  return (
    <div className={view === "session" ? "w-full max-w-4xl" : "mx-auto w-full max-w-[760px]"}>
      <div className={PILL}>
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          maxLength={4000}
          placeholder={view === "home" ? "What do you want to learn?" : "Message your agent"}
          aria-label={view === "home" ? "What do you want to learn?" : "Message your agent"}
          onChange={(event) => {
            setDraft(event.target.value);
            setSendError(null);
          }}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || composingRef.current) return;
            event.preventDefault();
            void submit();
          }}
          className="type-body block w-full resize-none bg-transparent text-text outline-none placeholder:text-text-muted"
        />
        {view === "session" && contextLabel && (
          <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-chip border border-primary/30 bg-primary-soft px-2.5 py-1 type-meta text-primary">
            <span className="truncate">{contextLabel}</span>
            <button
              type="button"
              onClick={onClearContext}
              className="shrink-0 rounded-full px-1 text-primary hover:bg-primary/10"
              aria-label="Remove message context"
            >
              ×
            </button>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {view === "home" ? (
              <>
                <CoursePicker
                  courses={courses}
                  value={selectedCourse}
                  onSelect={setSelectedCourse}
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  placement="top"
                />
                <SegmentedControl<ComposerMode>
                  label="Session type"
                  value={homeMode}
                  onChange={setHomeMode}
                  options={[
                    { value: "teach", label: "Teach" },
                    { value: "practice", label: "Practice" },
                  ]}
                  className="shrink-0"
                />
              </>
            ) : (
              <>
                <span className={CHIP}>
                  <BookOpen aria-hidden="true" className="size-4" />
                  {courseLabel || "Course"}
                </span>
                <span className={CHIP}>
                  {practice ? (
                    <ListChecks aria-hidden="true" className="size-4" />
                  ) : (
                    <GraduationCap aria-hidden="true" className="size-4" />
                  )}
                  {practice ? "Practice" : "Teach"}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={view === "home" ? "Start" : "Send"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity disabled:opacity-40"
          >
            {sending ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <ArrowUp aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </div>
      {sendError && (
        <p role="alert" className="type-body-sm mt-2 px-2 text-incorrect">
          {sendError}
        </p>
      )}
    </div>
  );
}

function chooseInitialCourse(courses: Course[], storedCode: string | null): Course | null {
  if (storedCode) {
    const stored = courses.find((course) => course.code === storedCode);
    if (stored) return stored;
  }
  return courses.length === 1 ? courses[0]! : null;
}

function readLastCourse(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem("hilum:last-course");
  } catch {
    return null;
  }
}

function writeLastCourse(code: string): void {
  try {
    localStorage.setItem("hilum:last-course", code);
  } catch {
    // Blocked storage is fine; the picker still works for this visit.
  }
}
