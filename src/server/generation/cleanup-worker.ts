import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";

import type { AppDatabase } from "@/server/db/client";
import { imageAssets } from "@/server/db/schema";
import type { ImageStorage } from "@/server/storage";

function isAlreadyMissing(error: unknown) {
  return error instanceof Error && ["IMAGE_NOT_FOUND", "NoSuchKey"].some((code) => error.message.includes(code));
}

export async function deleteExpiredImages(
  db: AppDatabase,
  storage: ImageStorage,
  now = new Date(),
) {
  const pending = await db
    .select({ id: imageAssets.id, storageKey: imageAssets.storageKey, deletionRequestedAt: imageAssets.deletionRequestedAt })
    .from(imageAssets)
    .where(and(
      isNull(imageAssets.deletedAt),
      or(lte(imageAssets.deleteAfter, now), isNotNull(imageAssets.deletionRequestedAt)),
    ));

  let deleted = 0;
  let failed = 0;
  for (const image of pending) {
    if (!image.deletionRequestedAt) {
      await db
        .update(imageAssets)
        .set({ deletionRequestedAt: now })
        .where(and(eq(imageAssets.id, image.id), isNull(imageAssets.deletedAt)));
    }

    try {
      await storage.delete(image.storageKey);
    } catch (error) {
      if (!isAlreadyMissing(error)) {
        failed += 1;
        continue;
      }
    }

    await db
      .update(imageAssets)
      .set({ deletedAt: now })
      .where(and(eq(imageAssets.id, image.id), isNull(imageAssets.deletedAt)));
    deleted += 1;
  }

  return { examined: pending.length, deleted, failed };
}
