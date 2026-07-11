import { beforeEach, describe, expect, it } from "vitest";

import { createInitialState } from "./game-machine";
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
});
