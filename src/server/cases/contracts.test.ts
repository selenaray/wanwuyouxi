import { describe, expect, it } from "vitest";

import { GeneratedCaseSchema, toPlayerCase } from "./contracts";

const valid = {
  decision: "PASS",
  logicalConfidence: 0.94,
  riskLabels: [],
  candidates: ["台灯", "书", "杯子"],
  game: {
    title: "消失的借阅卡",
    caseNumber: "WY-001",
    background: "闭馆前，一张借阅卡从桌面消失。",
    objective: "找出最后移动借阅卡的人。",
    interactionMode: "HOTSPOT",
    clues: [
      {
        id: "lamp",
        objectName: "台灯",
        clueText: "灯罩仍有余温。",
        regionHint: "桌面左侧",
        x: 0.2,
        y: 0.3,
        radius: 0.08,
        confidence: 0.95,
      },
      {
        id: "book",
        objectName: "书",
        clueText: "书页夹着一张新折痕。",
        regionHint: "桌面中央",
        x: 0.5,
        y: 0.5,
        radius: 0.08,
        confidence: 0.94,
      },
      {
        id: "cup",
        objectName: "杯子",
        clueText: "杯底压着半圈水印。",
        regionHint: "桌面右侧",
        x: 0.8,
        y: 0.6,
        radius: 0.08,
        confidence: 0.93,
      },
    ],
    question: "谁最后移动了借阅卡？",
    answerOptions: ["整理书本的人", "关闭台灯的人", "拿走杯子的人"],
    correctAnswerIndex: 2,
    wrongAnswerHint: "把三件物品留下的时间顺序连起来。",
    truth: "杯底的新水印覆盖了卡片原来的灰尘轮廓。",
  },
} as const;

describe("GeneratedCaseSchema", () => {
  it("accepts the fixed three-clue contract", () => {
    expect(GeneratedCaseSchema.parse(valid).game?.clues).toHaveLength(3);
  });

  it("accepts non-empty single-character Chinese answer options", () => {
    const singleCharacterAnswers = {
      ...valid,
      game: { ...valid.game, answerOptions: ["甲", "乙", "丙"] },
    };

    expect(GeneratedCaseSchema.safeParse(singleCharacterAnswers).success).toBe(true);
  });

  it("still rejects an empty answer option", () => {
    const emptyAnswer = {
      ...valid,
      game: { ...valid.game, answerOptions: ["", "乙", "丙"] },
    };

    expect(GeneratedCaseSchema.safeParse(emptyAnswer).success).toBe(false);
  });

  it("rejects a case with fewer than three clues", () => {
    const invalid = {
      ...valid,
      game: { ...valid.game, clues: valid.game.clues.slice(0, 2) },
    };

    expect(GeneratedCaseSchema.safeParse(invalid).success).toBe(false);
  });

  it("removes the answer and truth from the player view", () => {
    const player = toPlayerCase(GeneratedCaseSchema.parse(valid).game!);

    expect(player).not.toHaveProperty("correctAnswerIndex");
    expect(player).not.toHaveProperty("truth");
    expect(player.clues).toHaveLength(3);
  });
});
