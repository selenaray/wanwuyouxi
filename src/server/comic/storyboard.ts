import type { PortraitKey } from "@/features/game/suspect-roster";
import { isV2PlayerCase, type PlayerCase, type V2PlayerCase } from "@/features/game/types";

export type ComicPanel = {
  title: string;
  description: string;
};

export type CaseComicStoryboard = {
  panels: [ComicPanel, ComicPanel, ComicPanel, ComicPanel];
  prompt: string;
  referencePortraitKey: PortraitKey | null;
};

type StoryboardInput = {
  game: PlayerCase;
  truth: string;
  correctAnswerIndex: number | null;
};

type SolvedContext = {
  hasSpecificEvidence: boolean;
  culpritName: string | null;
  culpritReference: string | null;
  sceneObjects: string[];
  targetObjectName: string;
  evidenceDescription: string;
  claimText: string | null;
  referencePortraitKey: PortraitKey | null;
};

function getSolvedV2Context(game: V2PlayerCase, correctAnswerIndex: number | null) {
  const safeIndex = correctAnswerIndex !== null && correctAnswerIndex >= 0 && correctAnswerIndex < game.suspects.length
    ? correctAnswerIndex
    : 0;
  const suspect = game.suspects[safeIndex];
  const claim = game.claims[safeIndex];
  const evidence = game.evidence.find((item) => item.suspectId === suspect.id) ?? game.evidence[safeIndex];
  return { suspect, claim, evidence };
}

function solvedContextFromInput(input: StoryboardInput): SolvedContext {
  if (isV2PlayerCase(input.game)) {
    const { suspect, claim, evidence } = getSolvedV2Context(input.game, input.correctAnswerIndex);
    return {
      hasSpecificEvidence: true,
      culpritName: suspect.name,
      culpritReference: "嫌疑人的性别观感、年龄感、脸、发型、服装轮廓、气质都必须严格参考 Image 1。",
      sceneObjects: input.game.evidence.map((item) => item.objectName),
      targetObjectName: evidence.objectName,
      evidenceDescription: evidence.publicDescription,
      claimText: claim.text,
      referencePortraitKey: suspect.portraitKey,
    };
  }
  return {
    hasSpecificEvidence: false,
    culpritName: null,
    culpritReference: null,
    sceneObjects: "clues" in input.game ? input.game.clues.map((item) => item.objectName) : [],
    targetObjectName: "clues" in input.game ? input.game.clues[0]?.objectName ?? "关键物证" : "关键物证",
    evidenceDescription: "现场出现了与证词不一致的物理痕迹。",
    claimText: null,
    referencePortraitKey: null,
  };
}

function buildV2Panels(input: StoryboardInput & { game: V2PlayerCase }): CaseComicStoryboard["panels"] {
  const { suspect, claim, evidence } = getSolvedV2Context(input.game, input.correctAnswerIndex);
  return [
    {
      title: "案发前",
      description: `夜色中的现场保持安静，${suspect.name}靠近${evidence.regionHint}的${evidence.objectName}，其他线索还没有被发现。`,
    },
    {
      title: "关键动作",
      description: `${suspect.name}对${evidence.objectName}做出关键动作，画面突出${evidence.publicDescription}`,
    },
    {
      title: "伪装现场",
      description: `${suspect.name}试图恢复现场并留下证词：“${claim.text}”，但${evidence.objectName}的状态暴露了破绽。`,
    },
    {
      title: "真相揭晓",
      description: `侦探把${evidence.objectName}、证词和现场痕迹串联起来，揭示真相：${input.truth}`,
    },
  ];
}

function buildLegacyPanels(input: StoryboardInput): CaseComicStoryboard["panels"] {
  return [
    { title: "案发前", description: `${input.game.title}的现场仍然平静，关键物品散落在画面各处。` },
    { title: "关键动作", description: `某个关键物品被移动或改变，现场留下第一处不协调的痕迹。` },
    { title: "伪装现场", description: `嫌疑人试图用证词掩盖行动，让物证看起来像原本就在那儿。` },
    { title: "真相揭晓", description: `侦探复盘三条线索，揭示真相：${input.truth}` },
  ];
}

function panelBriefs(context: SolvedContext) {
  const culprit = context.culpritName ? "Image 1 对应的嫌疑人" : "嫌疑人";
  return [
    `第1格：用广角展示现场中的这些可见物证：${context.sceneObjects.join("、")}。${culprit}出现在现场边缘或刚靠近现场，气氛悬疑但不要出现文字。`,
    `第2格：特写 ${culprit} 正在移动或触碰「${context.targetObjectName}」，必须画这个物证本身，不要替换成其他道具。突出动作和手部，但不要让手里拿钥匙。`,
    `第3格：${culprit}试图把「${context.targetObjectName}」恢复原状或伪装成没动过，画面要表现紧张和遮掩。`,
    `第4格：侦探或复盘视角把「${context.targetObjectName}」与物理痕迹联系起来，重点呈现这个破绽：${context.evidenceDescription}`,
  ] as const;
}

function comicPrompt(context: SolvedContext) {
  const panels = panelBriefs(context);
  const keyRule = context.targetObjectName.includes("钥匙")
    ? "本案关键物证就是钥匙时，才可以画钥匙；钥匙必须作为关键物证出现，不能变成无关道具。"
    : "严禁画钥匙、钥匙串、金属钥匙、拿钥匙的手、像钥匙的道具，即使案件背景或动机里出现过钥匙，也不要画。";
  return [
    "生成一张 2x2 四格悬疑漫画，用来复盘这个轻推理案件的发生过程。",
    "画风：高质量二次元悬疑漫画、电影感构图、赛璐璐上色、线条清晰、光影强烈、颜色饱和但不灰蒙蒙，适合作为手机结果页海报。",
    "版式：四个等大的漫画分格，清楚分隔，从左上到右下阅读。",
    "画面中绝对不要出现任何文字：不要标题、章节名、分格名、字幕、对白气泡、logo、水印、中文、英文、日文、韩文。",
    "漫画必须严格围绕本案可见物证，不要画成通用盗窃故事，不要加入 prompt 没有要求的道具。",
    `本案现场可见物证：${context.sceneObjects.join("、")}。`,
    `本案真正发生变化的物证：${context.targetObjectName}。`,
    `这个物证的破绽：${context.evidenceDescription}`,
    context.claimText ? `嫌疑人的矛盾证词：${context.claimText}` : "",
    keyRule,
    "不要画四张同一个人的不同角度；四格必须分别是现场全景、物证动作特写、伪装/复原现场、真相复盘视角。",
    context.referencePortraitKey
      ? "Image 1 是本案嫌疑人的唯一角色参考。嫌疑人出现时，必须保留 Image 1 的脸、发型、服装轮廓、年龄感和整体身份，不要重新生成一个新人物。"
      : "嫌疑人出现时要保持视觉一致，但每一格的镜头距离、光线、动作和画面重点要不同。",
    context.culpritReference ? `角色参考要求：${context.culpritReference}` : "",
    ...panels,
  ].filter(Boolean).join("\n");
}

export function buildCaseComicStoryboard(input: StoryboardInput): CaseComicStoryboard {
  const panels = isV2PlayerCase(input.game)
    ? buildV2Panels({ ...input, game: input.game })
    : buildLegacyPanels(input);
  const solvedContext = solvedContextFromInput(input);
  return {
    panels,
    prompt: comicPrompt(solvedContext),
    referencePortraitKey: solvedContext.referencePortraitKey,
  };
}
