import { useEffect, useState } from "react";
import { api, type Course } from "../api.ts";
import { ProgressLazy } from "./lazy.ts";
import { navigate, graphHref } from "../lib/router.ts";

export function ProgressRoute({
  courses,
  onNewSession,
}: {
  courses: Course[];
  onNewSession?: (course: Course | null, goal?: string) => void;
}) {
  const course = courses.find((item) => item.concepts > 0) ?? courses[0];
  if (!course) return null;
  return (
    <ProgressLazy
      courses={courses}
      onStudy={(courseCode, conceptId) => {
        const selected = courses.find((item) => item.code === courseCode) ?? course;
        if (selected && onNewSession) {
          void onNewSession(selected, conceptId ?? "review concepts");
        }
      }}
      onOpenNote={(path, anchor) => {
        navigate(`/library/notes?path=${encodeURIComponent(path)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ""}`);
      }}
      onOpenGraph={(courseCode, conceptId) => {
        navigate(graphHref(courseCode, conceptId));
      }}
    />
  );
}
