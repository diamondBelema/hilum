import { useEffect, useState, type ReactNode } from "react";
import { api, type ConceptDetail, type ConceptSummary } from "../api.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Button } from "../components/Button.tsx";
import { MasteryRing } from "../components/MasteryRing.tsx";
import { Banner, Chip, EmptyState, Skeleton } from "../components/ui.tsx";

type EdgeView = { from: string; to: string; type: string };
type GraphView = { nodes: ConceptSummary[]; edges: EdgeView[] };

const NODE_RADIUS_BY_WEIGHT = { low: 22, mid: 28, high: 36 };
const INNER_R = 150;
const OUTER_R = 280;
const CANVAS = 720;
const CENTER = CANVAS / 2;

const STATE_COLORS: Record<string, string> = {
  unseen: "text-text-muted",
  familiar: "text-primary-soft",
  understood: "text-primary",
  mastered: "text-success",
  decayed: "text-warning",
};

function weightClass(w: number): "low" | "mid" | "high" {
  if (w >= 0.15) return "high";
  if (w >= 0.06) return "mid";
  return "low";
}

function nodeFill(state: string): string {
  switch (state) {
    case "mastered": return "fill-primary fill-opacity-90";
    case "understood": return "fill-primary fill-opacity-55";
    case "familiar": return "fill-primary fill-opacity-25";
    case "decayed": return "fill-warning fill-opacity-45";
    default: return "fill-none";
  }
}

function nodeStroke(state: string, overdue: boolean): string {
  const base = STATE_COLORS[state] ?? "text-text-muted";
  const dash = overdue ? "stroke-dasharray=\"4 3\"" : "";
  return `stroke-current ${base} stroke-2 ${dash}`;
}

