export type Course = {
  code: string;
  title: string;
  department: string | null;
  answerStyle: string | null;
  examDate: string | null;
  notes: number;
  tokens: number;
};

export type NoteMeta = {
  path: string;
  course: string | null;
  title: string;
  summary: string;
  snippet: string;
};

export type NoteDetail = {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  body: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type Health = {
  status: string;
  version: string;
  vault: string;
  db: string;
};

export const api = {
  health: () => getJson<Health>("/api/health"),
  courses: () => getJson<Course[]>("/api/courses"),
  notes: (course: string) => getJson<NoteMeta[]>(`/api/courses/${encodeURIComponent(course)}/notes`),
  note: (path: string) => getJson<NoteDetail>(`/api/note?path=${encodeURIComponent(path)}`),
  search: (query: string, course?: string) =>
    getJson<NoteMeta[]>(
      `/api/search?q=${encodeURIComponent(query)}${course ? `&course=${encodeURIComponent(course)}` : ""}`,
    ),
};

export function assetUrl(notePath: string, src: string): string {
  if (/^(https?:|data:|\/)/.test(src)) return src;
  const base = notePath.split("/").slice(0, -1);
  for (const part of src.split("/")) {
    if (part === "..") base.pop();
    else if (part !== ".") base.push(part);
  }
  return `/api/asset?path=${encodeURIComponent(base.join("/"))}`;
}
