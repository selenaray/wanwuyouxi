import { describe, expect, it } from "vitest";

import {
  PORTRAIT_KEYS,
  PortraitKeySchema,
  V2PrivateCaseSchema,
  VisualFactSchema,
  VisionObservationSchema,
  toV2PlayerCase,
} from "./v2-contracts";
import { PORTRAIT_KEYS as ROSTER_PORTRAIT_KEYS } from "@/features/game/suspect-roster";
import { validObservation, validV2Case } from "./v2-contracts.fixture";

export { validObservation, validV2Case } from "./v2-contracts.fixture";

describe("V2 contracts", () => {
  it("accepts three grounded observations and one complete factbook", () => {
    expect(VisionObservationSchema.parse(validObservation).visualFacts).toHaveLength(3);
    expect(V2PrivateCaseSchema.parse(validV2Case).suspects).toHaveLength(3);
  });

  it("removes liar, contradiction explanation, private actions and truth", () => {
    const player = toV2PlayerCase(V2PrivateCaseSchema.parse(validV2Case));
    expect(player).not.toHaveProperty("liarSuspectId");
    expect(player).not.toHaveProperty("truth");
    expect(player).not.toHaveProperty("visualFacts");
    expect(player.suspects[0]).not.toHaveProperty("privateAction");
    expect(player.suspects[0]).not.toHaveProperty("allowedFactIds");
    for (const suspect of player.suspects) {
      expect(suspect).not.toHaveProperty("privateAction");
      expect(suspect).not.toHaveProperty("allowedFactIds");
    }
    for (const claim of player.claims) {
      expect(claim).not.toHaveProperty("factRefs");
      expect(claim).not.toHaveProperty("evidenceRefs");
    }
    expect(player).not.toHaveProperty("contradiction");
  });

  it.each([
    ["evidence", validV2Case.evidence.slice(0, 2)],
    ["evidence", [...validV2Case.evidence, validV2Case.evidence[0]]],
    ["suspects", validV2Case.suspects.slice(0, 2)],
    ["suspects", [...validV2Case.suspects, validV2Case.suspects[0]]],
    ["claims", validV2Case.claims.slice(0, 2)],
    ["claims", [...validV2Case.claims, validV2Case.claims[0]]],
  ])("rejects a %s tuple with a non-three length", (field, value) => {
    expect(V2PrivateCaseSchema.safeParse({ ...validV2Case, [field]: value }).success).toBe(false);
  });

  it("rejects duplicate evidence and suspect IDs at their ID fields", () => {
    const duplicateEvidence = V2PrivateCaseSchema.safeParse({
      ...validV2Case,
      evidence: [
        validV2Case.evidence[0],
        { ...validV2Case.evidence[1], id: validV2Case.evidence[0].id },
        validV2Case.evidence[2],
      ],
    });
    const duplicateSuspect = V2PrivateCaseSchema.safeParse({
      ...validV2Case,
      suspects: [
        validV2Case.suspects[0],
        { ...validV2Case.suspects[1], id: validV2Case.suspects[0].id },
        validV2Case.suspects[2],
      ],
    });

    expect(duplicateEvidence.success).toBe(false);
    expect(duplicateSuspect.success).toBe(false);
    if (!duplicateEvidence.success) {
      expect(duplicateEvidence.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["evidence", 1, "id"] })]),
      );
    }
    if (!duplicateSuspect.success) {
      expect(duplicateSuspect.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["suspects", 1, "id"] })]),
      );
    }
  });

  it("rejects additional fields in strict V2 objects", () => {
    expect(V2PrivateCaseSchema.safeParse({ ...validV2Case, extra: true }).success).toBe(false);
    expect(
      VisualFactSchema.safeParse({ ...validObservation.visualFacts[0], extra: true }).success,
    ).toBe(false);
    expect(
      V2PrivateCaseSchema.safeParse({
        ...validV2Case,
        suspects: [
          { ...validV2Case.suspects[0], extra: true },
          validV2Case.suspects[1],
          validV2Case.suspects[2],
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces stable ID and visible description boundaries", () => {
    const visualFact = validObservation.visualFacts[0];

    expect(VisualFactSchema.safeParse({ ...visualFact, id: "a".repeat(40) }).success).toBe(true);
    expect(VisualFactSchema.safeParse({ ...visualFact, id: "" }).success).toBe(false);
    expect(VisualFactSchema.safeParse({ ...visualFact, id: "Uppercase" }).success).toBe(false);
    expect(VisualFactSchema.safeParse({ ...visualFact, id: "a".repeat(41) }).success).toBe(false);
    expect(VisualFactSchema.safeParse({ ...visualFact, visibleDescription: "abcd" }).success).toBe(true);
    expect(VisualFactSchema.safeParse({ ...visualFact, visibleDescription: "abc" }).success).toBe(false);
    expect(
      VisualFactSchema.safeParse({ ...visualFact, visibleDescription: "a".repeat(80) }).success,
    ).toBe(true);
    expect(
      VisualFactSchema.safeParse({ ...visualFact, visibleDescription: "a".repeat(81) }).success,
    ).toBe(false);
  });

  it("exposes only the fixed portrait keys", () => {
    expect(PORTRAIT_KEYS).toEqual(ROSTER_PORTRAIT_KEYS);
    expect(PortraitKeySchema.safeParse("noir-21").success).toBe(true);
    expect(PortraitKeySchema.safeParse("noir-22").success).toBe(false);
  });
});
