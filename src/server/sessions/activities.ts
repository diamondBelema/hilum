import { z } from "zod";

export const ACTIVITY_TYPES = [
  "flashcard",
  "cloze",
  "mcq_single",
  "tf_multi",
  "theory",
  "worked_example_stepper",
  "predict_reveal",
  "compare_table",
  "mermaid_diagram",
  "confidence_rating",
  "think_aloud",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export class ActivitySpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivitySpecError";
  }
}

const citeSchema = z
  .object({
    note: z.string().min(1),
    anchor: z.string().optional(),
    quote: z.string().optional(),
  })
  .strict();

const conceptIds = z.array(z.string().min(1)).default([]);

const flashcard = z
  .object({ type: z.literal("flashcard"), front: z.string().min(1), back: z.string().min(1), concept_ids: conceptIds })
  .strict();

const cloze = z
  .object({ type: z.literal("cloze"), text: z.string().min(1), explanation: z.string().optional(), concept_ids: conceptIds })
  .strict();

const mcq = z
  .object({
    type: z.literal("mcq_single"),
    stem: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(8),
    answer: z.number().int().min(0),
    explanation: z.string().optional(),
    concept_ids: conceptIds,
  })
  .strict();

const tf = z
  .object({
    type: z.literal("tf_multi"),
    stem: z.string().min(1),
    statements: z
      .array(z.object({ text: z.string().min(1), answer: z.boolean(), explanation: z.string().optional() }).strict())
      .min(2)
      .max(6),
    scoring: z.enum(["per_statement", "all_or_nothing"]).default("per_statement"),
    concept_ids: conceptIds,
  })
  .strict();

const theory = z
  .object({
    type: z.literal("theory"),
    prompt: z.string().min(1),
    marks: z.number().positive().default(5),
    model_answer: z.string().optional(),
    rubric: z.array(z.object({ point: z.string().min(1), marks: z.number().positive() }).strict()).optional(),
    concept_ids: conceptIds,
  })
  .strict();

const stepper = z
  .object({
    type: z.literal("worked_example_stepper"),
    title: z.string().min(1),
    steps: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) }).strict()).min(1).max(12),
    concept_ids: conceptIds,
  })
  .strict();

const predict = z
  .object({
    type: z.literal("predict_reveal"),
    prompt: z.string().min(1),
    reveal: z.string().min(1),
    hint: z.string().optional(),
    concept_ids: conceptIds,
  })
  .strict();

const table = z
  .object({
    type: z.literal("compare_table"),
    caption: z.string().optional(),
    columns: z.array(z.string().min(1)).min(2).max(6),
    rows: z.array(z.array(z.string()).min(2).max(6)).min(1).max(20),
    concept_ids: conceptIds,
  })
  .strict();

const mermaid = z
  .object({ type: z.literal("mermaid_diagram"), code: z.string().min(1), caption: z.string().optional(), concept_ids: conceptIds })
  .strict();

const confidence = z
  .object({ type: z.literal("confidence_rating"), prompt: z.string().optional(), concept_ids: conceptIds })
  .strict();

const thinkAloud = z
  .object({ type: z.literal("think_aloud"), prompt: z.string().min(1), min_words: z.number().int().min(0).max(200).default(10), concept_ids: conceptIds })
  .strict();

const componentSchema = z.discriminatedUnion("type", [flashcard, cloze, mcq, tf, theory, stepper, predict, table, mermaid, confidence, thinkAloud]);

export const activitySpecSchema = z
  .object({
    title: z.string().min(1).optional(),
    instructions: z.string().optional(),
    goal: z.string().optional(),
    cites: z.array(citeSchema).min(1),
    concept_ids: conceptIds,
    components: z.array(componentSchema).min(1).max(12),
  })
  .strict();

export type ActivityComponent = z.infer<typeof componentSchema>;
export type ActivitySpec = z.infer<typeof activitySpecSchema>;
export type Confidence = "guessing" | "likely" | "sure";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  guessing: "Guessing",
  likely: "Fairly sure",
  sure: "Sure",
};

export type ActivityResponse = {
  components: unknown[];
  confidence?: Confidence;
  think_aloud?: string;
};

export function parseActivitySpec(input: unknown): ActivitySpec {
  if (!input || typeof input !== "object") {
    throw new ActivitySpecError("ActivitySpec must be an object");
  }
  const raw = input as { components?: unknown };
  if (Array.isArray(raw.components)) {
    for (const item of raw.components) {
      const type = item && typeof item === "object" ? (item as { type?: unknown }).type : undefined;
      if (typeof type !== "string" || !(ACTIVITY_TYPES as readonly string[]).includes(type)) {
        throw new ActivitySpecError(
          `unknown activity component "${String(type ?? "missing type")}". Available types: ${ACTIVITY_TYPES.join(", ")}`,
        );
      }
    }
  }
  const parsed = activitySpecSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ActivitySpecError(`${first?.path.join(".") || "spec"}: ${first?.message ?? "invalid ActivitySpec"}`);
  }
  for (const component of parsed.data.components) {
    if (component.type === "cloze" && clozeAnswers(component.text).length === 0) {
      throw new ActivitySpecError("cloze needs at least one {{blank}}");
    }
    if (component.type === "mcq_single" && component.answer >= component.options.length) {
      throw new ActivitySpecError("mcq_single answer must point at an option");
    }
    if (component.type === "compare_table" && component.rows.some((row) => row.length !== component.columns.length)) {
      throw new ActivitySpecError("compare_table rows must match the column count");
    }
  }
  return parsed.data;
}

