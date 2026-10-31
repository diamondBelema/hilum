import { describe, expect, test } from "bun:test";
import { graphHref, parseRoute, questionsHref } from "../src/ui/lib/router.ts";
import { isPractice, sessionTitle } from "../src/ui/components/Sidebar.tsx";
import type { SessionSummary } from "../src/ui/api.ts";

describe("router", () => {
  test("builds stable deep links for graph integrations", () => {
    expect(graphHref("ana-211", "loop of Henle")).toBe(
      "/library/graph?course=ana-211&concept=loop+of+Henle",
    );
    expect(questionsHref("ana-211", "q/1")).toBe(
      "/library/questions?course=ana-211&q=q%2F1",
    );
    expect(graphHref("ana-211")).toBe("/library/graph?course=ana-211");
  });

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
  status: "Agent not connected",
  pendingCount: 0,
  agentConnected: false,
};

describe("session rows", () => {
  test("title comes from the goal and hides the practice prefix", () => {
    expect(sessionTitle("Teach me the nephron")).toBe("Teach me the nephron");
    expect(sessionTitle("Practice: loop of Henle")).toBe("loop of Henle");
    expect(sessionTitle("   ")).toBe("Untitled session");
    expect(isPractice("Practice: loop of Henle")).toBe(true);
    expect(isPractice("Teach me the nephron")).toBe(false);
  });

  test("row meta shows the full text status", () => {
    expect(base.status).toBe("Agent not connected");
    expect({ ...base, endedAt: Date.now() }.status).toBe("Agent not connected");
  });
});
