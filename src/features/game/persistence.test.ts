import { beforeEach, describe, expect, it } from "vitest";

import { createInitialState } from "./game-machine";
import { LEGACY_MOCK_CASE } from "./mock-case";
import { loadGameState, saveGameState } from "./persistence";

describe("game persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a valid game state", () => {
    const state = { ...createInitialState(), screen: "briefing" as const };
    saveGameState(state);

    expect(loadGameState()).toEqual(state);
  });

  it("falls back to a fresh state for invalid storage", () => {
    localStorage.setItem("wanwuyouxi.game.v1", "not-json");

    expect(loadGameState()).toEqual(createInitialState());
  });

  it("discards persisted V1 transient state instead of partially migrating it", () => {
    localStorage.setItem("wanwuyouxi.game.v1", JSON.stringify({
      ...createInitialState(),
      version: 1,
      screen: "exploring",
      openedClueIds: ["clock"],
    }));

    expect(loadGameState()).toEqual(createInitialState());
  });

  it("persists live identifiers without image URLs, case content, or truth", () => {
    const live = {
      ...createInitialState(),
      mode: "live" as const,
      screen: "briefing" as const,
      selectedImageUrl: "blob:private-photo",
      selectedImageName: "room.jpg",
      imageId: "image-id",
      jobId: "job-id",
      caseId: "case-id",
      caseData: LEGACY_MOCK_CASE,
      truth: LEGACY_MOCK_CASE.truth,
    };

    saveGameState(live);
    const stored = localStorage.getItem("wanwuyouxi.game.v1") ?? "";

    expect(stored).toContain("case-id");
    expect(stored).not.toContain("blob:private-photo");
    expect(stored).not.toContain(LEGACY_MOCK_CASE.truth);
    expect(stored).not.toContain("correctAnswerIndex");
  });
});
