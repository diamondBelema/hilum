import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, RotateCcw, ZoomIn } from "lucide-react";
import {
  api,
  type ConceptDetail,
  type ConceptNode,
  type ConceptSummary,
  type Course,
} from "../api.ts";
import { GraphCanvas } from "../components/GraphCanvas.tsx";
import { Button } from "../components/Button.tsx";
import { Chip } from "../components/ui.tsx";
import { MasteryRing } from "../components/MasteryRing.tsx";
import { Banner, EmptyState, Skeleton } from "../components/ui.tsx";
import { SegmentedControl } from "../components/SegmentedControl.tsx";
import { defaultCourse } from "../lib/courses.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Sheet } from "../components/Sheet.tsx";
import { cn } from "../lib/cn.ts";
import { graphHref, navigate, questionsHref, useRoute } from "../lib/router.ts";

type Mode = "neighborhood" | "overview" | "tree" | "frontier";

const MODES: { value: Mode; label: string }[] = [
  { value: "neighborhood", label: "Neighborhood" },
  { value: "overview", label: "Overview" },
  { value: "tree", label: "Tree" },
  { value: "frontier", label: "Frontier" },
];

const stateLabel = (state: string): string => {
  return (
    {
      unseen: "Not seen",
      familiar: "Familiar",
      understood: "Understood",
      mastered: "Mastered",
      decayed: "Due for review",
    }[state] ?? state
  );
};

