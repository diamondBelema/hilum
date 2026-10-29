import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { type Course } from "../api.ts";
import { cn } from "../lib/cn.ts";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";

type EmptySessionProps = {
  courses: Course[];
  selectedCourse: Course | null;
  setSelectedCourse: (course: Course | null) => void;
  activeSessionId: string | null;
  onNewSession: (course: Course | null, goal?: string) => void;
};

export function EmptySession({
  courses,
  selectedCourse,
  setSelectedCourse,
  activeSessionId,
  onNewSession,
}: EmptySessionProps) {
  const [inputValue, setInputValue] = useState("");
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);

  const canSubmit = Boolean(selectedCourse && inputValue.trim());

  const handleSend = useCallback(() => {
    if (!canSubmit || !selectedCourse) return;
    onNewSession(selectedCourse, inputValue.trim());
  }, [canSubmit, selectedCourse, inputValue, onNewSession]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Auto-grow textarea to about 6 lines
  useEffect(() => {
    if (!textareaRef) return;
    textareaRef.style.height = "auto";
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 6 * 24)}px`;
  }, [inputValue, textareaRef]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full">
        <h1 className="text-3xl font-prose font-bold text-text mb-2">What do you want to learn?</h1>
        <p className="text-text-muted mb-6">
          Pick a course, type your question, and start a new session.
        </p>

        <textarea
          ref={setTextareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your question or topic here…"
          rows={3}
          className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface px-2 py-1.5 text-xs text-text-muted">
            {selectedCourse ? (
              <>
                <span className="font-medium text-text">{selectedCourse.title}</span>
                <span className="font-mono text-[10px] text-text-muted">
                  · {selectedCourse.code}
                </span>
              </>
            ) : (
              <span>Select a course</span>
            )}
          </div>
          <Button
            variant="default"
            onClick={handleSend}
            disabled={!canSubmit}
            size="icon"
          >
            <ArrowRightIcon className="size-4" />
          </Button>
        </div>

        {!selectedCourse && (
          <p className="mt-2 text-[10px] text-text-muted">
            Pick a course from the list above to enable starting a session.
          </p>
        )}
      </div>
    </div>
  );
}
