import { apiUrl } from "./lib/desktop.ts";

export type Course = {
  code: string;
  title: string;
  department: string | null;
  answerStyle: string | null;
  examDate: string | null;
  notes: number;
  tokens: number;
  questions: number;
  concepts: number;
};

export type Goal = {
  id: string;
  course: string;
  title: string;
  deadline: string | null;
  study_min_per_day: number | null;
  status: "active" | "done" | "archived";
  plan_items: PlanItem[];
  tasks: Task[];
  coverage?: {
    sections: number;
    covered_accepted: number;
    covered_accepted_unverified?: number;
    covered_proposed: number;
    covered_proposed_unverified?: number;
    uncovered: { note: string; anchor: string; title: string }[];
  };
};

export type PlanItem = {
  id: string;
  title: string;
  kind: "learn" | "map" | "review";
  position: number;
  est_min_low: number;
  est_min_high: number;
  actual_sec: number;
  status: "todo" | "active" | "done" | "deferred" | "skipped";
  partial: number;
  plan_state: "draft" | "approved";
};

export type Task = {
  id: string;
  course: string;
  goal_id: string | null;
  plan_item_id: string | null;
  title: string;
  kind: "practice" | "review" | "revisit" | "custom";
  target_json?: Record<string, unknown> | null;
  due_date: string | null;
  status: "open" | "done" | "dropped";
  source: "user" | "agent";
};

