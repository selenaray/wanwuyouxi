import { describe, expect, it } from "vitest";

import { createInitialState, transitionGame } from "./game-machine";

describe("game state machine", () => {
  it("moves through the mock generation flow", () => {
    let state = createInitialState();

    state = transitionGame(state, { type: "START" });
    expect(state.screen).toBe("capture");

    state = transitionGame(state, { type: "USE_SAMPLE" });
    expect(state.screen).toBe("scanning");

    state = transitionGame(state, { type: "SCAN_COMPLETE" });
    expect(state.screen).toBe("briefing");

    state = transitionGame(state, { type: "ENTER_SCENE", now: 1000 });
    expect(state.screen).toBe("exploring");
    expect(state.startedAt).toBe(1000);
  });

  it("opens clues idempotently and unlocks deduction after all three", () => {
    let state = {
      ...createInitialState(),
      screen: "exploring" as const,
      startedAt: 1000,
    };

    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "clock" });
    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "clock" });
    expect(state.openedClueIds).toEqual(["clock"]);
    expect(transitionGame(state, { type: "BEGIN_DEDUCTION" }).screen).toBe("exploring");

    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "mug" });
    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "notebook" });
    expect(transitionGame(state, { type: "BEGIN_DEDUCTION" }).screen).toBe("deduction");
  });

  it("shows a hint after the first wrong answer and reveals after the second", () => {
    let state = {
      ...createInitialState(),
      screen: "deduction" as const,
      openedClueIds: ["clock", "mug", "notebook"],
      startedAt: 1000,
    };

    state = transitionGame(state, { type: "SUBMIT_ANSWER", answerIndex: 0, now: 2000 });
    expect(state.screen).toBe("deduction");
    expect(state.attemptCount).toBe(1);
    expect(state.showHint).toBe(true);

    state = transitionGame(state, { type: "SUBMIT_ANSWER", answerIndex: 1, now: 3000 });
    expect(state.screen).toBe("result");
    expect(state.attemptCount).toBe(2);
    expect(state.revealedAt).toBe(3000);
  });

  it("reveals immediately when the correct answer is selected", () => {
    const state = transitionGame(
      {
        ...createInitialState(),
        screen: "deduction",
        openedClueIds: ["clock", "mug", "notebook"],
        startedAt: 1000,
      },
      { type: "SUBMIT_ANSWER", answerIndex: 2, now: 2000 },
    );

    expect(state.screen).toBe("result");
    expect(state.firstAnswerCorrect).toBe(true);
  });
});
