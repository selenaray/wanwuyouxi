// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../../tests/helpers/database";

import { createSessionRoute } from "./route";

describe("POST /api/sessions", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("sets an HttpOnly SameSite=Lax anonymous cookie", async () => {
    const POST = createSessionRoute({
      db: database.db,
      secret: "a-secure-test-secret-with-at-least-32-characters",
      secure: false,
      now: () => new Date("2026-07-14T00:00:00.000Z"),
    });

    const response = await POST();
    const cookie = response.headers.get("set-cookie") ?? "";
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(cookie).toContain("wy_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).not.toContain("Secure");
    expect(body).toMatchObject({ ok: true, data: { expiresAt: "2026-07-21T00:00:00.000Z" } });
  });
});
