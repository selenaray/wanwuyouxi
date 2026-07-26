import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "./game-machine";
import { GameApp } from "./game-app";
import { LEGACY_MOCK_CASE, SAMPLE_IMAGE_URL } from "./mock-case";
import { saveGameState } from "./persistence";

function apiResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data, traceId: "trace" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GameApp", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function renderApp() {
    render(<GameApp />);
    act(() => vi.advanceTimersByTime(0));
  }

  function reachBriefing() {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "体验示例案件" }));
    expect(screen.getByText("正在重建案发现场")) .toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.getByRole("heading", { name: "午夜桌面的证词" })).toBeInTheDocument();
  }

  it("runs the sample-photo generation flow", () => {
    reachBriefing();
    expect(screen.getByRole("button", { name: "进入现场" })).toBeInTheDocument();
  });

  it("previews a local image without uploading it", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "开始扫描现场" }));
    const file = new File(["room"], "room.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("选择现场照片");
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("room.jpg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用这张照片" })).toBeInTheDocument();
  });

  it("starts on the home screen even when previous progress exists", () => {
    saveGameState({
      ...createInitialState(),
      screen: "briefing",
      selectedImageUrl: SAMPLE_IMAGE_URL,
      selectedImageName: "示例现场",
      caseData: LEGACY_MOCK_CASE,
    });

    renderApp();

    expect(screen.getByRole("button", { name: "开始扫描现场" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "进入现场" })).not.toBeInTheDocument();
  });

  it("accepts an iPhone HEIF photo for preview", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "开始扫描现场" }));
    const file = new File(["room"], "room.heif", { type: "image/heif" });
    fireEvent.change(screen.getByLabelText("选择现场照片"), { target: { files: [file] } });

    expect(screen.getByText("room.heif")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用这张照片" })).toBeInTheDocument();
  });

  it("unlocks three suspects from evidence and opens a public suspect sheet", () => {
    reachBriefing();
    fireEvent.click(screen.getByRole("button", { name: "进入现场" }));

    expect(screen.getByText("已发现 0/3 物证 · 已解锁 0/3 嫌疑人")).toBeInTheDocument();
    for (const evidenceName of ["查看台灯物证", "查看书本物证", "查看杯子物证"]) {
      fireEvent.click(screen.getByRole("button", { name: evidenceName }));
      fireEvent.click(screen.getByRole("button", { name: "收起物证" }));
    }

    expect(screen.getByText("已发现 3/3 物证 · 已解锁 3/3 嫌疑人")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "整理证词" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "整理证词" }));
    expect(screen.getByRole("heading", { name: "哪句话与现场物证矛盾？" })).toBeInTheDocument();
    expect(screen.getByText("杯子从始至终都在原位。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /江野/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交推理" }));
    expect(screen.getByRole("heading", { name: "案件已解开" })).toBeInTheDocument();
    expect(screen.getByText(/江野移动杯子/)).toBeInTheDocument();
  });

  it("generates a case comic from the result screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse({
      imageUrl: "https://example.com/comic.png",
      width: 2048,
      height: 2048,
      panels: [
        { title: "案发前", description: "现场平静。" },
        { title: "关键动作", description: "嫌疑人移动杯子。" },
        { title: "伪装现场", description: "现场被恢复。" },
        { title: "真相揭晓", description: "侦探揭开真相。" },
      ],
    })));
    reachBriefing();
    fireEvent.click(screen.getByRole("button", { name: "进入现场" }));
    for (const evidenceName of ["查看台灯物证", "查看书本物证", "查看杯子物证"]) {
      fireEvent.click(screen.getByRole("button", { name: evidenceName }));
      fireEvent.click(screen.getByRole("button", { name: "收起物证" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "整理证词" }));
    fireEvent.click(screen.getByRole("radio", { name: /江野/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交推理" }));

    fireEvent.click(screen.getByRole("button", { name: "生成案件漫画" }));

    expect(screen.getByText("正在生成漫画")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByAltText("案件漫画")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "保存漫画" })).toHaveAttribute("href", "https://example.com/comic.png");
    expect(screen.queryByText("案发前")).not.toBeInTheDocument();
    expect(screen.queryByText("关键动作")).not.toBeInTheDocument();
    expect(screen.queryByText("伪装现场")).not.toBeInTheDocument();
    expect(screen.queryByText("真相揭晓")).not.toBeInTheDocument();
    expect(screen.queryByText("嫌疑人移动杯子。")).not.toBeInTheDocument();
  });

  it("keeps a suspect locked until its linked evidence is opened", () => {
    reachBriefing();
    fireEvent.click(screen.getByRole("button", { name: "进入现场" }));

    expect(screen.getByRole("button", { name: "查看江野角色卡" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "查看杯子物证" }));
    expect(screen.getByRole("button", { name: "查看江野角色卡" })).toBeEnabled();
  });
});
