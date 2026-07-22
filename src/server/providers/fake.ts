import type { GeneratedCase, PrivateCase } from "@/server/cases/contracts";
import {
  V2PrivateCaseSchema,
  VisionObservationSchema,
  type V2PrivateCase,
  type VisionObservation,
} from "@/server/cases/v2-contracts";
import { validObservation, validV2Case } from "@/server/cases/v2-contracts.fixture";
import { SUSPECT_ROSTER } from "@/features/game/suspect-roster";

import type {
  CaseFactbookCompiler,
  CaseFactbookJudge,
  CaseJudgeProvider,
  ValidationIssue,
  VisionCaseProvider,
  VisionObservationProvider,
} from "./types";

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

export const fakeObservation = VisionObservationSchema.parse(validObservation);
export const fakeV2Case = V2PrivateCaseSchema.parse(validV2Case);

export class FakeVisionObservationProvider implements VisionObservationProvider {
  async observeScene() {
    return structuredClone(fakeObservation);
  }
}

export class FakeCaseFactbookCompiler implements CaseFactbookCompiler {
  async compileCase() {
    return structuredClone(fakeV2Case);
  }

  async repairCase(input: {
    game: V2PrivateCase;
    issues: ValidationIssue[];
    traceId: string;
  }) {
    return structuredClone(input.game);
  }
}

export class ObservationFallbackFactbookCompiler implements CaseFactbookCompiler {
  async compileCase(input: {
    observation: Extract<VisionObservation, { decision: "PASS" }>;
    traceId: string;
  }) {
    const facts = input.observation.visualFacts.slice(0, 3);
    const [first, second, third] = facts;
    const roster = [SUSPECT_ROSTER[0], SUSPECT_ROSTER[1], SUSPECT_ROSTER[8]] as const;
    const suspectIds = ["shen-yanzhou", "lin-wanqing", "jiang-ye"] as const;

    const game = {
      version: 2,
      title: "现场第三处破绽",
      caseNumber: "WY-FB-001",
      background: `${input.observation.sceneSummary}。三名到场者都声称没有改变关键物品。`,
      objective: "检查三件物证，找出证词与现场矛盾的人。",
      interactionMode: "HOTSPOT",
      visualFacts: input.observation.visualFacts,
      evidence: facts.map((fact, index) => ({
        id: `ev-${index + 1}`,
        visualFactId: fact.id,
        suspectId: suspectIds[index],
        objectName: fact.objectName,
        publicDescription: `${fact.regionHint}的${fact.objectName}留下了异常：${fact.visibleDescription}`,
        regionHint: fact.regionHint,
        x: fact.x,
        y: fact.y,
        radius: fact.radius,
        confidence: fact.confidence,
      })),
      suspects: roster.map((suspect, index) => ({
        id: suspectIds[index],
        name: suspect.name,
        gender: suspect.gender,
        age: suspect.age,
        identity: suspect.identity,
        relation: index === 0 ? "受邀到场的调查者" : index === 1 ? "案发前见过现场的人" : "最后离开现场的人",
        personalityTags: suspect.personalityTags,
        portraitKey: suspect.portraitKey,
        initialTestimony: index === 2
          ? `我只路过现场，没有碰过${third.objectName}，它一直保持原样。`
          : `我注意到${facts[index].objectName}有点不对，但没有移动过现场物品。`,
        privateAction: index === 2
          ? `移动了${third.objectName}并试图恢复原状。`
          : `发现了${facts[index].objectName}的异常但没有改动。`,
        allowedFactIds: [`tf-${index + 1}`, `cl-${index + 1}`],
      })),
      timelineFacts: [
        { id: "tf-1", timeLabel: "22:10", text: `沈砚舟先检查了${first.objectName}，记录下可见异常。` },
        { id: "tf-2", timeLabel: "22:20", text: `林晚晴提到${second.objectName}的位置让她感到不安。` },
        { id: "tf-3", timeLabel: "22:30", text: `江野最后靠近了${third.objectName}，随后独自离开。` },
      ],
      claims: [
        { id: "cl-1", suspectId: "shen-yanzhou", text: `我只看过${first.objectName}，没有处理其他东西。`, factRefs: ["tf-1"], evidenceRefs: ["ev-1"] },
        { id: "cl-2", suspectId: "lin-wanqing", text: `我只是提醒大家注意${second.objectName}，没再靠近现场。`, factRefs: ["tf-2"], evidenceRefs: ["ev-2"] },
        { id: "cl-3", suspectId: "jiang-ye", text: `我没有碰过${third.objectName}，它从头到尾都保持原样。`, factRefs: ["tf-3"], evidenceRefs: ["ev-3"] },
      ],
      liarSuspectId: "jiang-ye",
      contradiction: {
        claimId: "cl-3",
        evidenceId: "ev-3",
        explanation: `${third.objectName}的可见状态说明它曾被移动，与江野的证词矛盾。`,
      },
      wrongAnswerHint: `先看${third.objectName}的状态，再对照最后一份证词。`,
      truth: {
        summary: `江野移动了${third.objectName}后又放回原处，留下了无法解释的现场痕迹。`,
        motive: "他想在不惊动其他人的情况下取走关键物品。",
        evidenceChain: [
          third.visibleDescription,
          `江野声称${third.objectName}没有被碰过。`,
        ],
      },
    };

    return V2PrivateCaseSchema.parse(game);
  }

  async repairCase(input: {
    game: V2PrivateCase;
    issues: ValidationIssue[];
    traceId: string;
  }) {
    return structuredClone(input.game);
  }
}

export class FakeCaseFactbookJudge implements CaseFactbookJudge {
  async validateCase() {
    return { valid: true as const, confidence: 0.99, issues: [] };
  }
}
