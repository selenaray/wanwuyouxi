import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErrorScreen } from "./error-screen";

describe("ErrorScreen", () => {
  it("distinguishes invalid model output from a timeout", () => {
    render(<ErrorScreen errorCode="QWEN_SCHEMA_INVALID" onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "案件生成格式异常" })).toBeInTheDocument();
    expect(screen.queryByText("现场重建超时")).not.toBeInTheDocument();
  });

  it("shows a specific message for the observation provider errors", () => {
    render(<ErrorScreen errorCode="QWEN_OBSERVATION_UNAVAILABLE" onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "现场识别暂不可用" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "现场重建中断" })).not.toBeInTheDocument();
  });

  it("distinguishes case compilation failures from observation failures", () => {
    render(<ErrorScreen errorCode="DEEPSEEK_FACTBOOK_OUTPUT_INVALID" onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "案件逻辑未通过校验" })).toBeInTheDocument();
  });
});
