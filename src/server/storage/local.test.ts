// @vitest-environment node

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalImageStorage } from "./local";

describe("LocalImageStorage", () => {
  let root: string;
  let storage: LocalImageStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wanwuyouxi-images-"));
    storage = new LocalImageStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores generated private filenames with owner-only permissions", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const stored = await storage.put({ bytes, contentType: "image/jpeg", sha256: "a".repeat(64) });
    const file = join(root, stored.key);

    expect(stored.key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(await readFile(file)).toEqual(Buffer.from(bytes));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("creates a data URL without exposing a public path", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const stored = await storage.put({ bytes, contentType: "image/jpeg", sha256: "b".repeat(64) });

    const url = await storage.createReadUrl(stored.key, 300);

    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    expect(url).not.toContain(root);
  });
});
