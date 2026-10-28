import type { Course } from "../api.ts";

export function defaultCourse(courses: Course[], kind: "questions" | "concepts"): string {
  return (
    courses.find((course) => course[kind] > 0)?.code ??
    courses.find((course) => course.notes > 0)?.code ??
    courses[0]?.code ??
    ""
  );
}
