import type { ImageStorage, PutImageInput } from "./types";

export class MemoryImageStorage implements ImageStorage {
  readonly files = new Map<string, Uint8Array>();
  lastPut: PutImageInput | null = null;

  async put(input: PutImageInput) {
    const key = `${crypto.randomUUID()}.jpg`;
    this.lastPut = input;
    this.files.set(key, input.bytes);
    return { key };
  }

  async createReadUrl(key: string, expiresInSeconds: number) {
    const bytes = this.files.get(key);
    if (!bytes) throw new Error("IMAGE_NOT_FOUND");
    if (expiresInSeconds <= 0 || expiresInSeconds > 300) throw new Error("INVALID_SIGNED_URL_TTL");
    return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
  }

  async delete(key: string) {
    this.files.delete(key);
  }
}

