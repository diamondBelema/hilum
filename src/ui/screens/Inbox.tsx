import { useEffect, useRef, useState } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import { api, type Course, type InboxItem } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Banner, EmptyState } from "../components/ui.tsx";
import { cn } from "../lib/cn.ts";

type ReviewSuggestion = { course: string; score: number; evidence: string[] };

export function InboxScreen({ courses }: { courses: Course[] }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, ReviewSuggestion[]>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    void api
      .inbox()
      .then((next) => {
        setItems(next);
        return next;
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

  useEffect(load, []);

  async function upload(fileList: FileList | null) {
    if (!fileList) return;
    try {
      for (const file of Array.from(fileList)) await api.uploadInbox(file);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadSuggestions(item: InboxItem) {
    if (suggestions[item.id]) return;
    setLoadingSuggestions((prev) => new Set(prev).add(item.id));
    try {
      const result = await api.sortInbox(item.id);
      setSuggestions((prev) => ({ ...prev, [item.id]: result.candidates.slice(0, 2) }));
    } catch {
      setSuggestions((prev) => ({ ...prev, [item.id]: [] }));
    } finally {
      setLoadingSuggestions((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function acceptTop(item: InboxItem) {
    const top = suggestions[item.id]?.[0];
    if (!top) return;
    try {
      await api.correctInbox(item.id, top.course);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "sorted", course: top.course, confidence: top.score } : i)));
      setSuggestions((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function reject(item: InboxItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }

  async function acceptAll() {
    const needsReview = items.filter((i) => i.status === "needs_review");
    for (const item of needsReview) {
      const top = suggestions[item.id]?.[0];
      if (top) {
        try {
          await api.correctInbox(item.id, top.course);
        } catch {
          /* continue on error */
        }
      }
    }
    load();
    setSuggestions({});
  }

  const needsReview = items.filter((i) => i.status === "needs_review");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-label text-primary">Content in</p>
          <h1 className="type-title text-text">Inbox</h1>
          <p className="type-body-sm mt-1 text-text-muted">
            Files stay untouched while Hilum files them into your courses. {needsReview.length} item{needsReview.length === 1 ? "" : "s"} need review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="size-4" /> Refresh</Button>
          <Button variant="primary" onClick={() => inputRef.current?.click()}><FileUp className="size-4" /> Add files</Button>
          {needsReview.length > 0 && (
            <Button variant="secondary" onClick={acceptAll} disabled={loadingSuggestions.size > 0}>
              Approve all top suggestions
            </Button>
          )}
          <input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void upload(event.target.files)} />
        </div>
      </div>
      {items.length === 0 ? <EmptyState title="Inbox is empty">Add slides, PDFs, documents or photos to begin.</EmptyState> : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border-subtle bg-surface p-4">
              <div className="min-w-0 flex-1">
                <p className="type-body-sm truncate font-medium text-text">{item.path}</p>
                <p className="type-meta text-text-muted">
                  {item.kind} · {item.status}{item.course ? ` · ${item.course}` : ""}{item.confidence ? ` · ${Math.round(item.confidence * 100)}%` : ""}
                </p>
              </div>
              {item.status === "needs_review" && suggestions[item.id] ? (
                <div className="flex flex-wrap items-center gap-3">
                  {suggestions[item.id].map((suggestion, index) => (
                    <button
                      key={suggestion.course}
                      type="button"
                      onClick={() => void acceptTop(item)}
                      disabled={loadingSuggestions.has(item.id)}
                      className={cn(
                        "min-h-10 rounded-control border px-3 py-1.5 text-xs font-medium transition-colors",
                        index === 0 ? "border-primary bg-primary-soft text-primary" : "border-border-subtle hover:bg-surface-2",
                      )}
                    >
                      {index === 0 ? "✓ " : ""}{suggestion.course} ({Math.round(suggestion.score * 100)}%)
                    </button>
                  ))}
                  {loadingSuggestions.has(item.id) && <span className="type-meta text-xs text-text-muted">Loading…</span>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void reject(item)}
                    disabled={loadingSuggestions.has(item.id)}
                  >
                    Reject
                  </Button>
                </div>
              ) : item.status === "needs_review" && (
                <button
                  type="button"
                  onClick={() => void loadSuggestions(item)}
                  className="min-h-10 rounded-control border border-border-subtle px-3 text-xs text-text-muted hover:bg-surface-2"
                >
                  Show suggestions
                </button>
              )}
              {item.status !== "needs_review" && (
                <span className={`type-meta text-xs ${item.status === "sorted" ? "text-correct" : "text-text-muted"}`}>
                  {item.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
