import { LocalImageStorage } from "./local";
import { OssImageStorage } from "./oss";
import type { ImageStorage } from "./types";

let storage: ImageStorage | undefined;

export function getImageStorage(): ImageStorage {
  if (storage) return storage;

  if (process.env.IMAGE_STORAGE_DRIVER === "oss") {
    storage = new OssImageStorage({
      region: process.env.OSS_REGION ?? "",
      bucket: process.env.OSS_BUCKET ?? "",
      accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? "",
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? "",
    });
  } else {
    storage = new LocalImageStorage(process.env.LOCAL_IMAGE_ROOT ?? ".data/uploads");
  }

  return storage;
}

export type { ImageStorage } from "./types";

