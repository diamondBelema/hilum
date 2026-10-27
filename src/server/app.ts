import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, paths, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { handleMcpRequest } from "./mcp.ts";
import { QuestionBank, QuestionError } from "./questions/service.ts";
import { CitationError } from "./questions/citations.ts";
import { ExamError, ExamRunner } from "./exams/attempts.ts";
import { PaperError, PaperService } from "./exams/papers.ts";
import { GradingError, GradingService } from "./exams/grading.ts";
import { EventBus } from "./events.ts";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NoteIndexer } from "./vault/indexer.ts";
import { VaultService } from "./vault/service.ts";
import { resolveInside, VaultPathError } from "./vault/paths.ts";
import { ZodError } from "zod";

export type AppDeps = {
  config?: Partial<Config>;
};

export function createApp(deps: AppDeps = {}) {
  const config = loadConfig(deps.config);
  const db = openDb(config.dbPath);
  const indexer = new NoteIndexer(db, config.vaultPath);
  const vault = new VaultService(db, config.vaultPath, indexer);
  const questions = new QuestionBank(db, vault);
  const papers = new PaperService(db, vault);
  const events = new EventBus();
  const runner = new ExamRunner(db, papers, events);
  const grading = new GradingService(
    db,
    papers,
    events,
    `http://${config.hostname}:${config.port}`,
  );
  const app = new Hono();

  app.onError((err, c) => {
    if (
      err instanceof VaultPathError ||
      err instanceof QuestionError ||
      err instanceof PaperError ||
      err instanceof ExamError ||
      err instanceof GradingError
    ) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof CitationError) return c.json({ error: err.message }, 422);
    if (err instanceof ZodError) return c.json({ error: zodMessage(err) }, 400);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return c.json({ error: "not found" }, 404);
    console.error(err);
    return c.json({ error: "internal server error" }, 500);
  });

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      version: config.version,
      mcp: "/mcp",
      vault: config.vaultPath,
      db: config.dbPath,
      stats: vault.stats(),
    }),
  );

  app.get("/api/meta", (c) => {
    const rows = db.query("SELECT key, value FROM meta ORDER BY key").all();
    return c.json({ meta: rows });
  });

  app.get("/api/courses", async (c) => c.json(await vault.listCourses()));

  app.get("/api/courses/:code/notes", (c) =>
    c.json(vault.notesForCourse(c.req.param("code"))),
  );

  app.get("/api/index", (c) => c.json(vault.getIndex(c.req.query("course"))));

  app.get("/api/note", (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    return c.json(vault.readNote(path));
  });

  app.get("/api/search", (c) => {
    const query = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json(vault.search(query, c.req.query("course"), limit));
  });

  app.get("/api/assets", async (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(await vault.listAssets(course));
  });

  app.get("/api/asset", async (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    const abs = resolveInside(config.vaultPath, path);
    const file = Bun.file(abs);
    if (!(await file.exists())) return c.json({ error: "not found" }, 404);
    return new Response(file, { headers: { "content-type": file.type } });
  });

  app.get("/api/questions", async (c) => {
    const verified = c.req.query("verified");
    return c.json(
      await questions.list({
        course: c.req.query("course"),
        type: c.req.query("type"),
        topic: c.req.query("topic"),
        search: c.req.query("q"),
        verified: verified === undefined ? undefined : verified === "true",
        limit: Number(c.req.query("limit") ?? 200),
      }),
    );
  });

  app.get("/api/questions/:id", (c) => c.json(questions.get(c.req.param("id"))));

  app.patch("/api/questions/:id", async (c) => {
    const body = await c.req.json();
    return c.json(await questions.update(c.req.param("id"), body));
  });

  app.post("/api/questions/:id/verify", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(questions.verify(c.req.param("id"), body.verified !== false));
  });

  app.post("/api/papers", async (c) => {
    const body = await c.req.json();
    return c.json(
      await papers.create({
        course: body.course,
        title: body.title,
        blueprint: body.blueprint,
        mode: body.mode,
        durationSec: body.duration_sec,
      }),
      201,
    );
  });

  app.get("/api/papers", (c) => c.json(papers.list(c.req.query("course"))));

  app.get("/api/papers/:id", (c) => c.json(papers.get(c.req.param("id"))));

  app.get("/api/attempts", (c) => c.json(runner.attempts(c.req.query("course") || undefined)));

  app.post("/api/attempts", async (c) => {
    const body = await c.req.json();
    return c.json(runner.start(body.paper_id), 201);
  });

  app.get("/api/attempts/:id", (c) => c.json(runner.get(c.req.param("id"))));

  app.post("/api/attempts/:id/answers", async (c) => {
    const body = await c.req.json();
    return c.json(
      runner.save(c.req.param("id"), {
        questionId: body.question_id,
        response: body.response,
        timeSpentSec: body.time_spent_sec,
        flagged: body.flagged,
      }),
    );
  });

  app.post("/api/attempts/:id/submit", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(runner.submit(c.req.param("id"), { auto: body.auto === true }));
  });

  app.get("/api/attempts/:id/results", (c) => c.json(runner.results(c.req.param("id"))));

  app.get("/api/grading", (c) =>
    c.json(
      grading.pending({
        course: c.req.query("course") || undefined,
        limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      }),
    ),
  );

  app.get("/api/grading/:id/prompt", (c) =>
    c.json({ prompt: grading.prompt(Number(c.req.param("id"))) }),
  );

  app.post("/api/answers/:id/grade", async (c) => {
    const body = await c.req.json();
    const id = Number(c.req.param("id"));
    if (body.answer_id !== undefined && Number(body.answer_id) !== id) {
      throw new GradingError("answer_id in the payload does not match the URL");
    }
    return c.json(grading.grade({ ...body, answer_id: id }));
  });

  app.post("/api/attempts/:id/photo", async (c) => {
    const attemptId = c.req.param("id");
    const form = await c.req.formData();
    const questionId = String(form.get("question_id") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ExamError("photo upload needs a file");
    if (!/^[A-Za-z0-9._-]+$/.test(questionId)) throw new ExamError("invalid question id");
    if (file.size === 0) throw new ExamError("the photo is empty");
    if (file.size > 10 * 1024 * 1024) throw new ExamError("the photo must be 10 MB or smaller");
    const extension = PHOTO_TYPES.get(file.type);
    if (!extension) throw new ExamError("the photo must be JPEG, PNG or WebP");

    const session = runner.get(attemptId);
    if (session.attempt.status !== "in_progress") {
      throw new ExamError("attempt already submitted");
    }
    if (!session.paper.items.some((item) => item.question.id === questionId)) {
      throw new ExamError(`question ${questionId} is not in this paper`);
    }

    const name = `${attemptId}-${questionId}-${Date.now()}.${extension}`;
    await mkdir(config.uploadPath, { recursive: true });
    await writeFile(join(config.uploadPath, name), new Uint8Array(await file.arrayBuffer()));
    try {
      const current = session.answers.find((answer) => answer.questionId === questionId)?.response;
      const base =
        current && typeof current === "object" ? (current as Record<string, unknown>) : {};
      const text = form.get("text");
      const response = {
        ...base,
        photo: name,
        ...(typeof text === "string" && text.length > 0 ? { text } : {}),
      };
      const time = Number(form.get("time_spent_sec") ?? 0);
      return c.json(
        runner.save(attemptId, {
          questionId,
          response,
          timeSpentSec: Number.isFinite(time) ? time : 0,
        }),
      );
    } catch (err) {
      await unlink(join(config.uploadPath, name)).catch(() => {});
      throw err;
    }
  });

  app.get("/api/attempts/:id/photo/:questionId", async (c) => {
    const attemptId = c.req.param("id");
    const questionId = c.req.param("questionId");
    const file = c.req.query("file") ?? "";
    if (!new RegExp(`^${escapeRegExp(attemptId)}-${escapeRegExp(questionId)}-[0-9]+\\.(jpg|jpeg|png|webp)$`).test(file)) {
      throw new ExamError("invalid photo file");
    }
    const session = runner.get(attemptId);
    if (!session.paper.items.some((item) => item.question.id === questionId)) {
      throw new ExamError(`question ${questionId} is not in this paper`);
    }
    const path = resolveInside(config.uploadPath, file);
    const bytes = await readFile(path);
    return new Response(bytes, {
      headers: {
        "content-type": PHOTO_MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "private, no-store",
      },
    });
  });

  app.get("/api/events", (c) => {
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearInterval(timer);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        };
        write(`data: ${JSON.stringify({ type: "hello", at: Date.now() })}\n\n`);
        unsubscribe = events.subscribe((event) => write(`data: ${JSON.stringify(event)}\n\n`));
        timer = setInterval(() => write(": ping\n\n"), 20000);
        c.req.raw.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        closed = true;
        if (timer) clearInterval(timer);
        unsubscribe();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  });

  app.all("/mcp", (c) => handleMcpRequest(c.req.raw, config, vault, questions, papers, runner, grading));

  app.get("/_design", async (c) => c.html(await Bun.file(paths.uiIndex).text()));

  app.use("/*", serveStatic({ root: paths.uiDist }));
  app.get("*", serveStatic({ path: paths.uiIndex }));

  return { app, config, db, vault, indexer, questions, papers, runner, grading };
}

function zodMessage(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}

const PHOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const PHOTO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
