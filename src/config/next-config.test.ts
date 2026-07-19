import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("development network access", () => {
  it("builds a self-contained production server", () => {
    expect(nextConfig.output).toBe("standalone");
  });

  it("keeps PGlite external so its Node and WebAssembly loaders remain intact", () => {
    expect(nextConfig.serverExternalPackages).toContain("@electric-sql/pglite");
  });

  it("allows this Wi-Fi subnet to load interactive development assets", () => {
    expect(nextConfig.allowedDevOrigins).toContain("192.168.43.*");
  });

  it("allows temporary cpolar subdomains to load interactive development assets", () => {
    expect(nextConfig.allowedDevOrigins).toContain("*.r3.cpolar.top");
  });
});
