// @vitest-environment node

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../../../../tests/helpers/database";
import { MemoryImageStorage } from "@/server/storage/memory";

import { createUploadRoute } from "./route";

describe("POST /api/uploads", () => {
  let database: TestDatabase;
  let sessionId: string;
  let storage: MemoryImageStorage;

  beforeEach(async () => {
    database = await createTestDatabase();
    sessionId = await database.seedSession();
    storage = new MemoryImageStorage();
  });

  afterEach(async () => {
    await database.close();
  });

  async function validRequest() {
    const bytes = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#282421" },
    }).png().toBuffer();
    const form = new FormData();
    form.set("image", new File([bytes], "room.png", { type: "image/png" }));
    return new Request("http://test/api/uploads", { method: "POST", body: form });
  }

  it("sanitizes a valid image and never exposes its storage key", async () => {
    const POST = createUploadRoute({
      db: database.db,
      storage,
      resolveSessionId: async () => sessionId,
      now: () => new Date("2026-07-14T00:00:00.000Z"),
    });

    const response = await POST(await validRequest());
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ width: 640, height: 480, expiresAt: "2026-07-15T00:00:00.000Z" });
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("room.png");
    expect(storage.lastPut?.contentType).toBe("image/jpeg");
  });

  it("rejects unauthenticated uploads", async () => {
    const POST = createUploadRoute({
      db: database.db,
      storage,
      resolveSessionId: async () => { throw new Error("INVALID_SESSION"); },
      now: () => new Date(),
    });

    const response = await POST(await validRequest());
    expect(response.status).toBe(401);
  });

  it("rejects files whose bytes are not a supported image", async () => {
    const form = new FormData();
    form.set("image", new File(["not-an-image"], "fake.jpg", { type: "image/jpeg" }));
    const POST = createUploadRoute({
      db: database.db,
      storage,
      resolveSessionId: async () => sessionId,
      now: () => new Date(),
    });

    const response = await POST(new Request("http://test/api/uploads", { method: "POST", body: form }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_IMAGE");
  });
});

