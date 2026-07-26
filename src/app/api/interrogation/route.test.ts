// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { MOCK_CASE } from "@/features/game/mock-case";

describe("POST /api/interrogation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns different non-spoiling hints for the same object question across suspects", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const { POST } = await import("./route");

    const replies = await Promise.all(MOCK_CASE.suspects.map(async (suspect) => {
      const response = await POST(new Request("http://test/api/interrogation", {
        method: "POST",
        body: JSON.stringify({
          game: MOCK_CASE,
          suspectId: suspect.id,
          messages: [{ role: "user", content: "你最后一次碰到那件物品是什么时候？" }],
        }),
      }));
      const body = await response.json();
      expect(response.status).toBe(200);
      return body.data.reply as string;
    }));

    expect(new Set(replies).size).toBe(3);
    expect(replies.join("\n")).not.toContain("正确答案");
    expect(replies.join("\n")).not.toContain("真凶");
  });
});