export type PlanChange = {
  id: string;
  goal_id: string;
  status: "draft" | "applied";
  created_at: number;
  diff: {
    add: { title: string; kind: string; position: number; est_min_low: number; est_min_high: number }[];
    remove: string[];
    reorder: { id: string; position: number }[];
    defer: string[];
  };
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
  answer_input?: "text" | "text_and_drawing" | "photo";
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

export type AttemptSummary = {
  id: string;
  paperId: string;
  paperTitle: string;
  course: string;
  startedAt: number;
  submittedAt: number | null;
  status: string;
  durationUsedSec: number | null;
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

export type RubricScore = {
  heading: string;
  awarded: number;
  max: number;
  comment?: string;
};

export type MistakeTag =
  | "knowledge_gap"
  | "misread_question"
  | "wrong_structure"
  | "ran_out_of_time"
  | "careless";

export type Grade = {
  answerId: number;
  rubricScores: RubricScore[];
  total: number;
  feedback: string;
  mistakeTags: MistakeTag[];
  gradedBy: string;
  gradedAt: number;
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
  questionKind: string | null;
  conceptIds: string[];
  body: QuestionBody;
  cites: QuestionCite[];
  grade: Grade | null;
};

export type PendingGradingItem = {
  answerId: number;
  attemptId: string;
  paperId: string;
  paperTitle: string;
  course: string;
  questionId: string;
  section: string;
  type: QuestionType;
  questionKind: string | null;
  marks: number;
  topics: string[];
  conceptIds: string[];
  body: QuestionBody;
  cites: QuestionCite[];
  response: unknown;
  timeSpentSec: number;
  flagged: boolean;
  submittedAt: number;
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
  answer_input?: "text" | "text_and_drawing" | "photo";
  cites: QuestionCite[];
  source_paper?: string;
};

async function sendJson<T>(url: string, method: string, body: unknown, headers: HeadersInit = {}): Promise<T> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(apiUrl(url));
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type ActivityType =
  | "flashcard"
  | "cloze"
  | "mcq_single"
  | "mcq_multi"
  | "tf_multi"
  | "short_answer"
  | "matching"
  | "ordering"
  | "theory"
  | "calculation"
  | "worked_example_stepper"
  | "predict_reveal"
  | "compare_table"
  | "mermaid_diagram"
  | "concept_map"
  | "label_diagram"
  | "timeline"
  | "annotated_image"
  | "spotter_station"
  | "confidence_rating"
  | "think_aloud"
  | "muddy_point"
  | "spot_the_error"
  | "teach_back"
  | "case_vignette";

export type ActivityComponent = {
  type: ActivityType;
  concept_ids?: string[];
  front?: string;
  back?: string;
  text?: string;
  explanation?: string;
  stem?: string;
  options?: string[];
  answer?: number | number[] | string;
  statements?: { text: string; answer: boolean; explanation?: string }[];
  scoring?: "per_statement" | "all_or_nothing";
  prompt?: string;
  marks?: number;
  model_answer?: string;
  rubric?: { point: string; marks: number }[];
  title?: string;
  steps?: { title: string; body: string }[];
  reveal?: string;
  hint?: string;
  caption?: string;
  columns?: string[];
  rows?: string[][];
  code?: string;
  min_words?: number;
  pairs?: { left: string; right: string }[];
  items?: { id: string; text: string }[];
  tolerance?: number;
  errors?: number[];
  questions?: string[];
  nodes?: unknown[];
  edges?: unknown[];
  events?: unknown[];
  annotations?: unknown[];
  image?: string;
  labels?: string[];
  question?: string;
};

export type ActivityCite = { note: string; anchor?: string; quote?: string };
export type Cite = { note: string; anchor?: string; quote?: string };

export type ActivitySpec = {
  title?: string;
  instructions?: string;
  goal?: string;
  cites: ActivityCite[];
  concept_ids: string[];
  components: ActivityComponent[];
};

export type Confidence = "guessing" | "likely" | "sure";

export type ActivityResponse = {
  components: unknown[];
  confidence?: Confidence;
  think_aloud?: string;
};

export type SessionActivity = {
  id: string;
  sessionId: string;
  course: string;
  title: string;
  spec: ActivitySpec;
  cites: ActivityCite[];
  status: string;
  response: ActivityResponse | null;
  renderError: string | null;
  banked: boolean;
  bankedPath: string | null;
  createdAt: number;
  answeredAt: number | null;
};

export type AgentRequest = { id: number; text: string; status: string; createdAt: number };

export type SessionDetail = {
  id: string;
  course: string;
  goal: string;
  goalId: string | null;
  timeBoxMin: number | null;
  activePlanItemId: string | null;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  summary: string;
  notePath: string | null;
  agent: {
    state: "listening" | "connected" | "idle" | "none";
    clientName: string | null;
    lastSeenAt: number | null;
  };
  agentConnected: boolean;
  agentPreparing: boolean;
  activity: SessionActivity | null;
  activities: SessionActivity[];
  requests: AgentRequest[];
  unreadUserMessages: number;
  openRequests: AgentRequest[];
  messages: { id: number; kind: string; text: string; cites: Cite[]; unverified: boolean; createdAt: number }[];
  transcript: {
    kind: "activity" | "message" | "request";
    id: string | number;
    createdAt: number;
    data: SessionActivity | { id: number; kind: string; text: string; cites: Cite[]; unverified: boolean; createdAt: number } | { id: number; text: string; status: string; createdAt: number };
  }[];
  evidenceCount: number;
};

export type Pacing = {
  now: string;
  goal: { id: string; title: string; deadline: string | null; days_left: number | null } | null;
  plan: {
    done: number;
    total: number;
    remaining_min_range: [number, number];
    status: "behind" | "ahead" | "on_track" | null;
  };
  coverage: { sections: number; covered_accepted: number; covered_proposed: number };
  active_item: {
    id: string;
    title: string;
    elapsed_min: number;
    est_min_range: [number, number];
    nudge: "over_estimate" | null;
  } | null;
  session: { elapsed_min: number; time_box_min: number | null; remaining_min: number | null };
};

export type SessionSummary = {
  id: string;
  course: string;
  goal: string;
  startedAt: number;
  endedAt: number | null;
  summary: string;
  notePath: string | null;
  status: string;
  pendingCount: number;
  agentConnected: boolean;
};

export type MasteryState = "unseen" | "familiar" | "understood" | "mastered" | "decayed";

export type MasteryView = {
  conceptId: string;
  state: MasteryState;
  baseState: Exclude<MasteryState, "decayed">;
  score: number;
  evidenceCount: number;
  lastEvidenceAt: number | null;
  decayDueAt: number | null;
  overdue: boolean;
};

export type ConceptSummary = {
  id: string;
  course: string;
  title: string;
  aliases: string[];
  parentId: string | null;
  status: "proposed" | "accepted" | "rejected";
  examWeight: number;
  lecturerFlag: boolean;
  unverified: boolean;
  cites: QuestionCite[];
  path: string;
  mastery: MasteryView;
};

export type ConceptNode = ConceptSummary & {
  depth: number;
  childCount: number;
  rollup: {
    total: number;
    mastered: number;
    understood: number;
    familiar: number;
    unseen: number;
    due: number;
    weightedMastery: number;
  };
};

export type ConceptDetail = ConceptSummary & {
  definition: string;
  prerequisites: ConceptSummary[];
  related: ConceptSummary[];
  contrasts: ConceptSummary[];
  children: ConceptSummary[];
  linkedFrom: ConceptSummary[];
  timeline: {
    id: number;
    kind: string;
    correct: boolean | null;
    confidence: string | null;
    timeSec: number;
    excerpt: string | null;
    createdAt: number;
    sessionId: string | null;
    sessionNotePath: string | null;
    activityTitle: string | null;
    attemptId: string | null;
    questionType: string | null;
  }[];
  practice: { id: string; type: string; prompt: string; marks: number; verified: boolean }[];
};

export type FrontierItem = {
  concept: ConceptSummary;
  rank: number;
  reason: string;
  recentErrors: number;
  daysUntilExam: number | null;
};

export type MasterySnapshot = {
  counts: Record<MasteryState, number> & { total: number };
  concepts: ConceptSummary[];
};

export type CourseProgress = {
  code: string;
  title: string;
  examDate: string | null;
  total: number;
  mastered: number;
  understood: number;
  due: number;
  highWeightTotal: number;
  highWeightMastered: number;
  percent: number;
};

export type Dashboard = {
  next: FrontierItem[];
  due: ConceptSummary[];
  courses: CourseProgress[];
  exams: { course: string; title: string; examDate: string; days: number }[];
  counts: MasterySnapshot["counts"];
};

export type Health = {
  status: string;
  version: string;
  vault: string;
  db: string;
  disk: { freeBytes: number; totalBytes: number; freePercent: number } | null;
};

export type ServerSettings = {
  lan: boolean;
  mcpToken: string | null;
  vault: string;
  db: string;
  restartRequired?: boolean;
};

export const api = {
  health: () => getJson<Health>("/api/health"),
  settings: () => getJson<ServerSettings>("/api/settings"),
  updateSettings: (input: { lan?: boolean; regenerateToken?: boolean; vaultPath?: string }) =>
    sendJson<ServerSettings>("/api/settings", "POST", input),
  courses: () => getJson<Course[]>("/api/courses"),
  goals: (course?: string) =>
    getJson<Goal[]>(`/api/goals${course ? `?course=${encodeURIComponent(course)}` : ""}`),
  createGoal: (input: {
    course: string;
    title: string;
    deadline?: string | null;
    study_min_per_day?: number | null;
  }) => sendJson<Goal>("/api/goals", "POST", input),
  updateGoal: (id: string, input: Partial<Pick<Goal, "title" | "deadline" | "study_min_per_day" | "status">>) =>
    sendJson<Goal>(`/api/goals/${encodeURIComponent(id)}`, "PATCH", input),
  updatePlanItem: (id: string, input: { plan_state?: "draft" | "approved"; status?: PlanItem["status"]; partial?: boolean; position?: number }) =>
    sendJson<Goal>(`/api/plan-items/${encodeURIComponent(id)}`, "PATCH", input),
  planChanges: (goalId: string) =>
    getJson<PlanChange[]>(`/api/goals/${encodeURIComponent(goalId)}/plan-changes`),
  applyPlanChange: (id: string) =>
    sendJson<Goal>(`/api/plan-changes/${encodeURIComponent(id)}/apply`, "POST", {}),
  coverage: (course: string) =>
    getJson<NonNullable<Goal["coverage"]>>(`/api/coverage?course=${encodeURIComponent(course)}`),
  tasks: (course: string, status?: Task["status"]) =>
    getJson<Task[]>(`/api/tasks?course=${encodeURIComponent(course)}${status ? `&status=${status}` : ""}`),
  createTask: (input: {
    course: string;
    goal_id?: string | null;
    plan_item_id?: string | null;
    title: string;
    kind?: Task["kind"];
    target_json?: Record<string, unknown> | null;
    due_date?: string | null;
  }) => sendJson<Task>("/api/tasks", "POST", input),
  updateTask: (id: string, input: { status?: Task["status"] }) =>
    sendJson<Task>(`/api/tasks/${encodeURIComponent(id)}`, "PATCH", input),
  notes: (course: string) => getJson<NoteMeta[]>(`/api/courses/${encodeURIComponent(course)}/notes`),
  notesTree: (course: string) =>
    getJson<NoteMeta[]>(`/api/notes/tree?course=${encodeURIComponent(course)}`),
  createNote: (input: { course: string; title: string; folder?: string }) =>
    sendJson<{ path: string; bytes: number; mode: string }>("/api/notes", "POST", input),
  saveNote: (input: { path: string; content: string; etag?: string }) => {
    const headers: HeadersInit = { "content-type": "application/json" };
    if (input.etag) headers["if-match"] = input.etag;
    return sendJson<{ path: string; bytes: number; mode: string }>("/api/notes", "PUT", input, headers);
  },
  note: (path: string) => getJson<NoteDetail>(`/api/note?path=${encodeURIComponent(path)}`),
  writeNote: (input: { path: string; content: string; mode?: "create" | "replace"; requestId?: string }) =>
    sendJson<{ path: string; bytes: number; mode: string }>("/api/note", "POST", input),
  deleteNote: (path: string) =>
    sendJson<{ path: string }>(`/api/note?path=${encodeURIComponent(path)}`, "DELETE", undefined),
  writeAsset: (input: {
    course: string;
    fileName: string;
    base64: string;
    contentType: string;
  }) =>
    sendJson<{ path: string; bytes: number }>("/api/asset", "POST", input),
  updateCourse: (code: string, patch: {
    title?: string | null;
    department?: string | null;
    answerStyle?: string | null;
    examDate?: string | null;
    examBlueprint?: unknown[] | null;
  }) =>
    sendJson<{ path: string; bytes: number; mode: string }>(`/api/course/${encodeURIComponent(code)}`, "PATCH", patch),
  writeAnswerStyle: (code: string, content: string, requestId?: string) =>
    sendJson<{ path: string; bytes: number }>(`/api/course/${encodeURIComponent(code)}/answer-style`, "PATCH", { content, requestId }),
  writeRubric: (name: string, content: string, requestId?: string) =>
    sendJson<{ path: string; bytes: number }>(`/api/rubrics/${encodeURIComponent(name)}`, "PATCH", { content, requestId }),
  writeMastery: (code: string, content: string, requestId?: string) =>
    sendJson<{ path: string; bytes: number }>(`/api/course/${encodeURIComponent(code)}/mastery`, "PATCH", { content, requestId }),
  courseHistory: (code: string, file: string) =>
    getJson<{ stamp: string }[]>(`/api/course/${encodeURIComponent(code)}/history?file=${encodeURIComponent(file)}`),
  restoreCourseVersion: (code: string, file: string, stamp: string) =>
    sendJson<{ path: string; bytes: number }>(`/api/course/${encodeURIComponent(code)}/restore`, "POST", { file, stamp }),
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
  attempts: (course?: string) =>
    getJson<AttemptSummary[]>(
      `/api/attempts${course ? `?course=${encodeURIComponent(course)}` : ""}`,
    ),
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
  uploadPhoto: async (attemptId: string, questionId: string, file: File, text?: string) => {
    const form = new FormData();
    form.set("question_id", questionId);
    form.set("file", file);
    if (text) form.set("text", text);
    const res = await fetch(apiUrl(`/api/attempts/${encodeURIComponent(attemptId)}/photo`), {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<AttemptSession["answers"][number]>;
  },
  pendingGrading: (course?: string) =>
    getJson<PendingGradingItem[]>(
      `/api/grading${course ? `?course=${encodeURIComponent(course)}` : ""}`,
    ),
  gradingPrompt: (answerId: number) =>
    getJson<{ prompt: string }>(`/api/grading/${answerId}/prompt`),
  gradeAnswer: (answerId: number, input: {
    rubric_scores: RubricScore[];
    feedback: string;
    mistake_tags: MistakeTag[];
  }) => sendJson<Grade>(`/api/answers/${answerId}/grade`, "POST", { ...input, answer_id: answerId }),
  activeSession: (course?: string) =>
    getJson<SessionDetail | null>(
      `/api/sessions/active${course ? `?course=${encodeURIComponent(course)}` : ""}`,
    ),
  session: (id: string) => getJson<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
  pacing: (id: string) => getJson<Pacing>(`/api/sessions/${encodeURIComponent(id)}/pacing`),
  startSession: async (course: string, goal = "learn", options?: { goalId?: string; timeBoxMin?: number | null }) => {
    const res = await fetch(apiUrl("/api/sessions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course, goal, goal_id: options?.goalId, time_box_min: options?.timeBoxMin }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string; sessionId?: string };
      const err = new Error(payload.error ?? `Request failed: ${res.status}`);
      (err as { status?: number; sessionId?: string }).status = res.status;
      (err as { status?: number; sessionId?: string }).sessionId = payload.sessionId;
      throw err;
    }
    return res.json() as Promise<SessionDetail>;
  },
  endSession: (id: string, summary: string) =>
    sendJson<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}/end`, "POST", { summary }),
  reopenSession: (id: string) =>
    sendJson<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}/reopen`, "POST", {}),
  setSessionTitle: (id: string, title: string | null) =>
    sendJson<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`, "PATCH", { title }),
  focusSession: (sessionId: string, tabId?: string) =>
    sendJson<{ ok: boolean }>("/api/focus", "POST", { sessionId, tabId }),
  respondActivity: (id: string, activityId: string, response: ActivityResponse, timeSec: number) =>
    sendJson<SessionActivity>(
      `/api/sessions/${encodeURIComponent(id)}/activities/${encodeURIComponent(activityId)}/respond`,
      "POST",
      { response, time_sec: timeSec },
    ),
  renderError: (id: string, activityId: string, message: string) =>
    sendJson<{ ok: boolean }>(
      `/api/sessions/${encodeURIComponent(id)}/activities/${encodeURIComponent(activityId)}/render-error`,
      "POST",
      { message },
    ),
  askAgent: (id: string, text: string) =>
    sendJson<AgentRequest>(`/api/sessions/${encodeURIComponent(id)}/requests`, "POST", { text }),
  bankActivity: (activityId: string, tags: string[] = []) =>
    sendJson<{ path: string; id: string }>(
      `/api/activities/${encodeURIComponent(activityId)}/bank`,
      "POST",
      { tags },
    ),
  sessionHistory: (course?: string) =>
    getJson<SessionSummary[]>(
      `/api/sessions/history${course ? `?course=${encodeURIComponent(course)}` : ""}`,
    ),
  dashboard: () => getJson<Dashboard>("/api/dashboard"),
  concepts: (course?: string, status?: string) => {
    const search = new URLSearchParams();
    if (course) search.set("course", course);
    if (status) search.set("status", status);
    return getJson<ConceptSummary[]>(`/api/concepts${search.size ? `?${search}` : ""}`);
  },
  concept: (id: string) => getJson<ConceptDetail>(`/api/concepts/${encodeURIComponent(id)}`),
  updateConcept: (id: string, patch: Record<string, unknown>) =>
    sendJson<ConceptDetail>(`/api/concepts/${encodeURIComponent(id)}`, "PATCH", patch),
  mastery: (course?: string) =>
    getJson<MasterySnapshot>(`/api/mastery${course ? `?course=${encodeURIComponent(course)}` : ""}`),
  masteryTree: (course: string) =>
    getJson<ConceptNode[]>(`/api/mastery/tree?course=${encodeURIComponent(course)}`),
  frontier: (course: string, n = 5) =>
    getJson<FrontierItem[]>(
      `/api/mastery/next?course=${encodeURIComponent(course)}&n=${encodeURIComponent(String(n))}`,
    ),
  due: (course?: string, limit = 20) =>
    getJson<ConceptSummary[]>(
      `/api/mastery/due?limit=${limit}${course ? `&course=${encodeURIComponent(course)}` : ""}`,
    ),
  weak: (course: string, limit = 10) =>
    getJson<ConceptSummary[]>(
      `/api/mastery/weak?course=${encodeURIComponent(course)}&limit=${limit}`,
    ),
  graph: (course?: string, filter?: string) => {
    const search = new URLSearchParams();
    if (course) search.set("course", course);
    if (filter) search.set("filter", filter);
    return getJson<{ nodes: ConceptSummary[]; edges: { from: string; to: string; type: string }[] }>(
      `/api/graph${search.size ? `?${search}` : ""}`,
    );
  },
  conceptSessions: (conceptId: string) =>
    getJson<Array<{
      id: string;
      course: string;
      goal: string;
      startedAt: number;
      endedAt: number | null;
      evidenceCount: number;
      correctCount: number;
      lastAt: number;
    }>>(`/api/concepts/${encodeURIComponent(conceptId)}/sessions`),
  sessionConcepts: (sessionId: string) =>
    getJson<Array<{
      id: string;
      course: string;
      title: string;
      evidenceCount: number;
      correctCount: number;
    }>>(`/api/sessions/${encodeURIComponent(sessionId)}/concepts`),
  backupVault: async () => {
    const res = await fetch("/api/vault/backup", { method: "POST" });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ ok: boolean; destination: string }>;
  },
  vaultBackups: async () => {
    const res = await fetch(apiUrl("/api/vault/backups"));
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{
      root: string;
      backups: Array<{
        name: string;
        path: string;
        createdAt: number;
        format: number | null;
        stats: { notes?: number; courses?: number; tokens?: number } | null;
        hasDatabase: boolean;
      }>;
    }>;
  },
  rescanVault: async () => {
    const res = await fetch(apiUrl("/api/vault/rescan"), { method: "POST" });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ ok: boolean; stats: { notes: number; courses: number } }>;
  },
  diagnostics: async () => {
    const res = await fetch(apiUrl("/api/diagnostics"));
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<unknown>;
  },
  createDemoCourse: async () => {
    const res = await fetch(apiUrl("/api/onboarding/demo"), { method: "POST" });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ ok: boolean; created: boolean; course: string; message?: string }>;
  },
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

export function photoName(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = (response as { photo?: unknown }).photo;
  return typeof value === "string" ? value : null;
}

export function photoUrl(attemptId: string, questionId: string, name: string): string {
  return `/api/attempts/${encodeURIComponent(attemptId)}/photo/${encodeURIComponent(questionId)}?file=${encodeURIComponent(name)}`;
}
