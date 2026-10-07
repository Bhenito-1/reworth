/** ReWorth Image-Title Check — workspace `reworth-pm12p`. */
export const DEFAULT_ROBOFLOW_WORKSPACE = 'reworth-pm12p';
export const DEFAULT_ROBOFLOW_WORKFLOW_ID =
  'reworth-image-title-check-1790810818816';
export const DEFAULT_ROBOFLOW_API_BASE = 'https://serverless.roboflow.com';
export const DEFAULT_VISION_TIMEOUT_MS = 25_000;
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.5;
export const DEFAULT_VISION_MAX_IMAGES = 4;
export const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024;

export function readPositiveNumber(
  raw: string | number | undefined,
  fallback: number,
): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readThreshold(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  return n;
}
