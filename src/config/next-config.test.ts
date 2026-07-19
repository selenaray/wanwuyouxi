import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("development network access", () => {
  it("allows this Wi-Fi subnet to load interactive development assets", () => {
    expect(nextConfig.allowedDevOrigins).toContain("192.168.43.*");
  });
});
