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

export type QuestionType = "tf_multi" | "mcq_single" | "theory" | "spotter";

export type QuestionBody = {
  stem?: string;
  statements?: { text: string; answer: boolean }[];
  options?: Record<string, string>;
  answer?: string;
  accepted?: string[];
  image?: string;
  explanation?: string;
  scoring?: "per_statement" | "all_or_nothing";
  prompt?: string;
  model_answer?: string;
  rubric?: string;
};

export type QuestionCite = { note: string; anchor?: string; quote?: string };

export type Question = {
  id: string;
  course: string;
  type: QuestionType;
  questionKind: string | null;
  topics: string[];
  conceptIds: string[];
  difficulty: string | null;
  marks: number;
  body: QuestionBody;
  cites: QuestionCite[];
  sourcePaper: string | null;
  verified: boolean;
  unverified: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

export type BlueprintSection = {
  section: string;
  type: QuestionType;
  count: number;
  minutes?: number;
  marks_each?: number;
  topics?: string[];
  negative_marks?: number;
  scoring?: "per_statement" | "all_or_nothing";
  seconds_each?: number;
};

export type Paper = {
  id: string;
  course: string;
  title: string;
  blueprint: BlueprintSection[];
  mode: "strict" | "sectioned" | "practice";
  durationSec: number;
  createdAt: number;
  items: { question: Question; section: string; position: number }[];
};

export type AttemptSession = {
  attempt: {
    id: string;
    paperId: string;
    startedAt: number;
    submittedAt: number | null;
    status: "in_progress" | "submitted";
    durationUsedSec: number | null;
  };
  paper: Paper;
  answers: {
    questionId: string;
    response: unknown;
    timeSpentSec: number;
    flagged: boolean;
    autoScore: number | null;
    status: string;
  }[];
  remainingSec: number;
  expired: boolean;
};

export type ResultItem = {
  questionId: string;
  section: string;
  position: number;
  type: QuestionType;
  topics: string[];
  marks: number;
  response: unknown;
  autoScore: number | null;
  status: string;
  correct: boolean | null;
  flagged: boolean;
  timeSpentSec: number;
};

export type AttemptResults = {
  attempt: AttemptSession["attempt"];
  paper: { id: string; course: string; title: string; mode: string };
  items: ResultItem[];
  score: { awarded: number; max: number; pending: number };
  bySection: { section: string; awarded: number; max: number; pending: number }[];
  flaggedAccuracy: { flagged: number; correct: number } | null;
  mistakes: { questionId: string; section: string; topics: string[]; tags: string[] }[];
  durationUsedSec: number;
};

export type QuestionInput = {
  id?: string;
  type: QuestionType;
  question_kind?: string;
  topics?: string[];
  concept_ids?: string[];
  difficulty?: "easy" | "medium" | "hard";
  marks: number;
  stem?: string;
  statements?: { text: string; answer: boolean }[];
  options?: Record<string, string>;
  answer?: string;
  accepted?: string[];
  image?: string;
  explanation?: string;
  scoring?: "per_statement" | "all_or_nothing";
  prompt?: string;
  model_answer?: string;
  rubric?: string;
  cites: QuestionCite[];
  source_paper?: string;
};

async function sendJson<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

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
  questions: (params: {
    course?: string;
    type?: string;
    verified?: boolean;
    q?: string;
  } = {}) => {
    const search = new URLSearchParams();
    if (params.course) search.set("course", params.course);
    if (params.type) search.set("type", params.type);
    if (params.verified !== undefined) search.set("verified", String(params.verified));
    if (params.q) search.set("q", params.q);
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson<Question[]>(`/api/questions${suffix}`);
  },
  question: (id: string) => getJson<Question>(`/api/questions/${encodeURIComponent(id)}`),
  updateQuestion: (id: string, input: QuestionInput) =>
    sendJson<Question>(`/api/questions/${encodeURIComponent(id)}`, "PATCH", input),
  verifyQuestion: (id: string, verified = true) =>
    sendJson<Question>(`/api/questions/${encodeURIComponent(id)}/verify`, "POST", { verified }),
  papers: (course?: string) =>
    getJson<Paper[]>(`/api/papers${course ? `?course=${encodeURIComponent(course)}` : ""}`),
  paper: (id: string) => getJson<Paper>(`/api/papers/${encodeURIComponent(id)}`),
  createPaper: (input: {
    course: string;
    title?: string;
    blueprint: BlueprintSection[];
    mode: "strict" | "sectioned" | "practice";
  }) => sendJson<Paper>("/api/papers", "POST", input),
  startAttempt: (paperId: string) =>
    sendJson<AttemptSession>("/api/attempts", "POST", { paper_id: paperId }),
  attempt: (id: string) => getJson<AttemptSession>(`/api/attempts/${encodeURIComponent(id)}`),
  saveAnswer: (
    attemptId: string,
    input: {
      question_id: string;
      response: unknown;
      time_spent_sec?: number;
      flagged?: boolean;
    },
  ) => sendJson(`/api/attempts/${encodeURIComponent(attemptId)}/answers`, "POST", input),
  submitAttempt: (attemptId: string, auto = false) =>
    sendJson<AttemptResults>(`/api/attempts/${encodeURIComponent(attemptId)}/submit`, "POST", { auto }),
  results: (attemptId: string) =>
    getJson<AttemptResults>(`/api/attempts/${encodeURIComponent(attemptId)}/results`),
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

export function spotterImageUrl(question: Question): string {
  const src = question.body.image ?? "";
  if (!src) return "";
  if (/^(https?:|data:|\/)/.test(src)) return src;
  if (src.startsWith("courses/")) return `/api/asset?path=${encodeURIComponent(src)}`;
  return assetUrl(question.cites[0]?.note ?? `courses/${question.course}/course.md`, src);
}
