import { z } from "zod";

export const JobStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "VALIDATING",
  "SUCCEEDED",
  "RETRYABLE_FAILED",
  "REJECTED",
  "FAILED",
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const GenerationDecisionSchema = z.enum(["PASS", "RETRY", "BLOCK"]);
export type GenerationDecision = z.infer<typeof GenerationDecisionSchema>;

export const InteractionModeSchema = z.enum(["HOTSPOT", "CARD_FALLBACK"]);

export const ClueSchema = z.object({
  id: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/),
  objectName: z.string().min(1).max(12),
  clueText: z.string().min(4).max(80),
  regionHint: z.string().min(2).max(24),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  radius: z.number().min(0.04).max(0.12),
  confidence: z.number().min(0).max(1),
});

export const PrivateCaseSchema = z.object({
  title: z.string().min(4).max(24),
  caseNumber: z.string().min(4).max(24),
  background: z.string().min(12).max(180),
  objective: z.string().min(6).max(80),
  interactionMode: InteractionModeSchema,
  clues: z.tuple([ClueSchema, ClueSchema, ClueSchema]),
  question: z.string().min(6).max(80),
  answerOptions: z.tuple([
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
  ]),
  correctAnswerIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  wrongAnswerHint: z.string().min(4).max(80),
  truth: z.string().min(12).max(240),
});

export type PrivateCase = z.infer<typeof PrivateCaseSchema>;
export type PlayerCase = Omit<PrivateCase, "correctAnswerIndex" | "truth">;

const PassResultSchema = z.object({
  decision: z.literal("PASS"),
  logicalConfidence: z.number().min(0).max(1),
  riskLabels: z.array(z.string().max(40)).max(5),
  candidates: z.array(z.string().min(1).max(12)).min(3).max(8),
  game: PrivateCaseSchema,
});

const RejectedResultSchema = z.object({
  decision: z.enum(["RETRY", "BLOCK"]),
  reasonCode: z.enum([
    "TOO_DARK",
    "BLURRY",
    "NOT_A_SPACE",
    "TOO_FEW_OBJECTS",
    "UNSAFE",
  ]),
  riskLabels: z.array(z.string().max(40)).max(5),
  candidates: z.array(z.string().max(12)).max(8),
  game: z.null(),
});

export const GeneratedCaseSchema = z.discriminatedUnion("decision", [
  PassResultSchema,
  RejectedResultSchema,
]);

export type GeneratedCase = z.infer<typeof GeneratedCaseSchema>;

export function toPlayerCase(value: PrivateCase): PlayerCase {
  return {
    title: value.title,
    caseNumber: value.caseNumber,
    background: value.background,
    objective: value.objective,
    interactionMode: value.interactionMode,
    clues: value.clues,
    question: value.question,
    answerOptions: value.answerOptions,
    wrongAnswerHint: value.wrongAnswerHint,
  };
}
