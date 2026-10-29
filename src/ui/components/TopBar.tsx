"use client";

import * as React from "react";

import { SidebarToggle } from "./Sidebar.tsx";

export function TopBar({
  drag = true,
  open,
  onToggle,
  course,
  sessionTitle,
  children,
}: {
  drag?: boolean;
  open: boolean;
  onToggle: () => void;
  course?: { code: string; title: string } | null;
  sessionTitle?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={`${
        drag ? "lh-drag " : ""
      }flex h-15 select-none items-center gap-3 border-b border-border-subtle px-3`}
    >
      <SidebarToggle open={open} onToggle={onToggle} />
      {course && (
        <span className="font-mono text-xs text-text-muted rounded-control border border-border-subtle bg-surface px-2 py-1">
          {course.title} ({course.code})
        </span>
      )}
      {sessionTitle && course ? (
        <span className="text-xs font-mono text-text-muted ml-2">·</span>
      ) : null}
      {sessionTitle && !course ? (
        <span className="font-prose text-sm font-semibold truncate">{sessionTitle}</span>
      ) : null}
      {children}
    </header>
  );
}
