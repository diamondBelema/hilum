import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Layout,
  Maximize2,
  Minus,
  Plus,
  Target,
  TreePine,
  X,
  Zap,
} from "lucide-react";
import { forceCollide, forceCenter, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { api, type ConceptDetail, type ConceptNode, type ConceptSummary, type Course } from "../api.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { MasteryRing } from "../components/MasteryRing.tsx";
import { Banner, Chip, EmptyState, Skeleton } from "../components/ui.tsx";
import { defaultCourse } from "../lib/courses.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Sheet } from "../components/Sheet.tsx";

type EdgeView = { from: string; to: string; type: string };
type Point = { x: number; y: number };

const CANVAS = 720;
const CENTER = CANVAS / 2;
const MAX_NEIGHBORHOOD = 25;
const MAX_OVERVIEW = 300;
const LINK_DISTANCE = 140;
const CHAR_PER_LINE = 18;
const LABEL_MAX_LINES = 2;

// Node diameter (px) by exam weight, three steps. Keeps nodes 28-44px wide.
const NODE_DIAMETER = { low: 28, mid: 36, high: 44 } as const;

function weightClass(weight: number): keyof typeof NODE_DIAMETER {
  if (weight >= 0.4) return "high";
  if (weight >= 0.2) return "mid";
  return "low";
}

function nodeRadius(weight: number): number {
  return NODE_DIAMETER[weightClass(weight)] / 2;
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

// Split a title into at most LABEL_MAX_LINES lines of ~CHAR_PER_LINE chars.
function wrapLabel(title: string): string {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (trial.length <= CHAR_PER_LINE) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word.length > CHAR_PER_LINE ? word.slice(0, CHAR_PER_LINE) : word;
    }
    if (lines.length === LABEL_MAX_LINES - 1 && current) {
      // final line gets the rest, truncated
      break;
    }
  }
  if (current && lines.length < LABEL_MAX_LINES) lines.push(current);
  if (lines.length >= LABEL_MAX_LINES && words.join(" ").length > lines.join(" ").length) {
    lines[LABEL_MAX_LINES - 1] = lines[LABEL_MAX_LINES - 1].trimEnd() + "…";
  }
  return lines.join("\n");
}

function estimateLabelBox(diameter: number): { width: number; height: number } {
  const width = clamp(diameter, 110, 170);
  const height = 14 * LABEL_MAX_LINES + 10; // two lines + padding
  return { width, height };
}

// Greedy label placement: avoid overlaps, clamp inside the canvas.
function placeLabels(
  nodes: { id: string; x: number; y: number; diameter: number }[],
  canvas: number,
): Map<string, { x: number; y: number; width: number; height: number }> {
  const placed = new Map<string, { x: number; y: number; width: number; height: number }>();
  const heavier = [...nodes].sort((a, b) => b.diameter - a.diameter);
  for (const node of heavier) {
    const box = estimateLabelBox(node.diameter);
    const pad = 6;
    let x = clamp(node.x - box.width / 2, pad, canvas - box.width - pad);
    let y = clamp(node.y + node.diameter / 2 + 6, pad, canvas - box.height - pad);
    let attempts = 0;
    while (attempts < 6) {
      const overlap = [...placed.values()].some(
        (b) =>
          x < b.x + b.width && x + box.width > b.x && y < b.y + b.height && y + box.height > b.y,
      );
      if (!overlap) break;
      y += box.height + 6;
      if (y > canvas - box.height - pad) {
        y = clamp(node.y - node.diameter / 2 - box.height - 6, pad, canvas - box.height - pad);
        break;
      }
      attempts += 1;
    }
    placed.set(node.id, { x, y, width: box.width, height: box.height });
  }
  return placed;
}

// Run d3-force to a bounded stable state, return positions in canvas unit space.
type GraphNode = { id: string; x?: number; y?: number };

