// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createHealthRoute, createRuntimeHealthRoute } from "./handler";

describe("GET /api/health", () => {
  it("returns 200 when the database is available", async () => {
    const response = await createHealthRoute(async () => undefined)();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns a sanitized 503 when the database is unavailable", async () => {
    const response = await createHealthRoute(async () => {
      throw new Error("private database path");
    })();
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain('"ok":false');
    expect(text).not.toContain("private database path");
  });

  it("also sanitizes database initialization failures", async () => {
    const response = await createRuntimeHealthRoute(async () => {
      throw new Error("private migration path");
    })();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("private migration path");
  });
});
