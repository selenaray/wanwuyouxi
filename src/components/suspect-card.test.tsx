import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SuspectCard } from "./suspect-card";

const suspect = {
  id: "su-jiang",
  name: "江野",
  gender: "男" as const,
  age: 22,
  identity: "网络主播",
  relation: "在闭馆前来取文件",
  personalityTags: ["外向", "冒险"] as [string, string],
  portraitKey: "noir-09" as const,
  initialTestimony: "杯子从始至终都在原位。",
};

describe("SuspectCard", () => {
  it("keeps a locked suspect anonymous and disabled", () => {
    const onOpen = vi.fn();
    render(<SuspectCard suspect={suspect} unlocked={false} onOpen={onOpen} />);

    expect(screen.getByRole("button", { name: "查看江野角色卡" })).toBeDisabled();
    expect(screen.getByText("嫌疑人未解锁")).toBeInTheDocument();
    expect(screen.queryByText("江野")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows public identity and opens an unlocked suspect", () => {
    const onOpen = vi.fn();
    render(<SuspectCard suspect={suspect} unlocked onOpen={onOpen} />);

    const button = screen.getByRole("button", { name: "查看江野角色卡" });
    expect(button).toBeEnabled();
    expect(screen.getByRole("img", { name: "江野角色立绘" })).toHaveAttribute("src", "/portraits/noir-09.webp");
    expect(screen.getByText("网络主播")).toBeInTheDocument();
    expect(screen.getByText("外向")).toBeInTheDocument();
    expect(screen.getByText("冒险")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
