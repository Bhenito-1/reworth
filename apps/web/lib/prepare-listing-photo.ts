/** Long edge cap — matches listing w1600 variant; keeps uploads fast on mobile data. */
const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.82;
/** Skip re-encode when already small JPEG. */
const SKIP_IF_BYTES = 900_000;

function fileNameAsJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/i, "") || "photo";
  return `${base}.jpg`;
}

/**
 * Downscale and re-encode listing photos in the browser before multipart upload.
 * Cuts multi‑MB phone captures to ~200–800KB and speeds server sharp/storage work.
 */
export async function prepareListingPhoto(file: File): Promise<File> {
  if (
    file.type === "image/jpeg" &&
    file.size > 0 &&
    file.size <= SKIP_IF_BYTES
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const long = Math.max(width, height);
  const scale = long > MAX_EDGE ? MAX_EDGE / long : 1;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  if (scale === 1 && file.type === "image/jpeg" && file.size <= SKIP_IF_BYTES) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) return file;

  return new File([blob], fileNameAsJpeg(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/** Run async work on `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}