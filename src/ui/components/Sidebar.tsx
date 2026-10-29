"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DumbbellIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SearchIcon,
  Settings2,
} from "lucide-react";
import { api, type Course, type SessionSummary } from "../api.ts";
import { cn } from "../lib/cn.ts";
import { Button } from "./Button.tsx";
import { Input } from "./Input.tsx";

type SidebarProps = {
  courses: Course[];
  open: boolean;
  onToggle: () => void;
  onSelectSession: (id: string) => void;
  onNewSession: (course: Course | null, goal?: string) => void;
  onSettings: () => void;
  sessions: SessionSummary[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  activeSessionId: string | null;
};

export function Sidebar({
  courses,
  open,
  onToggle,
  onSelectSession,
  onNewSession,
  onSettings,
  sessions,
  loading,
  search,
  onSearchChange,
  activeSessionId,
}: SidebarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = sessions.filter(
    (s) =>
      !search ||
      s.course.toLowerCase().includes(search.toLowerCase()) ||
      s.goal.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <aside
      className={cn(
        "shrink-0 overflow-hidden duration-200 border-r border-border-subtle bg-surface flex h-full flex-col z-20",
        open ? "w-72" : "w-0",
      )}
      aria-hidden={!open}
    >
      {/* Wordmark band */}
      <div className="shrink-0 flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" aria-hidden="true" className="size-7 rounded-lg" />
          <span className="font-prose text-sm font-semibold tracking-tight">Hilum</span>
        </div>
      </div>

      {/* New session */}
      <div className="shrink-0 mx-3 mb-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onNewSession(null)}
          className="flex w-full items-center gap-2 rounded-control border border-border-subtle bg-surface min-h-11 px-2 py-2 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <PlusIcon className="size-3" />
          New session
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 mx-3 mb-2 flex items-center gap-2">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted/70">Sessions</span>
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-text-muted/70"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            aria-label="Search sessions"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-8 text-xs focus:border-primary focus:outline-none placeholder:text-text-muted/60"
          />
        </div>
      </div>

      {/* Session list */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto p-2"
      >
        {loading ? (
          <div className="px-2 py-4 text-xs text-text-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-4 text-xs text-text-muted">
            {search.trim() ? "No sessions match." : "No sessions yet."}
          </div>
        ) : (
          filtered.map((s) => {
            const course = courses.find((c) => c.code === s.course || c.title === s.course);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession(s.id)}
                aria-current={activeSessionId === s.id ? "page" : undefined}
                title={course?.title ?? s.course}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-control border min-h-11 px-2 py-2 text-left text-sm transition-colors",
                  activeSessionId === s.id
                    ? "border-primary bg-primary/10 text-text"
                    : "border-transparent text-text-muted hover:bg-surface-2 hover:text-text hover:border-border-subtle",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">
                    {course?.title ?? s.course}
                  </span>
                  <span className="block font-mono text-[10px] text-text-muted mt-0.5">
                    {course?.code ?? s.course}
                    {course ? " · " : ""}
                    {relativeTime(s.startedAt)}
                    {s.endedAt ? " · ended" : " · active"}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-border-subtle" />
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Settings pinned to bottom */}
      <div className="shrink-0 mt-auto px-3 pb-3 pt-1 border-t border-border-subtle">
        <button
          type="button"
          onClick={onSettings}
          className="flex items-center gap-2 rounded-control border border-transparent min-h-11 px-2 py-2 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <Settings2 className="size-3" />
          Settings
        </button>
      </div>
    </aside>
  );

  function relativeTime(timestamp: number): string {
    const ms = Date.now() - timestamp;
    if (ms < 60_000) return "just now";
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    const date = new Date(timestamp);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mm}-${dd}`;
  }
}

export function SidebarToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <span className={cn("sidebar-motion lh-no-drag relative flex h-9 shrink-0 overflow-hidden duration-200", open ? "w-0 -mr-3" : "w-9 mr-0")}>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={open ? "Close sidebar" : "Open sidebar"}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        onClick={onToggle}
        className={cn(
          "sidebar-motion duration-200",
          open ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {open ? (
          <PanelLeftCloseIcon className="size-4" />
        ) : (
          <PanelLeftOpenIcon className="size-4" />
        )}
      </Button>
    </span>
  );
}
