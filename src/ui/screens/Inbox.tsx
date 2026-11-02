import { useEffect, useRef, useState } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import { api, type Course, type InboxItem } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Banner, EmptyState } from "../components/ui.tsx";

export function InboxScreen({ courses }: { courses: Course[] }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = () => void api.inbox().then(setItems).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-label text-primary">Content in</p>
          <h1 className="type-title text-text">Inbox</h1>
          <p className="type-body-sm mt-1 text-text-muted">Files stay untouched while Hilum files them into your courses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="size-4" /> Refresh</Button>
          <Button variant="primary" onClick={() => inputRef.current?.click()}><FileUp className="size-4" /> Add files</Button>
          <input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => void upload(event.target.files)} />
        </div>
      </div>
      {items.length === 0 ? <EmptyState title="Inbox is empty">Add slides, PDFs, documents or photos to begin.</EmptyState> : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border-subtle bg-surface p-4">
              <div className="min-w-0">
                <p className="type-body-sm truncate font-medium text-text">{item.path}</p>
                <p className="type-meta text-text-muted">{item.kind} · {item.status}{item.course ? ` · ${item.course}` : ""}</p>
              </div>
              {item.status === "needs_review" && (
                <select
                  aria-label={`Choose course for ${item.path}`}
                  className="min-h-11 rounded-control border border-border-subtle bg-surface px-3 text-text"
                  defaultValue=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    void api.correctInbox(item.id, event.target.value).then(load).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                  }}
                >
                  <option value="">Choose course</option>
                  {courses.map((course) => <option key={course.code} value={course.code}>{course.title}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
