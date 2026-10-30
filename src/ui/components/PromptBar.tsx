import { ArrowUp } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "./Button.tsx";
import { cn } from "../lib/cn.ts";

export const PromptBar = forwardRef<HTMLTextAreaElement, PromptBarProps>(({
  value,
  onChange,
  onSubmit,
  placeholder = "What do you want to learn?",
  sending = false,
  error,
  disabledReason,
  controls,
  draftKey,
  autoFocus = false,
  maxLength = 4000,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const [counterWarn, setCounterWarn] = useState(false);

  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

  // Draft persistence
  useEffect(() => {
    if (!draftKey) return;
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored !== null && stored !== value) {
        onChange(stored);
      }
    } catch {
      // localStorage unavailable; ignore
    }
  }, [draftKey, value, onChange]);

  useEffect(() => {
    if (!draftKey) return;
    const handler = (event: StorageEvent) => {
      if (event.key === draftKey && !event.newValue) {
        // draft cleared elsewhere
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [draftKey]);

  // Auto-grow: no division by value length; maxHeight = 6 * lineHeight
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 24;
    const maxHeight = 6 * lineHeight;
    const next = Math.min(node.scrollHeight, maxHeight);
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, focused]);

  // Counter warning near limit
  useEffect(() => {
    const remaining = maxLength - value.length;
    setCounterWarn(remaining > 0 && remaining <= 200);
  }, [value, maxLength]);

  const truncated = value.length > maxLength;

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      let next = event.target.value;
      if (next.length > maxLength) {
        next = next.slice(0, maxLength);
        onChange(next);
        return;
      }
      onChange(next);
    },
    [maxLength, onChange],
  );

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    onSubmit(value);
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter") {
        if (event.shiftKey) {
          // newline; default behaviour inserts it
          return;
        }
        if (composingRef.current) return; // IME: do not submit during composition
        event.preventDefault();
        handleSubmit();
      }
      if (event.key === "Escape") {
        textareaRef.current?.blur();
      }
    },
    [handleSubmit],
  );

  const disabled = sending || truncated;

  // Visual focus state for the pill border
  const pillFocused = focused;

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div className="w-full max-w-[760px] mx-auto pointer-events-none">
      <div
        className={cn(
          "relative flex items-start gap-2 min-h-[56px] pointer-events-auto",
          pillFocused && "ring-1 ring-primary ring-inset",
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          aria-label={placeholder}
          placeholder={placeholder}
          rows={1}
          maxLength={maxLength}
          className={cn(
            "type-body w-full resize-none rounded-xl border border-border-subtle bg-surface-2 px-3 py-2 text-text outline-none",
            truncated ? "text-incorrect" : "placeholder:text-text-muted",
          )}
          style={{ minHeight: 0 }}
        />
        <Button
          type="button"
          variant="primary"
          size="icon-sm"
          onClick={handleSubmit}
          disabled={disabled}
          aria-label="Send"
          className="absolute bottom-2 right-2 size-[40px] align-self-end"
        >
          {sending ? (
            <span className="flex items-center justify-center h-full w-full">
              <svg
                className="animate-spin size-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </span>
          ) : (
            <ArrowUp aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>

      {truncated && (
        <p role="alert" className="type-body-sm mt-1 text-incorrect">
          Input truncated to {maxLength} characters.
        </p>
      )}

      {!truncated && counterWarn && (
        <p className="type-body-sm mt-1 text-text-muted">
          {maxLength - value.length} characters remaining
        </p>
      )}

      {error && (
        <p role="alert" className="type-body-sm mt-1 text-incorrect">{error}</p>
      )}

      {disabledReason && !sending && !error && (
        <p className="type-body-sm mt-1 text-text-muted">{disabledReason}</p>
      )}

      {controls && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {controls}
        </div>
      )}
    </div>
  );
});

export type PromptBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  sending?: boolean;
  error?: string | null;
  disabledReason?: string | null;
  controls?: React.ReactNode;
  draftKey?: string;
  autoFocus?: boolean;
  maxLength?: number;
};
