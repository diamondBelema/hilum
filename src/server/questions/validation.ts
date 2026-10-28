import { z } from "zod";

export const QUESTION_TYPES = ["tf_multi", "mcq_single", "theory", "spotter"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const citeSchema = z.object({
  note: z.string().min(1),
  anchor: z.string().optional(),
  quote: z.string().optional(),
});

export const questionInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: z.enum(QUESTION_TYPES),
    question_kind: z.string().min(1).optional(),
    topics: z.array(z.string().min(1)).default([]),
    concept_ids: z.array(z.string().min(1)).default([]),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    marks: z.number().positive(),
    stem: z.string().min(1).optional(),
    statements: z
      .array(z.object({ text: z.string().min(1), answer: z.boolean() }))
      .optional(),
    options: z.record(z.string().min(1)).optional(),
    answer: z.string().min(1).optional(),
    accepted: z.array(z.string().min(1)).optional(),
    image: z.string().min(1).optional(),
    explanation: z.string().optional(),
    scoring: z.enum(["per_statement", "all_or_nothing"]).optional(),
    prompt: z.string().min(1).optional(),
    model_answer: z.string().optional(),
    rubric: z.string().optional(),
    answer_input: z.enum(["text", "text_and_drawing", "photo"]).optional(),
    cites: z.array(citeSchema).default([]),
    source_paper: z.string().optional(),
    verified: z.boolean().default(false),
    unverified: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "tf_multi") {
      if (!value.stem) {
        ctx.addIssue({ code: "custom", message: "tf_multi needs a stem", path: ["stem"] });
      }
      const count = value.statements?.length ?? 0;
      if (count < 4 || count > 5) {
        ctx.addIssue({
          code: "custom",
          message: "tf_multi needs 4 or 5 statements",
          path: ["statements"],
        });
      }
    }
    if (value.type === "mcq_single") {
      if (!value.stem) {
        ctx.addIssue({ code: "custom", message: "mcq_single needs a stem", path: ["stem"] });
      }
      const keys = Object.keys(value.options ?? {});
      if (keys.length < 2) {
        ctx.addIssue({
          code: "custom",
          message: "mcq_single needs at least two options",
          path: ["options"],
        });
      }
      const answer = value.answer?.trim().toUpperCase();
      if (!answer) {
        ctx.addIssue({ code: "custom", message: "mcq_single needs an answer", path: ["answer"] });
      } else if (keys.length > 0 && !keys.includes(answer)) {
        ctx.addIssue({
          code: "custom",
          message: `answer ${answer} is not one of the options`,
          path: ["answer"],
        });
      }
    }
    if (value.type === "theory") {
      if (!value.prompt) {
        ctx.addIssue({ code: "custom", message: "theory needs a prompt", path: ["prompt"] });
      }
      if (!value.question_kind) {
        ctx.addIssue({
          code: "custom",
          message: "theory needs question_kind",
          path: ["question_kind"],
        });
      }
    }
    if (value.type === "spotter") {
      if (!value.prompt) {
        ctx.addIssue({ code: "custom", message: "spotter needs a prompt", path: ["prompt"] });
      }
      if (!value.image) {
        ctx.addIssue({ code: "custom", message: "spotter needs an image", path: ["image"] });
      }
      if (!value.answer) {
        ctx.addIssue({ code: "custom", message: "spotter needs an answer", path: ["answer"] });
      }
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

export type QuestionBody =
  | {
      stem: string;
      statements: { text: string; answer: boolean }[];
      explanation?: string;
      scoring?: "per_statement" | "all_or_nothing";
    }
  | { stem: string; options: Record<string, string>; answer: string; explanation?: string }
  | {
      prompt: string;
      image: string;
      answer: string;
      accepted?: string[];
      explanation?: string;
    }
  | {
      prompt: string;
      model_answer?: string;
      rubric?: string;
      answer_input?: "text" | "text_and_drawing" | "photo";
    };

export function questionBody(input: QuestionInput): QuestionBody {
  if (input.type === "tf_multi") {
    return {
      stem: input.stem ?? "",
      statements: input.statements ?? [],
      explanation: input.explanation,
      scoring: input.scoring ?? "per_statement",
    };
  }
  if (input.type === "mcq_single") {
    return {
      stem: input.stem ?? "",
      options: input.options ?? {},
      answer: (input.answer ?? "").trim().toUpperCase(),
      explanation: input.explanation,
    };
  }
  if (input.type === "spotter") {
    return {
      prompt: input.prompt ?? "",
      image: input.image ?? "",
      answer: input.answer ?? "",
      accepted: input.accepted,
      explanation: input.explanation,
    };
  }
  return {
    prompt: input.prompt ?? "",
    model_answer: input.model_answer,
    rubric: input.rubric,
    answer_input: input.answer_input ?? "text",
  };
}

export type Question = {
  id: string;
  course: string;
  type: QuestionType;
  questionKind: string | null;
  topics: string[];
  conceptIds: string[];
  difficulty: string | null;
  marks: number;
  body: QuestionBody;
  cites: { note: string; anchor?: string; quote?: string }[];
  sourcePaper: string | null;
  verified: boolean;
  unverified: boolean;
  verifiedBy: string | null;
  verifiedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

export type QuestionRow = {
  id: string;
  course: string;
  type: string;
  question_kind: string | null;
  topic_tags: string;
  concept_ids: string;
  difficulty: string | null;
  marks: number;
  body_json: string;
  cites_json: string;
  source_paper: string | null;
  verified: number;
  unverified: number;
  verified_by: string | null;
  verified_at: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
};

export function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    course: row.course,
    type: row.type as QuestionType,
    questionKind: row.question_kind,
    topics: JSON.parse(row.topic_tags) as string[],
    conceptIds: JSON.parse(row.concept_ids) as string[],
    difficulty: row.difficulty,
    marks: row.marks,
    body: JSON.parse(row.body_json) as QuestionBody,
    cites: JSON.parse(row.cites_json) as Question["cites"],
    sourcePaper: row.source_paper,
    verified: row.verified === 1,
    unverified: row.unverified === 1,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