export function GraphScreen({
  courses,
  onStudy,
}: {
  courses: Course[];
  onStudy: (course: string, goal: string) => void;
}) {
  const route = useRoute();
  const graphParams = new URLSearchParams(window.location.search);
  const requestedCourse = graphParams.get("course");
  const requestedConcept = graphParams.get("concept");
  const routeSessionId =
    route.name === "session" ? route.id : undefined;
  const [courseCode, setCourseCode] = useState(
    requestedCourse && courses.some((course) => course.code === requestedCourse)
      ? requestedCourse
      : defaultCourse(courses, "concepts"),
  );
  const [mode, setMode] = useState<Mode>("neighborhood");
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [view, setView] = useState<{ nodes: ConceptSummary[]; edges: { from: string; to: string; type: string }[] } | null>(null);
  const [tree, setTree] = useState<ConceptNode[] | null>(null);
  const [frontier, setFrontier] = useState<{
    concept: ConceptSummary;
    rank: number;
    reason: string;
  }[] | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [detailSessions, setDetailSessions] = useState<Array<{
    id: string;
    course: string;
    goal: string;
    startedAt: number;
    endedAt: number | null;
    evidenceCount: number;
    correctCount: number;
    lastAt: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionConceptIds, setSessionConceptIds] = useState<Set<string>>(new Set());
  const [showSessionOverlay, setShowSessionOverlay] = useState(false);
  const [resetViewToken, setResetViewToken] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!courseCode && courses[0]) {
      setCourseCode(
        requestedCourse && courses.some((course) => course.code === requestedCourse)
          ? requestedCourse
          : defaultCourse(courses, "concepts"),
      );
    }
  }, [courses, courseCode]);

  useEffect(() => {
    setRootId(null);
    setSelectedId(null);
    setDetail(null);
    setSearch("");
    setFocusNodeId(null);
    setView(null);
    setTree(null);
    setFrontier(null);
    setSessionConceptIds(new Set());
    setShowSessionOverlay(false);
    setResetViewToken((token) => token + 1);
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
    Promise.all([
      api.graph(courseCode),
      api.masteryTree(courseCode),
      api.frontier(courseCode, 6),
    ])
      .then(([graph, treeData, frontierData]) => {
        if (cancelled) return;
        setView(graph);
        setTree(treeData);
        setFrontier(frontierData);
        if (!rootId && graph.nodes.length > 0) {
          const flagged =
            (requestedConcept ? graph.nodes.find((node) => node.id === requestedConcept) : undefined) ??
            graph.nodes.find((node) => node.lecturerFlag) ??
            graph.nodes[0];
          if (!flagged) return;
          setRootId(flagged.id);
          setFocusNodeId(flagged.id);
          if (requestedConcept && flagged.id === requestedConcept) void loadDetail(flagged.id);
        }
        // Session overlay highlight
        if (routeSessionId) {
          setShowSessionOverlay(true);
          void api
            .sessionConcepts(routeSessionId)
            .then((rows) => {
              if (!cancelled) setSessionConceptIds(new Set(rows.map((r) => r.id)));
            })
            .catch(() => {});
        }
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [courseCode, reloadKey, requestedConcept, routeSessionId]);

  useEffect(() => {
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "activity" || event.type === "session" || event.type === "graded") {
        setReloadKey((key) => key + 1);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    ro.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const nodes = view?.nodes ?? [];
  const edges = view?.edges ?? [];
  const drawerOpen = Boolean(selectedId && detail);

  const loadDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetail(null);
      setDetailSessions([]);
      try {
        const [concept, sessions] = await Promise.all([
          api.concept(id),
          api.conceptSessions(id),
        ]);
        setDetail(concept);
        setDetailSessions(sessions);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const openNode = useCallback(
    (node: ConceptSummary) => {
      setRootId(node.id);
      setFocusNodeId(node.id);
      void loadDetail(node.id);
    },
    [loadDetail],
  );

  const onNodeSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) {
        setRootId(id);
        setFocusNodeId(id);
        const node = nodes.find((n) => n.id === id);
        if (node) void loadDetail(id);
      } else {
        setDetail(null);
      }
    },
    [nodes, loadDetail],
  );

  const handleStudy = useCallback(
    (concept: ConceptDetail) => {
      void onStudy(courseCode, concept.title);
    },
    [courseCode, onStudy],
  );

  // Enter-focus: pressing Enter in the search focuses the first match
  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const q = search.trim().toLowerCase();
      if (!q) return;
      const match = nodes.find((n) => n.title.toLowerCase().includes(q));
      if (!match) return;
      setFocusNodeId(match.id);
      setRootId(match.id);
      void loadDetail(match.id);
    },
    [search, nodes, loadDetail],
  );

  // Keep the graph useful by default; Frontier has its own focused list view.
  const filterOnly = mode === "frontier" ? "frontier" : null;
  const cappedNodes = useMemo(() => {
    let list = nodes;
    if (mode === "neighborhood" && rootId) {
      const distances = new Map<string, number>([[rootId, 0]]);
      const queue = [rootId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        const distance = distances.get(current) ?? 0;
        if (distance >= 2) continue;
        for (const edge of edges) {
          const next =
            edge.from === current ? edge.to : edge.to === current ? edge.from : null;
          if (next && !distances.has(next)) {
            distances.set(next, distance + 1);
            queue.push(next);
          }
        }
      }
      list = list.filter((node) => distances.has(node.id));
    }
    if (filterOnly === "frontier") {
      const frontierIds = new Set(frontier?.map((f) => f.concept.id));
      list = list.filter((n) => frontierIds.has(n.id));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(q));
    }
    if (list.length > 300) {
      const hidden = list.length - 300;
      list = list.slice(0, 300);
      return list;
    }
    return list;
  }, [edges, frontier, mode, nodes, rootId, search]);

  if (loading && !view && !tree && !frontier) {
    return (
      <div className="flex h-dvh min-h-0 flex-col items-center justify-center bg-bg p-6">
        <div className="space-y-4"><Skeleton lines={3} /><Skeleton lines={8} /></div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex h-dvh min-h-0 flex-col items-center justify-center bg-bg p-6">
        <EmptyState title="No courses yet">
          Add a course, then concepts appear in the graph.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-bg">
      {/* Top overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 flex flex-wrap items-center gap-3 bg-bg">
        {courses.length > 0 && (
          <label className="block type-body-sm font-medium">
            Course
            <select
              value={courseCode}
              onChange={(event) => setCourseCode(event.target.value)}
              className="mt-1.5 min-h-10 w-full min-w-44 rounded-control border border-border bg-surface px-3 type-body-sm text-text"
            >
              {courses.map((item) => (
                <option key={item.code} value={item.code}>{item.title}</option>
              ))}
            </select>
          </label>
        )}
        <SegmentedControl
          label="Graph view"
          value={mode}
          onChange={(value) => {
            setMode(value as Mode);
            setRootId(null);
            setSelectedId(null);
            setDetail(null);
            setFocusNodeId(null);
            setResetViewToken((token) => token + 1);
          }}
          options={MODES}
          className="flex-1 max-w-[340px]"
        />
        <div className="relative flex min-w-0 flex-1 items-center gap-2 sm:ml-auto sm:flex-none">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find a topic…"
            className="min-h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface pl-8 pr-3 type-body-sm text-text placeholder:text-text-muted focus:border-primary sm:w-[220px]"
          />
          <div className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 pointer-events-none text-text-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Reset graph view"
            title="Reset graph view"
            onClick={() => {
              setFocusNodeId(null);
              setResetViewToken((token) => token + 1);
            }}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      {/* Canvas area (full bleed) */}
      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
        {mode === "tree" ? (
          <div className="h-full overflow-y-auto p-4 pt-28 sm:p-6 sm:pt-28">
            <TreeView nodes={tree ?? []} onOpen={openNode} onStudy={onStudy} course={courseCode} />
          </div>
        ) : mode === "frontier" ? (
          <div className="h-full overflow-y-auto p-4 pt-28 sm:p-6 sm:pt-28">
            <FrontierView items={frontier ?? []} onOpen={openNode} onStudy={onStudy} course={courseCode} />
          </div>
        ) : containerSize.width > 0 && containerSize.height > 0 && cappedNodes.length > 0 ? (
          <GraphCanvas
            nodes={cappedNodes}
            edges={edges}
            width={containerSize.width}
            height={containerSize.height}
            course={courseCode}
            onStudy={(c, g) => void onStudy(c, g)}
            onNodeSelect={onNodeSelect}
            selectedId={selectedId}
            focusNodeId={focusNodeId}
            resetViewToken={resetViewToken}
            sessionId={showSessionOverlay ? routeSessionId : null}
            sessionConceptIds={sessionConceptIds}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState title={search ? "No matching concepts" : "No concepts in this view"}>
              {search
                ? "Try a different search term."
                : "Add cited concepts to this course and they will appear here."}
            </EmptyState>
          </div>
        )}
        {mode !== "tree" && mode !== "frontier" && cappedNodes.length > 0 && (
          <details className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-panel border border-border-subtle bg-surface shadow-popover">
            <summary className="cursor-pointer list-none px-3 py-2 type-body-sm font-medium text-text">
              Concept list ({cappedNodes.length})
            </summary>
            <div className="max-h-64 overflow-y-auto border-t border-border-subtle p-2">
              <ul className="space-y-1" aria-label="Concepts in graph">
                {cappedNodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => openNode(node)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left type-body-sm hover:bg-surface-2",
                        selectedId === node.id && "bg-primary-soft",
                      )}
                    >
                      <MasteryRing
                        state={node.mastery.state}
                        size={20}
                        label={`${node.title}: ${stateLabel(node.mastery.state)}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-text">{node.title}</span>
                      <span className="type-meta text-text-muted">{stateLabel(node.mastery.state)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>

      {error && (
        <div className="absolute bottom-6 left-6 z-20">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {/* Session overlay toggle */}
      {showSessionOverlay && routeSessionId && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSessionOverlay(false)}
          >
            Hide session highlight
          </Button>
        </div>
      )}

      {/* Concept drawer */}
      {drawerOpen && detail && (
        <ConceptDrawerPanel
          open
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
            setDetailSessions([]);
          }}
          label={detail.title}
          concept={detail}
          onStudy={handleStudy}
          onSelectNode={openNode}
          onBack={() => setSelectedId(null)}
          onOpenNote={(path, anchor) =>
            navigate(`/library/notes?path=${encodeURIComponent(path)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ""}`)
          }
          sessions={detailSessions}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concept drawer panel (shared Drawer pattern: portal, Escape, focus return,
// no backdrop blur)
// ---------------------------------------------------------------------------

function ConceptDrawerPanel({
  open,
  onClose,
  label,
  concept,
  onStudy,
  onSelectNode,
  onBack,
  onOpenNote,
  sessions,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  concept: ConceptDetail;
  onStudy: (concept: ConceptDetail) => void;
  onSelectNode: (node: ConceptSummary) => void;
  onBack: () => void;
  onOpenNote: (path: string, anchor?: string) => void;
  sessions: Array<{
    id: string;
    course: string;
    goal: string;
    startedAt: number;
    endedAt: number | null;
    evidenceCount: number;
    correctCount: number;
    lastAt: number;
  }>;
}) {
  if (!open) return null;

  return (
    <Sheet open title={label} onClose={onClose}>
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 type-body-sm text-text-muted hover:bg-surface-2"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>Back to graph</span>
        </button>
      </div>
      <div>
          <MasteryRing
            state={concept.mastery.state}
            size={40}
            label={`${concept.title}: ${stateLabel(concept.mastery.state)}`}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" onClick={() => void onStudy(concept)}>
              Study this
            </Button>
            {concept.status === "proposed" && <Chip>Proposed</Chip>}
          </div>

          {concept.definition && (
            <section className="mt-6">
              <h3 className="type-label text-text-muted">Definition</h3>
              <p className="mt-1 type-body-sm text-text reading">{concept.definition}</p>
            </section>
          )}

          <section className="mt-6">
            <h3 className="type-label text-text-muted">Citations</h3>
            {concept.cites.length === 0 ? (
              <p className="mt-1 type-body-sm text-text-muted">No citation recorded.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {concept.cites.map((cite, index) => (
                  <li
                    key={`${cite.note}-${index}`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenNote(cite.note, cite.anchor)}
                      className="flex min-h-11 w-full items-start gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-left hover:border-primary/40 hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block type-body-sm font-medium text-text">
                          {cite.note}
                        </span>
                        {cite.anchor && (
                          <span className="mt-0.5 block type-meta text-text-muted">
                            #{cite.anchor}
                          </span>
                        )}
                      </span>
                      <Copy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(concept.prerequisites.length > 0 ||
            concept.related.length > 0 ||
            concept.contrasts.length > 0 ||
            concept.children.length > 0) && (
            <section className="mt-6">
              <h3 className="type-label text-text-muted">Connections</h3>
              <div className="mt-1 flex flex-wrap gap-2">
                {concept.prerequisites.map((item) => (
                  <NeighbourChip
                    key={item.id}
                    item={item}
                    onSelect={() => void onSelectNode(item)}
                  />
                ))}
                {concept.related.map((item) => (
                  <NeighbourChip
                    key={item.id}
                    item={item}
                    onSelect={() => void onSelectNode(item)}
                  />
                ))}
                {concept.contrasts.map((item) => (
                  <NeighbourChip
                    key={item.id}
                    item={item}
                    onSelect={() => void onSelectNode(item)}
                  />
                ))}
                {concept.children.map((item) => (
                  <NeighbourChip
                    key={item.id}
                    item={item}
                    onSelect={() => void onSelectNode(item)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <h3 className="type-label text-text-muted">Learned in sessions</h3>
            {sessions.length === 0 ? (
              <p className="mt-1 type-body-sm text-text-muted">No sessions yet.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex min-h-10 items-start gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 cursor-pointer hover:bg-surface hover:border-primary/40"
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block type-body-sm font-medium text-text">
                        {session.goal}
                      </span>
                      <span className="mt-0.5 block type-meta text-text-muted">
                        {session.correctCount} of {session.evidenceCount} correct
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {concept.timeline.length > 0 && (
            <section className="mt-6">
              <h3 className="type-label text-text-muted">Evidence timeline</h3>
              <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle max-h-[200px] overflow-y-auto">
                {concept.timeline.slice(0, 10).map((item) => (
                  <li key={item.id} className="py-2 type-body-sm">
                    <p className="font-medium text-text">
                      {item.correct === null ? "Seen" : item.correct ? "Correct" : "Incorrect"}
                    </p>
                    <p className="mt-0.5 type-meta text-text-muted">
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                      {item.activityTitle ? ` · ${item.activityTitle}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {concept.practice.length > 0 && (
            <section className="mt-6">
              <h3 className="type-label text-text-muted">Practice bank</h3>
              <ul className="mt-1 space-y-1">
                {concept.practice.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                questionsHref(concept.course, item.id),
                              )
                            }
                            className="w-full rounded-control border border-transparent py-2 text-left hover:border-border-subtle hover:bg-surface-2"
                          >
                            <p className="type-body-sm text-text">{item.prompt}</p>
                            <p className="mt-0.5 type-meta text-text-muted">
                              {item.type} · {item.marks} mark{item.marks === 1 ? "" : "s"} ·{" "}
                              {item.verified ? "Verified" : "Unverified"}
                            </p>
                          </button>
                        </li>
                      ))}
              </ul>
            </section>
          )}
      </div>
    </Sheet>
  );
}

