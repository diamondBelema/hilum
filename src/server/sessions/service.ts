import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { Db } from "../db.ts";
import type { VaultService } from "../vault/service.ts";
import { slug } from "../vault/paths.ts";
import type { EventBus } from "../events.ts";
import type { GoalService } from "../goals/service.ts";
import { validateCites, type Cite } from "../questions/citations.ts";
import {
  ActivitySpecError,
  componentCorrect,
  parseActivitySpec,
  responseExcerpt,
  validateActivityResponse,
  type ActivityResponse,
  type ActivitySpec,
} from "./activities.ts";

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

type SessionRow = {
  id: string;
  course: string;
  goal: string;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  summary: string;
  note_path: string | null;
  agent_seen_at: number | null;
  goal_id: string | null;
  time_box_min: number | null;
  active_plan_item_id: string | null;
};

type ActivityRow = {
  id: string;
  session_id: string;
  course: string;
  spec_json: string;
  cites_json: string;
  concept_ids: string;
  response_json: string | null;
  render_error: string | null;
  status: string;
  banked: number;
  banked_path: string | null;
  response_seen: number;
  created_at: number;
  answered_at: number | null;
};

type RequestRow = {
  id: number;
  session_id: string;
  text: string;
  status: string;
  created_at: number;
};

export type SessionActivity = {
  id: string;
  sessionId: string;
  course: string;
  title: string;
  spec: ActivitySpec;
  cites: Cite[];
  status: string;
  response: ActivityResponse | null;
  renderError: string | null;
  banked: boolean;
  bankedPath: string | null;
  createdAt: number;
  answeredAt: number | null;
};

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
  requests: { id: number; text: string; status: string; createdAt: number }[];
  unreadUserMessages: number;
  openRequests: { id: number; text: string; status: string; createdAt: number }[];
  messages: { id: number; kind: string; text: string; cites: Cite[]; unverified: boolean; createdAt: number }[];
  transcript: {
    kind: "activity" | "message" | "request";
    id: string | number;
    createdAt: number;
    data: SessionActivity | { id: number; kind: string; text: string; cites: Cite[]; unverified: boolean; createdAt: number } | { id: number; text: string; status: string; createdAt: number };
  }[];
  evidenceCount: number;
};

const AGENT_WINDOW_MS = 3 * 60_000;
const AGENT_IDLE_MS = 10 * 60_000;
const FOCUS_TTL_MS = 90 * 1000;
const AWAIT_STEP_MS = 400;

function parseSpec(row: ActivityRow): ActivitySpec {
  try {
    return parseActivitySpec(JSON.parse(row.spec_json));
  } catch {
    return {
      title: "Activity",
      cites: [],
      concept_ids: [],
      components: [],
    };
  }
}

function toActivity(row: ActivityRow): SessionActivity {
  const spec = parseSpec(row);
  return {
    id: row.id,
    sessionId: row.session_id,
    course: row.course,
    title: spec.title ?? spec.components[0]?.type ?? "Activity",
    spec,
    cites: JSON.parse(row.cites_json) as Cite[],
    status: row.status,
    response: row.response_json ? (JSON.parse(row.response_json) as ActivityResponse) : null,
    renderError: row.render_error,
    banked: row.banked === 1,
    bankedPath: row.banked_path,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
  };
}

export class SessionService {
  constructor(
    readonly db: Db,
    private readonly vault: VaultService,
    private readonly events: EventBus,
    private readonly goals?: GoalService,
  ) {}

  private previousAgentState: string | null = null;

  private sessionRow(id: string): SessionRow {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | null;
    if (!row) throw new SessionError(`session not found: ${id}`);
    return row;
  }

  touch(id: string): void {
    this.db.query("UPDATE sessions SET agent_seen_at = ? WHERE id = ?").run(Date.now(), id);
  }

