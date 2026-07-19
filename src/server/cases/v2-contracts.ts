import { z } from "zod";

const StableIdSchema = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/);

export const PORTRAIT_KEYS = [
  "noir-01",
  "noir-02",
  "noir-03",
  "noir-04",
  "noir-05",
  "noir-06",
  "noir-07",
  "noir-08",
  "noir-09",
  "noir-10",
  "noir-11",
  "noir-12",
] as const;

export const PortraitKeySchema = z.enum(PORTRAIT_KEYS);

export const VisualFactSchema = z
  .object({
    id: StableIdSchema,
    objectName: z.string().min(1).max(12),
    visibleDescription: z.string().min(4).max(80),
    regionHint: z.string().min(1).max(24),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    radius: z.number().min(0.04).max(0.12),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const ObservationPassSchema = z
  .object({
    decision: z.literal("PASS"),
    sceneSummary: z.string().min(6).max(120),
    riskLabels: z.array(z.string().max(40)).max(5),
    visualFacts: z.array(VisualFactSchema).min(3).max(8),
  })
  .strict();

const ObservationRejectSchema = z
  .object({
    decision: z.enum(["RETRY", "BLOCK"]),
    reasonCode: z.enum([
      "TOO_DARK",
      "BLURRY",
      "NOT_A_SPACE",
      "TOO_FEW_OBJECTS",
      "UNSAFE",
    ]),
    sceneSummary: z.string().max(120),
    riskLabels: z.array(z.string().max(40)).max(5),
    visualFacts: z.array(VisualFactSchema).max(8),
  })
  .strict();

export const VisionObservationSchema = z.discriminatedUnion("decision", [
  ObservationPassSchema,
  ObservationRejectSchema,
]);
export type VisionObservation = z.infer<typeof VisionObservationSchema>;

export const EvidenceSchema = VisualFactSchema.omit({
  visibleDescription: true,
})
  .extend({
    id: StableIdSchema,
    visualFactId: StableIdSchema,
    suspectId: StableIdSchema,
    publicDescription: z.string().min(8).max(120),
  })
  .strict();

export const PrivateSuspectSchema = z
  .object({
    id: StableIdSchema,
    name: z.string().min(2).max(12),
    identity: z.string().min(2).max(24),
    relation: z.string().min(4).max(60),
    personalityTags: z.tuple([
      z.string().min(1).max(8),
      z.string().min(1).max(8),
    ]),
    portraitKey: PortraitKeySchema,
    initialTestimony: z.string().min(8).max(140),
    privateAction: z.string().min(6).max(120),
    allowedFactIds: z.array(StableIdSchema).min(1).max(12),
  })
  .strict();

const EvidenceTupleSchema = z
  .tuple([EvidenceSchema, EvidenceSchema, EvidenceSchema])
  .superRefine((evidence, context) => {
    const seenIds = new Set<string>();

    evidence.forEach((item, index) => {
      if (seenIds.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evidence IDs must be unique",
          path: [index, "id"],
        });
      }
      seenIds.add(item.id);
    });
  });

const SuspectTupleSchema = z
  .tuple([PrivateSuspectSchema, PrivateSuspectSchema, PrivateSuspectSchema])
  .superRefine((suspects, context) => {
    const seenIds = new Set<string>();

    suspects.forEach((item, index) => {
      if (seenIds.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Suspect IDs must be unique",
          path: [index, "id"],
        });
      }
      seenIds.add(item.id);
    });
  });

const TimelineFactSchema = z
  .object({
    id: StableIdSchema,
    timeLabel: z.string().min(2).max(12),
    text: z.string().min(6).max(120),
  })
  .strict();

const ClaimSchema = z
  .object({
    id: StableIdSchema,
    suspectId: StableIdSchema,
    text: z.string().min(8).max(140),
    factRefs: z.array(StableIdSchema).min(1).max(6),
    evidenceRefs: z.array(StableIdSchema).min(1).max(3),
  })
  .strict();

export const V2PrivateCaseSchema = z
  .object({
    version: z.literal(2),
    title: z.string().min(4).max(24),
    caseNumber: z.string().min(4).max(24),
    background: z.string().min(12).max(220),
    objective: z.string().min(6).max(100),
    interactionMode: z.enum(["HOTSPOT", "CARD_FALLBACK"]),
    visualFacts: z.array(VisualFactSchema).min(3).max(8),
    evidence: EvidenceTupleSchema,
    suspects: SuspectTupleSchema,
    timelineFacts: z.array(TimelineFactSchema).min(3).max(8),
    claims: z.tuple([ClaimSchema, ClaimSchema, ClaimSchema]),
    liarSuspectId: StableIdSchema,
    contradiction: z
      .object({
        claimId: StableIdSchema,
        evidenceId: StableIdSchema,
        explanation: z.string().min(8).max(160),
      })
      .strict(),
    wrongAnswerHint: z.string().min(4).max(100),
    truth: z
      .object({
        summary: z.string().min(12).max(240),
        motive: z.string().min(8).max(160),
        evidenceChain: z.array(z.string().min(4).max(80)).min(2).max(5),
      })
      .strict(),
  })
  .strict();

export type V2PrivateCase = z.infer<typeof V2PrivateCaseSchema>;
export type V2PlayerCase = ReturnType<typeof toV2PlayerCase>;

type V2PlayerSuspect = Omit<
  V2PrivateCase["suspects"][number],
  "privateAction" | "allowedFactIds"
>;
type V2PlayerClaim = Omit<
  V2PrivateCase["claims"][number],
  "factRefs" | "evidenceRefs"
>;

export function toV2PlayerCase(value: V2PrivateCase) {
  return {
    version: value.version,
    title: value.title,
    caseNumber: value.caseNumber,
    background: value.background,
    objective: value.objective,
    interactionMode: value.interactionMode,
    evidence: value.evidence,
    suspects: value.suspects.map(
      ({ privateAction: _privateAction, allowedFactIds: _allowedFactIds, ...suspect }) =>
        suspect,
    ) as [V2PlayerSuspect, V2PlayerSuspect, V2PlayerSuspect],
    claims: value.claims.map(
      ({ factRefs: _factRefs, evidenceRefs: _evidenceRefs, ...claim }) => claim,
    ) as [V2PlayerClaim, V2PlayerClaim, V2PlayerClaim],
    wrongAnswerHint: value.wrongAnswerHint,
  };
}
