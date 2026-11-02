import { api, type Course } from "../api.ts";
import { navigate } from "../lib/router.ts";
import { PapersLazy } from "./lazy.ts";

export function PapersRoute({ courses }: { courses: Course[] }) {
  const course = courses.find((item) => item.questions > 0) ?? courses[0];
  if (!course) return null;
  return <PapersLazy course={course} onBack={() => navigate("/library")} />;
}
