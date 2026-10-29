import { Menu } from "lucide-react";
import { Link } from "../lib/router.ts";
import { AgentStatus } from "./AgentStatus.tsx";
import { IconButton } from "./Button.tsx";

export type Crumb = { label: string; to?: string };

export function TopBar({
  onOpenSidebar,
  breadcrumb,
  sessionId,
}: {
  onOpenSidebar: () => void;
  breadcrumb: Crumb[];
  sessionId: string | null;
}) {
  return (
    <header className="flex min-h-15 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3">
      <IconButton
        label="Open sessions"
        onClick={onOpenSidebar}
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </IconButton>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2">
          {breadcrumb.map((crumb, index) => {
            const last = index === breadcrumb.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                {index > 0 && (
                  <span aria-hidden="true" className="type-meta text-text-muted">
                    /
                  </span>
                )}
                {crumb.to && !last ? (
                  <Link
                    to={crumb.to}
                    className="type-body-sm truncate font-medium text-text-muted hover:text-text"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className="type-body-sm truncate font-medium text-text"
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <AgentStatus sessionId={sessionId} />
    </header>
  );
}
