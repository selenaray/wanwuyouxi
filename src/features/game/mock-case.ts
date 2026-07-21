import type { MockCase, V2PlayerCase } from "./types";

export const SAMPLE_IMAGE_URL = "/sample-room.svg";

export const SAMPLE_CORRECT_ANSWER_INDEX = 2;
export const SAMPLE_TRUTH = "乔野移动杯子取走钥匙后又将其放回。杯底的新水印覆盖了原本连续的灰尘，因此‘杯子从始至终都在原位’与现场物证直接矛盾。";

export const LEGACY_MOCK_CASE: MockCase = {
  title: "凌晨零点的失踪者",
  caseNumber: "CASE 0711",
  background:
    "室友林夏说去楼下取外卖，却再也没有回来。门锁没有破坏，手机仍在桌上。她留下的三件东西，正在讲述同一个去向。",
  objective: "找到三条现场线索，判断林夏最后去了哪里。",
  clues: [
    {
      id: "clock",
      objectName: "停摆的时钟",
      clueText: "时针被人为拨到 11:47，背面粘着一小段银色胶带。",
      regionHint: "看看墙面上方",
      x: 72,
      y: 24,
    },
    {
      id: "mug",
      objectName: "仍温热的马克杯",
      clueText: "杯底压着一张天台门禁的临时通行贴，编号正是 1147。",
      regionHint: "留意桌面左侧",
      x: 27,
      y: 62,
    },
    {
      id: "notebook",
      objectName: "翻开的笔记本",
      clueText: "最后一行写着：『风停之前，把银色盒子带到最高处。』",
      regionHint: "翻找桌面中央",
      x: 58,
      y: 69,
    },
  ],
  question: "林夏最可能去了哪里？",
  answerOptions: ["深夜车站", "街角咖啡馆", "宿舍天台"],
  correctAnswerIndex: 2,
  wrongAnswerHint: "把时间、门禁和“最高处”放在一起想。",
  truth:
    "林夏没有离开宿舍楼。11:47 是天台临时门禁的编号，银色胶带来自她要带走的盒子，而笔记里的“最高处”指向宿舍天台。她在那里准备了一场只想让你发现的告别仪式。",
};

export const MOCK_CASE: V2PlayerCase = {
  version: 2,
  title: "午夜桌面的证词",
  caseNumber: "WY-V2-001",
  background: "闭馆前，保管箱钥匙在这张桌边短暂失踪，三个人都声称没有移动关键物品。",
  objective: "检查三件物证，判断谁的证词与现场矛盾。",
  interactionMode: "HOTSPOT",
  evidence: [
    {
      id: "ev-lamp",
      visualFactId: "vf-lamp",
      suspectId: "su-lin",
      objectName: "台灯",
      publicDescription: "灯罩朝向墙面，与值班记录中的照明方向不同。",
      regionHint: "左侧",
      x: 0.24,
      y: 0.35,
      radius: 0.08,
      confidence: 0.95,
    },
    {
      id: "ev-book",
      visualFactId: "vf-book",
      suspectId: "su-zhou",
      objectName: "书本",
      publicDescription: "书页留下朝向门口的反向折痕。",
      regionHint: "中央",
      x: 0.51,
      y: 0.55,
      radius: 0.08,
      confidence: 0.94,
    },
    {
      id: "ev-cup",
      visualFactId: "vf-cup",
      suspectId: "su-qiao",
      objectName: "杯子",
      publicDescription: "杯底的新水印覆盖了原本连续的灰尘。",
      regionHint: "右侧",
      x: 0.76,
      y: 0.62,
      radius: 0.08,
      confidence: 0.93,
    },
  ],
  suspects: [
    {
      id: "su-lin",
      name: "林默",
      identity: "夜班管理员",
      relation: "负责闭馆巡检",
      personalityTags: ["克制", "谨慎"],
      portraitKey: "noir-01",
      initialTestimony: "我只关了台灯，没有碰桌上的其他东西。",
    },
    {
      id: "su-zhou",
      name: "周岚",
      identity: "资料员",
      relation: "最后整理借阅资料",
      personalityTags: ["直接", "急躁"],
      portraitKey: "noir-02",
      initialTestimony: "我把书合上后就离开了。",
    },
    {
      id: "su-qiao",
      name: "乔野",
      identity: "临时访客",
      relation: "在闭馆前来取文件",
      personalityTags: ["冷静", "回避"],
      portraitKey: "noir-03",
      initialTestimony: "杯子从始至终都在原位。",
    },
  ],
  claims: [
    { id: "cl-lin", suspectId: "su-lin", text: "我只调整了台灯。" },
    { id: "cl-zhou", suspectId: "su-zhou", text: "我合上书后马上离开。" },
    { id: "cl-qiao", suspectId: "su-qiao", text: "杯子一直没有离开原位。" },
  ],
  wrongAnswerHint: "把证词里的绝对说法与物证的新旧痕迹对照。",
};
