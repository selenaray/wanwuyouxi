import "dotenv/config";

import { getRuntimeDatabase } from "../src/server/db/runtime";
import { deleteExpiredImages } from "../src/server/generation/cleanup-worker";
import { getImageStorage } from "../src/server/storage";

const intervalMs = Number(process.env.CLEANUP_INTERVAL_MS ?? 60_000);
const { db } = await getRuntimeDatabase();
const storage = getImageStorage();
let running = false;

async function clean() {
  if (running) return;
  running = true;
  try {
    const result = await deleteExpiredImages(db, storage);
    console.info("image cleanup", result);
  } catch {
    console.error("image cleanup failed");
  } finally {
    running = false;
  }
}

await clean();
setInterval(() => void clean(), intervalMs);
