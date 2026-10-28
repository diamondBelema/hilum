import { z } from "zod";

export const EDGE_TYPES = ["parent", "prerequisite", "related", "contrasts_with"] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const CONCEPT_STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ConceptStatus = (typeof CONCEPT_STATUSES)[number];

const citeSchema = z.object({
  note: z.string().min(1),
  anchor: z.string().optional(),
  quote: z.string().optional(),
});

const conceptFields = {
  title: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  parent: z.string().min(1).nullish(),
  prerequisites: z.array(z.string().min(1)).default([]),
  related: z.array(z.string().min(1)).default([]),
  contrasts: z.array(z.string().min(1)).default([]),
  topics: z.array(z.string().min(1)).default([]),
  exam_weight: z.number().min(0).max(1).default(0.05),
  lecturer_flag: z.boolean().default(false),
  status: z.enum(CONCEPT_STATUSES).default("proposed"),
  unverified: z.boolean().default(false),
  cites: z.array(citeSchema).min(1),
  definition: z.string().default(""),
};

export const conceptInputSchema = z.object({
  course: z.string().min(1),
  id: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "id may use letters, numbers, dot, underscore and hyphen")
    .optional(),
  ...conceptFields,
});

export const conceptPatchSchema = z.object({
  title: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).optional(),
  parent: z.string().min(1).nullish(),
  prerequisites: z.array(z.string().min(1)).optional(),
  related: z.array(z.string().min(1)).optional(),
  contrasts: z.array(z.string().min(1)).optional(),
  topics: z.array(z.string().min(1)).optional(),
  exam_weight: z.number().min(0).max(1).optional(),
  lecturer_flag: z.boolean().optional(),
  status: z.enum(CONCEPT_STATUSES).optional(),
  unverified: z.boolean().optional(),
  cites: z.array(citeSchema).min(1).optional(),
  definition: z.string().optional(),
});

export type ConceptInput = z.input<typeof conceptInputSchema>;
export type ConceptPatch = z.input<typeof conceptPatchSchema>;
