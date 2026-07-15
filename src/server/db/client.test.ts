// @vitest-environment node

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalDatabase } from "./client";

describe("createLocalDatabase", () => {
  it("starts from a nested data path whose parent directory does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanwuyouxi-pglite-"));
    const dataDir = join(root, "missing-parent", "pglite");
    const database = createLocalDatabase(dataDir);

    try {
      await database.client.query("select 1");
      expect((await stat(dataDir)).isDirectory()).toBe(true);
    } finally {
      await database.client.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
