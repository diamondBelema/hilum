import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { api, type Course, type Goal, type PlanChange } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { Banner, EmptyState } from "../components/ui.tsx";
import { subscribeHarnessEvents } from "../lib/events.ts";

export function PlanScreen({ courses }: { courses: Course[] }) {
  const [course, setCourse] = useState(courses[0]?.code ?? "");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [daily, setDaily] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editDaily, setEditDaily] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<PlanChange[]>([]);

  const selected = useMemo(() => goals.find((goal) => goal.id === selectedId) ?? goals[0] ?? null, [goals, selectedId]);

  const load = () => {
    if (!course) return;
    void api.goals(course).then((items) => {
      setGoals(items);
      setSelectedId((id) => id && items.some((item) => item.id === id) ? id : items[0]?.id ?? null);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    if (!course && courses[0]) setCourse(courses[0].code);
  }, [course, courses]);
  useEffect(() => { load(); }, [course]);
  useEffect(() => {
    if (!selected) {
      setChanges([]);
      return;
    }
    void api.planChanges(selected.id).then(setChanges).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [selected?.id]);
  useEffect(() => {
    if (!selected) return;
    setEditDeadline(selected.deadline ?? "");
    setEditDaily(selected.study_min_per_day ? String(selected.study_min_per_day) : "");
  }, [selected?.id]);
  useEffect(() => subscribeHarnessEvents((event) => {
    if ((event.type === "goal" || event.type === "plan") && event.course === course) load();
  }), [course]);

  async function createGoal(event: FormEvent) {
    event.preventDefault();
    if (!course || !title.trim()) return;
    setBusy(true);
    try {
      const goal = await api.createGoal({
        course,
        title: title.trim(),
        deadline: deadline || null,
        study_min_per_day: daily ? Number(daily) : null,
      });
      setTitle("");
      setDeadline("");
      setDaily("");
      setGoals((items) => [goal, ...items]);
      setSelectedId(goal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve(itemId: string) {
    setBusy(true);
    try {
      const goal = await api.updatePlanItem(itemId, { plan_state: "approved" });
      setGoals((items) => items.map((item) => item.id === goal.id ? goal : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const goal = await api.updateGoal(selected.id, {
        deadline: editDeadline || null,
        study_min_per_day: editDaily ? Number(editDaily) : null,
      });
      setGoals((items) => items.map((item) => item.id === goal.id ? goal : item));
      setEditingGoal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {error && <Banner tone="error">{error}</Banner>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-label text-primary">Planning</p>
          <h1 className="type-title text-text">Goals and plans</h1>
          <p className="type-body-sm mt-1 text-text-muted">Plans are proposals. Approve them when they fit your time.</p>
        </div>
        <label className="type-body-sm text-text-muted">
          Course
          <select value={course} onChange={(event) => setCourse(event.target.value)} className="mt-1 block min-h-11 rounded-control border border-border-subtle bg-surface px-3 text-text">
            {courses.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}
          </select>
        </label>
      </div>

      <form onSubmit={createGoal} className="grid gap-3 rounded-panel border border-border-subtle bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="type-body-sm text-text-muted sm:col-span-1">
          New goal
          <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cover BCH 203 before the exam" />
        </label>
        <label className="type-body-sm text-text-muted">
          Deadline
          <Input className="mt-1" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        </label>
        <label className="type-body-sm text-text-muted">
          Minutes/day
          <Input className="mt-1 w-28" type="number" min={1} value={daily} onChange={(event) => setDaily(event.target.value)} />
        </label>
        <Button type="submit" variant="primary" loading={busy} loadingLabel="Creating…"><Plus className="size-4" /> Create</Button>
      </form>

      {goals.length === 0 ? (
        <EmptyState title="No goals yet">Create a goal to give sessions a stable direction.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {goals.map((goal) => (
              <button key={goal.id} type="button" onClick={() => setSelectedId(goal.id)} className={`w-full rounded-control border p-3 text-left ${selected?.id === goal.id ? "border-primary bg-primary-soft" : "border-border-subtle bg-surface hover:bg-surface-2"}`}>
                <span className="type-body-sm block font-medium text-text">{goal.title}</span>
                <span className="type-meta text-text-muted">{goal.plan_items.length} items · {goal.status}</span>
              </button>
            ))}
          </div>
          {selected && (
            <section className="rounded-panel border border-border-subtle bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="type-heading text-text">{selected.title}</h2>
                  <p className="type-body-sm mt-1 text-text-muted">
                    {selected.deadline ? `Deadline ${selected.deadline}` : "No deadline"}
                    {selected.study_min_per_day ? ` · ${selected.study_min_per_day} min/day` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.coverage && <span className="type-body-sm rounded-control bg-surface-2 px-3 py-2 text-text-muted">{selected.coverage.covered_accepted} of {selected.coverage.sections} sections mapped</span>}
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingGoal((value) => !value)}>
                    {editingGoal ? "Cancel" : "Edit goal"}
                  </Button>
                </div>
              </div>
              {editingGoal && (
                <form onSubmit={saveGoal} className="mt-4 grid gap-3 rounded-control border border-border-subtle bg-surface-2 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="type-body-sm text-text-muted">
                    Deadline
                    <Input className="mt-1" type="date" value={editDeadline} onChange={(event) => setEditDeadline(event.target.value)} />
                  </label>
                  <label className="type-body-sm text-text-muted">
                    Minutes/day
                    <Input className="mt-1 w-28" type="number" min={1} value={editDaily} onChange={(event) => setEditDaily(event.target.value)} />
                  </label>
                  <Button type="submit" variant="primary" loading={busy} loadingLabel="Saving…">Save</Button>
                </form>
              )}
              <div className="mt-5 space-y-2">
                {selected.plan_items.length === 0 ? (
                  <p className="type-body-sm text-text-muted">No plan items yet. Ask the agent to propose a plan.</p>
                ) : selected.plan_items.map((item, index) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border-subtle p-3">
                    <div className="min-w-0">
                      <p className="type-body-sm font-medium text-text">{item.title}</p>
                      <p className="type-meta text-text-muted">
                        {item.kind} · {item.est_min_low}-{item.est_min_high} min
                        {item.actual_sec > 0 ? ` · ${Math.round(item.actual_sec / 60)} min actual` : ""}
                        {item.partial ? " · resumed" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.plan_state === "draft" && (
                        <>
                          <Button type="button" size="icon-xs" variant="ghost" aria-label="Move item up" disabled={busy || index === 0} onClick={() => {
                            const previous = selected.plan_items[index - 1];
                            if (!previous) return;
                            setBusy(true);
                            void Promise.all([
                              api.updatePlanItem(item.id, { position: previous.position }),
                              api.updatePlanItem(previous.id, { position: item.position }),
                            ]).then(() => load()).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false));
                          }}>↑</Button>
                          <Button type="button" size="icon-xs" variant="ghost" aria-label="Move item down" disabled={busy || index === selected.plan_items.length - 1} onClick={() => {
                            const next = selected.plan_items[index + 1];
                            if (!next) return;
                            setBusy(true);
                            void Promise.all([
                              api.updatePlanItem(item.id, { position: next.position }),
                              api.updatePlanItem(next.id, { position: item.position }),
                            ]).then(() => load()).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false));
                          }}>↓</Button>
                        </>
                      )}
                      {item.plan_state === "draft" ? (
                        <Button type="button" variant="outline" onClick={() => void approve(item.id)} disabled={busy}><Check className="size-4" /> Approve</Button>
                      ) : <span className="type-meta text-primary">Approved</span>}
                    </div>
                  </div>
                ))}
              </div>
              {changes.some((change) => change.status === "draft") && (
                <div className="mt-6 border-t border-border-subtle pt-4">
                  <h3 className="type-label text-text-muted">Proposed changes</h3>
                  <div className="mt-2 space-y-2">
                    {changes.filter((change) => change.status === "draft").map((change) => (
                      <div key={change.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-warning/30 bg-warning-soft p-3">
                        <div>
                          <p className="type-body-sm font-medium text-text">Updated plan proposal</p>
                          <p className="type-meta text-text-muted">
                            {change.diff.add.length} add · {change.diff.remove.length} remove · {change.diff.defer.length} defer · {change.diff.reorder.length} reorder
                          </p>
                        </div>
                        <Button type="button" variant="outline" disabled={busy} onClick={() => {
                          setBusy(true);
                          void api.applyPlanChange(change.id).then((goal) => {
                            setGoals((items) => items.map((item) => item.id === goal.id ? goal : item));
                            return api.planChanges(selected.id);
                          }).then(setChanges).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusy(false));
                        }}>Apply change</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-6 border-t border-border-subtle pt-4">
                <h3 className="type-label text-text-muted">Open tasks</h3>
                {selected.tasks.filter((task) => task.status === "open").length === 0 ? (
                  <p className="type-body-sm mt-2 text-text-muted">No open tasks for this goal.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selected.tasks.filter((task) => task.status === "open").map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-3 rounded-control border border-border-subtle p-3">
                        <div>
                          <p className="type-body-sm text-text">{task.title}</p>
                          <p className="type-meta text-text-muted">{task.kind}{task.due_date ? ` · due ${task.due_date}` : ""}</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => {
                          void api.updateTask(task.id, { status: "done" }).then(load).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                        }}>
                          <Check className="size-4" /> Done
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