export function clozeAnswers(text: string): string[] {
  return [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => (match[1] ?? "").trim());
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateActivityResponse(spec: ActivitySpec, input: unknown): ActivityResponse {
  if (!input || typeof input !== "object") throw new ActivitySpecError("response must be an object");
  const raw = input as { components?: unknown; confidence?: unknown; think_aloud?: unknown };
  if (!Array.isArray(raw.components)) throw new ActivitySpecError("response.components must be an array");
  const components: unknown[] = [];
  for (const [index, component] of spec.components.entries()) {
    const value = raw.components[index];
    switch (component.type) {
      case "mcq_single": {
        if (value === null || value === undefined) throw new ActivitySpecError(`component ${index + 1}: choose an option`);
        const answer = Number(value);
        if (!Number.isInteger(answer) || answer < 0 || answer >= component.options.length) {
          throw new ActivitySpecError(`component ${index + 1}: invalid option`);
        }
        components.push(answer);
        break;
      }
      case "tf_multi": {
        if (!Array.isArray(value) || value.length !== component.statements.length) {
          throw new ActivitySpecError(`component ${index + 1}: mark every statement`);
        }
        if (value.some((item) => typeof item !== "boolean")) {
          throw new ActivitySpecError(`component ${index + 1}: mark every statement`);
        }
        components.push(value);
        break;
      }
      case "cloze": {
        const blanks = clozeAnswers(component.text);
        if (!Array.isArray(value) || value.length !== blanks.length) {
          throw new ActivitySpecError(`component ${index + 1}: fill every blank`);
        }
        if (value.some((item) => !String(item ?? "").trim())) {
          throw new ActivitySpecError(`component ${index + 1}: fill every blank`);
        }
        components.push(value.map((item) => String(item ?? "")));
        break;
      }
      case "theory": {
        const answer = String(value ?? "").trim();
        if (!answer) throw new ActivitySpecError(`component ${index + 1}: write an answer`);
        components.push(answer);
        break;
      }
      case "predict_reveal":
        components.push(String(value ?? ""));
        break;
      case "think_aloud": {
        const text = String(value ?? "").trim();
        const words = text ? text.split(/\s+/).length : 0;
        if (words < component.min_words) {
          throw new ActivitySpecError(`component ${index + 1}: write at least ${component.min_words} words`);
        }
        components.push(text);
        break;
      }
      case "confidence_rating":
        if (value !== "guessing" && value !== "likely" && value !== "sure") {
          throw new ActivitySpecError(`component ${index + 1}: choose a confidence rating`);
        }
        components.push(value);
        break;
      default:
        components.push(null);
    }
  }
  let confidence = raw.confidence;
  if (confidence !== undefined) {
    if (confidence !== "guessing" && confidence !== "likely" && confidence !== "sure") {
      throw new ActivitySpecError("confidence must be guessing, likely or sure");
    }
  } else {
    const rating = spec.components.find((component) => component.type === "confidence_rating");
    if (rating) confidence = components[spec.components.indexOf(rating)];
    if (confidence !== "guessing" && confidence !== "likely" && confidence !== "sure") confidence = undefined;
  }
  const thinkAloudComponent = spec.components.find((component) => component.type === "think_aloud");
  const thinkAloud =
    typeof raw.think_aloud === "string"
      ? raw.think_aloud
      : thinkAloudComponent
        ? String(components[spec.components.indexOf(thinkAloudComponent)] ?? "")
        : undefined;
  return {
    components,
    confidence: confidence as Confidence | undefined,
    think_aloud: thinkAloud?.trim() || undefined,
  };
}

export function componentCorrect(component: ActivityComponent, value: unknown): boolean | null {
  if (component.type === "mcq_single") return value === component.answer;
  if (component.type === "tf_multi") {
    if (!Array.isArray(value) || value.length !== component.statements.length) return null;
    return component.statements.every((statement, index) => value[index] === statement.answer);
  }
  if (component.type === "cloze") {
    const answers = clozeAnswers(component.text);
    if (!Array.isArray(value) || value.length !== answers.length) return null;
    return answers.every((answer, index) => normalize(String(value[index] ?? "")) === normalize(answer));
  }
  return null;
}

export function responseExcerpt(spec: ActivitySpec, component: ActivityComponent, value: unknown): string {
  if (component.type === "mcq_single" && typeof value === "number") {
    return `${component.stem} → ${component.options[value] ?? ""}`.slice(0, 500);
  }
  if (component.type === "tf_multi" && Array.isArray(value)) {
    return component.statements
      .map((statement, index) => `${value[index] === true ? "T" : value[index] === false ? "F" : "—"} ${statement.text}`)
      .join(" · ")
      .slice(0, 500);
  }
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" · ").slice(0, 500);
  return String(value ?? spec.title ?? "").slice(0, 500);
}
