import { useEffect, useState } from "react";
import { api, type Goal } from "../api.ts";
import { cn } from "../lib/cn.ts";

type PlanGraphStripProps = {
  goal: Goal;
  className?: string;
};

export function PlanGraphStrip({ goal, className }: PlanGraphStripProps) {
  const [graph, setGraph] = useState<{ nodes: { id: string; title: string }[]; edges: { from: string; to: string; type: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goal.course) return;
    let cancelled = false;
    api
      .graph(goal.course)
      .then((data) => {
        if (!cancelled) setGraph(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [goal.course]);

  const items = [...goal.plan_items].sort((a, b) => a.position - b.position);
  const itemByConcept = new Map<string, typeof items[number] | undefined>();
  for (const item of items) {
    if (item.concept_id) itemByConcept.set(item.concept_id, item);
  }
  // concept_id is optional on PlanItem type; add it
  const conceptEdges = (graph?.edges ?? []).filter((e) => e.type === "prerequisite");

  const statusColor: Record<string, string> = {
    todo: "border-border-subtle bg-surface-2 text-text-muted",
    active: "border-warning/40 bg-warning-soft text-warning",
    done: "border-correct/40 bg-correct-soft text-correct",
    deferred: "border-border-subtle bg-surface-2 text-text-muted",
    skipped: "border-border-subtle bg-surface-2 text-text-muted",
  };

  return (
    <div className={cn("rounded-panel border border-border-subtle bg-surface p-4", className)}>
      <h2 className="type-heading text-text mb-3">Plan graph</h2>
      {error && <p className="type-body-sm text-incorrect mb-3">{error}</p>}
      {items.length === 0 && (
        <p className="type-body-sm text-text-muted mb-3">No plan items yet. Propose a plan to see the graph.</p>
      )}
      {items.length > 0 && (
        <>
          <div className="relative h-20 mb-3">
            {items.map((item, index) => {
              const isLast = index === items.length - 1;
              const conceptId = item.concept_id;
              const incoming = conceptEdges.filter((e) => {
                const targetItem = itemByConcept.get(e.to);
                return targetItem?.id === item.id;
              });
              const hasIncoming = incoming.length > 0;
              const left = (index / Math.max(items.length - 1, 1)) * 100;
              return (
                <div
                  key={item.id}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${left}%`, transform: "translateX(-50%)" }}
                >
                  {/* Connector line from prerequisite items */}
                  {hasIncoming && index > 0 && (
                    <svg className="absolute left-1/2 top-[-8px] w-[2px] h-8" style={{ transform: "translateX(-50%)" }}>
                      <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  )}
                  <div
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-sm transition-colors",
                      statusColor[item.status],
                    )}
                  >
                    <span className={cn("w-2.5 h-2.5 rounded-full", item.status === "done" ? "bg-correct" : item.status === "active" ? "bg-warning" : "bg-border-subtle")} />
                    <span className="truncate max-w-[120px]">{item.title}</span>
                  </div>
                  <p className="absolute top-full mt-1 type-meta text-xs text-text-muted text-center w-32">
                    {item.status}{item.partial > 0 ? ` (${item.partial}%)` : ""}
                  </p>
                  {/* Horizontal connector to next item */}
                  {!isLast && (
                    <svg className="absolute left-1/2 top-1/2 w-full h-[1px]" style={{ transform: "translateX(-50%)" }}>
                      <line x1="0" y1="0" x2="100%" y2="0" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <span key={item.id} className={cn("inline-flex min-h-9 items-center rounded-control border px-2 py-1 text-xs", statusColor[item.status])}>
                {item.title}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
