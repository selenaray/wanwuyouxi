import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhoneShell } from "./phone-shell";

describe("PhoneShell", () => {
  it("does not render a fake mobile status bar", () => {
    render(<PhoneShell><p>案件入口</p></PhoneShell>);

    expect(screen.getByText("案件入口")).toBeInTheDocument();
    expect(screen.queryByText("9:41")).not.toBeInTheDocument();
    expect(document.querySelector(".status-bar")).not.toBeInTheDocument();
  });
});
