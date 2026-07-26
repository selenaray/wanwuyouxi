import type { GeneratedCase, PrivateCase } from "@/server/cases/contracts";
import {
  V2PrivateCaseSchema,
  VisionObservationSchema,
  type V2PrivateCase,
  type VisionObservation,
} from "@/server/cases/v2-contracts";
import { validObservation, validV2Case } from "@/server/cases/v2-contracts.fixture";
import { buildCaseTitle, selectSuspectRoster } from "@/server/cases/case-semantics";

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

function answerIndexFromTrace(traceId: string) {
  return [...traceId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
}

export class ObservationFallbackFactbookCompiler implements CaseFactbookCompiler {
  async compileCase(input: {
    observation: Extract<VisionObservation, { decision: "PASS" }>;
    traceId: string;
  }) {
    const facts = input.observation.visualFacts.slice(0, 3);
    const [first, second, third] = facts;
    const roster = selectSuspectRoster({
      sceneSummary: input.observation.sceneSummary,
      objectNames: facts.map((fact) => fact.objectName),
    });
    const suspectIds = roster.map((suspect) => suspect.id) as [string, string, string];
    const liarIndex = answerIndexFromTrace(input.traceId);
    const liarFact = facts[liarIndex];
    const liarSuspect = roster[liarIndex];
    const title = buildCaseTitle({
      sceneSummary: input.observation.sceneSummary,
      objectNames: facts.map((fact) => fact.objectName),
      keyObjectName: liarFact.objectName,
      traceId: input.traceId,
    });

    const game = {
      version: 2,
      title,
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
        initialTestimony: index === liarIndex
          ? `我只路过现场，没有碰过${facts[index].objectName}，它一直保持原样。`
          : `我注意到${facts[index].objectName}有点不对，但没有移动过现场物品。`,
        privateAction: index === liarIndex
          ? `移动了${facts[index].objectName}并试图恢复原状。`
          : `发现了${facts[index].objectName}的异常但没有改动。`,
        allowedFactIds: [`tf-${index + 1}`, `cl-${index + 1}`],
      })),
      timelineFacts: [
        { id: "tf-1", timeLabel: "22:10", text: `${roster[0].name}先检查了${first.objectName}，记录下可见异常。` },
        { id: "tf-2", timeLabel: "22:20", text: `${roster[1].name}提到${second.objectName}的位置让人不安。` },
        { id: "tf-3", timeLabel: "22:30", text: `${roster[2].name}最后靠近了${third.objectName}，随后独自离开。` },
      ],
      claims: facts.map((fact, index) => ({
        id: `cl-${index + 1}`,
        suspectId: suspectIds[index],
        text: index === liarIndex
          ? `我没有碰过${fact.objectName}，它从头到尾都保持原样。`
          : `我只注意到${fact.objectName}有些异常，但没有移动它。`,
        factRefs: [`tf-${index + 1}`],
        evidenceRefs: [`ev-${index + 1}`],
      })),
      liarSuspectId: suspectIds[liarIndex],
      contradiction: {
        claimId: `cl-${liarIndex + 1}`,
        evidenceId: `ev-${liarIndex + 1}`,
        explanation: `${liarFact.objectName}的可见状态说明它曾被移动，与${liarSuspect.name}的证词矛盾。`,
      },
      wrongAnswerHint: `先看${liarFact.objectName}的状态，再对照对应证词。`,
      truth: {
        summary: `${liarSuspect.name}移动了${liarFact.objectName}后又放回原处，留下了无法解释的现场痕迹。`,
        motive: "对方想在不惊动其他人的情况下取走关键物品。",
        evidenceChain: [
          liarFact.visibleDescription,
          `${liarSuspect.name}声称${liarFact.objectName}没有被碰过。`,
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
