import { SUSPECT_ROSTER, type SuspectArchetype } from "@/features/game/suspect-roster";

type CaseSemanticInput = {
  sceneSummary: string;
  objectNames: string[];
  truth?: string;
  culpritName?: string;
  keyObjectName?: string;
  evidenceDescription?: string;
};

type InterrogationHintInput = {
  suspectName: string;
  suspectIdentity: string;
  objectName: string;
  claimText: string;
  evidenceDescription: string;
  personalityTags: [string, string];
};

const ROLE_KEYWORDS: Array<{ words: string[]; rosterIds: string[] }> = [
  { words: ["酒店", "房卡", "行李", "走廊", "清洁"], rosterIds: ["zhao-xiaoyu", "zhang-weiqiang", "tang-wanning", "li-jianguo", "wang-guifen"] },
  { words: ["书", "台灯", "杯", "书桌", "作业", "宿舍", "教室"], rosterIds: ["xu-xinghe", "ye-zhiqiu", "shen-zhixia", "fang-ye", "lin-wanqing"] },
  { words: ["古董", "画", "展柜", "钥匙", "保管箱", "展厅"], rosterIds: ["xu-qinghe", "wen-ruyue", "han-mobai", "gu-yanchuan", "zhou-qiming"] },
  { words: ["门", "电梯", "车", "包裹", "外卖", "监控"], rosterIds: ["chen-haoran", "zhang-weiqiang", "li-jianguo", "lu-chengze", "zhou-qiming"] },
];

const OBJECT_ENGLISH: Array<{ words: string[]; label: string }> = [
  { words: ["杯", "杯子", "水杯"], label: "cup" },
  { words: ["房卡", "卡"], label: "hotel access card" },
  { words: ["台灯", "灯"], label: "desk lamp" },
  { words: ["书", "书本"], label: "book" },
  { words: ["钥匙"], label: "key" },
  { words: ["行李", "箱"], label: "suitcase" },
  { words: ["手机"], label: "phone" },
  { words: ["纸", "票据", "便签", "文件"], label: "paper note" },
  { words: ["电脑", "笔记本"], label: "laptop" },
  { words: ["椅", "座椅"], label: "chair" },
  { words: ["桌", "桌面"], label: "desk" },
  { words: ["瓶"], label: "bottle" },
  { words: ["遥控"], label: "remote control" },
  { words: ["相机", "摄像"], label: "camera" },
  { words: ["钱包"], label: "wallet" },
  { words: ["包", "背包"], label: "bag" },
  { words: ["眼镜"], label: "glasses" },
  { words: ["笔"], label: "pen" },
  { words: ["画", "相框"], label: "framed painting" },
  { words: ["门"], label: "door" },
  { words: ["清洁"], label: "cleaning cart" },
];

const CASE_TITLE_TEMPLATES = [
  "第七分钟的空白",
  "归位之前",
  "门后回声",
  "灯灭以后",
  "第二次沉默",
  "夜色多出的一步",
  "未寄出的证词",
  "走廊尽头的停顿",
  "安静房间里的回声",
  "最后一段空白",
];

