// @vitest-environment node

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function expectWorkerToStayRunning(script: string) {
  const root = await mkdtemp(join(tmpdir(), "wanwuyouxi-worker-"));
  temporaryRoots.push(root);
  const child = spawn(process.execPath, ["--import", "tsx", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PGLITE_DATA_DIR: join(root, "nested", "pglite"),
      LOCAL_IMAGE_ROOT: join(root, "uploads"),
      QWEN_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      CLEANUP_INTERVAL_MS: "10000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const exitPromise = new Promise<"exited">((resolve) => child.once("exit", () => resolve("exited")));
  const outcome = await Promise.race([
    exitPromise,
    new Promise<"running">((resolve) => setTimeout(() => resolve("running"), 1500)),
  ]);

  if (outcome === "running") {
    child.kill("SIGTERM");
    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 500)),
    ]);
  }
  expect(outcome, stderr).toBe("running");
}

describe("worker entrypoints", () => {
  it("keeps the generation worker running", async () => {
    await expectWorkerToStayRunning("scripts/worker.ts");
  }, 10_000);

  it("keeps the cleanup worker running", async () => {
    await expectWorkerToStayRunning("scripts/cleanup-worker.ts");
  }, 10_000);
});
