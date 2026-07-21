import {
  PORTRAIT_KEYS,
  V2PrivateCaseSchema,
  type V2PrivateCase,
  type VisionObservation,
} from "./v2-contracts";

export type V2DeterministicIssue =
  | "INVALID_SCHEMA"
  | "INVALID_OBSERVATION"
  | "DUPLICATE_VISUAL_FACT"
  | "VISUAL_FACT_DRIFT"
  | "DUPLICATE_EVIDENCE"
  | "DUPLICATE_EVIDENCE_VISUAL_FACT"
  | "DUPLICATE_EVIDENCE_SUSPECT"
  | "DUPLICATE_SUSPECT"
  | "DUPLICATE_PORTRAIT"
  | "INVALID_PORTRAIT"
  | "DUPLICATE_TIMELINE_FACT"
  | "DUPLICATE_CLAIM"
  | "DUPLICATE_CLAIM_SUSPECT"
  | "EVIDENCE_NOT_VISIBLE"
  | "EVIDENCE_OBJECT_MISMATCH"
  | "EVIDENCE_COORDINATE_DRIFT"
  | "EVIDENCE_SUSPECT_MISSING"
  | "CLAIM_SUSPECT_MISSING"
  | "CLAIM_FACT_MISSING"
  | "CLAIM_EVIDENCE_MISSING"
  | "SUSPECT_FACT_MISSING"
  | "INVALID_LIAR"
  | "CONTRADICTION_CLAIM_MISSING"
  | "CONTRADICTION_EVIDENCE_MISSING"
  | "CONTRADICTION_LIAR_MISMATCH"
  | "CONTRADICTION_EVIDENCE_MISMATCH"
  | "LOW_HOTSPOT_CONFIDENCE"
  | "HOTSPOT_OVERLAP";

export type V2ValidationResult = {
  publishable: boolean;
  game: V2PrivateCase | null;
  issues: V2DeterministicIssue[];
};

const FALLBACK_ISSUES = new Set<V2DeterministicIssue>([
  "LOW_HOTSPOT_CONFIDENCE",
  "HOTSPOT_OVERLAP",
]);

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

function hotspotsOverlap(game: V2PrivateCase, imageAspect: number) {
  for (let left = 0; left < game.evidence.length; left += 1) {
    for (let right = left + 1; right < game.evidence.length; right += 1) {
      const a = game.evidence[left];
      const b = game.evidence[right];
      const dx = (a.x - b.x) * imageAspect;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < (a.radius + b.radius) * 0.8) return true;
    }
  }
  return false;
}

