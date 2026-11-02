import { api, type Course } from "../api.ts";
import { GraphLazy } from "./lazy.ts";
import { navigate } from "../lib/router.ts";

export function GraphRoute({
  courses,
  onStudy,
}: {
  courses: Course[];
  onStudy: (course: string, goal: string) => void;
}) {
  const course = courses.find((item) => item.concepts > 0) ?? courses[0];
  if (!course) return null;
  return <GraphLazy courses={courses} onStudy={onStudy} />;
}
