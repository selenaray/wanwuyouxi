import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameApp } from "./game-app";

describe("GameApp", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
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

  it("keeps a suspect locked until its linked evidence is opened", () => {
    reachBriefing();
    fireEvent.click(screen.getByRole("button", { name: "进入现场" }));

    expect(screen.getByRole("button", { name: "查看江野角色卡" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "查看杯子物证" }));
    expect(screen.getByRole("button", { name: "查看江野角色卡" })).toBeEnabled();
  });
});
