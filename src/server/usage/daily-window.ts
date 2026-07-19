const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function startOfShanghaiDay(now: Date) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(utcMidnight - SHANGHAI_OFFSET_MS);
}
