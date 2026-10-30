import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import {
  ArrowLeft,
  ImageIcon,
  Save,
  Trash2,
  Zap,
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

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
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
    topics: string;
    sourceType: string;
  }>({ title: "", course: course?.code ?? "", topics: "", sourceType: "student_notes" });
  const [banners, setBanners] = useState<{ kind: "external" | "saved"; message: string }[]>([]);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const lastWrittenRef = useRef(source);

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
          topics: (detail.frontmatter.topics as string[])?.join(", ") ?? "",
          sourceType: (detail.frontmatter.source_type as string) ?? "student_notes",
        });
        setSource(detail.body);
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
        target = `courses/${course}/notes/${slug(title)}.md`;
        mode = "create";
      }
      const result = await api.writeNote({ path: target, content, mode, requestId: `editor-${Date.now()}` });
      if (!detailPath) setDetailPath(target);
      lastWrittenRef.current = content;
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

  const autosave = debounce(() => {
    if (unsaved && detailPath) void save();
  }, 1500);

  useEffect(() => {
    if (unsaved && detailPath) autosave();
  }, [unsaved, detailPath, autosave]);

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
    <div className="max-w-4xl">
      <div className="flex items-baseline gap-2 mb-3">
        <Button variant="ghost" className="px-2" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{!detailPath ? "New note" : "Editor"}</h1>
        {detailPath && (
          <Button
            variant="destructive"
            onClick={() => void deleteNote()}
            loading={deleting}
            aria-label="Delete note"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </Button>
        )}
      </div>

      {error && <div className="mb-3">{error}</div>}

      {banners.map((banner, index) => (
        <div key={index} className={`mb-3 rounded-control border px-3 py-2 ${externalBannerKind(banner.kind)}`}>
          <p className="text-sm">{banner.message}</p>
          {banner.kind === "external" && (
            <p className="mt-2 text-xs text-text-muted">External changes detected.</p>
          )}
        </div>
      ))}

      <div className="mb-4 border border-border-subtle rounded-panel bg-surface p-3">
        <div className="flex flex-wrap gap-2 items-start">
          <label className="block w-full sm:w-48">
            <span className="block text-xs font-medium mb-1 text-text-muted">Title</span>
            <input
              value={frontmatter.title}
              onChange={(event) => setFrontmatter((prev) => ({ ...prev, title: event.target.value }))}
              className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary"
            />
          </label>
          <label className="block w-full sm:w-48">
            <span className="block text-xs font-medium mb-1 text-text-muted">Course</span>
            <input
              value={frontmatter.course}
              onChange={(event) => setFrontmatter((prev) => ({ ...prev, course: event.target.value }))}
              className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary"
            />
          </label>
          <label className="block w-full sm:w-48">
            <span className="block text-xs font-medium mb-1 text-text-muted">Topics (comma separated)</span>
            <input
              value={frontmatter.topics}
              onChange={(event) => setFrontmatter((prev) => ({ ...prev, topics: event.target.value }))}
              className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary"
            />
          </label>
          <label className="block w-full sm:w-48">
            <span className="block text-xs font-medium mb-1 text-text-muted">Source type</span>
            <input
              value={frontmatter.sourceType}
              onChange={(event) => setFrontmatter((prev) => ({ ...prev, sourceType: event.target.value }))}
              className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-text-muted">Student notes get</span>
          <code className="text-xs font-mono text-primary">source_type: student_notes, trust: medium</code>
        </div>
      </div>

      <div className="flex gap-3 h-[calc(100dvh-400px)] min-h-[500px]">
        <div className="flex-1 border border-border-subtle rounded-panel bg-surface relative">
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            <Button variant="ghost" onClick={() => setMode("source")} disabled={mode === "source"}>
              <ImageIcon aria-hidden="true" className="size-4" />
              Markdown
            </Button>
            <Button variant="ghost" onClick={() => setMode("preview")} disabled={mode === "preview"}>
              <Zap aria-hidden="true" className="size-4" />
              Preview
            </Button>
          </div>
          <div ref={editorRef} className="h-full w-full min-h-0" />
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 text-xs text-text-muted">
            <span>{unsaved ? "Not saved" : "Saved"}</span>
            {saving && <span className="animate-pulse">…</span>}
          </div>
        </div>
        <div className="flex-1 border border-border-subtle rounded-panel bg-surface p-3 overflow-auto relative min-h-0">
          {mode === "preview" && (
            <div className="markdown prose-sm max-w-none leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!unsaved || saving}>
          <Save aria-hidden="true" className="size-4" />
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}
