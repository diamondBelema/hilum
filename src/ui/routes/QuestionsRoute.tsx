import { api, type Course } from "../api.ts";
import { QuestionsLazy } from "./lazy.ts";

export function QuestionsRoute({ courses }: { courses: Course[] }) {
  return <QuestionsLazy courses={courses} />;
}
