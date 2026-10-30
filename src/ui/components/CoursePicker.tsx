import { useEffect, useId, useReducer, useRef } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { Course } from "../api.ts";
import { cn } from "../lib/cn.ts";
import { Popover } from "./Popover.tsx";

export type PickerState = {
  open: boolean;
  query: string;
  active: number;
  selectedCode: string | null;
};

export type PickerAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "query"; query: string }
  | { type: "move"; delta: number; count: number }
  | { type: "home" }
  | { type: "end"; count: number }
  | { type: "select"; code: string };

export const initialPickerState: PickerState = {
  open: false,
  query: "",
  active: 0,
  selectedCode: null,
};

export function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case "open":
      return { ...state, open: true, query: "", active: 0 };
    case "close":
      return { ...state, open: false };
    case "query":
      return { ...state, query: action.query, active: 0 };
    case "move": {
      if (action.count <= 0) return state;
      const next = (state.active + action.delta + action.count) % action.count;
      return { ...state, active: next };
    }
    case "home":
      return { ...state, active: 0 };
    case "end":
      return { ...state, active: Math.max(0, action.count - 1) };
    case "select":
      return { ...state, open: false, query: "", active: 0, selectedCode: action.code };
    default:
      return state;
  }
}

export function filterCourses(courses: Course[], query: string): Course[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return courses;
  return courses.filter(
    (course) =>
      course.code.toLowerCase().includes(needle) || course.title.toLowerCase().includes(needle),
  );
}

export function chooseInitialCourse(courses: Course[], storedCode: string | null): Course | null {
  if (storedCode) {
    const stored = courses.find((course) => course.code === storedCode);
    if (stored) return stored;
  }
  return courses.length === 1 ? courses[0]! : null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const LAST_COURSE = "hilum:last-course";

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLastCourse(target: StorageLike | null = storage()): string | null {
  try {
    return target?.getItem(LAST_COURSE) ?? null;
  } catch {
    return null;
  }
}

export function writeLastCourse(code: string, target: StorageLike | null = storage()) {
  try {
    target?.setItem(LAST_COURSE, code);
  } catch {
    // Blocked storage is fine; the picker still works for this visit.
  }
}

export function CoursePicker({
  courses,
  value,
  onSelect,
  open,
  onOpenChange,
  placement = "bottom",
}: {
  courses: Course[];
  value: Course | null;
  onSelect: (course: Course) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: "top" | "bottom";
}) {
  const [state, dispatch] = useReducer(pickerReducer, initialPickerState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const labelId = useId();

  const filtered = filterCourses(courses, state.query);
  const activeIndex = filtered.length === 0 ? -1 : Math.min(state.active, filtered.length - 1);

  useEffect(() => {
    if (open) {
      dispatch({ type: "open" });
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      dispatch({ type: "close" });
    }
  }, [open]);

  function close(reason: "escape" | "outside" = "escape") {
    onOpenChange(false);
    dispatch({ type: "close" });
    if (reason === "escape") triggerRef.current?.focus();
  }

  function select(course: Course) {
    onSelect(course);
    dispatch({ type: "select", code: course.code });
    onOpenChange(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      dispatch({ type: "move", delta: 1, count: filtered.length });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      dispatch({ type: "move", delta: -1, count: filtered.length });
    } else if (event.key === "Home") {
      event.preventDefault();
      dispatch({ type: "home" });
    } else if (event.key === "End") {
      event.preventDefault();
      dispatch({ type: "end", count: filtered.length });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = filtered[activeIndex];
      if (choice) select(choice);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={
          value ? `Course ${value.title} (${value.code}). Change course` : "Choose a course"
        }
        onClick={() => {
          if (open) {
            close("outside");
          } else {
            onOpenChange(true);
          }
        }}
        className={cn(
          "type-body-sm inline-flex min-h-11 max-w-full items-center gap-2 rounded-chip border px-3 font-medium",
          value
            ? "border-border-strong bg-surface text-text hover:bg-surface-2"
            : "border-border-strong bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        <span className="truncate">
          {value ? (
            <>
              {value.title}
              <span className="type-meta ml-1 text-text-muted">{value.code}</span>
            </>
          ) : (
            "Choose a course"
          )}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </button>

      <Popover
        open={open}
        onClose={close}
        labelledBy={labelId}
        className="left-0 right-auto w-80"
        placement={placement}
      >
        <p id={labelId} className="type-label text-text-muted">
          Choose a course
        </p>
        <div className="relative mt-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
            }
            value={state.query}
            onChange={(event) => dispatch({ type: "query", query: event.target.value })}
            onKeyDown={onKeyDown}
            placeholder="Search courses"
            aria-label="Search courses"
            className="type-body-sm min-h-11 w-full rounded-control border border-border-strong bg-surface pl-8 pr-3 text-text placeholder:text-text-muted"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="mt-2 max-h-64 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="type-body-sm px-2 py-3 text-text-muted">
              {courses.length === 0 ? "No courses yet." : "No courses match that search."}
            </li>
          ) : (
            filtered.map((course, index) => {
              const selected = value?.code === course.code;
              const active = index === activeIndex;
              return (
                <li
                  key={course.code}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(course)}
                  className={cn(
                    "type-body-sm flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control px-2 py-2",
                    active ? "bg-primary-soft text-text" : "text-text hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{course.title}</span>
                    <span className="type-meta block text-text-muted">
                      {course.code} · {course.notes} {course.notes === 1 ? "note" : "notes"}
                    </span>
                  </span>
                  {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
                </li>
              );
            })
          )}
        </ul>
      </Popover>
    </div>
  );
}
