import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertSafeStorageKey, type ImageStorage, type PutImageInput } from "./types";

export class LocalImageStorage implements ImageStorage {
  constructor(private readonly root: string) {}

  async put(input: PutImageInput) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = `${crypto.randomUUID()}.jpg`;
    await writeFile(join(this.root, key), input.bytes, { mode: 0o600, flag: "wx" });
    return { key };
  }

  async createReadUrl(key: string, expiresInSeconds: number) {
    assertSafeStorageKey(key);
    if (expiresInSeconds <= 0 || expiresInSeconds > 300) {
      throw new Error("INVALID_SIGNED_URL_TTL");
    }
    const bytes = await readFile(join(this.root, key));
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }

  async delete(key: string) {
    assertSafeStorageKey(key);
    await rm(join(this.root, key), { force: true });
  }
}

