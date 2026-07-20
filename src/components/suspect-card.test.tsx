import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SuspectCard } from "./suspect-card";

const suspect = {
  id: "su-qiao",
  name: "乔野",
  identity: "临时访客",
  relation: "在闭馆前来取文件",
  personalityTags: ["冷静", "回避"] as [string, string],
  portraitKey: "noir-03" as const,
  initialTestimony: "杯子从始至终都在原位。",
};

describe("SuspectCard", () => {
  it("keeps a locked suspect anonymous and disabled", () => {
    const onOpen = vi.fn();
    render(<SuspectCard suspect={suspect} unlocked={false} onOpen={onOpen} />);

    expect(screen.getByRole("button", { name: "查看乔野角色卡" })).toBeDisabled();
    expect(screen.getByText("嫌疑人未解锁")).toBeInTheDocument();
    expect(screen.queryByText("乔野")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows public identity and opens an unlocked suspect", () => {
    const onOpen = vi.fn();
    render(<SuspectCard suspect={suspect} unlocked onOpen={onOpen} />);

    const button = screen.getByRole("button", { name: "查看乔野角色卡" });
    expect(button).toBeEnabled();
    expect(screen.getByRole("img", { name: "乔野角色立绘" })).toHaveAttribute("src", "/portraits/noir-03.webp");
    expect(screen.getByText("临时访客")).toBeInTheDocument();
    expect(screen.getByText("冷静")).toBeInTheDocument();
    expect(screen.getByText("回避")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
