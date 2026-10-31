import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import {
  ArrowLeft,
  FileText,
  Save,
  Trash2,
} from "lucide-react";
import { api } from "../api.ts";
import { type Course } from "../api.ts";
import { parseNote } from "../lib/frontmatter.ts";
import { Button } from "../components/Button.tsx";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function Editor({
  course,
  onBack,
  notePath,
}: {
  course: Course | null;
  onBack: () => void;
  notePath?: string;
}) {
  const [mode, setMode] = useState<"source" | "preview">("preview");
  const [source, setSource] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailPath, setDetailPath] = useState(notePath ?? "");
  const [deleting, setDeleting] = useState(false);
  const [frontmatter, setFrontmatter] = useState<{
    title: string;
    course: string;
    folder: string;
    topics: string;
    sourceType: string;
  }>({ title: "", course: course?.code ?? "", folder: "notes", topics: "", sourceType: "student_notes" });
  const [banners, setBanners] = useState<{ kind: "external" | "saved"; message: string }[]>([]);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const lastWrittenRef = useRef(source);

  function updateFrontmatter(
    update: (previous: typeof frontmatter) => typeof frontmatter,
  ) {
    setFrontmatter(update);
    setUnsaved(true);
    setSaved(false);
  }

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;
    const state = EditorState.create({
      doc: source,
        extensions: [
        basicSetup,
        markdown(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            setSource(next);
            setUnsaved(next !== lastWrittenRef.current);
            setSaved(false);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!notePath) return;
      try {
        const detail = await api.note(notePath);
        setDetailPath(detail.path);
        setFrontmatter({
          title: (detail.frontmatter.title as string) ?? "",
          course: detail.frontmatter.course as string ?? "",
          folder: detail.path.split("/").at(-2) ?? "notes",
          topics: (detail.frontmatter.topics as string[])?.join(", ") ?? "",
          sourceType: (detail.frontmatter.source_type as string) ?? "student_notes",
        });
        setSource(detail.body);
        viewRef.current?.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: detail.body },
        });
        lastWrittenRef.current = detail.body;
        setUnsaved(false);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
  }, [notePath]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const front = parseFrontmatter();
      const content = `---\n${front}\n---\n${source}`;
      let target = detailPath;
      let mode: "create" | "replace" = "replace";
      if (!target) {
        const course = frontmatter.course.trim();
        const title = frontmatter.title.trim();
        if (!course || !title) throw new Error("Course and title are required");
        const folder = slug(frontmatter.folder) || "notes";
        target = `courses/${course}/${folder}/${slug(title)}.md`;
        mode = "create";
      }
      const result = await api.writeNote({ path: target, content, mode, requestId: `editor-${Date.now()}` });
      if (!detailPath) setDetailPath(target);
      lastWrittenRef.current = source;
      setUnsaved(false);
      setSaved(true);
      setBanners((prev) => [...prev, { kind: "saved", message: `Saved · ${result.bytes} bytes` }]);
      setTimeout(() => setBanners((prev) => prev.slice(1)), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [detailPath, source, frontmatter]);

  const deleteNote = useCallback(async () => {
    if (!detailPath) return;
    if (!window.confirm("Delete this note?")) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteNote(detailPath);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }, [detailPath, onBack]);

  useEffect(() => {
    if (!unsaved || !detailPath) return;
    const timer = window.setTimeout(() => void save(), 1500);
    return () => window.clearTimeout(timer);
  }, [detailPath, save, unsaved]);

  function parseFrontmatter(): string {
    const lines: string[] = [];
    const title = frontmatter.title.trim();
    if (title) lines.push(`title: ${title}`);
    if (frontmatter.course.trim()) lines.push(`course: ${frontmatter.course.trim()}`);
    if (frontmatter.topics.trim()) lines.push(`topics: [${frontmatter.topics.split(",").map((t) => t.trim()).filter(Boolean).map((t) => `"${t}"`).join(", ")}]`);
    lines.push(`source_type: ${frontmatter.sourceType}`);
    lines.push(`trust: medium`);
    return lines.join("\n");
  }

  function externalBannerKind(kind: "external" | "saved"): string {
    return kind === "external" ? "border-warning bg-warning-soft text-warning" : "border-correct bg-correct-soft text-correct";
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" className="-ml-2 mb-1 px-2 text-text-muted" onClick={onBack}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span>Notes</span>
          </Button>
          <h1 className="type-title truncate">{!detailPath ? "New note" : frontmatter.title || "Edit note"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="type-meta text-text-muted">{unsaved ? "Unsaved changes" : saved ? "Saved" : "Draft"}</span>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!unsaved || saving}>
            <Save aria-hidden="true" className="size-4" />
            Save
          </Button>
          {detailPath && (
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={() => void deleteNote()}
              loading={deleting}
              aria-label="Delete note"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2">
          <FileText aria-hidden="true" className="size-4 text-primary" />
          <p className="type-label text-text-muted">Note details</p>
        </div>
      </div>

      {error && <div className="mt-3 rounded-control border border-incorrect/40 bg-incorrect-soft p-3 type-body-sm text-incorrect">{error}</div>}

      {banners.map((banner, index) => (
        <div key={index} className={`mt-3 rounded-control border px-3 py-2 ${externalBannerKind(banner.kind)}`}>
          <p className="type-body-sm">{banner.message}</p>
          {banner.kind === "external" && (
            <p className="mt-2 text-xs text-text-muted">External changes detected.</p>
          )}
        </div>
      ))}

      <div className="mt-3 rounded-panel border border-border-subtle bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block type-label text-text-muted">Title</span>
            <input
              value={frontmatter.title}
              onChange={(event) => updateFrontmatter((prev) => ({ ...prev, title: event.target.value }))}
              className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 py-2 type-body-sm focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block type-label text-text-muted">Course</span>
            <input
              value={frontmatter.course}
              onChange={(event) => updateFrontmatter((prev) => ({ ...prev, course: event.target.value }))}
              className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 py-2 type-body-sm focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block type-label text-text-muted">Section / folder</span>
            <input
              value={frontmatter.folder}
              onChange={(event) => updateFrontmatter((prev) => ({ ...prev, folder: event.target.value }))}
              placeholder="exam-review"
              className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 py-2 type-body-sm focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block type-label text-text-muted">Topics (comma separated)</span>
            <input
              value={frontmatter.topics}
              onChange={(event) => updateFrontmatter((prev) => ({ ...prev, topics: event.target.value }))}
              className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 py-2 type-body-sm focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block type-label text-text-muted">Source type</span>
            <input
              value={frontmatter.sourceType}
              onChange={(event) => updateFrontmatter((prev) => ({ ...prev, sourceType: event.target.value }))}
              className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 py-2 type-body-sm focus:border-primary"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <span className="type-meta text-text-muted">Default metadata</span>
          <code className="type-code text-primary">source_type: student_notes · trust: medium</code>
        </div>
      </div>

      <div className="mt-4 flex min-h-[520px] flex-col gap-3 lg:h-[calc(100dvh-390px)] lg:flex-row">
        <div className={`relative min-h-[520px] flex-1 overflow-hidden rounded-panel border border-border-subtle bg-surface ${mode === "preview" ? "hidden lg:block" : ""}`}>
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
              <span className="type-label text-text-muted">Markdown</span>
              <div className="flex gap-1">
                <Button variant={mode === "source" ? "secondary" : "ghost"} size="xs" onClick={() => setMode("source")} disabled={mode === "source"}>
                  Edit
                </Button>
                <Button variant={mode === "preview" ? "secondary" : "ghost"} size="xs" onClick={() => setMode("preview")} disabled={mode === "preview"}>
                  Preview
                </Button>
              </div>
          </div>
          <div ref={editorRef} className="h-[calc(100%-49px)] w-full min-h-0 overflow-auto" />
          <div className="absolute bottom-3 left-3 flex items-center gap-2 type-meta text-text-muted">
              <span>{unsaved ? "Changes will autosave" : saved ? "Saved" : "Ready"}</span>
              {saving && <span className="animate-pulse">Saving…</span>}
          </div>
        </div>
        <div className={`relative min-h-[520px] flex-1 overflow-auto rounded-panel border border-border-subtle bg-surface p-5 ${mode === "source" ? "hidden lg:block" : ""}`}>
          {mode === "preview" && (
              <div className="markdown max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}
