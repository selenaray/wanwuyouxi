import type { GeneratedCase, PrivateCase } from "@/server/cases/contracts";

import type { CaseJudgeProvider, VisionCaseProvider } from "./types";

export const fakePrivateCase: PrivateCase = {
  title: "午夜访客",
  caseNumber: "CASE 0714",
  background: "午夜前，一件重要物品在这间房里悄然消失，只留下三处不协调的痕迹。",
  objective: "检查三个物品，找出真正改变现场的人。",
  interactionMode: "HOTSPOT",
  clues: [
    { id: "lamp", objectName: "台灯", clueText: "灯罩内侧仍残留着不自然的余温。", regionHint: "画面左侧", x: 0.25, y: 0.35, radius: 0.08, confidence: 0.95 },
    { id: "book", objectName: "书本", clueText: "书页的折痕朝向与摆放方向相反。", regionHint: "画面中央", x: 0.5, y: 0.55, radius: 0.08, confidence: 0.94 },
    { id: "cup", objectName: "杯子", clueText: "杯底的新水印盖住了一圈旧灰尘。", regionHint: "画面右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
  ],
  question: "谁最后改变了现场？",
  answerOptions: ["整理书本的人", "关闭台灯的人", "拿走杯子的人"],
  correctAnswerIndex: 2,
  wrongAnswerHint: "注意三件物品留下痕迹的新旧顺序。",
  truth: "杯底的新水印覆盖了原本连续的灰尘，说明拿走杯子的人最后移动过关键物品。",
};

export class FakeVisionCaseProvider implements VisionCaseProvider {
  async generateCase(): Promise<GeneratedCase> {
    return {
      decision: "PASS",
      logicalConfidence: 0.98,
      riskLabels: [],
      candidates: ["台灯", "书本", "杯子"],
      game: fakePrivateCase,
    };
  }
}

export class FakeCaseJudgeProvider implements CaseJudgeProvider {
  async validateCase() {
    return { valid: true, confidence: 0.99, issues: [] };
  }

  async repairCase(input: { game: PrivateCase }) {
    return input.game;
  }
}