function forceLayout(nodes: ConceptSummary[], edges: EdgeView[]): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return positions;

  const radiusById = new Map(nodes.map((node) => [node.id, nodeRadius(node.examWeight) + 8]));
  const nodeData: GraphNode[] = nodes.map((node) => ({ id: node.id }));
  const linkData: { source: string; target: string }[] = edges
    .filter((e) => radiusById.has(e.from) && radiusById.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }));

  const sim = forceSimulation(nodeData as unknown as SimulationNodeDatum[])
    .force(
      "link",
      ((forceLink(linkData as any) as any)
        .id((d: GraphNode) => d.id)
        .distance(LINK_DISTANCE)
        .strength(1)) as any,
    )
    .force("charge", ((forceManyBody() as any).strength(-140).distanceMax(260)) as any)
    .force("center", (forceCenter(CENTER, CENTER) as any) as any)
    .force(
      "collision",
      ((forceCollide() as any).radius((d: GraphNode) => (radiusById.get(d.id) ?? 16) + 6).iterations(2)) as any,
    )
    .stop();

  for (let i = 0; i < 240; i += 1) sim.tick();
  for (const d of nodeData) {
    const x = typeof d.x === "number" ? d.x : CENTER;
    const y = typeof d.y === "number" ? d.y : CENTER;
    positions.set(d.id, { x: clamp(x, 0, CANVAS), y: clamp(y, 0, CANVAS) });
  }
  return positions;
}

function contentBounds(
  positions: Map<string, Point>,
  nodes: ConceptSummary[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const node of nodes) {
    const p = positions.get(node.id);
    if (!p) continue;
    const r = nodeRadius(node.examWeight) + 24; // + label buffer
    minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r);
    maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r);
    any = true;
  }
  if (!any) return null;
  return { minX, minY, maxX, maxY };
}

