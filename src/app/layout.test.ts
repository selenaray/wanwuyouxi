import { describe, expect, it } from "vitest";

import { viewport } from "./layout";

describe("mobile viewport", () => {
  it("opts into iPhone safe-area insets", () => {
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
    });
  });
});
