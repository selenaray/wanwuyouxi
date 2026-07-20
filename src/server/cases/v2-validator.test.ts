// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  V2PrivateCaseSchema,
  VisionObservationSchema,
  type V2PrivateCase,
} from "./v2-contracts";
import { validObservation, validV2Case } from "./v2-contracts.fixture";
import { validateV2Case } from "./v2-validator";

type Mutation = Partial<{
  evidence1Id: string;
  suspect1Id: string;
  suspect1Portrait: V2PrivateCase["suspects"][number]["portraitKey"];
  evidence0VisualFactId: string;
  evidence0X: number;
  liarSuspectId: string;
  contradictionClaimSuspectId: string;
  contradictionEvidenceSuspectId: string;
}>;

function mutate(overrides: Mutation) {
  const game = V2PrivateCaseSchema.parse(validV2Case);
  if (overrides.evidence1Id) game.evidence[1].id = overrides.evidence1Id;
  if (overrides.suspect1Id) game.suspects[1].id = overrides.suspect1Id;
  if (overrides.suspect1Portrait) {
    game.suspects[1].portraitKey = overrides.suspect1Portrait;
  }
  if (overrides.evidence0VisualFactId) {
    game.evidence[0].visualFactId = overrides.evidence0VisualFactId;
  }
  if (overrides.evidence0X !== undefined) game.evidence[0].x = overrides.evidence0X;
  if (overrides.liarSuspectId) game.liarSuspectId = overrides.liarSuspectId;
  if (overrides.contradictionClaimSuspectId) {
    game.claims[2].suspectId = overrides.contradictionClaimSuspectId;
  }
  if (overrides.contradictionEvidenceSuspectId) {
    game.evidence[2].suspectId = overrides.contradictionEvidenceSuspectId;
  }
  return game;
}

const observation = VisionObservationSchema.parse(validObservation);

describe("validateV2Case", () => {
  it("accepts the grounded V2 fixture", () => {
    const result = validateV2Case(
      V2PrivateCaseSchema.parse(validV2Case),
      observation,
      4 / 3,
    );

    expect(result).toMatchObject({ publishable: true, issues: [] });
    expect(result.game).toEqual(validV2Case);
  });

  it.each([
    ["duplicate evidence ids", mutate({ evidence1Id: "ev-lamp" }), "DUPLICATE_EVIDENCE"],
    ["duplicate suspects", mutate({ suspect1Id: "su-lin" }), "DUPLICATE_SUSPECT"],
    ["duplicate portraits", mutate({ suspect1Portrait: "noir-01" }), "DUPLICATE_PORTRAIT"],
    ["unknown visual fact", mutate({ evidence0VisualFactId: "vf-missing" }), "EVIDENCE_NOT_VISIBLE"],
    ["coordinate drift", mutate({ evidence0X: 0.9 }), "EVIDENCE_COORDINATE_DRIFT"],
    ["unknown liar", mutate({ liarSuspectId: "su-missing" }), "INVALID_LIAR"],
    ["claim belongs to other suspect", mutate({ contradictionClaimSuspectId: "su-lin" }), "CONTRADICTION_LIAR_MISMATCH"],
    ["evidence belongs to other suspect", mutate({ contradictionEvidenceSuspectId: "su-lin" }), "CONTRADICTION_EVIDENCE_MISMATCH"],
  ])("blocks %s", (_description, game, issue) => {
    const result = validateV2Case(game, observation, 4 / 3);

    expect(result.publishable).toBe(false);
    expect(result.game).toBeNull();
    expect(result.issues).toContain(issue);
  });

  it("falls back to cards for low-confidence grounded evidence", () => {
    const lowConfidenceObservation = structuredClone(observation);
    lowConfidenceObservation.visualFacts[0].confidence = 0.64;
    const game = V2PrivateCaseSchema.parse(validV2Case);
    game.visualFacts[0].confidence = 0.64;
    game.evidence[0].confidence = 0.64;

    expect(validateV2Case(game, lowConfidenceObservation, 4 / 3)).toMatchObject({
      publishable: true,
      game: { interactionMode: "CARD_FALLBACK" },
      issues: ["LOW_HOTSPOT_CONFIDENCE"],
    });
  });

  it("falls back to cards when grounded hotspots overlap", () => {
    const overlapObservation = structuredClone(observation);
    overlapObservation.visualFacts[1] = {
      ...overlapObservation.visualFacts[1],
      x: 0.25,
      y: 0.36,
    };
    const game = V2PrivateCaseSchema.parse(validV2Case);
    game.visualFacts = structuredClone(overlapObservation.visualFacts);
    game.evidence[1].x = 0.25;
    game.evidence[1].y = 0.36;

    expect(validateV2Case(game, overlapObservation, 4 / 3)).toMatchObject({
      publishable: true,
      game: { interactionMode: "CARD_FALLBACK" },
      issues: ["HOTSPOT_OVERLAP"],
    });
  });
});