export function GraphScreen({
  courses,
  onStudy,
}: {
  courses: Course[];
  onStudy: (course: string, conceptId: string) => void;
}) {
  const [courseCode, setCourseCode] = useState(defaultCourse(courses, "concepts"));
  const [mode, setMode] = useState<"neighborhood" | "overview" | "tree" | "frontier">("neighborhood");
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<{ nodes: ConceptSummary[]; edges: EdgeView[] } | null>(null);
  const [tree, setTree] = useState<ConceptNode[] | null>(null);
  const [frontier, setFrontier] = useState<{ concept: ConceptSummary; rank: number; reason: string }[] | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [fitPending, setFitPending] = useState(true);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const didDrag = useRef(false);
  const positionsRef = useRef<Map<string, Point>>(new Map());

  useEffect(() => {
    if (!courseCode && courses[0]) setCourseCode(defaultCourse(courses, "concepts"));
  }, [courses, courseCode]);

  useEffect(() => {
    setRootId(null); setSelectedId(null); setDetail(null); setSearch("");
    setView(null); setTree(null); setFrontier(null);
    setZoom(1); setPan({ x: 0, y: 0 }); setFitPending(true);
  }, [courseCode]);

  useEffect(() => {
    if (!courseCode) { setLoading(false); setView(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    Promise.all([api.graph(courseCode), api.masteryTree(courseCode), api.frontier(courseCode, 6)])
      .then(([graph, treeData, frontierData]) => {
        if (cancelled) return;
        setView(graph); setTree(treeData); setFrontier(frontierData);
        if (!rootId && graph.nodes.length > 0) {
          const flagged = graph.nodes.find((node) => node.lecturerFlag) ?? graph.nodes[0];
          setRootId(flagged.id);
        }
        setFitPending(true);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [courseCode, reloadKey]);

  useEffect(() => {
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "activity" || event.type === "session" || event.type === "graded") {
        setReloadKey((key) => key + 1);
      }
    });
    return unsubscribe;
  }, []);

  const nodes = view?.nodes ?? [];
  const edges = view?.edges ?? [];
  const root = nodes.find((node) => node.id === rootId) ?? nodes[0] ?? null;

  const layout = useMemo(() => {
    if (mode === "neighborhood" && root) {
      const adjacency = new Map<string, Set<string>>();
      for (const node of nodes) adjacency.set(node.id, new Set());
      for (const edge of edges) {
        adjacency.get(edge.from)?.add(edge.to);
        adjacency.get(edge.to)?.add(edge.from);
      }
      const distance = new Map<string, number>([[root.id, 0]]);
      const queue = [root.id];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const depth = distance.get(id) ?? 0;
        if (depth >= 2) continue;
        for (const next of adjacency.get(id) ?? []) {
          if (!distance.has(next)) { distance.set(next, depth + 1); queue.push(next); }
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
      const positions = forceLayout(visible, edges);
      positionsRef.current = positions;
      return { visible, positions, allCount: all.length, capped: all.length > visible.length };
    }
    const visible = mode === "overview" ? nodes.slice(0, MAX_OVERVIEW) : nodes;
    const positions = forceLayout(visible, edges);
    positionsRef.current = positions;
    return { visible, positions, allCount: nodes.length, capped: nodes.length > visible.length };
  }, [adjacencyVersion(nodes, edges), mode, nodes, edges, root]);

  function adjacencyVersion(nodes: ConceptSummary[], edges: EdgeView[]): string {
    return `${nodes.length}:${edges.length}:${rootId ?? "-"}`;
  }

  // Auto-fit content on first render of a new graph.
  useEffect(() => {
    if (!fitPending || !root) return;
    const bounds = contentBounds(layout.positions, layout.visible);
    if (!bounds) return;
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const pad = 40;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    const scale = Math.min((rect.width - pad * 2) / contentW, (rect.height - pad * 2) / contentH, 1.6);
    const nextZoom = clamp(scale, 0.6, 1.6);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    setZoom(nextZoom);
    zoomRef.current = nextZoom;
    setPan({ x: rect.width / 2 - cx * nextZoom, y: rect.height / 2 - cy * nextZoom });
    setFitPending(false);
  }, [fitPending, root, layout]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * CANVAS;
      const py = ((event.clientY - rect.top) / rect.height) * CANVAS;
      const previous = zoomRef.current;
      const next = clamp(previous * (event.deltaY < 0 ? 1.15 : 0.87), 0.5, 3.2);
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

  const transformed = useMemo(() => {
    const map = new Map<string, Point>();
    for (const [id, point] of layout.positions) {
      map.set(id, { x: point.x * zoom + pan.x, y: point.y * zoom + pan.y });
    }
    return map;
  }, [layout.positions, zoom, pan]);

  const visibleIds = new Set(layout.visible.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  const rootTitle = root?.title ?? "";
  const extra = layout.allCount - layout.visible.length;
  const showLabels = mode !== "overview" || zoom >= 1.1;

  async function loadDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    try { setDetail(await api.concept(id)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  function openNode(node: ConceptSummary) {
    if (didDrag.current) return;
    setRootId(node.id);
    void loadDetail(node.id);
  }

  function resetView() {
    setZoom(1); zoomRef.current = 1; setPan({ x: 0, y: 0 }); setFitPending(true);
  }

  const drawerOpen = Boolean(selectedId && detail);

  const labelPlacement = useMemo(() => {
    if (!showLabels) return new Map<string, { x: number; y: number; width: number; height: number }>();
    const labeled = layout.visible.map((node) => ({
      id: node.id,
      x: transformed.get(node.id)?.x ?? 0,
      y: transformed.get(node.id)?.y ?? 0,
      diameter: NODE_DIAMETER[weightClass(node.examWeight)] * zoom,
    }));
    return placeLabels(labeled, CANVAS * zoom);
  }, [layout.visible, transformed, zoom, showLabels]);

  const onNodePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
    },
    [],
  );

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
                <option key={item.code} value={item.code}>{item.title}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-2">
            {[
            { id: "neighborhood", label: "Neighborhood", icon: Target },
            { id: "overview", label: "Overview", icon: Layout },
            { id: "tree", label: "Tree", icon: TreePine },
            { id: "frontier", label: "Frontier", icon: Zap },
          ].map((m) => (
            <Button
              key={m.id}
              variant={mode === m.id ? "primary" : "secondary"}
              onClick={() => { setMode(m.id as typeof mode); setFitPending(true); }}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4"><Banner tone="error">{error}</Banner></div>}

      {loading && !view && !tree && !frontier ? (
        <div className="mt-6 space-y-4"><Skeleton lines={3} /><Skeleton lines={8} /></div>
      ) : courses.length === 0 ? (
        <div className="mt-6"><EmptyState title="No courses yet">Add a course, then concepts appear in the graph.</EmptyState></div>
      ) : mode === "tree" ? (
        <TreeView nodes={tree ?? []} onOpen={openNode} onStudy={onStudy} course={courseCode} />
      ) : mode === "frontier" ? (
        <FrontierView items={frontier ?? []} onOpen={openNode} onStudy={onStudy} course={courseCode} />
      ) : (
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
              <button
                type="button"
                onClick={() => {
                  const match = nodes.find((node) => node.title.toLowerCase().includes(search.trim().toLowerCase()));
                  if (!match) return;
                  const position = layout.positions.get(match.id);
                  if (!position) return;
                  const nextZoom = 1.6;
                  setZoom(nextZoom); zoomRef.current = nextZoom;
                  setPan({ x: CENTER - position.x * nextZoom, y: CENTER - position.y * nextZoom });
                  setRootId(match.id); void loadDetail(match.id);
                }}
                className="min-h-11 px-3 rounded-control border border-border bg-surface text-sm"
              >
                Focus
              </button>
              {search.trim() && (
                <button type="button" onClick={() => setSearch("")} className="min-h-11 px-3 rounded-control border border-border bg-surface text-sm">
                  Clear
                </button>
              )}
              <p className="text-xs text-text-muted">Search centers a topic and zooms in.</p>
            </div>
          )}

          <div
            ref={containerRef}
            className="relative aspect-square w-full touch-none overflow-hidden rounded-panel border border-border-subtle bg-surface"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if ((event.target as HTMLElement).closest("button, input, select, a")) return;
              dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
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
              setTimeout(() => { didDrag.current = false; }, 0);
            }}
            onPointerCancel={() => { dragRef.current = null; }}
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
                const startRadius = nodeRadius(fromNode.examWeight) * zoom + 4;
                const endRadius = nodeRadius(toNode.examWeight) * zoom + 4;
                const x1 = from.x + ux * startRadius;
                const y1 = from.y + uy * startRadius;
                const x2 = to.x - ux * endRadius;
                const y2 = to.y - uy * endRadius;
                const selected = selectedId === edge.from || selectedId === edge.to;
                const stroke = selected ? "var(--primary)" : "var(--border-strong)";
                const width = selected ? 2.5 : 1.5;
                return (
                  <g key={`${edge.from}-${edge.to}-${edge.type}`}>
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
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
              <IconButton label="Zoom in" onClick={() => setZoom((value) => clamp(value * 1.2, 0.5, 3.2))}>
                <Plus aria-hidden="true" className="size-5" />
              </IconButton>
              <IconButton label="Zoom out" onClick={() => setZoom((value) => clamp(value / 1.2, 0.5, 3.2))}>
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
              const diameter = NODE_DIAMETER[weightClass(node.examWeight)] * zoom;
              const radius = diameter / 2;
              const labelBox = labelPlacement.get(node.id);
              const labelVisible = showLabels && Boolean(labelBox);
              return (
                <div
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(position.x / CANVAS) * 100}%`, top: `${(position.y / CANVAS) * 100}%` }}
                  onPointerDown={onNodePointerDown}
                >
                  <button
                    type="button"
                    onClick={() => openNode(node)}
                    aria-label={`${node.title}, ${stateLabel(node.mastery.state)}`}
                    className={`relative flex min-h-[${Math.max(28, diameter)}px] min-w-[${Math.max(28, diameter)}px] flex-col items-center rounded-full p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      selected ? "outline-2 outline-offset-2 outline-primary" : ""
                    }`}
                  >
                    <MasteryRing
                      state={node.mastery.state}
                      size={diameter * 0.78}
                      label={`${node.title}: ${stateLabel(node.mastery.state)}`}
                    />
                    {labelVisible && labelBox && (
                      <span
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 mt-1.5 rounded bg-bg px-1.5 py-0.5 text-xs text-text leading-none"
                        style={{
                          width: `${labelBox.width}px`,
                          textShadow: `0 0 4px var(--bg)`,
                          WebkitLineClamp: LABEL_MAX_LINES,
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {wrapLabel(node.title)}
                      </span>
                    )}
                  </button>
                  {labelVisible && labelBox && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{
                        top: `${(labelBox.y / CANVAS) * 100}%`,
                        width: `${labelBox.width}px`,
                        height: `${labelBox.height}px`,
                      }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              {mode === "neighborhood"
                ? `2-hop neighborhood of ${rootTitle || "this topic"} (${layout.visible.length}${extra > 0 ? ` of ${layout.allCount}` : ""} topics)`
                : `${layout.visible.length}${extra > 0 ? ` of ${layout.allCount}` : ""} topics`}
            </p>
            {mode === "neighborhood" && extra > 0 && (
              <Button variant="secondary" onClick={() => setMode("overview")}>+{extra} more</Button>
            )}
            {mode === "overview" && extra > 0 && (
              <span className="text-xs text-warning">Showing the first {MAX_OVERVIEW} topics.</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">
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
          <svg width="24" height="8" aria-hidden="true"><line x1="0" y1="0" x2="24" y2="0" stroke="var(--border-strong)" strokeWidth="1.5" /><line x1="12" y1="-4" x2="12" y2="12" stroke="var(--border-strong)" strokeWidth="1.5" /></svg>
          Contrasts with
        </span>
        <span className="flex items-center gap-1.5">
          <MasteryRing state="familiar" size={16} />
          Shape and fill show mastery · dashed outline = review due
        </span>
      </div>

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

function TreeView({
  nodes,
  onOpen,
  onStudy,
  course,
}: {
  nodes: ConceptNode[];
  onOpen: (node: ConceptSummary) => void;
  onStudy: (course: string, conceptId: string) => void;
  course: string;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Build a nested tree from the flat depth-ordered list returned by api.masteryTree.
  const roots: ConceptNode[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenMap = new Map<string, ConceptNode[]>();
  let lastByDepth: Map<number, ConceptNode> = new Map();
  for (const node of nodes) {
    // nearest open ancestor is the last seen node at depth-1
    const parent = lastByDepth.get(node.depth - 1) ?? null;
    if (!parent) roots.push(node);
    else {
      const list = childrenMap.get(parent.id) ?? [];
      list.push(node);
      childrenMap.set(parent.id, list);
    }
    lastByDepth.set(node.depth, node);
    // clear deeper levels since we've moved on
    for (const [d] of lastByDepth) if (d > node.depth) lastByDepth.delete(d);
  }

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const render = (list: ConceptNode[]) => (
    <ul className="space-y-1 pl-4">
      {list.map((node) => {
        const kids = (childrenMap.get(node.id) ?? []).length > 0;
        const open = openIds.has(node.id);
        return (
          <li key={node.id} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => toggle(node.id)}
              disabled={!kids}
              aria-label={kids ? (open ? "Collapse" : "Expand") : "No subtopics"}
              className={`shrink-0 size-5 rounded border border-border-subtle bg-surface text-xs text-text-muted flex items-center justify-center ${
                !kids ? "opacity-40" : ""
              }`}
            >
              {kids ? (open ? "▾" : "▸") : ""}
            </button>
            <button
              type="button"
              onClick={() => { onOpen(node); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-2 min-w-0 flex-1"
            >
              <MasteryRing state={node.mastery.state} size={20} label={`${node.title}: ${stateLabel(node.mastery.state)}`} />
              <span className="truncate text-sm text-text">{node.title}</span>
              {node.mastery.state === "decayed" && <span className="text-xs text-warning" title="Review due">review due</span>}
            </button>
            <span className="text-xs text-text-muted">
              {node.rollup.mastered + node.rollup.understood + node.rollup.familiar + node.rollup.unseen === 0
                ? "No evidence yet"
                : `${node.rollup.mastered} of ${node.rollup.total} mastered`}
            </span>
            {kids && open && render(childrenMap.get(node.id) ?? [])}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">Indented topic tree. Tap a topic for its drawer; chevrons expand subtopics.</p>
      <div className="border border-border-subtle rounded-panel bg-surface p-3 max-h-[70vh] overflow-y-auto">
        {roots.length === 0 ? (
          <p className="text-xs text-text-muted">No topics yet.</p>
        ) : (
          render(roots)
        )}
      </div>
    </div>
  );
}

function FrontierView({
  items,
  onOpen,
  onStudy,
  course,
}: {
  items: { concept: ConceptSummary; rank: number; reason: string }[];
  onOpen: (node: ConceptSummary) => void;
  onStudy: (course: string, conceptId: string) => void;
  course: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">Topics ready to study next — prerequisites met, ranked by exam weight and review need.</p>
      <div className="border border-border-subtle rounded-panel bg-surface p-3 max-h-[70vh] overflow-y-auto space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-text-muted">No topics ready yet. Finish prerequisites or wait for a review to come due.</p>
        ) : (
          items.map((item) => (
            <div key={item.concept.id} className="flex items-center gap-3 p-2 rounded-control border border-transparent hover:border-border-subtle cursor-pointer hover:bg-surface-2 transition-colors" onClick={() => onOpen(item.concept)}>
              <MasteryRing state={item.concept.mastery.state} size={24} label={`${item.concept.title}: ${stateLabel(item.concept.mastery.state)}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{item.concept.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">{item.reason}</p>
              </div>
              <Button variant="primary" className="text-xs px-2" onClick={(e) => { e.stopPropagation(); void onStudy(course, item.concept.id); }}>
                Study this
              </Button>
            </div>
          ))
        )}
      </div>
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
            {concept.mastery.evidenceCount > 0 ? ` · ${concept.mastery.evidenceCount} evidence` : ""}
            {concept.mastery.overdue && concept.mastery.decayDueAt ? ` · overdue` : ""}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" onClick={onStudy}>Study this</Button>
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

      {(concept.prerequisites.length > 0 || concept.related.length > 0 || concept.contrasts.length > 0 || concept.children.length > 0) && (
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
                <p className="font-medium">{item.correct === null ? "Seen" : item.correct ? "Correct" : "Incorrect"}</p>
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
