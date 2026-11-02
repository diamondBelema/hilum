import { useEffect, useRef, useState } from "react";
import { Check, CheckSquare, Play, Search, Square } from "lucide-react";
import { api, type ConceptSummary, type Course } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { SegmentedControl } from "../components/SegmentedControl.tsx";
import { cn } from "../lib/cn.ts";
import { navigate } from "../lib/router.ts";

export function PracticeScreen({ courses }: { courses: Course[] }) {
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [concepts, setConcepts] = useState<ConceptSummary[]>([]);
  const [selectedConcepts, setSelectedConcepts] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!selectedCourse) return;
    let cancelled = false;
    setLoading(true);
    api
      .concepts(selectedCourse.code)
      .then((items) => {
        if (!cancelled) {
          setConcepts(items);
        }
      })
      .catch(() => setConcepts([]))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedCourse]);

  const filtered = concepts.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleConcept = (id: string) => {
    setSelectedConcepts((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPractice = async () => {
    if (!selectedCourse || selectedConcepts.size === 0) return;
    setStarting(true);
    try {
      const session = await api.startSession(selectedCourse.code, `Practice: ${selectedCourse.title}`, {
        conceptIds: Array.from(selectedConcepts),
      });
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      /* handled by parent error boundary */
    } finally {
      setStarting(false);
    }
  };

  if (!selectedCourse) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <h1 className="type-title text-text">Practice mode</h1>
        <p className="type-body-sm mt-2 text-text-muted">
          Choose a course, select the concepts you want to practise, then start a practice session.
        </p>
        <div className="mt-6">
          <p className="type-label text-text-muted">Course</p>
          <select
            value=""
            onChange={(event) => {
              const code = event.target.value;
              const course = courses.find((c) => c.code === code);
              if (course) setSelectedCourse(course);
            }}
            className="type-body-sm min-h-11 shrink-0 rounded-control border border-border-subtle bg-surface px-3 text-text w-full"
          >
            <option value="">Select a course…</option>
            {courses.map((course) => (
              <option key={course.code} value={course.code}>
                {course.code} — {course.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const masteryState = (concept: ConceptSummary) => {
    return concept.mastery.state;
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="type-title text-text">Practice mode</h1>
          <p className="type-body-sm mt-1 text-text-muted">
            Select the concepts to practise. Each starts a fresh session referencing only those concepts.
          </p>
        </div>
        <Button onClick={startPractice} disabled={starting || selectedConcepts.size === 0}>
          {starting
            ? "Starting…"
            : (
              <>
                <Play aria-hidden="true" className="size-4" />
                Start practice session
              </>
            )}
        </Button>
      </div>

      <div className="mb-4">
        <p className="type-label text-text-muted">Concepts ({selectedConcepts.size} selected)</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search concepts…"
            className="type-body-sm shrink-0 rounded-control border border-border-subtle bg-surface px-3 py-2 text-text w-full sm:w-[240px]"
          />
          <SegmentedControl<"all" | "unseen" | "familiar" | "understood" | "mastered" | "decayed">
            label="Filter by mastery"
            value="all"
            onChange={() => {}}
            options={[
              { value: "all", label: "All" },
              { value: "unseen", label: "Unseen" },
              { value: "decayed", label: "Decayed" },
              { value: "familiar", label: "Familiar" },
              { value: "understood", label: "Understood" },
              { value: "mastered", label: "Mastered" },
            ] as const}
            className="mt-3 shrink-0"
          />
        </div>
      </div>

      <div className="overflow-y-auto max-h-[60vh] border border-border-subtle rounded-control bg-surface">
        <ul className="divide-y divide-border-subtle">
          {filtered.map((concept) => {
            const selected = selectedConcepts.has(concept.id);
            return (
              <li key={concept.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => toggleConcept(concept.id)}
                  aria-checked={selected}
                  className={cn(
                    "shrink-0 rounded-full border size-5 flex items-center justify-center",
                    selected ? "border-primary bg-primary-soft text-primary" : "border-border-subtle hover:border-primary/40",
                    "group-hover:bg-surface-2",
                  )}
                >
                  {selected ? <Check aria-hidden="true" className="size-3" /> : <Square aria-hidden="true" className="size-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="type-body-sm font-medium text-text truncate">{concept.title}</p>
                  <p className={`type-meta text-xs truncate ${cn({ "text-correct": masteryState(concept) === "mastered", "text-warning": masteryState(concept) === "decayed" }) }`}>
                    {masteryState(concept)} · {concept.mastery.score.toFixed(0)}%
                  </p>
                </div>
                <span className={`type-meta text-xs ${selected ? "text-primary" : "text-text-muted"}`}>
                  {selected ? "Selected" : masteryState(concept)}
                </span>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-text-muted text-sm">No concepts match.</li>
          )}
        </ul>
      </div>

      {selectedConcepts.size > 0 && (
        <div className="mt-4 rounded-control border border-primary/30 bg-primary-soft p-3">
          <p className="type-body-sm text-text">
            {selectedConcepts.size} concept{selectedConcepts.size === 1 ? "" : "s"} will be referenced in this practice session.
          </p>
        </div>
      )}
    </div>
  );
}
