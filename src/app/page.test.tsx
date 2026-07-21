import { render, screen } from "@testing-library/react";

import Home from "./page";

describe("Home", () => {
  it("introduces the Wanwuyouxi experience", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "万物有戏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始扫描现场" })).toBeInTheDocument();
  });
});
