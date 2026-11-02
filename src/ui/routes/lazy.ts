import { lazy, type ComponentType } from "react";

export const NotesLazy = lazy(() => import("../screens/Notes.tsx").then((mod) => ({ default: mod.Notes }))) as ComponentType<{
  courses: import("../api.ts").Course[];
  course: import("../api.ts").Course | null;
  notes: import("../api.ts").NoteMeta[];
  results: import("../api.ts").NoteMeta[] | null;
  query: string;
  onQuery: (value: string) => void;
  onSelectCourse: (course: import("../api.ts").Course) => void;
  onClearCourse: () => void;
  onOpenNote: (path: string) => void;
  onNewNote: (course: import("../api.ts").Course | null) => void;
  onDeleteNote: (path: string) => void;
  loading: boolean;
}>;

export const ReaderLazy = lazy(() => import("../screens/Reader.tsx").then((mod) => ({ default: mod.Reader }))) as ComponentType<{
  note: { path: string; title: string; summary: string; tags: string[]; frontmatter: Record<string, unknown>; body: string } | null;
  course: import("../api.ts").Course | null;
  onOpenNote: (path: string, anchor?: string) => void;
  onEditNote?: (path: string) => void;
  onDeleteNote?: (path: string) => void;
}>;

export const EditorLazy = lazy(() => import("../screens/Editor.tsx").then((mod) => ({ default: mod.Editor }))) as ComponentType<{
  course: import("../api.ts").Course | null;
  onBack: () => void;
  notePath?: string;
}>;

export const PapersLazy = lazy(() => import("../screens/Papers.tsx").then((mod) => ({ default: mod.Papers }))) as ComponentType<{
  course: import("../api.ts").Course;
  onBack: () => void;
}>;

export const QuestionsLazy = lazy(() => import("../screens/Questions.tsx").then((mod) => ({ default: mod.Questions }))) as ComponentType<{
  courses: import("../api.ts").Course[];
}>;

export const ProgressLazy = lazy(() => import("../screens/Progress.tsx").then((mod) => ({ default: mod.ProgressScreen }))) as ComponentType<{
  courses: import("../api.ts").Course[];
  onStudy: (course: string, conceptId?: string) => void;
  onOpenNote: (path: string, anchor?: string) => void;
  onOpenGraph: (course: string, conceptId: string) => void;
}>;

export const GraphLazy = lazy(() => import("../screens/Graph.tsx").then((mod) => ({ default: mod.GraphScreen }))) as ComponentType<{
  courses: import("../api.ts").Course[];
  onStudy: (courseCode: string, goal: string) => void;
}>;

export const PlanLazy = lazy(() => import("../screens/Plan.tsx").then((mod) => ({ default: mod.PlanScreen }))) as ComponentType<{
  courses: import("../api.ts").Course[];
}>;
