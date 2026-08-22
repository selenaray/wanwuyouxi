// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { MOCK_CASE } from "@/features/game/mock-case";

const openAIMocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: openAIMocks.create } };
  },
}));

describe("POST /api/interrogation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
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

  it("uses the configured Singapore Qwen model for free interrogation", async () => {
    vi.stubEnv("FACTBOOK_PROVIDER", "qwen");
    vi.stubEnv("QWEN_TEXT_API_KEY", "qwen-text-key");
    vi.stubEnv("QWEN_TEXT_BASE_URL", "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1");
    vi.stubEnv("QWEN_TEXT_MODEL", "qwen3.7-plus");
    openAIMocks.create.mockResolvedValue({ choices: [{ message: { content: "我只看见桌上的杯子。" } }] });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://test/api/interrogation", {
      method: "POST",
      body: JSON.stringify({
        game: MOCK_CASE,
        suspectId: MOCK_CASE.suspects[0].id,
        messages: [{ role: "user", content: "你看见了什么？" }],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.reply).toBe("我只看见桌上的杯子。");
    expect(openAIMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      model: "qwen3.7-plus",
      enable_thinking: false,
    }));
  });
});
