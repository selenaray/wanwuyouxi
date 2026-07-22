const MAX_EDGE = 1600;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export function calculateResizeDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function shouldUseServerHeicFallback(file: File) {
  return ["image/heic", "image/heif"].includes(file.type) && file.size <= MAX_BYTES;
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (shouldUseServerHeicFallback(file)) return file;
  if (file.size > MAX_SOURCE_BYTES) throw new Error("IMAGE_TOO_LARGE");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("IMAGE_DECODE_FAILED");
  }

  const dimensions = calculateResizeDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("IMAGE_DECODE_FAILED");
  context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("IMAGE_ENCODE_FAILED")),
      "image/jpeg",
      0.82,
    );
  });
  if (blob.size > MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "scene";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
