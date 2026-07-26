import { describe, expect, it } from "vitest";

import { validV2Case } from "@/server/cases/v2-contracts.fixture";
import { toV2PlayerCase, V2PrivateCaseSchema } from "@/server/cases/v2-contracts";

import { buildCaseComicStoryboard } from "./storyboard";

const playerCase = toV2PlayerCase(V2PrivateCaseSchema.parse(validV2Case));
const hotelCase = {
  ...playerCase,
  title: "门缝里的归还",
  background: "酒店走廊门口有房卡、行李箱和清洁推车，三个人都声称没有重新靠近房门。",
  evidence: [
    { ...playerCase.evidence[0], suspectId: "su-shen", objectName: "行李箱", publicDescription: "行李箱轮痕在门口突然中断。", regionHint: "左侧" },
    { ...playerCase.evidence[1], suspectId: "su-lin", objectName: "清洁推车", publicDescription: "清洁推车把手上有新的水渍。", regionHint: "中央" },
    { ...playerCase.evidence[2], suspectId: "su-zhao", objectName: "房卡", publicDescription: "房卡边缘留下新的指纹。", regionHint: "右侧" },
  ],
  suspects: [
    playerCase.suspects[0],
    playerCase.suspects[1],
    {
      ...playerCase.suspects[2],
      id: "su-zhao",
      name: "赵小雨",
      gender: "女" as const,
      age: 23,
      identity: "酒店服务员",
      portraitKey: "noir-15" as const,
      initialTestimony: "房卡一直在门边，我没有碰。",
    },
  ],
  claims: [
    playerCase.claims[0],
    playerCase.claims[1],
    { ...playerCase.claims[2], suspectId: "su-zhao", text: "房卡一直在门边，我没有碰。" },
  ],
};

describe("buildCaseComicStoryboard", () => {
  it("turns a solved V2 case into a four-panel comic brief", () => {
    const storyboard = buildCaseComicStoryboard({
      game: playerCase,
      truth: "江野移动杯子取走钥匙后又将其放回。新水印覆盖旧灰尘，证明杯子曾被拿起并放回。",
      correctAnswerIndex: 2,
    });

    expect(storyboard.panels).toHaveLength(4);
    expect(storyboard.panels.map((panel) => panel.title)).toEqual([
      "案发前",
      "关键动作",
      "伪装现场",
      "真相揭晓",
    ]);
    expect(storyboard.panels[1].description).toContain("杯子");
    expect(storyboard.panels[2].description).toContain("江野");
    expect(storyboard.prompt).toContain("2x2 四格悬疑漫画");
    expect(storyboard.prompt).toContain("画面中绝对不要出现任何文字");
    expect(storyboard.prompt).toContain("本案现场可见物证：台灯、书本、杯子");
    expect(storyboard.prompt).toContain("本案真正发生变化的物证：杯子");
    expect(storyboard.prompt).toContain("杯底的新水印覆盖了原本连续的灰尘");
    expect(storyboard.prompt).toContain("严禁画钥匙、钥匙串、金属钥匙");
    expect(storyboard.prompt).toContain("Image 1 是本案嫌疑人的唯一角色参考");
    expect(storyboard.prompt).not.toContain("key object");
    expect(storyboard.prompt).not.toContain("key card");
    expect(storyboard.prompt).not.toContain("late-night desk mystery");
    expect(storyboard.prompt).not.toContain("No one will notice");
    expect(storyboard.prompt).not.toContain("保管箱钥匙");
    expect(storyboard.prompt).not.toContain("取走钥匙");
    expect(storyboard.prompt).not.toContain("Culprit profile:");
    expect(storyboard.prompt).not.toContain("male, 22 years old");
    expect(storyboard.referencePortraitKey).toBe("noir-09");
    expect(storyboard.prompt).not.toContain("案件标题");
    expect(storyboard.prompt).not.toContain("案发前");
    expect(storyboard.prompt).not.toContain("关键动作");
    expect(storyboard.prompt).not.toContain("伪装现场");
    expect(storyboard.prompt).not.toContain("真相揭晓");
  });

  it("builds the comic prompt from the current case and culprit portrait", () => {
    const storyboard = buildCaseComicStoryboard({
      game: hotelCase,
      truth: "赵小雨移动房卡后又把它放回门边，新指纹暴露了动作。",
      correctAnswerIndex: 2,
    });

    expect(storyboard.referencePortraitKey).toBe("noir-15");
    expect(storyboard.prompt).toContain("Image 1 是本案嫌疑人的唯一角色参考");
    expect(storyboard.prompt).toContain("本案现场可见物证：行李箱、清洁推车、房卡");
    expect(storyboard.prompt).toContain("本案真正发生变化的物证：房卡");
    expect(storyboard.prompt).toContain("房卡边缘留下新的指纹");
    expect(storyboard.prompt).toContain("严禁画钥匙、钥匙串、金属钥匙");
    expect(storyboard.prompt).not.toContain("cup");
    expect(storyboard.prompt).not.toContain("key card");
    expect(storyboard.prompt).not.toContain("late-night desk mystery");
    expect(storyboard.prompt).not.toContain("male, 22 years old");
  });
});