function hashText(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function includesAny(source: string, words: string[]) {
  return words.some((word) => source.includes(word));
}

function rosterById(id: string) {
  return SUSPECT_ROSTER.find((suspect) => suspect.id === id);
}

function pickUnique(candidates: SuspectArchetype[], seed: number) {
  const pool = [...candidates];
  const picked: SuspectArchetype[] = [];
  let cursor = seed;
  while (pool.length > 0 && picked.length < 3) {
    const index = cursor % pool.length;
    picked.push(pool.splice(index, 1)[0]);
    cursor = Math.floor(cursor / 7) + 11;
  }
  return picked;
}

export function selectSuspectRoster(input: CaseSemanticInput): [SuspectArchetype, SuspectArchetype, SuspectArchetype] {
  const source = `${input.sceneSummary} ${input.objectNames.join(" ")}`;
  const matchedIds = ROLE_KEYWORDS
    .filter((group) => includesAny(source, group.words))
    .flatMap((group) => group.rosterIds);
  const candidates = Array.from(new Set(matchedIds))
    .map(rosterById)
    .filter((suspect): suspect is SuspectArchetype => Boolean(suspect));
  const fallbackPool = candidates.length >= 3 ? candidates : [...candidates, ...SUSPECT_ROSTER];
  const picked = pickUnique(fallbackPool, hashText(source));
  return [picked[0], picked[1], picked[2]];
}

export function buildInterrogationHints(input: InterrogationHintInput) {
  const [primaryTag, secondaryTag] = input.personalityTags;
  return [
    `${input.suspectName}避开了正面回答，只说最后一次看见${input.objectName}时，它已经在原位。`,
    `${input.suspectName}提到自己的身份是${input.suspectIdentity}，所以比别人更容易注意到${input.objectName}的位置变化。`,
    `对方强调“${input.claimText}”，但语气里刻意避开了“碰没碰过”这个细节。`,
    `当问到时间点时，${input.suspectName}只给出模糊顺序：先有人离开，后来才发现${input.objectName}不对。`,
    `${input.suspectName}说${input.evidenceDescription}可能是旧痕迹，但没有解释为什么会刚好出现在关键位置。`,
    `这个回答表现出${primaryTag}的一面：说得很稳，却把责任推给了现场混乱。`,
    `对方无意间透露，案发前后至少有两个人接近过${input.objectName}。`,
    `${input.suspectName}提醒你别只盯着人，要比较三份证词里谁最依赖${input.objectName}保持原样。`,
    `这句话带着${secondaryTag}的防备感：信息不少，但每一句都留了退路。`,
    `如果继续追问，最值得核对的是“最后看见${input.objectName}的人”和“最需要它不被移动的人”是不是同一个。`,
  ];
}

export function buildCaseTitle(input: CaseSemanticInput & { traceId: string }) {
  return CASE_TITLE_TEMPLATES[hashText(`${input.sceneSummary} ${input.traceId}`) % CASE_TITLE_TEMPLATES.length];
}

function objectToEnglish(value: string | undefined) {
  if (!value) return "important object";
  return OBJECT_ENGLISH.find((item) => includesAny(value, item.words))?.label ?? "important object";
}

function sceneToEnglish(input: CaseSemanticInput) {
  const source = `${input.sceneSummary} ${input.objectNames.join(" ")}`;
  if (includesAny(source, ["酒店", "房卡", "走廊"])) return "hotel corridor mystery";
  if (includesAny(source, ["书", "台灯", "书桌", "宿舍"])) return "late-night desk mystery";
  if (includesAny(source, ["古董", "画", "展柜", "展厅"])) return "gallery display mystery";
  if (includesAny(source, ["门", "车", "外卖", "包裹"])) return "doorway delivery mystery";
  return "indoor mystery scene";
}

export function buildEnglishComicContext(input: CaseSemanticInput) {
  const object = objectToEnglish(input.keyObjectName ?? input.objectNames[0]);
  const scene = sceneToEnglish(input);
  const trace = objectToEnglish(input.evidenceDescription) === "important object"
    ? "a fresh physical trace contradicts the testimony"
    : `a fresh trace on the ${object} contradicts the testimony`;
  const keyGuard = object === "key"
    ? "The important object is a small metal key, so a key may appear only as that exact evidence object."
    : "Do not depict a metal key, key ring, or random handheld key-like prop; focus on the named important object instead.";
  return [
    `Scene type: ${scene}.`,
    `Important object: ${object}.`,
    `Core contradiction: the ${object} was secretly moved and later restored.`,
    `Visible evidence: ${trace}.`,
    keyGuard,
    "Visual story: the culprit approaches the object, changes it, restores the scene, and a detective reconstructs the contradiction through physical traces.",
  ].join(" ");
}
