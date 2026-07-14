export type PutImageInput = {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  sha256: string;
};

export interface ImageStorage {
  put(input: PutImageInput): Promise<{ key: string }>;
  createReadUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export function assertSafeStorageKey(key: string) {
  if (!/^[0-9a-f-]{36}\.jpg$/i.test(key)) throw new Error("INVALID_STORAGE_KEY");
}

