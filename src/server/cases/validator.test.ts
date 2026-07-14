import { describe, expect, it } from "vitest";

import { fakePrivateCase } from "@/server/providers/fake";

import { validateGeneratedCase } from "./validator";

function generated(overrides: Record<string, unknown> = {}) {
  return {
    decision: "PASS",
    logicalConfidence: 0.95,
    riskLabels: [],
    candidates: ["台灯", "书本", "杯子"],
    game: structuredClone(fakePrivateCase),
    ...overrides,
  };
}

describe("validateGeneratedCase", () => {
  it("accepts a structurally and logically valid case", () => {
    const result = validateGeneratedCase(generated(), 4 / 3);
    expect(result.publishable).toBe(true);
    expect(result.game?.interactionMode).toBe("HOTSPOT");
  });

  it("rejects duplicate clue objects", () => {
    const value = generated();
    value.game.clues[1].objectName = value.game.clues[0].objectName;

    const result = validateGeneratedCase(value, 4 / 3);
    expect(result.publishable).toBe(false);
    expect(result.issues).toContain("DUPLICATE_CLUE_OBJECT");
  });

  it("rejects clues that are not among visible candidates", () => {
    const result = validateGeneratedCase(generated({ candidates: ["台灯", "书本", "沙发"] }), 4 / 3);
    expect(result.publishable).toBe(false);
    expect(result.issues).toContain("CLUE_NOT_VISIBLE");
  });

  it("falls back to cards when hotspot confidence is low", () => {
    const value = generated();
    value.game.clues[0].confidence = 0.41;

    const result = validateGeneratedCase(value, 4 / 3);
    expect(result.publishable).toBe(true);
    expect(result.game?.interactionMode).toBe("CARD_FALLBACK");
    expect(result.issues).toContain("LOW_HOTSPOT_CONFIDENCE");
  });

  it("falls back to cards when hotspots severely overlap", () => {
    const value = generated();
    value.game.clues[1].x = value.game.clues[0].x;
    value.game.clues[1].y = value.game.clues[0].y;

    const result = validateGeneratedCase(value, 4 / 3);
    expect(result.publishable).toBe(true);
    expect(result.game?.interactionMode).toBe("CARD_FALLBACK");
    expect(result.issues).toContain("HOTSPOT_OVERLAP");
  });

  it("rejects restricted unsafe detail", () => {
    const value = generated();
    value.game.truth = "嫌疑人提供了详细的自杀方法，并要求玩家照做才能完成案件。";

    const result = validateGeneratedCase(value, 4 / 3);
    expect(result.publishable).toBe(false);
    expect(result.issues).toContain("UNSAFE_CONTENT");
  });
});