  async start(
    course: string,
    goal = "learn",
    title: string | null = null,
    actor: "agent" | "app" = "app",
    options: { goalId?: string | null; timeBoxMin?: number | null } = {},
  ): Promise<SessionDetail> {
    if (!course.trim()) throw new SessionError("course is required");
    const exists = (await this.vault.listCourses()).some((item) => item.code === course);
    if (!exists) throw new SessionError(`course not found: ${course}`);
    // App actor always creates a new session. If an open session already exists for this
    // course, return a conflict so the UI can offer "resume or start new".
    if (actor === "app") {
      const active = this.db
        .query("SELECT * FROM sessions WHERE course = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
        .get(course) as SessionRow | null;
      if (active) {
        const err = new SessionError(`session already open: ${active.id}`);
        (err as { status?: number }).status = 409;
        (err as { sessionId?: string }).sessionId = active.id;
        throw err;
      }
    } else {
      const active = this.db
        .query("SELECT * FROM sessions WHERE course = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
        .get(course) as SessionRow | null;
      if (active) {
        this.touch(active.id);
        return this.detail(active.id);
      }
    }
    const id = `sess-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .query(
        "INSERT INTO sessions (id, course, goal, title, goal_id, time_box_min, started_at, agent_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, course, goal, title ?? null, options.goalId ?? null, options.timeBoxMin ?? null, now, null);
    if (options.goalId) {
      const goalRow = this.db
        .query("SELECT course FROM goals WHERE id = ?")
        .get(options.goalId) as { course: string } | null;
      if (!goalRow || goalRow.course !== course) {
        this.db.query("DELETE FROM sessions WHERE id = ?").run(id);
        throw new SessionError(`goal does not belong to course: ${options.goalId}`);
      }
    }
    if (actor === "app" && goal.trim()) {
      this.request(id, goal);
    }
    this.events.publish({ type: "session", course, sessionId: id, state: "started", at: Date.now() });
    return this.detail(id);
  }

  focus(sessionId: string, tabId: string | null = null): { ok: boolean } {
    if (!sessionId.trim()) {
      this.db.query("DELETE FROM session_focus WHERE id = 'focused'").run();
      return { ok: true };
    }
    this.sessionRow(sessionId);
    this.db
      .query(
        "INSERT INTO session_focus (id, session_id, tab_id, updated_at) VALUES ('focused', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, tab_id = excluded.tab_id, updated_at = excluded.updated_at",
      )
      .run(sessionId, tabId, Date.now());
    return { ok: true };
  }

  focused(): SessionDetail | null {
    const row = this.db
      .query("SELECT session_id, updated_at FROM session_focus WHERE id = 'focused'")
      .get() as { session_id: string | null; updated_at: number } | null;
    const now = Date.now();
    if (row?.session_id && now - row.updated_at < FOCUS_TTL_MS) {
      try {
        return this.detail(row.session_id);
      } catch {
        // fall through to fallback below
      }
    }
    // Never return null while an open session exists.
    return this.active();
  }

  private agentRow(): {
    id: string;
    client_name: string | null;
    last_seen_at: number | null;
    listening_until: number | null;
  } | null {
    return this.db.query("SELECT * FROM agent_presence WHERE id = 'presence'").get() as
      | { id: string; client_name: string | null; last_seen_at: number | null; listening_until: number | null }
      | null;
  }

  private ensurePresenceRow(): void {
    this.db
      .query(
        "INSERT INTO agent_presence (id, client_name, last_seen_at, listening_until) VALUES ('presence', NULL, NULL, NULL) ON CONFLICT(id) DO NOTHING",
      )
      .run();
  }

  agentState(): {
    state: "listening" | "connected" | "idle" | "none";
    clientName: string | null;
    lastSeenAt: number | null;
  } {
    const now = Date.now();
    const row = this.agentRow();
    const clientName = row?.client_name ?? null;
    const lastSeenAt = row?.last_seen_at ?? null;
    const listeningUntil = row?.listening_until ?? null;
    if (listeningUntil !== null && now < listeningUntil) {
      return { state: "listening", clientName, lastSeenAt };
    }
    if (lastSeenAt !== null && now - lastSeenAt < AGENT_IDLE_MS) {
      return { state: "connected", clientName, lastSeenAt };
    }
    if (lastSeenAt !== null) {
      return { state: "idle", clientName, lastSeenAt };
    }
    return { state: "none", clientName: null, lastSeenAt: null };
  }

  private publishAgentState(state: { state: string; clientName: string | null; lastSeenAt: number | null }): void {
    const key = `${state.state}:${state.clientName}:${state.lastSeenAt}`;
    if (key === this.previousAgentState) return;
    this.previousAgentState = key;
    this.events.publish({
      type: "agent",
      state: state.state,
      clientName: state.clientName,
      lastSeenAt: state.lastSeenAt,
      at: Date.now(),
    });
  }

  markPresence(clientName: string): void {
    this.ensurePresenceRow();
    const now = Date.now();
    this.db.query("UPDATE agent_presence SET client_name = ?, last_seen_at = ? WHERE id = 'presence'").run(clientName, now);
    this.publishAgentState(this.agentState());
  }

  setListening(timeoutSec: number): void {
    this.ensurePresenceRow();
    const now = Date.now();
    this.db.query("UPDATE agent_presence SET listening_until = ? WHERE id = 'presence'").run(now + timeoutSec * 1000);
    this.publishAgentState(this.agentState());
  }

  clearListening(): void {
    this.ensurePresenceRow();
    this.db.query("UPDATE agent_presence SET listening_until = NULL WHERE id = 'presence'").run();
    this.publishAgentState(this.agentState());
  }

  setSessionTitle(sessionId: string, title: string | null): void {
    const session = this.sessionRow(sessionId);
    this.db.query("UPDATE sessions SET title = ? WHERE id = ?").run(title ?? null, sessionId);
    this.events.publish({
      type: "session",
      course: session.course,
      sessionId,
      state: "title_changed",
      at: Date.now(),
    });
  }

  active(course?: string): SessionDetail | null {
    const row = course
      ? (this.db
          .query("SELECT * FROM sessions WHERE course = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
          .get(course) as SessionRow | null)
      : (this.db
          .query("SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
          .get() as SessionRow | null);
    return row ? this.detail(row.id) : null;
  }

  detail(id: string): SessionDetail {
    const row = this.sessionRow(id);
    const rows = this.db
      .query("SELECT * FROM activities WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30")
      .all(id) as ActivityRow[];
    const activities = rows.map(toActivity);
    const activity =
      activities.find((item) => item.status === "pending" || item.status === "error") ??
      activities[0] ??
      null;
    const requests = this.db
      .query("SELECT * FROM agent_requests WHERE session_id = ? ORDER BY created_at DESC LIMIT 20")
      .all(id) as RequestRow[];
    const evidence = this.db
      .query("SELECT COUNT(*) AS count FROM evidence WHERE session_id = ?")
      .get(id) as { count: number };
    const messages = this.messages(row.id);
    const transcript = this.transcript(row.id);
    const agent = this.agentState();
    const unseenResponse = rows.some((item) => item.status === "answered" && item.response_seen === 0);
    const openRequestRows = requests.filter((item) => item.status !== "answered");
    const openRequests = openRequestRows.map((item) => ({
      id: item.id,
      text: item.text,
      status: item.status,
      createdAt: item.created_at,
    }));
    return {
      id: row.id,
      course: row.course,
      goal: row.goal,
      goalId: row.goal_id,
      timeBoxMin: row.time_box_min,
      activePlanItemId: row.active_plan_item_id,
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      summary: row.summary,
      notePath: row.note_path,
      agent,
      agentConnected: agent.state === "listening" || agent.state === "connected",
      agentPreparing: Boolean(unseenResponse || openRequests.length > 0),
      activity,
      activities,
      requests: requests.map((item) => ({
        id: item.id,
        text: item.text,
        status: item.status,
        createdAt: item.created_at,
      })),
      unreadUserMessages: openRequests.length,
      openRequests,
      messages,
      transcript,
      evidenceCount: evidence.count,
    };
  }

  async pushActivity(sessionId: string, input: unknown, planItemId?: string | null): Promise<SessionActivity> {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    let spec: ActivitySpec;
    try {
      spec = parseActivitySpec(input);
    } catch (err) {
      if (err instanceof ActivitySpecError) throw new SessionError(err.message);
      throw err;
    }
    let cites: Cite[];
    try {
      cites = validateCites(this.vault, spec.cites);
    } catch (err) {
      throw new SessionError(err instanceof Error ? err.message : String(err));
    }
    const conceptIds = [
      ...new Set([
        ...spec.concept_ids,
        ...spec.components.flatMap((component) => component.concept_ids ?? []),
      ]),
    ];
    const id = `act-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO activities (id, session_id, course, spec_json, cites_json, concept_ids, plan_item_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        id,
        sessionId,
        session.course,
        JSON.stringify(spec),
        JSON.stringify(cites),
        JSON.stringify(conceptIds),
        planItemId ?? session.active_plan_item_id ?? null,
        now,
      );
    if (planItemId ?? session.active_plan_item_id) {
      const activeId = planItemId ?? session.active_plan_item_id;
      const item = this.db.query(
        `SELECT plan_items.id
         FROM plan_items
         JOIN goals ON goals.id = plan_items.goal_id
         WHERE plan_items.id = ? AND goals.course = ?`,
      ).get(activeId, session.course);
      if (!item) throw new SessionError(`plan item does not belong to course: ${activeId}`);
      this.db.query("UPDATE sessions SET active_plan_item_id = ? WHERE id = ?").run(
        activeId,
        sessionId,
      );
    }
    this.touch(sessionId);
    this.markRequestsAnswered(sessionId);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId: id,
      state: "pushed",
      at: now,
    });
    return toActivity(
      this.db.query("SELECT * FROM activities WHERE id = ?").get(id) as ActivityRow,
    );
  }

