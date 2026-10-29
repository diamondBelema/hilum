import { describe, expect, test } from "bun:test";
import {
  chooseInitialCourse,
  filterCourses,
  initialPickerState,
  pickerReducer,
  readLastCourse,
  writeLastCourse,
} from "../src/ui/components/CoursePicker.tsx";
import { startIntent } from "../src/ui/components/Composer.tsx";
import type { Course } from "../src/ui/api.ts";

const courses: Course[] = [
  { code: "ana-211", title: "Anatomy 211", department: "anatomy", answerStyle: null, examDate: null, notes: 12, tokens: 900, questions: 4, concepts: 8 },
  { code: "bch-201", title: "Biochemistry 201", department: "biochemistry", answerStyle: null, examDate: null, notes: 7, tokens: 500, questions: 2, concepts: 5 },
];

describe("course picker", () => {
  test("opens closed, and opening resets the search and active row", () => {
    expect(initialPickerState.open).toBe(false);
    const opened = pickerReducer({ ...initialPickerState, query: "bch", active: 1 }, { type: "open" });
    expect(opened).toMatchObject({ open: true, query: "", active: 0 });
  });

  test("arrow keys move and wrap; Home and End jump", () => {
    let state = pickerReducer(initialPickerState, { type: "open" });
    state = pickerReducer(state, { type: "move", delta: 1, count: 2 });
    expect(state.active).toBe(1);
    state = pickerReducer(state, { type: "move", delta: 1, count: 2 });
    expect(state.active).toBe(0);
    state = pickerReducer(state, { type: "move", delta: -1, count: 2 });
    expect(state.active).toBe(1);
    expect(pickerReducer(state, { type: "home" }).active).toBe(0);
    expect(pickerReducer(state, { type: "end", count: 2 }).active).toBe(1);
  });

  test("selecting remembers the course and closes the picker", () => {
    const state = pickerReducer(
      { ...initialPickerState, open: true, active: 1 },
      { type: "select", code: "bch-201" },
    );
    expect(state).toMatchObject({ open: false, selectedCode: "bch-201", active: 0, query: "" });
  });

  test("escape closes without changing the selection", () => {
    const state = pickerReducer(
      { ...initialPickerState, open: true, selectedCode: "ana-211" },
      { type: "close" },
    );
    expect(state.open).toBe(false);
    expect(state.selectedCode).toBe("ana-211");
  });

  test("the last course is remembered across visits", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    };
    expect(readLastCourse(storage)).toBeNull();
    writeLastCourse("bch-201", storage);
    expect(readLastCourse(storage)).toBe("bch-201");
    expect(chooseInitialCourse(courses, readLastCourse(storage))?.code).toBe("bch-201");
  });

  test("preselects the only course; otherwise waits for a choice", () => {
    expect(chooseInitialCourse([courses[0]!], null)?.code).toBe("ana-211");
    expect(chooseInitialCourse(courses, null)).toBeNull();
    expect(chooseInitialCourse(courses, "missing")).toBeNull();
  });

  test("filters by title or course code", () => {
    expect(filterCourses(courses, "bio").map((course) => course.code)).toEqual(["bch-201"]);
    expect(filterCourses(courses, "211").map((course) => course.code)).toEqual(["ana-211"]);
    expect(filterCourses(courses, "  ")).toHaveLength(2);
  });
});

describe("composer send", () => {
  test("send without a course asks for one and names the course problem", () => {
    expect(startIntent("teach me", courses, null, "teach")).toEqual({
      kind: "need-course",
      message: "Choose a course before starting.",
    });
    expect(startIntent("teach me", [], null, "teach")).toEqual({
      kind: "need-course",
      message: "There are no courses yet. Add a course to the vault, then reload.",
    });
  });

  test("practice keeps the mode in the stored goal", () => {
    expect(startIntent("  loop of Henle  ", courses, courses[0]!, "practice")).toEqual({
      kind: "start",
      goal: "Practice: loop of Henle",
    });
    expect(startIntent("loop of Henle", courses, courses[0]!, "teach")).toEqual({
      kind: "start",
      goal: "loop of Henle",
    });
    expect(startIntent("   ", courses, courses[0]!, "teach")).toEqual({ kind: "empty" });
  });
});
