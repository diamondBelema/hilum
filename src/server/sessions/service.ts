import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { Db } from "../db.ts";
import type { VaultService } from "../vault/service.ts";
import { slug } from "../vault/paths.ts";
import type { EventBus } from "../events.ts";
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
  started_at: number;
  ended_at: number | null;
  summary: string;
  note_path: string | null;
  agent_seen_at: number | null;
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
  startedAt: number;
  endedAt: number | null;
  summary: string;
  notePath: string | null;
  agentSeenAt: number | null;
  agentConnected: boolean;
  agentPreparing: boolean;
  activity: SessionActivity | null;
  activities: SessionActivity[];
  requests: { id: number; text: string; status: string; createdAt: number }[];
  messages: { id: number; kind: string; text: string; createdAt: number }[];
  evidenceCount: number;
};

const AGENT_WINDOW_MS = 3 * 60_000;
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
    private readonly db: Db,
    private readonly vault: VaultService,
    private readonly events: EventBus,
  ) {}

  private sessionRow(id: string): SessionRow {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | null;
    if (!row) throw new SessionError(`session not found: ${id}`);
    return row;
  }

  touch(id: string): void {
    this.db.query("UPDATE sessions SET agent_seen_at = ? WHERE id = ?").run(Date.now(), id);
  }

  async start(course: string, goal = "learn", actor: "agent" | "app" = "agent"): Promise<SessionDetail> {
    if (!course.trim()) throw new SessionError("course is required");
    const exists = (await this.vault.listCourses()).some((item) => item.code === course);
    if (!exists) throw new SessionError(`course not found: ${course}`);
    const active = this.db
      .query("SELECT * FROM sessions WHERE course = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
      .get(course) as SessionRow | null;
    if (active) {
      if (actor === "agent") this.touch(active.id);
      return this.detail(active.id);
    }
    const id = `sess-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .query("INSERT INTO sessions (id, course, goal, started_at, agent_seen_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, course, goal, now, actor === "agent" ? now : null);
    this.events.publish({ type: "session", course, sessionId: id, state: "started", at: Date.now() });
    return this.detail(id);
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
    const agentSeenAt = row.agent_seen_at;
    const unseenResponse = rows.some((item) => item.status === "answered" && item.response_seen === 0);
    const openRequests = requests.some((item) => item.status === "open");
    return {
      id: row.id,
      course: row.course,
      goal: row.goal,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      summary: row.summary,
      notePath: row.note_path,
      agentSeenAt,
      agentConnected: Boolean(agentSeenAt && Date.now() - agentSeenAt < AGENT_WINDOW_MS),
      agentPreparing: Boolean(unseenResponse || openRequests),
      activity,
      activities,
      requests: requests.map((item) => ({
        id: item.id,
        text: item.text,
        status: item.status,
        createdAt: item.created_at,
      })),
      messages,
      evidenceCount: evidence.count,
    };
  }

  async pushActivity(sessionId: string, input: unknown): Promise<SessionActivity> {
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
        `INSERT INTO activities (id, session_id, course, spec_json, cites_json, concept_ids, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(id, sessionId, session.course, JSON.stringify(spec), JSON.stringify(cites), JSON.stringify(conceptIds), now);
    this.touch(sessionId);
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

  request(sessionId: string, text: string): { id: number; text: string; status: string; createdAt: number } {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    const clean = text.trim();
    if (!clean) throw new SessionError("request is empty");
    if (clean.length > 500) throw new SessionError("request is too long (max 500 characters)");
    const now = Date.now();
    const result = this.db
      .query("INSERT INTO agent_requests (session_id, text, created_at) VALUES (?, ?, ?)")
      .run(sessionId, clean, now);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId: "",
      state: "request",
      at: now,
    });
    return { id: Number(result.lastInsertRowid), text: clean, status: "open", createdAt: now };
  }

  requests(sessionId: string): { id: number; text: string; status: string; createdAt: number }[] {
    this.sessionRow(sessionId);
    const rows = this.db
      .query("SELECT * FROM agent_requests WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as RequestRow[];
    return rows.map((row) => ({ id: row.id, text: row.text, status: row.status, createdAt: row.created_at }));
  }

  markRequestsDelivered(sessionId: string, ids: number[]): void {
    for (const id of ids) {
      this.db
        .query("UPDATE agent_requests SET status = 'delivered' WHERE id = ? AND session_id = ?")
        .run(id, sessionId);
    }
  }

  say(
    sessionId: string,
    text: string,
    kind = "say",
  ): { id: number; text: string; kind: string; createdAt: number } {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) throw new SessionError("session has ended");
    const clean = text.trim();
    if (!clean) throw new SessionError("message is empty");
    if (clean.length > 2000) throw new SessionError("message is too long (max 2000 characters)");
    const now = Date.now();
    const result = this.db
      .query(
        "INSERT INTO agent_messages (session_id, kind, text, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(sessionId, kind, clean, now);
    this.touch(sessionId);
    this.events.publish({
      type: "activity",
      course: session.course,
      sessionId,
      activityId: "",
      state: "agent_message",
      at: now,
    });
    return { id: Number(result.lastInsertRowid), text: clean, kind, createdAt: now };
  }

  messages(sessionId: string): {
    id: number;
    kind: string;
    text: string;
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
        created_at: number;
      }[];
    return rows.map((row) => ({ id: row.id, kind: row.kind, text: row.text, createdAt: row.created_at }));
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
      if (answered) {
        this.db.query("UPDATE activities SET response_seen = 1 WHERE id = ?").run(answered.id);
        const activity = toActivity(answered);
        const renderErrors = errors.map((row) => ({ activityId: row.id, message: row.render_error }));
        this.markRenderErrorsSeen(renderErrors.map((row) => row.activityId));
        return {
          status: "answered",
          activity,
          requests,
          renderErrors,
          agentConnected: true,
        };
      }
      if (errors.length > 0) {
        this.markRenderErrorsSeen(errors.map((row) => row.id));
        return {
          status: "timeout",
          requests,
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
          requests,
          renderErrors: errors.map((row) => ({ activityId: row.id, message: row.render_error })),
          waitingFor: pending
            ? { activityId: pending.id, title: parseSpec(pending).title ?? "activity", createdAt: pending.created_at }
            : undefined,
          agentConnected: true,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, AWAIT_STEP_MS));
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

  async end(sessionId: string, summary = ""): Promise<SessionDetail> {
    const session = this.sessionRow(sessionId);
    if (session.ended_at) return this.detail(sessionId);
    const now = Date.now();
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
    const clean = summary.trim();
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
      clean || "No summary was written.",
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

  history(course?: string): unknown[] {
    const rows = (
      course
        ? this.db
            .query("SELECT * FROM sessions WHERE course = ? ORDER BY started_at DESC LIMIT 20")
            .all(course)
        : this.db.query("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20").all()
    ) as SessionRow[];
    return rows.map((row) => ({
      id: row.id,
      course: row.course,
      goal: row.goal,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      summary: row.summary,
      notePath: row.note_path,
    }));
  }
}
