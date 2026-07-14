// @vitest-environment node

import { describe, expect, it } from "vitest";

import { signSessionCookie, verifySessionCookie } from "./session";

const secret = "a-secure-test-secret-with-at-least-32-characters";

describe("anonymous session signatures", () => {
  it("round-trips an opaque public id", async () => {
    const publicId = crypto.randomUUID();
    const cookie = await signSessionCookie(publicId, secret);

    await expect(verifySessionCookie(cookie, secret)).resolves.toBe(publicId);
  });

  it("rejects a modified signed cookie", async () => {
    const cookie = await signSessionCookie(crypto.randomUUID(), secret);
    const changed = `${cookie.slice(0, -1)}${cookie.endsWith("a") ? "b" : "a"}`;

    await expect(verifySessionCookie(changed, secret)).rejects.toThrow("INVALID_SESSION");
  });

  it("rejects secrets shorter than 32 characters", async () => {
    await expect(signSessionCookie(crypto.randomUUID(), "too-short")).rejects.toThrow(
      "INVALID_SESSION_SECRET",
    );
  });
});

