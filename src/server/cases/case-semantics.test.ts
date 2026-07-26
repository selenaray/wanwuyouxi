import { describe, expect, it } from "vitest";

import {
  buildCaseTitle,
  buildEnglishComicContext,
  buildInterrogationHints,
  selectSuspectRoster,
} from "./case-semantics";

const deskInput = {
  sceneSummary: "书桌旁有台灯、书本和杯子，像是深夜学习后的房间。",
  objectNames: ["台灯", "书本", "杯子"],
  truth: "有人移动杯子后又放回原处。",
  culpritName: "江野",
  keyObjectName: "杯子",
  evidenceDescription: "杯底的新水印覆盖旧灰尘",
};

const hotelInput = {
  sceneSummary: "酒店走廊门口有房卡、行李箱和清洁推车。",
  objectNames: ["房卡", "行李箱", "清洁推车"],
  truth: "有人拿走房卡后又把它放回门边。",
  culpritName: "赵小雨",
  keyObjectName: "房卡",
  evidenceDescription: "房卡边缘留下新的指纹",
};

describe("case semantics", () => {
  it("selects different roster suspects for different scene semantics", () => {
    const deskSuspects = selectSuspectRoster(deskInput).map((suspect) => suspect.name);
    const hotelSuspects = selectSuspectRoster(hotelInput).map((suspect) => suspect.name);

    expect(deskSuspects).toHaveLength(3);
    expect(hotelSuspects).toHaveLength(3);
    expect(new Set(deskSuspects).size).toBe(3);
    expect(new Set(hotelSuspects).size).toBe(3);
    expect(hotelSuspects).not.toEqual(["沈砚舟", "林晚晴", "江野"]);
    expect(hotelSuspects).not.toEqual(deskSuspects);
  });

  it("builds at least ten varied non-spoiling interrogation hints", () => {
    const hints = buildInterrogationHints({
      suspectName: "赵小雨",
      suspectIdentity: "酒店服务员",
      objectName: "房卡",
      claimText: "我没有碰过房卡。",
      evidenceDescription: "房卡边缘留下新的指纹",
      personalityTags: ["敏感", "细心"],
    });

    expect(hints).toHaveLength(10);
    expect(new Set(hints).size).toBe(10);
    expect(hints.join("\n")).toContain("房卡");
    expect(hints.join("\n")).not.toContain("真凶");
  });

  it("creates English-only comic context that changes with the case facts", () => {
    const deskContext = buildEnglishComicContext(deskInput);
    const hotelContext = buildEnglishComicContext(hotelInput);

    expect(deskContext).toContain("cup");
    expect(hotelContext).toContain("hotel access card");
    expect(hotelContext).toContain("Do not depict a metal key");
    expect(deskContext).not.toEqual(hotelContext);
    expect(deskContext).not.toMatch(/[\u3400-\u9fff]/);
    expect(hotelContext).not.toMatch(/[\u3400-\u9fff]/);
  });

  it("creates a short case title from the key object and trace", () => {
    const title = buildCaseTitle({ ...hotelInput, traceId: "trace-hotel-1" });

    expect(title).not.toBe("现场第三处破绽");
    expect(title).not.toContain("房卡");
    expect(hotelInput.objectNames.every((objectName) => !title.includes(objectName))).toBe(true);
    expect(title.length).toBeLessThanOrEqual(24);
  });
});
