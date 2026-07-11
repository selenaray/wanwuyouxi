import type { MockCase } from "./types";

export const SAMPLE_IMAGE_URL = "/sample-room.svg";

export const MOCK_CASE: MockCase = {
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
