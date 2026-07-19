export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "production") {
    const { readProductionConfig } = await import("@/server/config/production");
    readProductionConfig(process.env);
  }
  if (process.env.ENABLE_INLINE_CLEANUP !== "1") return;

  const [
    { getRuntimeDatabase },
    { deleteExpiredImages },
    { startCleanupScheduler },
    { getImageStorage },
  ] = await Promise.all([
    import("@/server/db/runtime"),
    import("@/server/generation/cleanup-worker"),
    import("@/server/generation/cleanup-scheduler"),
    import("@/server/storage"),
  ]);
  const { db } = await getRuntimeDatabase();
  const storage = getImageStorage();
  startCleanupScheduler({
    clean: () => deleteExpiredImages(db, storage).then(() => undefined),
    intervalMs: Math.max(60_000, Number(process.env.CLEANUP_INTERVAL_MS ?? 60_000)),
  });
}