function angleFor(index: number, total: number): number {
  return (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
}

function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function GraphScreen({
  courses,
  onStudy,
}: {
  courses: { code: string; title: string }[];
  onStudy: (course: string, conceptId: string) => void;
}) {
  const [courseCode, setCourseCode] = useState(courses[0]?.code ?? "");
  const [mode, setMode] = useState<"neighborhood" | "overview">("neighborhood");
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<GraphView | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!courseCode && courses[0]) setCourseCode(courses[0].code);
  }, [courses, courseCode]);

  useEffect(() => {
    if (!courseCode) {
      setLoading(false);
      setView(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.graph(courseCode, mode === "overview" ? undefined : undefined)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        if (!rootId && data.nodes.length > 0) setRootId(data.nodes[0].id);
      })
      .catch((err) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [courseCode, mode, reloadKey]);

  const course = courses.find((item) => item.code === courseCode);
  const nodes = view?.nodes ?? [];
  const edges = view?.edges ?? [];

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const node of nodes) adj.set(node.id, new Set());
  for (const edge of edges) {
    const a = adj.get(edge.from) ?? new Set();
    const b = adj.get(edge.to) ?? new Set();
    a.add(edge.to);
    b.add(edge.from);
    adj.set(edge.from, a);
    adj.set(edge.to, b);
  }

  // Neighborhood layout: root center, 1-hop inner ring, 2-hop outer ring
  let positions = new Map<string, { x: number; y: number }>();
  let neighborhoodNodes: ConceptSummary[] = [];
  let neighborhoodEdges: EdgeView[] = [];

  if (mode === "neighborhood" && rootId && nodes.length > 0) {
    const root = nodes.find((n) => n.id === rootId) ?? nodes[0];
    const oneHop = new Set<string>();
    const twoHop = new Set<string>();
    for (const edge of edges) {
      if (edge.from === root.id) oneHop.add(edge.to);
      if (edge.to === root.id) oneHop.add(edge.from);
    }
    for (const edge of edges) {
      if (oneHop.has(edge.from) && edge.to !== root.id && !oneHop.has(edge.to)) twoHop.add(edge.to);
      if (oneHop.has(edge.to) && edge.from !== root.id && !oneHop.has(edge.from)) twoHop.add(edge.from);
    }
    neighborhoodNodes = [root, ...nodes.filter((n) => oneHop.has(n.id) || twoHop.has(n.id))];
    const nIds = new Set(neighborhoodNodes.map((n) => n.id));
    neighborhoodEdges = edges.filter((e) => nIds.has(e.from) && nIds.has(e.to));

    positions = new Map();
    positions.set(root.id, { x: CENTER, y: CENTER });

    const oneList = Array.from(oneHop);
    oneList.forEach((id, i) => {
      const p = polar(CENTER, CENTER, INNER_R, angleFor(i, oneList.length));
      positions.set(id, p);
    });
    const twoList = Array.from(twoHop);
    twoList.forEach((id, i) => {
      const p = polar(CENTER, CENTER, OUTER_R, angleFor(i, twoList.length));
      positions.set(id, p);
    });
  } else if (mode === "overview") {
    neighborhoodNodes = nodes;
    neighborhoodEdges = edges;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((node, i) => {
      const cx = 60 + (i % cols) * 150;
      const cy = 60 + Math.floor(i / cols) * 150;
      positions.set(node.id, { x: cx, y: cy });
    });
  }

  const filteredNodes = search.length
    ? neighborhoodNodes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase()))
    : neighborhoodNodes;

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

  function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, type: string): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const rFrom = 26;
    const rTo = 26;
    const x1 = from.x + ux * rFrom;
    const y1 = from.y + uy * rFrom;
    const x2 = to.x - ux * rTo;
    const y2 = to.y - uy * rTo;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpX = -uy * 20;
    const perpY = ux * 20;
    return `M ${x1} ${y1} Q ${midX + perpX} ${midY + perpY} ${x2} ${y2}`;
  }

  function edgeStroke(type: string): string {
    switch (type) {
      case "parent": return "stroke-text-muted stroke-1";
      case "prerequisite": return "stroke-text-muted stroke-1 stroke-dasharray=\"5 3\"";
      case "related": return "stroke-text-muted stroke-1 stroke-dasharray=\"2 2\"";
      case "contrasts_with": return "stroke-danger stroke-1 stroke-dasharray=\"6 2\"";
      default: return "stroke-text-muted stroke-1";
    }
  }

  const drawerOpen = Boolean(selectedId && detail);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="mt-1 text-sm text-text-muted">
            Topics and how they connect. Tap a node to open its citations, evidence and practice bank.
          </p>
        </div>
        {courses.length > 0 && (
          <label className="block text-sm font-medium">
            Course
            <select
              value={courseCode}
              onChange={(event) => {
                setCourseCode(event.target.value);
                setSelectedId(null);
                setRootId(null);
              }}
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
          <Button
            variant={mode === "neighborhood" ? "primary" : "secondary"}
            onClick={() => setMode("neighborhood")}
          >
            Neighborhood
          </Button>
          <Button
            variant={mode === "overview" ? "primary" : "secondary"}
            onClick={() => setMode("overview")}
          >
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
          <div className="mt-6 relative">
            {mode === "overview" && (
              <div className="absolute left-0 top-0 z-10 flex items-center gap-2 bg-surface px-3 py-1.5 rounded-control border border-border-subtle shadow-sm">
                <label className="text-xs text-text-muted">Search</label>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-[180px] rounded-control border border-border bg-surface px-2 py-1 text-sm focus:border-primary-soft"
                  placeholder="Filter concepts…"
                />
              </div>
            )}
            <div
              className="relative w-full aspect-square min-h-[560px] border border-border-subtle rounded-panel bg-surface"
            >
              <svg
                width={CANVAS}
                height={CANVAS}
                className="absolute inset-0"
                viewBox={`0 0 ${CANVAS} ${CANVAS}`}
              >
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="currentColor" />
                  </marker>
                </defs>
                {neighborhoodEdges
                  .filter(
                    (e) =>
                      mode !== "overview" ||
                      (!search.length ||
                        neighborhoodNodes.some((n) => n.id === e.from && n.title.toLowerCase().includes(search.toLowerCase())) ||
                        neighborhoodNodes.some((n) => n.id === e.to && n.title.toLowerCase().includes(search.toLowerCase()))),
                  )
                  .map((edge) => {
                    const fromNode = neighborhoodNodes.find((n) => n.id === edge.from);
                    const toNode = neighborhoodNodes.find((n) => n.id === edge.to);
                    const fromPos = positions.get(edge.from);
                    const toPos = positions.get(edge.to);
                    if (!fromPos || !toPos || !fromNode || !toNode) return null;
                    const show =
                      mode === "neighborhood"
                        ? neighborhoodNodes.some((n) => n.id === edge.from || n.id === edge.to)
                        : (!search.length ||
                            fromNode.title.toLowerCase().includes(search.toLowerCase()) ||
                            toNode.title.toLowerCase().includes(search.toLowerCase()));
                    if (!show) return null;
                    const isSelected = selectedId === edge.from || selectedId === edge.to;
                    return (
                      <path
                        key={`${edge.from}-${edge.to}-${edge.type}`}
                        d={edgePath(fromPos, toPos, edge.type)}
                        className={`${edgeStroke(edge.type)} ${
                          isSelected ? "stroke-primary" : ""
                        } ${selectedId && (edge.from === selectedId || edge.to === selectedId) ? "stroke-2" : "stroke-1"}`}
                        markerEnd={edge.type === "prerequisite" ? "url(#arrow)" : undefined}
                      />
                    );
                  })}
                {filteredNodes.map((node) => {
                  const pos = positions.get(node.id);
                  if (!pos) return null;
                  const overdue = node.mastery.overdue;
                  const r = NODE_RADIUS_BY_WEIGHT[weightClass(node.examWeight)];
                  const highlighted = selectedId === node.id || rootId === node.id;
                  const inSearch = !search.length || node.title.toLowerCase().includes(search.toLowerCase());
                  if (!inSearch) return null;
                  return (
                    <g
                      key={node.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void loadDetail(node.id);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={r}
                        className={`${nodeFill(node.mastery.state)} ${nodeStroke(node.mastery.state, overdue)} transition-all ${
                          highlighted ? "ring-2 ring-primary-soft" : ""
                        }`}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + r + 14}
                        textAnchor="middle"
                        className={`text-xs ${node.mastery.state === "mastered" ? "font-semibold text-text" : "text-text-muted"} leading-none`}
                        style={{ maxWidth: `${r * 2.2}px` }}
                      >
                        {node.title}
                      </text>
                      {highlighted && (
                        <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="2" />
                      )}
                    </g>
                  );
                })}
              </svg>
              {mode === "neighborhood" && rootId && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center gap-1 pointer-events-auto">
                    <MasteryRing state={nodes.find((n) => n.id === rootId)?.mastery.state ?? "unseen"} size={40} />
                    <span className="text-xs font-semibold text-text truncate w-32 text-center">
                      {nodes.find((n) => n.id === rootId)?.title ?? "Root"}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-text-muted text-center">
              {mode === "neighborhood"
                ? `2-hop neighborhood of {rootId ? nodes.find((n) => n.id === rootId)?.title ?? "" : ""} ({neighborhoodNodes.length} topics)`
                : `${neighborhoodNodes.length} topics · search to filter`}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="size-3 shrink-0 border border-border-subtle rounded-full" /> Parent
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 shrink-0 border-b border-border-subtle w-4" /> Prerequisite
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 shrink-0 border-t border-t border-dotted border-border-subtle w-4" /> Related
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 shrink-0 border border-danger w-4" /> Contrasts with
            </span>
          </div>
        </>
      )}

      <Sheet
        open={drawerOpen}
        title={detail?.title ?? "Topic"}
        onClose={() => setSelectedId(null)}
        className="w-[420px]"
      >
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

function Sheet({
  open,
  title,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="fixed inset-0 bg-bg bg-opacity-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`w-full max-w-md bg-surface border-t border-border-subtle shadow-2xl rounded-t-panel p-6 ${className}`}>
        <div className="flex items-baseline justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose}>
            <span className="sr-only">Close</span>
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