function NeighbourChip({
  item,
  onSelect,
}: {
  item: ConceptSummary;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-chip border border-border-subtle bg-surface px-2.5 py-1 type-body-sm text-text hover:border-primary/40 hover:bg-surface-2"
      aria-label={`Select ${item.title}`}
    >
      <MasteryRing
        state={item.mastery.state}
        size={16}
        label={`${item.title}: ${stateLabel(item.mastery.state)}`}
      />
      <span className="truncate">{item.title}</span>
      <ZoomIn aria-hidden="true" className="size-4 shrink-0 text-primary opacity-0 group-hover:opacity-100" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tree view (kept)
// ---------------------------------------------------------------------------

function TreeView({
  nodes,
  onOpen,
  onStudy,
  course,
}: {
  nodes: ConceptNode[];
  onOpen: (node: ConceptSummary) => void;
  onStudy: (course: string, goal: string) => void;
  course: string;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const roots: ConceptNode[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenMap = new Map<string, ConceptNode[]>();
  let lastByDepth: Map<number, ConceptNode> = new Map();
  for (const node of nodes) {
    const parent = lastByDepth.get(node.depth - 1) ?? null;
    if (!parent) roots.push(node);
    else {
      const list = childrenMap.get(parent.id) ?? [];
      list.push(node);
      childrenMap.set(parent.id, list);
    }
    lastByDepth.set(node.depth, node);
    for (const [d] of lastByDepth) if (d > node.depth) lastByDepth.delete(d);
  }

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
              onClick={() => {
                onOpen(node);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-2 min-w-0 flex-1"
            >
              <MasteryRing
                state={node.mastery.state}
                size={20}
                label={`${node.title}: ${stateLabel(node.mastery.state)}`}
              />
              <span className="truncate type-body-sm text-text">{node.title}</span>
              {node.mastery.state === "decayed" && (
                <span className="text-xs text-warning" title="Review due">
                  review due
                </span>
              )}
            </button>
            <span className="text-xs type-meta text-text-muted">
              {node.rollup.mastered + node.rollup.understood + node.rollup.familiar +
                node.rollup.unseen === 0
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
      <p className="type-meta text-text-muted">
        Indented topic tree. Tap a topic for its drawer; chevrons expand subtopics.
      </p>
      <div className="border border-border-subtle rounded-panel bg-surface p-3 max-h-[70vh] overflow-y-auto">
        {roots.length === 0 ? (
          <p className="type-meta text-text-muted">No topics yet.</p>
        ) : (
          render(roots)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frontier view (kept)
// ---------------------------------------------------------------------------

function FrontierView({
  items,
  onOpen,
  onStudy,
  course,
}: {
  items: { concept: ConceptSummary; rank: number; reason: string }[];
  onOpen: (node: ConceptSummary) => void;
  onStudy: (course: string, goal: string) => void;
  course: string;
}) {
  return (
    <div className="space-y-3">
      <p className="type-meta text-text-muted">
        Topics ready to study next — prerequisites met, ranked by exam weight and review need.
      </p>
      <div className="border border-border-subtle rounded-panel bg-surface p-3 max-h-[70vh] overflow-y-auto space-y-2">
        {items.length === 0 ? (
          <p className="type-meta text-text-muted">
            No topics ready yet. Finish prerequisites or wait for a review to come due.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.concept.id}
              className="flex min-h-12 items-center gap-3 p-2 rounded-control border border-transparent hover:border-border-subtle cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => onOpen(item.concept)}
            >
              <MasteryRing
                state={item.concept.mastery.state}
                size={24}
                label={`${item.concept.title}: ${stateLabel(item.concept.mastery.state)}`}
              />
              <div className="min-w-0 flex-1">
                <p className="type-body-sm text-text">{item.concept.title}</p>
                <p className="mt-0.5 type-meta text-text-muted">{item.reason}</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="text-xs px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  void onStudy(course, item.concept.title);
                }}
              >
                Study this
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
