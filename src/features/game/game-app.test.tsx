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
    expect(screen.getByRole("heading", { name: "凌晨零点的失踪者" })).toBeInTheDocument();
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

  it("collects three clues and reveals the truth after a correct answer", () => {
    reachBriefing();
    fireEvent.click(screen.getByRole("button", { name: "进入现场" }));

    for (const clueName of ["查看停摆的时钟", "查看仍温热的马克杯", "查看翻开的笔记本"]) {
      fireEvent.click(screen.getByRole("button", { name: clueName }));
      fireEvent.click(screen.getByRole("button", { name: "收起线索" }));
    }

    fireEvent.click(screen.getByRole("button", { name: "开始推理" }));
    fireEvent.click(screen.getByRole("radio", { name: "宿舍天台" }));
    fireEvent.click(screen.getByRole("button", { name: "提交推理" }));

    expect(screen.getByText("案件已解开")).toBeInTheDocument();
    expect(screen.getByText(/林夏没有离开宿舍楼/)).toBeInTheDocument();
  });

  it("shows a hint after one wrong answer", () => {
    reachBriefing();
    fireEvent.click(screen.getByRole("button", { name: "进入现场" }));
    for (const clueName of ["查看停摆的时钟", "查看仍温热的马克杯", "查看翻开的笔记本"]) {
      fireEvent.click(screen.getByRole("button", { name: clueName }));
      fireEvent.click(screen.getByRole("button", { name: "收起线索" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "开始推理" }));
    fireEvent.click(screen.getByRole("radio", { name: "深夜车站" }));
    fireEvent.click(screen.getByRole("button", { name: "提交推理" }));

    expect(screen.getByText(/把时间、门禁和“最高处”放在一起想/)).toBeInTheDocument();
    expect(screen.queryByText("案件已解开")).not.toBeInTheDocument();
  });
});
