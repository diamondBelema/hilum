import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  forceCollide,
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import type { ConceptSummary } from "../api.ts";

type GraphEdge = { from: string; to: string; type: string };

const EDGE_TYPE_SHORT = (type: string): string => {
  if (type === "parent") return "▸";
  if (type === "prerequisite") return "pre";
  if (type === "related") return "rel";
  if (type === "contrasts_with") return "↔";
  return type;
};

type GraphCanvasProps = {
  nodes: ConceptSummary[];
  edges: GraphEdge[];
  width: number;
  height: number;
  course?: string;
  onStudy?: (course: string, conceptId: string) => void;
  onNodeSelect?: (id: string | null) => void;
  selectedId?: string | null;
  focusNodeId?: string | null;
  resetViewToken?: number;
  sessionId?: string | null;
  sessionConceptIds?: Set<string>;
  ambient?: boolean;
};

// ---------------------------------------------------------------------------
// CSS variable readers. Custom properties keep the `light-dark()` expression
// in their computed value, but canvas paints do not resolve that expression
// when it is assigned directly to fillStyle/strokeStyle.
// ---------------------------------------------------------------------------

const colorCache = new Map<string, string>();

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function cssColor(name: string, fallback: string): string {
  const themeKey = `${document.documentElement.dataset.theme ?? "auto"}:${window.matchMedia("(prefers-color-scheme: dark)").matches}`;
  const cacheKey = `${themeKey}:${name}`;
  const cached = colorCache.get(cacheKey);
  if (cached) return cached;

  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color || fallback;
  probe.remove();
  colorCache.set(cacheKey, resolved);
  return resolved;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINK_DISTANCE = 100;
const CHARGE_STRENGTH = -240;
const NODE_MIN_RADIUS = 6;
const NODE_MAX_RADIUS = 18;
const LABEL_TRUNCATE = 28;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;

const MASTERY_FILL: Record<string, number> = {
  unseen: 0,
  familiar: 0.4,
  understood: 0.75,
  mastered: 1,
  decayed: 1,
};

const MASTERY_STROKE_VAR: Record<string, string> = {
  unseen: "--text-muted",
  familiar: "--primary",
  understood: "--primary",
  mastered: "--primary",
  decayed: "--warning",
};

const EDGE_DASH: Record<string, string | undefined> = {
  prerequisite: "6 4",
  related: "2 5",
  contrasts_with: undefined,
};

const EDGE_LINK_DISTANCE: Record<string, number> = {
  parent: 80,
  prerequisite: 100,
  related: 100,
  contrasts_with: 100,
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function computeDegree(
  nodes: ConceptSummary[],
  edges: GraphEdge[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const node of nodes) map.set(node.id, 0);
  for (const edge of edges) {
    map.set(edge.from, (map.get(edge.from) ?? 0) + 1);
    map.set(edge.to, (map.get(edge.to) ?? 0) + 1);
  }
  return map;
}

function computeRadius(degreeById: Map<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  let minDeg = Infinity;
  let maxDeg = -Infinity;
  for (const d of degreeById.values()) {
    minDeg = Math.min(minDeg, d);
    maxDeg = Math.max(maxDeg, d);
  }
  const span = maxDeg - minDeg || 1;
  for (const [id, deg] of degreeById) {
    const t = (deg - minDeg) / span;
    map.set(id, NODE_MIN_RADIUS + t * (NODE_MAX_RADIUS - NODE_MIN_RADIUS));
  }
  return map;
}

function radiusForNode(node: ConceptSummary, degreeById: Map<string, number>): number {
  const degree = degreeById.get(node.id) ?? 0;
  const degreeRadius = computeRadius(new Map([[node.id, degree]])).get(node.id) ?? NODE_MIN_RADIUS;
  const examWeight = Math.max(0, Math.min(1, node.examWeight / 10));
  return Math.max(degreeRadius, NODE_MIN_RADIUS + examWeight * (NODE_MAX_RADIUS - NODE_MIN_RADIUS));
}

function truncate(title: string, max: number): string {
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "…";
}

// ---------------------------------------------------------------------------
// GraphCanvas
// ---------------------------------------------------------------------------

export function GraphCanvas({
  nodes: nodesProp,
  edges: edgesProp,
  width,
  height,
  course,
  onStudy,
  onNodeSelect,
  selectedId: selectedIdProp,
  focusNodeId: focusNodeIdProp,
  resetViewToken = 0,
  sessionId: sessionIdProp,
  sessionConceptIds: sessionConceptIdsProp,
  ambient = false,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation> | null>(null);
  const rafRef = useRef<number>(0);
  const transformRef = useRef({ k: 1, x: 0, y: 0 });
  const hoveredRef = useRef<string | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPhaseRef = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const pinnedRef = useRef<Set<string>>(new Set());
  const dragStartRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const degreeByIdRef = useRef(computeDegree(nodesProp, edgesProp));
  const radiusByIdRef = useRef(computeRadius(degreeByIdRef.current));

  degreeByIdRef.current = computeDegree(nodesProp, edgesProp);
  radiusByIdRef.current = computeRadius(degreeByIdRef.current);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const lastFocusedRef = useRef<string | null>(null);
  const lastResetTokenRef = useRef(resetViewToken);

  useEffect(() => {
    selectedRef.current = selectedIdProp ?? null;
    draw();
  }, [selectedIdProp]);

  // ---------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodesProp.length === 0) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const nodeData: Array<SimulationNodeDatum & { id: string; radius: number }> = nodesProp.map(
      (node) => ({
        id: node.id,
        radius: radiusForNode(node, degreeByIdRef.current),
        x: width / 2,
        y: height / 2,
        fx: undefined,
        fy: undefined,
      }),
    );

    const nodeIds = new Set(nodeData.map((n) => n.id));
    const linkData = edgesProp
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, type: e.type }));

    const linkForce = forceLink(linkData as any)
      .id((d: any) => d.id)
      .distance((d: any) => {
        const edge = d as any;
        const t = edge?.type;
        if (t && EDGE_LINK_DISTANCE[t] !== undefined) return EDGE_LINK_DISTANCE[t];
        return LINK_DISTANCE;
      })
      .strength(0.8);

    const sim = forceSimulation(nodeData as unknown as SimulationNodeDatum[])
      .force("link", linkForce)
      .force("charge", ((forceManyBody() as any).strength(CHARGE_STRENGTH).distanceMax(600)) as any)
      .force("center", (forceCenter(width / 2, height / 2) as any) as any)
      .force(
        "collision",
        ((forceCollide() as any)
          .radius((d: { radius: number }) => d.radius + 6)
          .iterations(2)) as any,
      )
      .alpha(1)
      .restart();

    simRef.current = sim;

    if (typeof window !== "undefined") {
      (window as any).__hilumGraphTest = {
        getHoveredNodeId: () => hoveredRef.current,
        getSelectedNodeId: () => selectedRef.current,
        getZoom: () => transformRef.current.k,
        getPan: () => ({ x: transformRef.current.x, y: transformRef.current.y }),
      };
    }

    function tick() {
      if (!simRef.current) return;
      simRef.current.tick();
      draw();
      if (simRef.current.alpha() > 0.01) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    draw();
    if (simRef.current.alpha() > 0.01) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      simRef.current?.stop();
      simRef.current = null;
      if (typeof window !== "undefined" && (window as any).__hilumGraphTest) {
        delete (window as any).__hilumGraphTest;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesProp.length, edgesProp.length, width, height]);

  // ---------------------------------------------------------------
  // Focus camera on a node
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!focusNodeIdProp || focusNodeIdProp === lastFocusedRef.current) return;
    const p = nodePos(focusNodeIdProp);
    if (!p) return;
    lastFocusedRef.current = focusNodeIdProp;
    transformRef.current.k = 1.6;
    setZoom(1.6);
    const rect = canvasRef.current!.getBoundingClientRect();
    transformRef.current.x = rect.width / 2 - p.x * 1.6;
    transformRef.current.y = rect.height / 2 - p.y * 1.6;
    setPan({ x: transformRef.current.x, y: transformRef.current.y });
    simRef.current?.alpha(0.4).restart();
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeIdProp, width, height]);

  const setCameraZoom = useCallback(
    (nextZoom: number, sx = width / 2, sy = height / 2) => {
      const previous = transformRef.current.k;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const before = screenToCanvas(sx, sy);
      transformRef.current.k = next;
      transformRef.current.x = sx - before.x * next;
      transformRef.current.y = sy - before.y * next;
      setZoom(next);
      setPan({ x: transformRef.current.x, y: transformRef.current.y });
      if (next !== previous) draw();
    },
    [height, width],
  );

  const resetCamera = useCallback(() => {
    transformRef.current = { k: 1, x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
    lastFocusedRef.current = null;
    draw();
  }, []);

  useEffect(() => {
    if (resetViewToken === lastResetTokenRef.current) return;
    lastResetTokenRef.current = resetViewToken;
    resetCamera();
  }, [resetCamera, resetViewToken]);

  // ---------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const { k, x, y } = transformRef.current;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.translate(x, y);
    ctx.scale(k, k);

    const bg = cssColor("--bg", "#141414");
    const textColor = cssColor("--text", "#e6e6e6");
    const borderSubtle = cssColor("--border-subtle", "#434343");
    const borderStrong = cssColor("--border-strong", "#686868");
    const primary = cssColor("--primary", "#9bc2e3");
    const textMuted = cssColor("--text-muted", "#8d8d8d");
    const warning = cssColor("--warning", "#e2b566");
    const sessionConceptIds = sessionConceptIdsProp ?? new Set<string>();
    const sessionId = sessionIdProp;
    const selectedId = selectedIdProp ?? selectedRef.current;
    const hoveredId = hoverNode;
    const activeId = selectedId ?? hoveredId;

    // A restrained graph-paper texture makes the canvas feel spatial without
    // competing with labels or the selected concept.
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = borderSubtle;
    ctx.lineWidth = 1 / k;
    const grid = 32;
    const left = -x / k - grid;
    const top = -y / k - grid;
    const right = (width - x) / k + grid;
    const bottom = (height - y) / k + grid;
    for (let gx = Math.floor(left / grid) * grid; gx <= right; gx += grid) {
      ctx.beginPath();
      ctx.moveTo(gx, top);
      ctx.lineTo(gx, bottom);
      ctx.stroke();
    }
    for (let gy = Math.floor(top / grid) * grid; gy <= bottom; gy += grid) {
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(right, gy);
      ctx.stroke();
    }
    ctx.restore();

    // --- Edges ---
    const visibleEdges = edgesProp.filter(
      (e) =>
        (activeId === null || e.from === activeId || e.to === activeId) &&
        degreeByIdRef.current.has(e.from) &&
        degreeByIdRef.current.has(e.to),
    );

    ctx.lineWidth = 1 / k;
    for (const edge of visibleEdges) {
      const a = nodePos(edge.from);
      const b = nodePos(edge.to);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const ra = radiusByIdRef.current.get(edge.from) ?? NODE_MIN_RADIUS;
      const rb = radiusByIdRef.current.get(edge.to) ?? NODE_MIN_RADIUS;
      const x1 = a.x + ux * (ra + 2);
      const y1 = a.y + uy * (ra + 2);
      const x2 = b.x - ux * (rb + 2);
      const y2 = b.y - uy * (rb + 2);

      const isSelectedEdge =
        selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
      const isHoveredEdge =
        selectedId === null && hoveredId !== null && (edge.from === hoveredId || edge.to === hoveredId);
      const dash = EDGE_DASH[edge.type];

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isSelectedEdge || isHoveredEdge ? primary : borderStrong;
      ctx.globalAlpha = isSelectedEdge || isHoveredEdge ? 0.95 : selectedId || hoveredId ? 0.12 : 0.42;
      ctx.lineWidth = (isSelectedEdge || isHoveredEdge ? 1.8 : 1) / k;
      if (dash) ctx.setLineDash(dash.split(" ").map(Number));
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Prerequisites point toward the concept that depends on them.
      if (edge.type === "prerequisite") {
        const arrowSize = 6 / k;
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(x2, y2);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-arrowSize, arrowSize / 2);
        ctx.lineTo(-arrowSize, -arrowSize / 2);
        ctx.closePath();
        ctx.fillStyle = primary;
        ctx.globalAlpha = isSelectedEdge ? 0.95 : selectedId ? 0.22 : 0.55;
        ctx.fill();
        ctx.restore();
      }

      // A crossbar makes contrast edges distinct even without relying on color.
      if (edge.type === "contrasts_with") {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        const size = 5 / k;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.strokeStyle = warning;
        ctx.lineWidth = 2 / k;
        ctx.globalAlpha = isSelectedEdge ? 0.95 : selectedId ? 0.22 : 0.65;
        ctx.stroke();
        ctx.restore();
      }

      // Relationship labels stay quiet until a node is selected.
      if (isSelectedEdge && EDGE_TYPE_SHORT(edge.type)) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.font = `${Math.max(9, 10 / k)}px ${cssVar("--font-ui")}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = EDGE_TYPE_SHORT(edge.type);
        const metrics = ctx.measureText(label);
        ctx.fillStyle = textMuted;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(
          mx - metrics.width / 2 - 2 / k,
          my - 6 / k,
          metrics.width + 4 / k,
          12 / k,
        );
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 1;
        ctx.fillText(label, mx, my);
      }

      ctx.globalAlpha = 1;
    }

    // --- Nodes ---
    for (const node of nodesProp) {
      const p = nodePos(node.id);
      if (!p) continue;

      const r = radiusByIdRef.current.get(node.id) ?? NODE_MIN_RADIUS;
      const selected = selectedId === node.id;
      const isHovered = hoveredId === node.id;
      const dimmed =
        activeId !== null &&
        activeId !== node.id &&
        !isNeighbour(activeId, node.id) &&
        hoveredId !== node.id;

      // Session overlay highlight
      const inSession =
        sessionId !== null && sessionConceptIds.has(node.id);
      const sessionDimmed =
        sessionId !== null && !inSession;

      const proposed =
        node.status === "proposed";

      ctx.save();
      const shake = isHovered ? Math.sin(hoverPhaseRef.current) * 1.5 : 0;
      ctx.translate(p.x + shake, p.y);
      ctx.scale(k, k);

      if (dimmed) ctx.globalAlpha = 0.12;
      if (sessionDimmed && !selected) ctx.globalAlpha = 0.4;
      if (proposed && !selected) ctx.globalAlpha = 0.5;

      const fill = MASTERY_FILL[node.mastery.state] ?? 0;
      const strokeVar = MASTERY_STROKE_VAR[node.mastery.state] ?? "--text-muted";
      const strokeColor = cssColor(strokeVar, textMuted);

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 2 * Math.PI);

      if (node.mastery.state === "unseen") {
        // Hollow ring
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
      } else if (fill >= 1) {
        // Solid fill
        ctx.fillStyle =
          node.mastery.state === "decayed" ? warning : strokeColor;
        ctx.fill();
        // Decayed: dashed outer ring
        if (node.mastery.state === "decayed") {
          ctx.lineWidth = 2 / k;
          ctx.strokeStyle = primary;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // Partial fill
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * fill);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fillStyle = strokeColor;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 2 * Math.PI);
        ctx.lineWidth = 1 / k;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
      }

      // Session highlight ring
      if (inSession && !selected) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 3 / k, 0, 2 * Math.PI);
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = primary;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Selection ring
      if (selected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4 / k, 0, 2 * Math.PI);
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = primary;
        ctx.stroke();
      }

      // Hover highlight
      if (isHovered && !selected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 2 / k, 0, 2 * Math.PI);
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = textColor;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // --- Labels ---
    const showLabels = hoverNode !== null || selectedRef.current !== null || k >= 1.55;
    if (showLabels) {
      ctx.font = `${Math.max(11, 13 / k)}px ${cssVar("--font-prose")}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      const labelNodes = nodesProp.filter(
        (n) =>
          hoverNode === n.id ||
          selectedRef.current === n.id ||
          isNeighbour(n.id, selectedRef.current ?? "") ||
          k >= 1.55,
      );

      for (const node of labelNodes) {
        const p = nodePos(node.id);
        if (!p) continue;
        const title = truncate(node.title, LABEL_TRUNCATE);
        const metrics = ctx.measureText(title);
        const tw = metrics.width;
        const th = 13 / k;
        const px = p.x;
        const py = p.y - (radiusByIdRef.current.get(node.id) ?? NODE_MIN_RADIUS) - 8 / k;

        ctx.fillStyle = bg;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(px - tw / 2 - 3 / k, py - th / 2 - 2 / k, tw + 6 / k, th + 4 / k);
        ctx.globalAlpha = 1;

        ctx.fillStyle = textColor;
        ctx.fillText(title, px, py);
      }
    }

    ctx.restore();
  }

  function nodePos(id: string): { x: number; y: number } | null {
    if (!simRef.current) return null;
    const nodesList = simRef.current.nodes() as unknown as {
      id: string;
      x: number;
      y: number;
    }[];
    const d = nodesList.find((n) => n.id === id);
    if (!d) return null;
    return { x: d.x, y: d.y };
  }

  function isNeighbour(a: string, b: string): boolean {
    if (!a || !b) return false;
    return edgesProp.some(
      (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
    );
  }

  function screenToCanvas(sx: number, sy: number): { x: number; y: number } {
    const { k, x, y } = transformRef.current;
    return { x: (sx - x) / k, y: (sy - y) / k };
  }

  function findNodeAt(sx: number, sy: number): string | null {
    const c = screenToCanvas(sx, sy);
    const rMax = NODE_MAX_RADIUS / transformRef.current.k;
    for (const node of nodesProp) {
      const p = nodePos(node.id);
      if (!p) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < rMax) return node.id;
    }
    return null;
  }

  function localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: event.clientX, y: event.clientY };
  }

  // ---------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      const point = localPoint(event);
      const id = findNodeAt(point.x, point.y);
      if (id) {
        const node = simRef.current?.nodes().find((item) => (item as { id?: string }).id === id);
        if (node) {
          node.fx = node.x;
          node.fy = node.y;
        }
      } else {
        dragStartRef.current = {
          sx: event.clientX,
          sy: event.clientY,
          x: pan.x,
          y: pan.y,
        };
      }
    },
    [pan],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = localPoint(event);
      const id = findNodeAt(point.x, point.y);
      setHoverNode(id);
      hoveredRef.current = id;

      const drag = dragStartRef.current;
      if (drag) {
        const dx = (event.clientX - drag.sx) / transformRef.current.k;
        const dy = (event.clientY - drag.sy) / transformRef.current.k;
        const nextPan = {
          x: drag.x + dx,
          y: drag.y + dy,
        };
        setPan(nextPan);
        transformRef.current.x = nextPan.x;
        transformRef.current.y = nextPan.y;
      }
    },
    [pan],
  );

  const onPointerUp = useCallback(() => {
    dragStartRef.current = null;
    pinnedRef.current = new Set();
  }, []);

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const point = localPoint(event);
      const id = findNodeAt(point.x, point.y);
      if (!id) return;
      const p = nodePos(id);
      if (!p) return;
      transformRef.current.k = 1.6;
      setZoom(1.6);
      const rect = canvasRef.current!.getBoundingClientRect();
      transformRef.current.x = rect.width / 2 - p.x * 1.6;
      transformRef.current.y = rect.height / 2 - p.y * 1.6;
      setPan({ x: transformRef.current.x, y: transformRef.current.y });
      simRef.current?.alpha(0.4).restart();
    },
    [],
  );

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const point = localPoint(event);
      const id = findNodeAt(point.x, point.y);
      if (!id) {
        if (selectedRef.current !== null) {
          selectedRef.current = null;
          onNodeSelect?.(null);
          draw();
        }
        return;
      }
      if (selectedRef.current === id) return;
      selectedRef.current = id;
      pinnedRef.current.add(id);
      onNodeSelect?.(id);
      simRef.current?.alpha(0.4).restart();
      draw();
    },
    [onNodeSelect],
  );

  useEffect(() => {
    draw();
  }, [zoom, pan.x, pan.y, nodesProp.length, edgesProp.length, hoverNode]);

  useEffect(() => {
    if (!hoverNode) {
      if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
      return;
    }
    const animate = () => {
      hoverPhaseRef.current += 0.35;
      draw();
      hoverFrameRef.current = requestAnimationFrame(animate);
    };
    hoverFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    };
  }, [hoverNode]);

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  const canvasEvents = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onClick,
  };

  if (ambient) {
    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full block bg-transparent"
        {...canvasEvents}
        style={{ touchAction: "none" }}
      />
    );
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-bg"
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        {...canvasEvents}
        style={{ touchAction: "none" }}
      />

      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-control border border-border-subtle bg-surface/95 p-1 shadow-popover">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setCameraZoom(transformRef.current.k / 1.2)}
          className="inline-flex size-10 items-center justify-center rounded-control text-text hover:bg-surface-2"
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <span className="min-w-12 text-center type-meta tabular-nums text-text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setCameraZoom(transformRef.current.k * 1.2)}
          className="inline-flex size-10 items-center justify-center rounded-control text-text hover:bg-surface-2"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reset graph zoom and position"
          title="Reset graph zoom and position"
          onClick={resetCamera}
          className="inline-flex size-10 items-center justify-center rounded-control text-text hover:bg-surface-2"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
        </button>
      </div>

    </div>
  );
}
