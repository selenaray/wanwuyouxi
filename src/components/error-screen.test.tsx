import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErrorScreen } from "./error-screen";

describe("ErrorScreen", () => {
  it("distinguishes invalid model output from a timeout", () => {
    render(<ErrorScreen errorCode="QWEN_SCHEMA_INVALID" onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "案件生成格式异常" })).toBeInTheDocument();
    expect(screen.queryByText("现场重建超时")).not.toBeInTheDocument();
  });
});
