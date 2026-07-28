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

async function decodeWithImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      image.src = objectUrl;
    });
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (shouldUseServerHeicFallback(file)) return file;
  if (file.size > MAX_SOURCE_BYTES) throw new Error("IMAGE_TOO_LARGE");

  let decoded: {
    source: CanvasImageSource;
    width: number;
    height: number;
    close: () => void;
  };
  try {
    if (typeof createImageBitmap !== "function") throw new Error("IMAGE_BITMAP_UNAVAILABLE");
    const bitmap = await createImageBitmap(file);
    decoded = {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    decoded = await decodeWithImageElement(file);
  }

  const dimensions = calculateResizeDimensions(decoded.width, decoded.height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.close();
    throw new Error("IMAGE_DECODE_FAILED");
  }
  context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
  decoded.close();

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
