import { z } from "zod";
import SmilesDrawer from "smiles-drawer";

export const ACTIVITY_TYPES = [
  "flashcard",
  "cloze",
  "mcq_single",
  "mcq_multi",
  "tf_multi",
  "short_answer",
  "matching",
  "ordering",
  "theory",
  "calculation",
  "worked_example_stepper",
  "predict_reveal",
  "compare_table",
  "mermaid_diagram",
  "concept_map",
  "label_diagram",
  "timeline",
  "annotated_image",
  "spotter_station",
  "confidence_rating",
  "think_aloud",
  "muddy_point",
  "spot_the_error",
  "teach_back",
  "case_vignette",
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

const mcqMulti = z
  .object({
    type: z.literal("mcq_multi"),
    stem: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(8),
    answer: z.array(z.number().int().nonnegative()).optional(),
    explanation: z.string().optional(),
    concept_ids: conceptIds,
  })
  .strict();

const shortAnswer = z
  .object({
    type: z.literal("short_answer"),
    stem: z.string().min(1),
    model_answer: z.string().optional(),
    concept_ids: conceptIds,
  })
  .strict();

const matching = z
  .object({
    type: z.literal("matching"),
    pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) }).strict()).min(1).max(12),
    concept_ids: conceptIds,
  })
  .strict();

const ordering = z
  .object({
    type: z.literal("ordering"),
    items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) }).strict()).min(2).max(12),
    concept_ids: conceptIds,
  })
  .strict();

const calculation = z
  .object({
    type: z.literal("calculation"),
    stem: z.string().min(1),
    answer: z.number().optional(),
    tolerance: z.number().nonnegative().optional(),
    concept_ids: conceptIds,
  })
  .strict();

const spotTheError = z
  .object({
    type: z.literal("spot_the_error"),
    text: z.string().min(1),
    errors: z.array(z.number().int().nonnegative()).optional(),
    concept_ids: conceptIds,
  })
  .strict();

const teachBack = z
  .object({
    type: z.literal("teach_back"),
    prompt: z.string().min(1),
    min_words: z.number().int().min(0).max(300).default(20),
    concept_ids: conceptIds,
  })
  .strict();

const caseVignette = z
  .object({
    type: z.literal("case_vignette"),
    stem: z.string().min(1),
    questions: z.array(z.string().min(1)).min(1).max(6),
    concept_ids: conceptIds,
  })
  .strict();

const conceptMap = z
  .object({
    type: z.literal("concept_map"),
    nodes: z.array(z.any()).optional(),
    edges: z.array(z.any()).optional(),
    caption: z.string().optional(),
    concept_ids: conceptIds,
  })
  .strict();

const labelDiagram = z
  .object({
    type: z.literal("label_diagram"),
    image: z.string().optional(),
    labels: z.array(z.string().min(1)).min(1).max(12),
    concept_ids: conceptIds,
  })
  .strict();

const timeline = z
  .object({
    type: z.literal("timeline"),
    events: z.array(z.any()).optional(),
    concept_ids: conceptIds,
  })
  .strict();

const annotatedImage = z
  .object({
    type: z.literal("annotated_image"),
    image: z.string().optional(),
    annotations: z.array(z.any()).optional(),
    concept_ids: conceptIds,
  })
  .strict();

const spotterStation = z
  .object({
    type: z.literal("spotter_station"),
    image: z.string().optional(),
    question: z.string().min(1),
    concept_ids: conceptIds,
  })
  .strict();

const muddyPoint = z
  .object({ type: z.literal("muddy_point"), prompt: z.string().min(1), concept_ids: conceptIds })
  .strict();

const componentSchema = z.discriminatedUnion("type", [
  flashcard,
  cloze,
  mcq,
  mcqMulti,
  tf,
  shortAnswer,
  matching,
  ordering,
  theory,
  calculation,
  stepper,
  predict,
  table,
  mermaid,
  conceptMap,
  labelDiagram,
  timeline,
  annotatedImage,
  spotterStation,
  confidence,
  thinkAloud,
  muddyPoint,
  spotTheError,
  teachBack,
  caseVignette,
]);

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

export function validateSmilesBlocks(value: unknown): void {
  if (typeof value === "string") {
    const blocks = /```smiles[^\r\n]*\r?\n([\s\S]*?)```/gi;
    for (const match of value.matchAll(blocks)) {
      const smiles = match[1]?.trim() ?? "";
      if (!smiles) throw new ActivitySpecError("smiles code block must not be empty");
      try {
        SmilesDrawer.Parser.parse(smiles);
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid SMILES";
        throw new ActivitySpecError(`invalid SMILES "${smiles}": ${message}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validateSmilesBlocks(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) validateSmilesBlocks(item);
  }
}

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
  validateSmilesBlocks(parsed.data);
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
      case "mcq_multi": {
        if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
          throw new ActivitySpecError(`component ${index + 1}: select options`);
        }
        components.push(value);
        break;
      }
      case "short_answer": {
        const answer = String(value ?? "").trim();
        if (!answer) throw new ActivitySpecError(`component ${index + 1}: write an answer`);
        components.push(answer);
        break;
      }
      case "matching": {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new ActivitySpecError(`component ${index + 1}: make every match`);
        }
        components.push(value);
        break;
      }
      case "ordering": {
        if (!Array.isArray(value)) throw new ActivitySpecError(`component ${index + 1}: order the items`);
        components.push(value);
        break;
      }
      case "calculation": {
        if (value === null || value === undefined || String(value).trim() === "") {
          throw new ActivitySpecError(`component ${index + 1}: enter a number`);
        }
        components.push(Number(value));
        break;
      }
      case "spot_the_error": {
        if (!Array.isArray(value)) throw new ActivitySpecError(`component ${index + 1}: mark the error lines`);
        components.push(value);
        break;
      }
      case "teach_back": {
        const text = String(value ?? "").trim();
        const minWords = component.min_words ?? 20;
        const words = text ? text.split(/\s+/).length : 0;
        if (words < minWords) {
          throw new ActivitySpecError(`component ${index + 1}: write at least ${minWords} words`);
        }
        components.push(text);
        break;
      }
      case "case_vignette": {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new ActivitySpecError(`component ${index + 1}: answer every question`);
        }
        components.push(value);
        break;
      }
      case "concept_map":
      case "label_diagram":
      case "timeline":
      case "annotated_image":
      case "spotter_station":
      case "muddy_point":
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