export function validateV2Case(
  value: V2PrivateCase,
  observation: VisionObservation,
  imageAspect: number,
): V2ValidationResult {
  const game = structuredClone(value);
  const issues: V2DeterministicIssue[] = [];
  const addIssue = (issue: V2DeterministicIssue) => {
    if (!issues.includes(issue)) issues.push(issue);
  };

  if (!V2PrivateCaseSchema.safeParse(value).success) addIssue("INVALID_SCHEMA");
  if (observation.decision !== "PASS") {
    return { publishable: false, game: null, issues: ["INVALID_OBSERVATION"] };
  }

  if (hasDuplicates(game.visualFacts.map((fact) => fact.id))) {
    addIssue("DUPLICATE_VISUAL_FACT");
  }
  if (JSON.stringify(game.visualFacts) !== JSON.stringify(observation.visualFacts)) {
    addIssue("VISUAL_FACT_DRIFT");
  }
  if (hasDuplicates(game.evidence.map((evidence) => evidence.id))) {
    addIssue("DUPLICATE_EVIDENCE");
  }
  if (hasDuplicates(game.evidence.map((evidence) => evidence.visualFactId))) {
    addIssue("DUPLICATE_EVIDENCE_VISUAL_FACT");
  }
  if (hasDuplicates(game.evidence.map((evidence) => evidence.suspectId))) {
    addIssue("DUPLICATE_EVIDENCE_SUSPECT");
  }
  if (hasDuplicates(game.suspects.map((suspect) => suspect.id))) {
    addIssue("DUPLICATE_SUSPECT");
  }
  if (hasDuplicates(game.suspects.map((suspect) => suspect.portraitKey))) {
    addIssue("DUPLICATE_PORTRAIT");
  }
  if (
    game.suspects.length !== 3
    || game.suspects.some((suspect) => !PORTRAIT_KEYS.includes(suspect.portraitKey))
  ) {
    addIssue("INVALID_PORTRAIT");
  }
  if (hasDuplicates(game.timelineFacts.map((fact) => fact.id))) {
    addIssue("DUPLICATE_TIMELINE_FACT");
  }
  if (hasDuplicates(game.claims.map((claim) => claim.id))) addIssue("DUPLICATE_CLAIM");
  if (hasDuplicates(game.claims.map((claim) => claim.suspectId))) {
    addIssue("DUPLICATE_CLAIM_SUSPECT");
  }

  const visibleFacts = new Map(observation.visualFacts.map((fact) => [fact.id, fact]));
  const suspectIds = new Set(game.suspects.map((suspect) => suspect.id));
  const evidenceIds = new Set(game.evidence.map((evidence) => evidence.id));
  const timelineIds = new Set(game.timelineFacts.map((fact) => fact.id));
  const claimIds = new Set(game.claims.map((claim) => claim.id));
  const allowedFactIds = new Set([...timelineIds, ...claimIds]);

  for (const evidence of game.evidence) {
    const visibleFact = visibleFacts.get(evidence.visualFactId);
    if (!visibleFact) {
      addIssue("EVIDENCE_NOT_VISIBLE");
    } else {
      if (evidence.objectName !== visibleFact.objectName) {
        addIssue("EVIDENCE_OBJECT_MISMATCH");
      }
      if (
        evidence.x !== visibleFact.x
        || evidence.y !== visibleFact.y
        || evidence.radius !== visibleFact.radius
      ) {
        addIssue("EVIDENCE_COORDINATE_DRIFT");
      }
    }
    if (!suspectIds.has(evidence.suspectId)) addIssue("EVIDENCE_SUSPECT_MISSING");
  }

  for (const claim of game.claims) {
    if (!suspectIds.has(claim.suspectId)) addIssue("CLAIM_SUSPECT_MISSING");
    if (claim.factRefs.some((reference) => !timelineIds.has(reference))) {
      addIssue("CLAIM_FACT_MISSING");
    }
    if (claim.evidenceRefs.some((reference) => !evidenceIds.has(reference))) {
      addIssue("CLAIM_EVIDENCE_MISSING");
    }
  }
  if (
    game.suspects.some((suspect) =>
      suspect.allowedFactIds.some((reference) => !allowedFactIds.has(reference)))
  ) {
    addIssue("SUSPECT_FACT_MISSING");
  }

  if (!suspectIds.has(game.liarSuspectId)) addIssue("INVALID_LIAR");
  const contradictionClaim = game.claims.find(
    (claim) => claim.id === game.contradiction.claimId,
  );
  const contradictionEvidence = game.evidence.find(
    (evidence) => evidence.id === game.contradiction.evidenceId,
  );
  if (!contradictionClaim) addIssue("CONTRADICTION_CLAIM_MISSING");
  if (!contradictionEvidence) addIssue("CONTRADICTION_EVIDENCE_MISSING");
  if (contradictionClaim && contradictionClaim.suspectId !== game.liarSuspectId) {
    addIssue("CONTRADICTION_LIAR_MISMATCH");
  }
  if (contradictionEvidence && contradictionEvidence.suspectId !== game.liarSuspectId) {
    addIssue("CONTRADICTION_EVIDENCE_MISMATCH");
  }

  if (
    observation.visualFacts.some((fact) => fact.confidence < 0.65)
    || game.evidence.some((evidence) => evidence.confidence < 0.65)
  ) {
    addIssue("LOW_HOTSPOT_CONFIDENCE");
  }
  if (hotspotsOverlap(game, imageAspect)) addIssue("HOTSPOT_OVERLAP");

  if (issues.some((issue) => !FALLBACK_ISSUES.has(issue))) {
    return { publishable: false, game: null, issues };
  }
  if (issues.length > 0) game.interactionMode = "CARD_FALLBACK";
  return { publishable: true, game, issues };
}
