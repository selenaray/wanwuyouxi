import OSS from "ali-oss";

import type { ImageStorage, PutImageInput } from "./types";

type OssStorageConfig = {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
};

export class OssImageStorage implements ImageStorage {
  private readonly client: OSS;

  constructor(config: OssStorageConfig) {
    this.client = new OSS({ ...config, secure: true });
  }

  async put(input: PutImageInput) {
    const key = `${crypto.randomUUID()}.jpg`;
    await this.client.put(key, Buffer.from(input.bytes), {
      headers: { "Content-Type": input.contentType, "x-oss-object-acl": "private" },
    });
    return { key };
  }

  async createReadUrl(key: string, expiresInSeconds: number) {
    if (expiresInSeconds <= 0 || expiresInSeconds > 300) throw new Error("INVALID_SIGNED_URL_TTL");
    return this.client.signatureUrl(key, { expires: expiresInSeconds, method: "GET" });
  }

  async delete(key: string) {
    await this.client.delete(key);
  }
}

