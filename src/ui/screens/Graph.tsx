import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { api, type ConceptDetail, type ConceptSummary, type Course } from "../api.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { MasteryRing } from "../components/MasteryRing.tsx";
import { Banner, Chip, EmptyState, Skeleton } from "../components/ui.tsx";
import { defaultCourse } from "../lib/courses.ts";
import { Sheet } from "../components/Sheet.tsx";

type EdgeView = { from: string; to: string; type: string };
type GraphView = { nodes: ConceptSummary[]; edges: EdgeView[] };
type Point = { x: number; y: number };

const CANVAS = 720;
const CENTER = CANVAS / 2;
const INNER_R = 150;
const OUTER_R = 280;
const MAX_NEIGHBORHOOD = 25;
const MAX_OVERVIEW = 300;
const NODE_RADIUS = { low: 24, mid: 32, high: 40 } as const;

function weightClass(weight: number): keyof typeof NODE_RADIUS {
  if (weight >= 0.4) return "high";
  if (weight >= 0.2) return "mid";
  return "low";
}

function stateLabel(state: string): string {
  return (
    {
      unseen: "Not seen",
      familiar: "Familiar",
      understood: "Understood",
      mastered: "Mastered",
      decayed: "Due for review",
    }[state] ?? state
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function edgeDash(type: string): string | undefined {
  if (type === "prerequisite") return "6 4";
  if (type === "related") return "2 5";
  return undefined;
}

export function GraphScreen({
  courses,
  onStudy,
}: {
  courses: Course[];
  onStudy: (course: string, conceptId: string) => void;
}) {
  const [courseCode, setCourseCode] = useState(defaultCourse(courses, "concepts"));
  const [mode, setMode] = useState<"neighborhood" | "overview">("neighborhood");
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<GraphView | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    if (!courseCode && courses[0]) setCourseCode(defaultCourse(courses, "concepts"));
  }, [courses, courseCode]);

  useEffect(() => {
    setRootId(null);
    setSelectedId(null);
    setDetail(null);
    setSearch("");
    setView(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [courseCode]);

  useEffect(() => {
    if (!courseCode) {
      setLoading(false);
      setView(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .graph(courseCode)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        if (!rootId && data.nodes.length > 0) {
          const flagged = data.nodes.find((node) => node.lecturerFlag) ?? data.nodes[0];
          setRootId(flagged.id);
        }
      })
      .catch((err) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [courseCode, reloadKey]);

  useEffect(() => {
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "activity" || event.type === "session" || event.type === "graded") {
        setReloadKey((key) => key + 1);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * CANVAS;
      const py = ((event.clientY - rect.top) / rect.height) * CANVAS;
      const previous = zoomRef.current;
      const next = clamp(previous * (event.deltaY < 0 ? 1.15 : 0.87), 0.6, 3.2);
      zoomRef.current = next;
      setZoom(next);
      setPan((current) => ({
        x: px - (px - current.x) * (next / previous),
        y: py - (py - current.y) * (next / previous),
      }));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const nodes = view?.nodes ?? [];
  const edges = view?.edges ?? [];
  const root = nodes.find((node) => node.id === rootId) ?? nodes[0] ?? null;

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of nodes) map.set(node.id, new Set());
    for (const edge of edges) {
      map.get(edge.from)?.add(edge.to);
      map.get(edge.to)?.add(edge.from);
    }
    return map;
  }, [nodes, edges]);

  const layout = useMemo(() => {
    const positions = new Map<string, Point>();
    if (mode === "neighborhood" && root) {
      const distance = new Map<string, number>([[root.id, 0]]);
      const queue = [root.id];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const depth = distance.get(id) ?? 0;
        if (depth >= 2) continue;
        for (const next of adjacency.get(id) ?? []) {
          if (!distance.has(next)) {
            distance.set(next, depth + 1);
            queue.push(next);
          }
        }
      }
      const all = nodes
        .filter((node) => distance.has(node.id))
        .sort(
          (a, b) =>
            (distance.get(a.id) ?? 0) - (distance.get(b.id) ?? 0) ||
            b.examWeight - a.examWeight ||
            a.title.localeCompare(b.title),
        );
      const visible = all.slice(0, MAX_NEIGHBORHOOD);
      const rings = [visible.filter((node) => distance.get(node.id) === 1), visible.filter((node) => distance.get(node.id) === 2)];
      positions.set(root.id, { x: CENTER, y: CENTER });
      rings.forEach((ring, ringIndex) => {
        ring.forEach((node, index) => {
          const angle = (index / Math.max(1, ring.length)) * Math.PI * 2 - Math.PI / 2 + (ringIndex === 1 ? Math.PI / 8 : 0);
          const radius = ringIndex === 0 ? INNER_R : OUTER_R;
          positions.set(node.id, { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius });
        });
      });
      return { visible, positions, allCount: all.length, capped: all.length > visible.length };
    }
    const visible = [...nodes].slice(0, MAX_OVERVIEW);
    const columns = Math.max(1, Math.ceil(Math.sqrt(visible.length)));
    const rows = Math.max(1, Math.ceil(visible.length / columns));
    const padding = 60;
    const stepX = columns > 1 ? (CANVAS - padding * 2) / (columns - 1) : 0;
    const stepY = rows > 1 ? (CANVAS - padding * 2) / (rows - 1) : 0;
    visible.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(node.id, {
        x: columns > 1 ? padding + column * stepX : CENTER,
        y: rows > 1 ? padding + row * stepY : CENTER,
      });
    });
    return { visible, positions, allCount: nodes.length, capped: nodes.length > visible.length };
  }, [adjacency, mode, nodes, root]);

  useEffect(() => {
    if (!search.trim() || mode !== "overview") return;
    const match = nodes.find((node) => node.title.toLowerCase().includes(search.trim().toLowerCase()));
    if (!match) return;
    const position = layout.positions.get(match.id);
    if (!position) return;
    const nextZoom = 1.6;
    setZoom(nextZoom);
    zoomRef.current = nextZoom;
    setPan({ x: CENTER - position.x * nextZoom, y: CENTER - position.y * nextZoom });
  }, [search, mode, nodes, layout]);

  const transformed = useMemo(() => {
    const map = new Map<string, Point>();
    for (const [id, point] of layout.positions) {
      map.set(id, { x: point.x * zoom + pan.x, y: point.y * zoom + pan.y });
    }
    return map;
  }, [layout, zoom, pan]);

  const visibleIds = new Set(layout.visible.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  const rootTitle = root?.title ?? "";
  const extra = layout.allCount - layout.visible.length;
  const showLabels = mode === "neighborhood" || zoom >= 1.25;

  async function loadDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    try {
      const value = await api.concept(id);
      setDetail(value);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function openNode(node: ConceptSummary) {
    if (didDrag.current) return;
    setRootId(node.id);
    void loadDetail(node.id);
  }

  function resetView() {
    setZoom(1);
    zoomRef.current = 1;
    setPan({ x: 0, y: 0 });
  }

  const drawerOpen = Boolean(selectedId && detail);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="mt-1 text-sm text-text-muted">
            Topics and how they connect. Open a topic to see its citations, evidence and practice bank.
          </p>
        </div>
        {courses.length > 0 && (
          <label className="block text-sm font-medium">
            Course
            <select
              value={courseCode}
              onChange={(event) => setCourseCode(event.target.value)}
              className="mt-1.5 min-h-11 w-full min-w-44 rounded-control border border-border bg-surface px-3 text-sm"
            >
              {courses.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-2">
          <Button variant={mode === "neighborhood" ? "primary" : "secondary"} onClick={() => setMode("neighborhood")}>
            Neighborhood
          </Button>
          <Button variant={mode === "overview" ? "primary" : "secondary"} onClick={() => setMode("overview")}>
            Overview
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {loading && !view ? (
        <div className="mt-6 space-y-4">
          <Skeleton lines={3} />
          <Skeleton lines={8} />
        </div>
      ) : courses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No courses yet">Add a course, then concepts appear in the graph.</EmptyState>
        </div>
      ) : !view || view.nodes.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No topics yet">
            Ask your teaching agent to add cited concepts. They appear here once created.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6">
            {mode === "overview" && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="min-w-56 flex-1">
                  <span className="sr-only">Find a topic</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-sm"
                    placeholder="Find a topic…"
                  />
                </label>
                <p className="text-xs text-text-muted">Search centers a topic and zooms in.</p>
              </div>
            )}

            <div
              ref={containerRef}
              className="relative aspect-square w-full touch-none overflow-hidden rounded-panel border border-border-subtle bg-surface"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                if ((event.target as HTMLElement).closest("button, input, select, a")) return;
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  panX: pan.x,
                  panY: pan.y,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const dx = ((event.clientX - drag.x) / rect.width) * CANVAS;
                const dy = ((event.clientY - drag.y) / rect.height) * CANVAS;
                if (Math.hypot(dx, dy) > 3) drag.moved = true;
                setPan({ x: drag.panX + dx, y: drag.panY + dy });
              }}
              onPointerUp={(event) => {
                const drag = dragRef.current;
                if (!drag) return;
                didDrag.current = drag.moved;
                dragRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                setTimeout(() => {
                  didDrag.current = false;
                }, 0);
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="absolute inset-0 h-full w-full" role="img" aria-label={`${mode} graph of ${rootTitle}`}>
                <defs>
                  <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L0,8 L8,4 z" fill="var(--border-strong)" />
                  </marker>
                </defs>
                {visibleEdges.map((edge) => {
                  const from = transformed.get(edge.from);
                  const to = transformed.get(edge.to);
                  if (!from || !to) return null;
                  const fromNode = layout.visible.find((node) => node.id === edge.from);
                  const toNode = layout.visible.find((node) => node.id === edge.to);
                  if (!fromNode || !toNode) return null;
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const distance = Math.hypot(dx, dy) || 1;
                  const ux = dx / distance;
                  const uy = dy / distance;
                  const startRadius = NODE_RADIUS[weightClass(fromNode.examWeight)] * zoom + 4;
                  const endRadius = NODE_RADIUS[weightClass(toNode.examWeight)] * zoom + 4;
                  const x1 = from.x + ux * startRadius;
                  const y1 = from.y + uy * startRadius;
                  const x2 = to.x - ux * endRadius;
                  const y2 = to.y - uy * endRadius;
                  const selected = selectedId === edge.from || selectedId === edge.to;
                  const stroke = selected ? "var(--primary)" : "var(--border-strong)";
                  const width = selected ? 3 : 1.5;
                  return (
                    <g key={`${edge.from}-${edge.to}-${edge.type}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={width}
                        strokeDasharray={edge.type === "contrasts_with" ? undefined : edgeDash(edge.type)}
                        markerEnd={edge.type === "prerequisite" ? "url(#graph-arrow)" : undefined}
                      />
                      {edge.type === "contrasts_with" && (
                        <line
                          x1={(x1 + x2) / 2 - uy * 7}
                          y1={(y1 + y2) / 2 + ux * 7}
                          x2={(x1 + x2) / 2 + uy * 7}
                          y2={(y1 + y2) / 2 - ux * 7}
                          stroke={stroke}
                          strokeWidth={width}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="absolute top-2 right-2 flex flex-col gap-1">
                <IconButton label="Zoom in" onClick={() => setZoom((value) => clamp(value * 1.2, 0.6, 3.2))}>
                  <Plus aria-hidden="true" className="size-5" />
                </IconButton>
                <IconButton label="Zoom out" onClick={() => setZoom((value) => clamp(value / 1.2, 0.6, 3.2))}>
                  <Minus aria-hidden="true" className="size-5" />
                </IconButton>
                <IconButton label="Reset view" onClick={resetView}>
                  <Maximize2 aria-hidden="true" className="size-5" />
                </IconButton>
              </div>

              {layout.visible.map((node) => {
                const position = transformed.get(node.id);
                if (!position) return null;
                const selected = selectedId === node.id;
                const labelVisible = showLabels || hovered === node.id || selected;
                return (
                  <div
                    key={node.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${(position.x / CANVAS) * 100}%`, top: `${(position.y / CANVAS) * 100}%` }}
                    onPointerEnter={() => setHovered(node.id)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <button
                      type="button"
                      onClick={() => openNode(node)}
                      aria-label={`${node.title}, ${stateLabel(node.mastery.state)}`}
                      className={`relative flex min-h-11 min-w-11 flex-col items-center rounded-full p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        selected ? "outline-2 outline-offset-2 outline-primary" : ""
                      }`}
                    >
                      <MasteryRing
                        state={node.mastery.state}
                        size={NODE_RADIUS[weightClass(node.examWeight)] * 2 * zoom}
                        label={`${node.title}: ${stateLabel(node.mastery.state)}`}
                      />
                      {labelVisible && (
                        <span className="pointer-events-none absolute top-full mt-1 max-w-[10rem] truncate rounded bg-bg px-1.5 py-0.5 text-[13px] text-text [text-shadow:0_0_4px_var(--bg)]">
                          {node.title}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-text-muted">
                {mode === "neighborhood"
                  ? `2-hop neighborhood of ${rootTitle || "this topic"} (${layout.visible.length}${extra > 0 ? ` of ${layout.allCount}` : ""} topics)`
                  : `${layout.visible.length}${extra > 0 ? ` of ${layout.allCount}` : ""} topics · zoom or hover for labels`}
              </p>
              {mode === "neighborhood" && extra > 0 && (
                <Button variant="secondary" onClick={() => setMode("overview")}>
                  +{extra} more
                </Button>
              )}
              {mode === "overview" && extra > 0 && (
                <span className="text-[13px] text-warning">Showing the first {MAX_OVERVIEW} topics.</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <svg width="24" height="8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke="var(--border-strong)" strokeWidth="1.5" /></svg>
              Parent
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="24" height="8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="6 4" /></svg>
              Prerequisite
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="24" height="8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="2 5" /></svg>
              Related
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="24" height="8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke="var(--border-strong)" strokeWidth="1.5" /><line x1="12" y1="0" x2="12" y2="8" stroke="var(--border-strong)" strokeWidth="1.5" /></svg>
              Contrasts with
            </span>
            <span className="flex items-center gap-1.5">
              <MasteryRing state="familiar" size={16} />
              Shape and fill show mastery
            </span>
          </div>
        </>
      )}

      <Sheet open={drawerOpen} title={detail?.title ?? "Topic"} onClose={() => setSelectedId(null)}>
        {!detail ? (
          <Skeleton lines={10} />
        ) : (
          <ConceptDrawer concept={detail} onStudy={() => void onStudy(detail.course, detail.id)} />
        )}
      </Sheet>
    </div>
  );
}

function ConceptDrawer({
  concept,
  onStudy,
}: {
  concept: ConceptDetail;
  onStudy: () => void;
}) {
  const STATE_LABELS: Record<string, string> = {
    unseen: "Not seen",
    familiar: "Familiar",
    understood: "Understood",
    mastered: "Mastered",
    decayed: "Due for review",
  };
  return (
    <div>
      <div className="flex items-start gap-3">
        <MasteryRing state={concept.mastery.state} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{concept.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {STATE_LABELS[concept.mastery.state]}
            {concept.mastery.evidenceCount > 0
              ? ` · ${concept.mastery.evidenceCount} evidence`
              : ""}
            {concept.mastery.overdue && concept.mastery.decayDueAt
              ? ` · overdue`
              : ""}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" onClick={onStudy}>
              Study this
            </Button>
            {concept.status === "proposed" && <Chip>Proposed</Chip>}
          </div>
        </div>
      </div>

      {concept.definition && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-text-muted mb-1">Definition</h3>
          <p className="reading text-sm text-text">{concept.definition}</p>
        </section>
      )}

      <section className="mt-4">
        <h3 className="text-xs font-semibold text-text-muted mb-1">Citations</h3>
        {concept.cites.length === 0 ? (
          <p className="text-sm text-text-muted">No citation recorded.</p>
        ) : (
          <ul className="space-y-1">
            {concept.cites.map((cite, index) => (
              <li key={`${cite.note}-${index}`} className="text-sm">
                <span className="font-medium">{cite.note}</span>
                {cite.anchor ? ` · #${cite.anchor}` : ""}
                {cite.quote && <span className="reading mt-0.5 block text-xs text-text-muted">“{cite.quote}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {concept.prerequisites.length > 0 || concept.related.length > 0 || concept.contrasts.length > 0 || concept.children.length > 0 && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-text-muted mb-1">Connections</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {concept.prerequisites.length > 0 && (
              <>
                <dt className="text-xs text-text-muted">Prerequisites</dt>
                <dd className="flex flex-wrap gap-1">
                  {concept.prerequisites.map((item) => (
                    <span key={item.id} className="inline-flex min-h-9 items-center gap-1 rounded-chip border border-border-subtle bg-surface px-2 py-0.5 text-xs hover:border-border-strong cursor-pointer" onClick={() => {}}>
                      {item.title}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {concept.related.length > 0 && (
              <>
                <dt className="text-xs text-text-muted">Related</dt>
                <dd className="flex flex-wrap gap-1">
                  {concept.related.map((item) => (
                    <span key={item.id} className="inline-flex min-h-9 items-center gap-1 rounded-chip border border-border-subtle bg-surface px-2 py-0.5 text-xs hover:border-border-strong cursor-pointer" onClick={() => {}}>
                      {item.title}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {concept.contrasts.length > 0 && (
              <>
                <dt className="text-xs text-text-muted">Contrasts with</dt>
                <dd className="flex flex-wrap gap-1">
                  {concept.contrasts.map((item) => (
                    <span key={item.id} className="inline-flex min-h-9 items-center gap-1 rounded-chip border border-border-subtle bg-surface px-2 py-0.5 text-xs hover:border-border-strong cursor-pointer" onClick={() => {}}>
                      {item.title}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {concept.children.length > 0 && (
              <>
                <dt className="text-xs text-text-muted">Subtopics</dt>
                <dd className="flex flex-wrap gap-1">
                  {concept.children.map((item) => (
                    <span key={item.id} className="inline-flex min-h-9 items-center gap-1 rounded-chip border border-border-subtle bg-surface px-2 py-0.5 text-xs hover:border-border-strong cursor-pointer" onClick={() => {}}>
                      {item.title}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {concept.timeline.length > 0 && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-text-muted mb-1">Evidence timeline</h3>
          <ul className="divide-y divide-border-subtle border-y border-border-subtle max-h-[300px] overflow-y-auto">
            {concept.timeline.slice(0, 10).map((item) => (
              <li key={item.id} className="py-2 text-sm">
                <p className="font-medium">
                  {item.correct === null ? "Seen" : item.correct ? "Correct" : "Incorrect"}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  {item.activityTitle ? ` · ${item.activityTitle}` : ""}
                  {item.questionType ? ` · ${item.questionType}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {concept.practice.length > 0 && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-text-muted mb-1">Practice bank</h3>
          <ul className="space-y-2">
            {concept.practice.map((item) => (
              <li key={item.id} className="py-1.5 border-b border-border-subtle last:border-0">
                <p className="text-sm">{item.prompt}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {item.type} · {item.marks} mark{item.marks === 1 ? "" : "s"} · {item.verified ? "Verified" : "Unverified"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
