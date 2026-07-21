import { describe, expect, it } from "vitest";

import { createInitialState, transitionGame } from "./game-machine";
import { LEGACY_MOCK_CASE } from "./mock-case";
import type { GameState, V2PlayerCase } from "./types";

const V2_CASE = {
  version: 2,
  title: "午夜桌面的证词",
  caseNumber: "WY-V2-001",
  background: "闭馆前，保管箱钥匙在这张桌边短暂失踪。",
  objective: "检查三件物证，判断谁的证词与现场矛盾。",
  interactionMode: "HOTSPOT",
  evidence: [
    { id: "ev-lamp", visualFactId: "vf-lamp", suspectId: "su-lin", objectName: "台灯", publicDescription: "灯罩的朝向与值班记录不符。", regionHint: "左侧", x: 0.24, y: 0.35, radius: 0.08, confidence: 0.95 },
    { id: "ev-book", visualFactId: "vf-book", suspectId: "su-zhou", objectName: "书本", publicDescription: "书页留下朝向门口的反向折痕。", regionHint: "中央", x: 0.51, y: 0.55, radius: 0.08, confidence: 0.94 },
    { id: "ev-cup", visualFactId: "vf-cup", suspectId: "su-qiao", objectName: "杯子", publicDescription: "杯底的新水印覆盖了原本连续的灰尘。", regionHint: "右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
  ],
  suspects: [
    { id: "su-lin", name: "林默", identity: "夜班管理员", relation: "负责闭馆巡检", personalityTags: ["克制", "谨慎"], portraitKey: "noir-01", initialTestimony: "我只关了台灯，没有碰桌上的其他东西。" },
    { id: "su-zhou", name: "周岚", identity: "资料员", relation: "最后整理借阅资料", personalityTags: ["直接", "急躁"], portraitKey: "noir-02", initialTestimony: "我把书合上后就离开了。" },
    { id: "su-qiao", name: "乔野", identity: "临时访客", relation: "在闭馆前来取文件", personalityTags: ["冷静", "回避"], portraitKey: "noir-03", initialTestimony: "杯子从始至终都在原位。" },
  ],
  claims: [
    { id: "cl-lin", suspectId: "su-lin", text: "我只调整了台灯。" },
    { id: "cl-zhou", suspectId: "su-zhou", text: "我合上书后马上离开。" },
    { id: "cl-qiao", suspectId: "su-qiao", text: "杯子一直没有离开原位。" },
  ],
  wrongAnswerHint: "把证词里的绝对说法与物证的新旧痕迹对照。",
} as V2PlayerCase;

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
    let state: GameState = {
      ...createInitialState(),
      screen: "exploring" as const,
      startedAt: 1000,
      caseData: LEGACY_MOCK_CASE,
    };

    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "clock" });
    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "clock" });
    expect(state.openedClueIds).toEqual(["clock"]);
    expect(transitionGame(state, { type: "BEGIN_DEDUCTION" }).screen).toBe("exploring");

    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "mug" });
    state = transitionGame(state, { type: "OPEN_CLUE", clueId: "notebook" });
    expect(transitionGame(state, { type: "BEGIN_DEDUCTION" }).screen).toBe("deduction");
  });

  it("atomically and idempotently unlocks the suspect linked to V2 evidence", () => {
    const exploring = {
      ...createInitialState(),
      screen: "exploring" as const,
      caseData: V2_CASE,
    };

    const locked = transitionGame(exploring, { type: "OPEN_SUSPECT", suspectId: "su-qiao" });
    expect(locked.activeSuspectId).toBeNull();

    const afterEvidence = transitionGame(exploring, { type: "OPEN_EVIDENCE", evidenceId: "ev-cup" });
    expect(afterEvidence.openedEvidenceIds).toEqual(["ev-cup"]);
    expect(afterEvidence.unlockedSuspectIds).toEqual(["su-qiao"]);
    expect(afterEvidence.activeClueId).toBe("ev-cup");

    const reopened = transitionGame(afterEvidence, { type: "OPEN_EVIDENCE", evidenceId: "ev-cup" });
    expect(reopened.openedEvidenceIds).toEqual(["ev-cup"]);
    expect(reopened.unlockedSuspectIds).toEqual(["su-qiao"]);

    const opened = transitionGame(afterEvidence, { type: "OPEN_SUSPECT", suspectId: "su-qiao" });
    expect(opened.activeSuspectId).toBe("su-qiao");
    expect(transitionGame(opened, { type: "CLOSE_SUSPECT" }).activeSuspectId).toBeNull();
  });

  it("requires all three V2 evidence items and suspects before deduction", () => {
    let state: GameState = {
      ...createInitialState(),
      screen: "exploring" as const,
      caseData: V2_CASE,
    };

    state = transitionGame(state, { type: "OPEN_EVIDENCE", evidenceId: "ev-lamp" });
    state = transitionGame(state, { type: "OPEN_EVIDENCE", evidenceId: "ev-book" });
    expect(transitionGame(state, { type: "BEGIN_DEDUCTION" }).screen).toBe("exploring");

    state = transitionGame(state, { type: "OPEN_EVIDENCE", evidenceId: "ev-cup" });
    expect(transitionGame({ ...state, unlockedSuspectIds: state.unlockedSuspectIds.slice(0, 2) }, { type: "BEGIN_DEDUCTION" }).screen).toBe("exploring");
    expect(transitionGame({ ...state, openedEvidenceIds: state.openedEvidenceIds.slice(0, 2) }, { type: "BEGIN_DEDUCTION" }).screen).toBe("exploring");
    expect(transitionGame(state, { type: "BEGIN_DEDUCTION" }).screen).toBe("deduction");
  });

  it("shows a hint after the first wrong answer and reveals after the second", () => {
    let state: GameState = {
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

  it("keeps the deduction visible until a live reveal has loaded", () => {
    let state: GameState = {
      ...createInitialState(),
      screen: "deduction" as const,
      mode: "live" as const,
      openedClueIds: ["clock", "mug", "notebook"],
      startedAt: 1000,
    };

    state = transitionGame(state, {
      type: "ANSWER_RESPONSE",
      correct: true,
      completed: true,
      attemptCount: 1,
      now: 2000,
    });
    expect(state.screen).toBe("deduction");

    state = transitionGame(state, {
      type: "REVEAL_LOADED",
      truth: "真相",
      firstAnswerCorrect: true,
      now: 2000,
    });
    expect(state.screen).toBe("result");
    expect(state.truth).toBe("真相");
    expect(state.revealedAt).toBe(2000);
  });

  it("hydrates an exact persisted sample-game state", () => {
    const persisted = {
      ...createInitialState(),
      screen: "exploring" as const,
      selectedImageUrl: "/sample-room.svg",
      selectedImageName: "示例宿舍现场",
      openedClueIds: ["clock", "mug"],
      startedAt: 1000,
    };

    expect(transitionGame(createInitialState(), { type: "HYDRATE", state: persisted })).toEqual(persisted);
  });

  it("keeps the real generation error and clears a failed job before retrying", () => {
    const failed = transitionGame(
      { ...createInitialState(), mode: "live", jobId: "failed-job" },
      { type: "SCAN_FAILED", errorCode: "QWEN_SCHEMA_INVALID" },
    );

    expect(failed.errorCode).toBe("QWEN_SCHEMA_INVALID");
    expect(transitionGame(failed, { type: "RETRY_SCAN" })).toMatchObject({
      screen: "capture",
      jobId: null,
      imageId: null,
      errorCode: null,
    });
  });
});
