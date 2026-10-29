import { describe, expect, test } from "bun:test";
import { parseRoute } from "../src/ui/lib/router.ts";
import { isPractice, sessionTitle, shortStatus, statusFor } from "../src/ui/components/Sidebar.tsx";
import type { SessionDetail, SessionSummary } from "../src/ui/api.ts";

describe("router", () => {
  test("maps the public routes", () => {
    expect(parseRoute("/")).toEqual({ name: "home" });
    expect(parseRoute("/sessions/abc")).toEqual({ name: "session", id: "abc" });
    expect(parseRoute("/library")).toEqual({ name: "library", section: null });
    expect(parseRoute("/library/notes")).toEqual({ name: "library", section: "notes" });
    expect(parseRoute("/settings")).toEqual({ name: "settings" });
  });

  test("tolerates trailing slashes and decodes ids", () => {
    expect(parseRoute("/sessions/abc/")).toEqual({ name: "session", id: "abc" });
    expect(parseRoute("/sessions/a%20b")).toEqual({ name: "session", id: "a b" });
    expect(parseRoute("/library/")).toEqual({ name: "library", section: null });
  });

  test("keeps unknown paths out of the shell routes", () => {
    expect(parseRoute("/nope").name).toBe("not-found");
    expect(parseRoute("/library/notes/extra").name).toBe("not-found");
  });
});

const base: SessionSummary = {
  id: "s1",
  course: "ana-211",
  goal: "Teach me the nephron",
  startedAt: Date.now() - 60_000,
  endedAt: null,
  summary: "",
  notePath: null,
};

const detail: SessionDetail = {
  ...base,
  agentSeenAt: Date.now(),
  agentConnected: true,
  agentPreparing: false,
  activity: null,
  activities: [],
  requests: [],
  messages: [],
  transcript: [],
  evidenceCount: 0,
};

describe("session rows", () => {
  test("title comes from the goal and hides the practice prefix", () => {
    expect(sessionTitle("Teach me the nephron")).toBe("Teach me the nephron");
    expect(sessionTitle("Practice: loop of Henle")).toBe("loop of Henle");
    expect(sessionTitle("   ")).toBe("Untitled session");
    expect(isPractice("Practice: loop of Henle")).toBe(true);
    expect(isPractice("Teach me the nephron")).toBe(false);
  });

  test("status is derived from SessionDetail fields", () => {
    expect(statusFor({ ...base, endedAt: Date.now() }, detail)).toBe("Ended");
    expect(statusFor(base, { ...detail, activities: [{ status: "pending" } as SessionDetail["activities"][number]] })).toBe(
      "Waiting for your answer",
    );
    expect(statusFor(base, { ...detail, activities: [], agentPreparing: true })).toBe("Agent working");
    expect(statusFor(base, { ...detail, activities: [], agentPreparing: false })).toBe("Agent connected");
    expect(statusFor(base, { ...detail, agentConnected: false, agentPreparing: false })).toBe(
      "Agent not connected",
    );
    expect(statusFor(base, undefined)).toBe("Active");
  });

  test("row meta uses a compact status that fits two lines", () => {
    expect(shortStatus("Waiting for your answer")).toBe("Waiting");
    expect(shortStatus("Agent working")).toBe("Working");
    expect(shortStatus("Agent connected")).toBe("Connected");
    expect(shortStatus("Agent not connected")).toBe("No agent");
    expect(shortStatus("Ended")).toBe("Ended");
  });
});
