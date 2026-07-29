const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

export async function compressImage(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) return file;

  const newName = file.name.replace(/\.\w+$/, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

export async function prepareUploadFile(file: File): Promise<File> {
  let working = file;
  if (isHeic(working)) {
    working = await convertHeicToJpeg(working);
  }
  if (working.type.startsWith("image/")) {
    working = await compressImage(working);
  }
  return working;
}
