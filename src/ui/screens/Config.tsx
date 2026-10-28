import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, List, SlidersHorizontal, Timer } from "lucide-react";
import { api, type Course } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Sheet } from "../components/Sheet.tsx";

type BlueprintRow = { type: string; count: string; minutes: string; marksEach: string };

export function Config({
  course,
  onClose,
  open = true,
}: {
  course: Course | null;
  onClose: () => void;
  open?: boolean;
}) {
  const [tab, setTab] = useState<"course" | "answerStyle" | "rubric" | "mastery">("course");
  const [coursePatch, setCoursePatch] = useState<{
    title: string;
    department: string;
    examDate: string;
    defaultMode: string;
    blueprint: BlueprintRow[];
  }>({
    title: course?.title ?? "",
    department: course?.department ?? "",
    examDate: course?.examDate ?? "",
    defaultMode: "sectioned",
    blueprint: course ? blueprintRows(course) : [],
  });
  function blueprintRows(c: Course): BlueprintRow[] {
    const bp = (c as unknown as { exam_blueprint?: BlueprintRow[] }).exam_blueprint;
    if (Array.isArray(bp) && bp.length > 0) return bp;
    return [{ type: "mcq_single", count: "30", minutes: "45", marksEach: "2" }];
  }

  const [answerStyle, setAnswerStyle] = useState("");
  const [answerStyleLoading, setAnswerStyleLoading] = useState(false);
  const [rubricName, setRubricName] = useState("");
  const [rubricContent, setRubricContent] = useState("");
  const [mastery, setMastery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ stamp: string }[]>([]);
  const [historyFile, setHistoryFile] = useState("course.md");

  useEffect(() => {
    if (course) {
      setCoursePatch((prev) => ({
        ...prev,
        title: course.title,
        department: course.department ?? "",
        examDate: course.examDate ?? "",
      }));
    }
  }, [course]);

  const saveCourse = useCallback(async () => {
    if (!course) return;
    setSaving(true);
    setError(null);
    try {
      const blueprint = coursePatch.blueprint
        .filter((row) => row.type.trim())
        .map((row) => ({
          type: row.type.trim(),
          count: Number(row.count) || 0,
          minutes: Number(row.minutes) || 0,
          marks_each: Number(row.marksEach) || 0,
        }));
      await api.updateCourse(course.code, {
        title: coursePatch.title.trim() || undefined,
        department: coursePatch.department.trim() || undefined,
        examDate: coursePatch.examDate.trim() || undefined,
        examBlueprint: blueprint.length > 0 ? blueprint : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void loadHistory("course.md");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [course, coursePatch]);

  const loadHistory = useCallback(async (file: string) => {
    if (!course) return;
    setHistoryFile(file);
    try {
      const stamps = await api.courseHistory(course.code, file);
      setHistory(stamps);
    } catch {
      setHistory([]);
    }
  }, [course]);

  const restoreHistory = useCallback(async (stamp: string) => {
    if (!course) return;
    setSaving(true);
    try {
      await api.restoreCourseVersion(course.code, historyFile, stamp);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void loadHistory(historyFile);
      if (historyFile === "course.md") {
        // re-read course to reflect restored values
        const updated = (await api.courses()).find((c) => c.code === course.code);
        if (updated) {
          setCoursePatch((prev) => ({
            ...prev,
            title: updated.title,
            department: updated.department ?? "",
            examDate: updated.examDate ?? "",
          }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [course, historyFile]);

  const saveAnswerStyle = useCallback(async () => {
    if (!course) return;
    setSaving(true);
    setError(null);
    try {
      await api.writeAnswerStyle(course.code, answerStyle);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [course, answerStyle]);

  const saveRubric = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.writeRubric(rubricName, rubricContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [rubricName, rubricContent]);

  const saveMastery = useCallback(async () => {
    if (!course) return;
    setSaving(true);
    setError(null);
    try {
      await api.writeMastery(course.code, mastery);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [course, mastery]);

  return (
    <Sheet open={open} title="Course config" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs font-mono tracking-wider uppercase text-text-muted">
          Course config · writes {course?.code ?? "course"} files through the vault
        </p>
        {error && <div className="rounded-control border border-incorrect bg-incorrect-soft p-3 text-incorrect text-sm">{error}</div>}
        {saved && <div className="rounded-control border border-correct bg-correct-soft p-3 text-correct text-sm">Saved</div>}

        <div className="flex gap-2 border-b border-border-subtle pb-2">
          {[
            { id: "course", label: "Course settings", icon: SlidersHorizontal },
            { id: "answerStyle", label: "Answer style", icon: List },
            { id: "rubric", label: "Rubrics", icon: FileText },
            { id: "mastery", label: "Mastery thresholds", icon: Timer },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`text-xs font-medium py-1.5 border-b-2 ${
                tab === (t.id as typeof tab) ? "border-primary text-primary" : "border-transparent text-text-muted hover:border-border-subtle"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "course" && (
          <section>
            {course && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-text-muted mb-1">Title</span>
                    <input
                      value={coursePatch.title}
                      onChange={(e) => setCoursePatch((p) => ({ ...p, title: e.target.value }))}
                      className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-text-muted mb-1">Department</span>
                    <input
                      value={coursePatch.department}
                      onChange={(e) => setCoursePatch((p) => ({ ...p, department: e.target.value }))}
                      className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-text-muted mb-1">Exam date</span>
                    <input
                      type="date"
                      value={coursePatch.examDate}
                      onChange={(e) => setCoursePatch((p) => ({ ...p, examDate: e.target.value }))}
                      className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-text-muted mb-1">Default exam mode</span>
                    <select
                      value={coursePatch.defaultMode}
                      onChange={(e) => setCoursePatch((p) => ({ ...p, defaultMode: e.target.value }))}
                      className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="strict">Strict</option>
                      <option value="sectioned">Sectioned</option>
                      <option value="practice">Practice</option>
                    </select>
                  </label>
                </div>
                <div className="mb-4">
                  <p className="text-xs font-medium text-text-muted mb-2">Exam blueprint (sections)</p>
                  <table className="w-full text-sm border border-border-subtle">
                    <thead>
                      <tr>
                        <th className="text-left text-xs text-text-muted pb-2">Type</th>
                        <th className="text-left text-xs text-text-muted pb-2">Count</th>
                        <th className="text-left text-xs text-text-muted pb-2">Minutes</th>
                        <th className="text-left text-xs text-text-muted pb-2">Marks each</th>
                        <th className="text-left text-xs text-text-muted pb-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {coursePatch.blueprint.map((row, i) => (
                        <tr key={i} className="border-t border-border-subtle">
                          <td className="pb-2">
                            <input
                              value={row.type}
                              onChange={(e) =>
                                setCoursePatch((p) => {
                                  const next = [...p.blueprint];
                                  next[i] = { ...next[i], type: e.target.value };
                                  return { ...p, blueprint: next };
                                })}
                              className="w-full border-none bg-transparent text-sm focus:ring-0"
                            />
                          </td>
                          <td className="pb-2">
                            <input
                              value={row.count}
                              onChange={(e) =>
                                setCoursePatch((p) => {
                                  const next = [...p.blueprint];
                                  next[i] = { ...next[i], count: e.target.value };
                                  return { ...p, blueprint: next };
                                })}
                              className="w-full border-none bg-transparent text-sm focus:ring-0"
                            />
                          </td>
                          <td className="pb-2">
                            <input
                              value={row.minutes}
                              onChange={(e) =>
                                setCoursePatch((p) => {
                                  const next = [...p.blueprint];
                                  next[i] = { ...next[i], minutes: e.target.value };
                                  return { ...p, blueprint: next };
                                })}
                              className="w-full border-none bg-transparent text-sm focus:ring-0"
                            />
                          </td>
                          <td className="pb-2">
                            <input
                              value={row.marksEach}
                              onChange={(e) =>
                                setCoursePatch((p) => {
                                  const next = [...p.blueprint];
                                  next[i] = { ...next[i], marksEach: e.target.value };
                                  return { ...p, blueprint: next };
                                })}
                              className="w-full border-none bg-transparent text-sm focus:ring-0"
                            />
                          </td>
                          <td className="pb-2">
                            <Button variant="ghost" className="px-1" onClick={() => setCoursePatch((p) => ({ ...p, blueprint: p.blueprint.filter((_, j) => j !== i) }))}>
                              <ArrowLeft className="size-3.5" aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={4} className="pt-3">
                          <Button variant="secondary" className="text-xs px-2 py-1" onClick={() => setCoursePatch((p) => ({ ...p, blueprint: [...p.blueprint, { type: "", count: "", minutes: "", marksEach: "" }] }))}>
                            Add section
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="primary" onClick={saveCourse} loading={saving} disabled={!course}>
                    Save course settings
                  </Button>
                  <Button variant="secondary" onClick={() => loadHistory("course.md")} className="text-xs px-2 py-1.5">
                    History
                  </Button>
                </div>
                {history.length > 0 && (
                  <div className="mt-3 border border-border-subtle rounded-panel bg-surface p-2 max-h-48 overflow-y-auto">
                    <p className="text-xs text-text-muted mb-1">Saved versions (course.md)</p>
                    <ul className="space-y-1">
                      {history.map((item) => (
                        <li key={item.stamp} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono">{new Date(Number(item.stamp)).toLocaleString()}</span>
                          <Button variant="ghost" className="px-1.5 py-0.5" onClick={() => void restoreHistory(item.stamp)}>
                            Restore
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {!course && <EmptyConfig>No course selected</EmptyConfig>}
          </section>
        )}

        {tab === "answerStyle" && course && (
          <section>
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">answer-style.md</span>
              <textarea
                value={answerStyle}
                onChange={(e) => setAnswerStyle(e.target.value)}
                rows={12}
                className="reading w-full rounded-control border border-border-strong bg-surface p-3 font-mono text-xs focus:border-primary focus:outline-none"
              />
            </label>
            <p className="mt-2 text-xs text-text-muted">
              Maps each question kind to a rubric, with typical marks, minutes, drawing_expected,
              answer_input and guidance text.
            </p>
            <Button variant="primary" onClick={saveAnswerStyle} loading={saving} disabled={answerStyleLoading}>
              Save answer style
            </Button>
          </section>
        )}

        {tab === "rubric" && (
          <section>
            <div className="flex gap-2 mb-3">
              <label className="block flex-1">
                <span className="block text-xs font-medium text-text-muted mb-1">Rubric name</span>
                <input
                  value={rubricName}
                  onChange={(e) => setRubricName(e.target.value)}
                  className="min-h-10 w-full rounded-control border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  placeholder="anatomy-muscle"
                />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">rubrics/<span className="font-mono">{rubricName || "name"}</span>.md</span>
              <textarea
                value={rubricContent}
                onChange={(e) => setRubricContent(e.target.value)}
                rows={12}
                className="reading w-full rounded-control border border-border-strong bg-surface p-3 font-mono text-xs focus:border-primary focus:outline-none"
              />
            </label>
            <p className="mt-2 text-xs text-text-muted">
              Required headings in order, what earns marks, mark allocation and command-word guidance.
            </p>
            <Button variant="primary" onClick={saveRubric} loading={saving} disabled={!rubricName.trim()}>
              Save rubric
            </Button>
          </section>
        )}

        {tab === "mastery" && course && (
          <section>
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">mastery.md</span>
              <textarea
                value={mastery}
                onChange={(e) => setMastery(e.target.value)}
                rows={12}
                className="reading w-full rounded-control border border-border-strong bg-surface p-3 font-mono text-xs focus:border-primary focus:outline-none"
              />
            </label>
            <p className="mt-2 text-xs text-text-muted">
              Per-state thresholds and decay intervals (days). Editing thresholds does not change past
              grades — grades keep a snapshot of the rubric used.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-control border border-border-subtle bg-surface-2 p-3">
                <p className="text-xs font-medium">Familiar</p>
                <p className="text-sm text-text">read or seen, low accuracy</p>
              </div>
              <div className="rounded-control border border-border-subtle bg-surface-2 p-3">
                <p className="text-xs font-medium">Understood</p>
                <p className="text-sm text-text">correct ≥2×, ≥2 activity types</p>
              </div>
              <div className="rounded-control border border-border-subtle bg-surface-2 p-3">
                <p className="text-xs font-medium">Mastered</p>
                <p className="text-sm text-text">timed correct, ≥80% last 5</p>
              </div>
            </div>
            <Button variant="primary" onClick={saveMastery} loading={saving}>
              Save mastery thresholds
            </Button>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function EmptyConfig({ children }: { children: string }) {
  return (
    <div className="rounded-panel border border-border-subtle bg-surface p-6 text-center">
      <p className="text-sm text-text-muted">{children}</p>
    </div>
  );
}