  respond(sessionId: string, activityId: string, input: unknown, timeSec = 0): SessionActivity {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    const row = this.db
      .query("SELECT * FROM activities WHERE id = ? AND session_id = ?")
      .get(activityId, sessionId) as ActivityRow | null;
    if (!row) throw new SessionError(`activity not found: ${activityId}`);
    if (row.status === "answered") throw new SessionError("activity already answered");
    if (row.status === "error") throw new SessionError("activity needs to be replaced after a render error");
    const spec = parseSpec(row);
    let response: ActivityResponse;
    try {
      response = validateActivityResponse(spec, input);
    } catch (err) {
      if (err instanceof ActivitySpecError) throw new SessionError(err.message);
      throw err;
    }
    const now = Date.now();
    this.db
      .query("UPDATE activities SET response_json = ?, status = 'answered', answered_at = ? WHERE id = ?")
      .run(JSON.stringify(response), now, activityId);
    this.writeEvidence(sessionId, activityId, spec, response, Math.max(0, Math.round(timeSec)));
    this.goals?.autoCompleteTasks(session.course, sessionId);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId,
      state: "answered",
      at: now,
    });
    return toActivity(
      this.db.query("SELECT * FROM activities WHERE id = ?").get(activityId) as ActivityRow,
    );
  }

  private writeEvidence(
    sessionId: string,
    activityId: string,
    spec: ActivitySpec,
    response: ActivityResponse,
    timeSec: number,
  ): void {
    const now = Date.now();
    for (const [index, component] of spec.components.entries()) {
      const value = response.components[index];
      const correct = componentCorrect(component, value);
      const excerpt = responseExcerpt(spec, component, value);
      const ids = component.concept_ids.length ? component.concept_ids : spec.concept_ids;
      for (const conceptId of ids) {
        this.db
          .query(
            `INSERT INTO evidence (session_id, activity_id, concept_id, kind, correct, confidence, time_sec, excerpt, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sessionId,
            activityId,
            conceptId,
            `activity:${component.type}`,
            correct === null ? null : correct ? 1 : 0,
            response.confidence ?? null,
            timeSec,
            excerpt,
            now,
          );
      }
    }
  }

  request(
    sessionId: string,
    text: string,
    clientId: string | null = null,
  ): { id: number; text: string; status: string; createdAt: number } {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    const clean = text.trim();
    if (!clean) throw new SessionError("request is empty");
    if (clean.length > 500) throw new SessionError("request is too long (max 500 characters)");
    const now = Date.now();
    if (clientId) {
      const existing = this.db
        .query("SELECT * FROM agent_requests WHERE session_id = ? AND client_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(sessionId, clientId) as RequestRow | null;
      if (existing) {
        return { id: existing.id, text: existing.text, status: existing.status, createdAt: existing.created_at };
      }
    }
    const result = this.db
      .query("INSERT INTO agent_requests (session_id, client_id, text, status, created_at) VALUES (?, ?, ?, 'sent', ?)")
      .run(sessionId, clientId ?? null, clean, now);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId: "",
      state: "request",
      at: now,
    });
    return { id: Number(result.lastInsertRowid), text: clean, status: "sent", createdAt: now };
  }

  requests(sessionId: string): { id: number; text: string; status: string; createdAt: number }[] {
    this.sessionRow(sessionId);
    const rows = this.db
      .query("SELECT * FROM agent_requests WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as RequestRow[];
    return rows.map((row) => ({ id: row.id, text: row.text, status: row.status, createdAt: row.created_at }));
  }

  markRequestsSeen(sessionId: string, ids: number[]): void {
    const session = this.sessionRow(sessionId);
    const now = Date.now();
    for (const id of ids) {
      const row = this.db
        .query("SELECT status FROM agent_requests WHERE id = ? AND session_id = ?")
        .get(id, sessionId) as { status: string } | null;
      if (!row || row.status === "seen" || row.status === "answered") continue;
      this.db.query("UPDATE agent_requests SET status = 'seen' WHERE id = ? AND session_id = ?").run(id, sessionId);
      this.events.publish({
        type: "activity",
        course: session.course,
        sessionId,
        activityId: "",
        state: "request_seen",
        at: now,
      });
    }
  }

  markRequestsAnswered(sessionId: string): void {
    const session = this.sessionRow(sessionId);
    const now = Date.now();
    const rows = this.db
      .query("SELECT id FROM agent_requests WHERE session_id = ? AND status IN ('sent', 'seen')")
      .all(sessionId) as { id: number }[];
    for (const row of rows) {
      this.db.query("UPDATE agent_requests SET status = 'answered' WHERE id = ? AND session_id = ?").run(row.id, sessionId);
      this.events.publish({
        type: "activity",
        course: session.course,
        sessionId,
        activityId: "",
        state: "request_answered",
        at: now,
      });
    }
  }

  activities(sessionId: string): SessionActivity[] {
    this.sessionRow(sessionId);
    const rows = this.db
      .query("SELECT * FROM activities WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as ActivityRow[];
    return rows.map(toActivity);
  }

  say(
    sessionId: string,
    text: string,
    kind = "say",
    cites: Cite[] = [],
    unverified = false,
  ): { id: number; text: string; kind: string; cites: Cite[]; unverified: boolean; createdAt: number } {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    const clean = text.trim();
    if (!clean) throw new SessionError("message is empty");
    if (clean.length > 2000) throw new SessionError("message is too long (max 2000 characters)");
    let normalized: Cite[] = [];
    if (cites && cites.length > 0) {
      try {
        normalized = validateCites(this.vault, cites);
      } catch (err) {
        throw new SessionError(err instanceof Error ? err.message : String(err));
      }
    }
    const now = Date.now();
    const result = this.db
      .query(
        "INSERT INTO agent_messages (session_id, kind, text, cites_json, unverified, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(sessionId, kind, clean, JSON.stringify(normalized), unverified ? 1 : 0, now);
    this.touch(sessionId);
    this.markRequestsAnswered(sessionId);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId: "",
      state: "agent_message",
      at: now,
    });
    return { id: Number(result.lastInsertRowid), text: clean, kind, cites: normalized, unverified: unverified ? true : false, createdAt: now };
  }

  messages(sessionId: string): {
    id: number;
    kind: string;
    text: string;
    cites: Cite[];
    unverified: boolean;
    createdAt: number;
  }[] {
    this.sessionRow(sessionId);
    const rows = this.db
      .query(
        "SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC",
      )
      .all(sessionId) as {
        id: number;
        session_id: string;
        kind: string;
        text: string;
        cites_json: string;
        unverified: number;
        created_at: number;
      }[];
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      text: row.text,
      cites: JSON.parse(row.cites_json ?? "[]"),
      unverified: row.unverified === 1,
      createdAt: row.created_at,
    }));
  }

  transcript(sessionId: string): SessionDetail["transcript"] {
    this.sessionRow(sessionId);
    const items: SessionDetail["transcript"] = [];

    for (const act of this.messages(sessionId)) {
      items.push({ kind: "message", id: act.id, createdAt: act.createdAt, data: act });
    }
    for (const req of this.requests(sessionId)) {
      items.push({ kind: "request", id: req.id, createdAt: req.createdAt, data: req });
    }
    for (const act of this.activities(sessionId)) {
      items.push({ kind: "activity", id: act.id, createdAt: act.createdAt, data: act });
    }

    return items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }


  renderError(sessionId: string, activityId: string, message: string): void {
    const session = this.sessionRow(sessionId);
    const clean = message.trim().slice(0, 1000) || "activity could not be displayed";
    const row = this.db
      .query("SELECT * FROM activities WHERE id = ? AND session_id = ?")
      .get(activityId, sessionId) as ActivityRow | null;
    if (!row) throw new SessionError(`activity not found: ${activityId}`);
    this.db
      .query("UPDATE activities SET render_error = ?, status = 'error' WHERE id = ?")
      .run(clean, activityId);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId,
      state: "error",
      at: Date.now(),
    });
  }

  async awaitResponse(
    sessionId: string,
    timeoutSec = 20,
  ): Promise<{
    status: "answered" | "timeout";
    activity?: SessionActivity;
    requests: { id: number; text: string; status: string; createdAt: number }[];
    renderErrors: { activityId: string; message: string }[];
    waitingFor?: { activityId: string; title: string; createdAt: number };
    agentConnected: boolean;
  }> {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    this.touch(sessionId);
    const timeout = Math.min(Math.max(0, timeoutSec), 25) * 1000;
    this.setListening(Math.ceil(timeout / 1000));
    try {
      const deadline = Date.now() + timeout;
      for (;;) {
        const answered = this.db
          .query(
            "SELECT * FROM activities WHERE session_id = ? AND status = 'answered' AND response_seen = 0 ORDER BY answered_at ASC LIMIT 1",
          )
          .get(sessionId) as ActivityRow | null;
        const errors = this.db
          .query(
            "SELECT id, render_error FROM activities WHERE session_id = ? AND status = 'error' AND render_error IS NOT NULL AND render_seen = 0 ORDER BY created_at DESC LIMIT 5",
          )
          .all(sessionId) as { id: string; render_error: string }[];
        const requests = this.requests(sessionId);
        const seenIds = requests.filter((item) => item.status === "sent").map((item) => item.id);
        if (seenIds.length > 0) this.markRequestsSeen(sessionId, seenIds);
        if (answered) {
          this.db.query("UPDATE activities SET response_seen = 1 WHERE id = ?").run(answered.id);
          const activity = toActivity(answered);
          const renderErrors = errors.map((row) => ({ activityId: row.id, message: row.render_error }));
          this.markRenderErrorsSeen(renderErrors.map((row) => row.activityId));
          return {
            status: "answered",
            activity,
            requests: this.requests(sessionId),
            renderErrors,
            agentConnected: true,
          };
        }
        if (errors.length > 0) {
          this.markRenderErrorsSeen(errors.map((row) => row.id));
          return {
            status: "timeout",
            requests: this.requests(sessionId),
            renderErrors: errors.map((row) => ({ activityId: row.id, message: row.render_error })),
            agentConnected: true,
          };
        }
        if (Date.now() >= deadline) {
          const pending = this.db
            .query(
              "SELECT * FROM activities WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
            )
            .get(sessionId) as ActivityRow | null;
          return {
            status: "timeout",
            requests: this.requests(sessionId),
            renderErrors: errors.map((row) => ({ activityId: row.id, message: row.render_error })),
            waitingFor: pending
              ? { activityId: pending.id, title: parseSpec(pending).title ?? "activity", createdAt: pending.created_at }
              : undefined,
            agentConnected: true,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, AWAIT_STEP_MS));
      }
    } finally {
      this.clearListening();
    }
  }

  private markRenderErrorsSeen(ids: string[]): void {
    for (const id of ids) {
      this.db.query("UPDATE activities SET render_seen = 1 WHERE id = ?").run(id);
    }
  }

  recordEvidence(input: {
    sessionId: string;
    conceptId: string;
    kind: string;
    correct?: boolean | null;
    confidence?: string | null;
    timeSec?: number;
    excerpt?: string;
  }): { id: number; sessionId: string; conceptId: string } {
    const session = this.sessionRow(input.sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    if (!input.conceptId.trim()) throw new SessionError("concept_id is required");
    if (!input.kind.trim()) throw new SessionError("kind is required");
    const result = this.db
      .query(
        `INSERT INTO evidence (session_id, concept_id, kind, correct, confidence, time_sec, excerpt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.sessionId,
        input.conceptId,
        input.kind,
        input.correct === undefined || input.correct === null ? null : input.correct ? 1 : 0,
        input.confidence ?? null,
        Math.max(0, Math.round(input.timeSec ?? 0)),
        input.excerpt ?? null,
        Date.now(),
      );
    this.touch(input.sessionId);
    this.events.publish({
      type: "session",
      course: session.course,
      sessionId: input.sessionId,
      state: "evidence",
      at: Date.now(),
    });
    return { id: Number(result.lastInsertRowid), sessionId: input.sessionId, conceptId: input.conceptId };
  }

  async bankActivity(
    activityId: string,
    tags: string[] = [],
  ): Promise<{ path: string; id: string; sessionId: string }> {
    const row = this.db.query("SELECT * FROM activities WHERE id = ?").get(activityId) as ActivityRow | null;
    if (!row) throw new SessionError(`activity not found: ${activityId}`);
    if (row.banked && row.banked_path) {
      return { path: row.banked_path, id: row.id, sessionId: row.session_id };
    }
    const spec = parseSpec(row);
    const cites = JSON.parse(row.cites_json) as Cite[];
    if (!cites.some((cite) => cite.quote)) {
      throw new SessionError("banked activities need at least one citation with a quote");
    }
    const title = spec.title ?? spec.components[0]?.type ?? "Activity";
    const dir = `courses/${row.course}/activities`;
    const filename = `${slug(title).slice(0, 48) || "activity"}-${row.id.slice(4, 12)}.md`;
    const path = `${dir}/${filename}`;
    mkdirSync(join(this.vault.root, dir), { recursive: true });
    if (!existsSync(join(this.vault.root, path))) {
      const body = [
        "---",
        stringifyYaml(
          {
            title,
            type: "activity",
            activity_id: row.id,
            course: row.course,
            topics: tags,
            cites,
            spec,
          },
          { lineWidth: 0 },
        ).trimEnd(),
        "---",
        "",
        `# ${title}`,
        "",
        spec.instructions ?? "Banked activity. Replay it without an agent.",
        "",
        "```json",
        JSON.stringify(spec, null, 2),
        "```",
        "",
      ].join("\n");
      await this.vault.writeNote({ path, content: body, mode: "create" });
    }
    this.db.query("UPDATE activities SET banked = 1, banked_path = ? WHERE id = ?").run(path, row.id);
    return { path, id: row.id, sessionId: row.session_id };
  }

  private fallbackSummary(session: SessionRow): string {
    const concepts = this.db
      .query(
        `SELECT DISTINCT c.title AS title FROM concepts c JOIN evidence e ON e.concept_id = c.id WHERE e.session_id = ? ORDER BY c.title`,
      )
      .all(session.id) as { title: string }[];
    const scores = this.db
      .query(
        `SELECT COALESCE(SUM(CASE WHEN e.correct = 1 THEN 1 ELSE 0 END), 0) AS right, COALESCE(SUM(CASE WHEN e.correct = 0 THEN 1 ELSE 0 END), 0) AS wrong FROM evidence e WHERE e.session_id = ?`,
      )
      .get(session.id) as { right: number; wrong: number };
    return [
      `Goal: ${session.goal}`,
      "",
      `Concepts touched: ${concepts.map((item) => item.title).join(", ") || "none"}`,
      "",
      `Answers: ${scores.right} right, ${scores.wrong} wrong`,
    ].join("\n");
  }

  async end(sessionId: string, summary = ""): Promise<SessionDetail> {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) return this.detail(sessionId);
    const now = Date.now();
    this.goals?.recordSessionCarryOver(sessionId, now);
    const counts = this.db
      .query(
        `SELECT COUNT(*) AS activities,
          COALESCE(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END),0) AS answered
         FROM activities WHERE session_id = ?`,
      )
      .get(sessionId) as { activities: number; answered: number };
    const evidence = this.db
      .query("SELECT COUNT(*) AS count FROM evidence WHERE session_id = ?")
      .get(sessionId) as { count: number };
    const messages = this.messages(sessionId);
    const clean = summary.trim() || this.fallbackSummary(session);
    const date = new Date(session.started_at).toISOString().slice(0, 10);
    const path = `courses/${session.course}/sessions/${date}-${session.id}.md`;
    const body = [
      "---",
      stringifyYaml(
        {
          title: `Session ${date}`,
          type: "session",
          session_id: session.id,
          course: session.course,
          goal: session.goal,
          started_at: new Date(session.started_at).toISOString(),
          ended_at: new Date(now).toISOString(),
          activities: counts.activities,
          answered: counts.answered,
          evidence: evidence.count,
        },
        { lineWidth: 0 },
      ).trimEnd(),
      "---",
      "",
      `# Session ${date}`,
      "",
      clean,
      "",
      "## Activity log",
      "",
      ...(
        this.db
          .query("SELECT * FROM activities WHERE session_id = ? ORDER BY created_at ASC")
          .all(sessionId) as ActivityRow[]
      ).map((row) => {
        const spec = parseSpec(row);
        return `- ${spec.title ?? spec.components[0]?.type ?? "Activity"} (${row.status})`;
      }),
      "",
      "## Agent messages",
      "",
      ...messages.map((msg) => {
        const cites = msg.cites.length ? ` (${msg.cites.map((c) => c.note).join(", ")})` : "";
        return `- [${msg.kind}] ${msg.text}${cites}`;
      }),
      "",
    ].join("\n");
    if (!existsSync(join(this.vault.root, path))) {
      await this.vault.writeNote({ path, content: body, mode: "create" });
    }
    this.db
      .query("UPDATE sessions SET ended_at = ?, summary = ?, note_path = ?, agent_seen_at = ? WHERE id = ?")
      .run(now, clean, path, now, sessionId);
    this.events.publish({
      type: "session",
      course: session.course,
      sessionId,
      state: "ended",
      at: now,
    });
    return this.detail(sessionId);
  }

  async reopen(sessionId: string): Promise<SessionDetail> {
    const session = this.sessionRow(sessionId);
    if (!session.ended_at) throw new SessionError("session is not ended");
    const now = Date.now();
    this.request(sessionId, "Resumed this session. Continue where we left off.");
    this.db
      .query("UPDATE sessions SET ended_at = NULL, agent_seen_at = NULL WHERE id = ?")
      .run(sessionId);
    this.events.publish({
      type: "session",
      course: session.course,
      sessionId,
      state: "reopened",
      at: now,
    });
    return this.detail(sessionId);
  }

  history(course?: string): unknown[] {
    const rows = (
      course
        ? this.db
            .query("SELECT * FROM sessions WHERE course = ? ORDER BY started_at DESC LIMIT 20")
            .all(course)
        : this.db.query("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20").all()
    ) as SessionRow[];
    return rows.map((row) => {
      const ended = Boolean(row.ended_at);
      const pending = this.db
        .query("SELECT COUNT(*) AS count FROM activities WHERE session_id = ? AND status = 'pending'")
        .get(row.id) as { count: number };
      const agentSeenAt = row.agent_seen_at;
      const agentConnected = Boolean(agentSeenAt && Date.now() - agentSeenAt < AGENT_WINDOW_MS);
      let status = "Ended";
      if (!ended) {
        if (pending.count > 0) status = "Waiting for your answer";
        else if (agentConnected) status = "Agent connected";
        else status = "Agent not connected";
      }
      return {
        id: row.id,
        course: row.course,
        goal: row.goal,
        title: row.title,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        summary: row.summary,
        notePath: row.note_path,
        status,
        pendingCount: pending.count,
        agentConnected,
      };
    });
  }

  conceptSessions(conceptId: string): Array<{
    id: string;
    course: string;
    goal: string;
    startedAt: number;
    endedAt: number | null;
    evidenceCount: number;
    correctCount: number;
    lastAt: number;
  }> {
    const rows = this.db
      .query(
        `SELECT s.id, s.course, s.goal, s.started_at, s.ended_at,
                COUNT(e.id) AS evidence_count,
                COALESCE(SUM(CASE WHEN e.correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
                MAX(e.created_at) AS last_at
         FROM sessions s
         JOIN evidence e ON e.session_id = s.id
         WHERE e.concept_id = ?
         GROUP BY s.id
         ORDER BY last_at DESC`,
      )
      .all(conceptId) as Array<{
        id: string;
        course: string;
        goal: string;
        startedAt: number;
        endedAt: number | null;
        evidenceCount: number;
        correctCount: number;
        lastAt: number;
      }>;
    return rows;
  }

  sessionConcepts(sessionId: string): Array<{
    id: string;
    course: string;
    title: string;
    evidenceCount: number;
    correctCount: number;
  }> {
    const rows = this.db
      .query(
        `SELECT c.id, c.course, c.title,
                COUNT(e.id) AS evidence_count,
                COALESCE(SUM(CASE WHEN e.correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count
         FROM concepts c
         JOIN evidence e ON e.concept_id = c.id
         WHERE e.session_id = ?
         GROUP BY c.id
         ORDER BY MAX(e.created_at) DESC`,
      )
      .all(sessionId) as Array<{
        id: string;
        course: string;
        title: string;
        evidenceCount: number;
        correctCount: number;
      }>;
    return rows;
  }
}
