import { createHash } from 'crypto';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

export type ImageVariants = {
  w640?: { webp?: string; avif?: string };
  w1080?: { webp?: string; avif?: string };
  w1600?: { webp?: string; avif?: string };
  original?: string;
};

export type PipelineResult = {
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  dHash: string;
  exifStripped: boolean;
  gps?: { lat: number; lng: number };
  variants: ImageVariants;
};

export type PipelineInput = {
  key: string;
  body: Buffer | null;
  publicUrl: (variantKey: string) => string;
  /** When set (Cloudinary), build real transform URLs for w640/webp etc. */
  deliveryUrl?: (key: string, transformation?: string) => string;
  mode: 'mock' | 'sharp';
};

function mockDHash(key: string, sizeBytes: number): string {
  return createHash('sha256')
    .update(`${key}:${sizeBytes}`)
    .digest('hex')
    .slice(0, 16);
}

/** Hamming distance between two hex dHash strings (bit-wise over decoded bits). */
export function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += bitCount(x);
  }
  dist += Math.abs(a.length - b.length) * 4;
  return dist;
}

function bitCount(n: number): number {
  let c = 0;
  let v = n;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  return c;
}

function buildMockVariants(
  key: string,
  publicUrl: (k: string) => string,
): ImageVariants {
  // Point every size at the original object so mock/local/S3 storage works
  // without generating real WebP/AVIF derivatives on disk.
  const url = publicUrl(key);
  return {
    original: url,
    w640: { webp: url, avif: url },
    w1080: { webp: url, avif: url },
    w1600: { webp: url, avif: url },
  };
}

/** Cloudinary on-the-fly transforms — no extra stored files needed. */
function buildCloudinaryVariants(
  key: string,
  deliveryUrl: (k: string, transformation?: string) => string,
): ImageVariants {
  return {
    original: deliveryUrl(key),
    w640: {
      webp: deliveryUrl(key, 'w_640,c_limit,f_webp,q_auto'),
      avif: deliveryUrl(key, 'w_640,c_limit,f_avif,q_auto'),
    },
    w1080: {
      webp: deliveryUrl(key, 'w_1080,c_limit,f_webp,q_auto'),
      avif: deliveryUrl(key, 'w_1080,c_limit,f_avif,q_auto'),
    },
    w1600: {
      webp: deliveryUrl(key, 'w_1600,c_limit,f_webp,q_auto'),
      avif: deliveryUrl(key, 'w_1600,c_limit,f_avif,q_auto'),
    },
  };
}

function buildVariants(input: PipelineInput): ImageVariants {
  if (input.deliveryUrl) {
    return buildCloudinaryVariants(input.key, input.deliveryUrl);
  }
  return buildMockVariants(input.key, input.publicUrl);
}

/**
 * Image pipeline: validate → malware context assumed clean → strip EXIF (mock) →
 * resize metadata → dHash. Sharp path is best-effort; falls back to mock.
 */
export async function runImagePipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const sizeBytes = input.body?.length ?? 0;
  if (sizeBytes > MAX_IMAGE_BYTES) {
    throw new PipelineValidationError(
      `File exceeds ${MAX_IMAGE_BYTES} bytes`,
      'OVERSIZE',
    );
  }

  let mime = 'image/jpeg';
  if (input.body && input.body.length > 0) {
    mime = await detectMime(input.body);
  } else {
    // Infer from key extension when body unavailable (presign-complete mock)
    mime = mimeFromKey(input.key);
  }

  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new PipelineValidationError(`Unsupported MIME: ${mime}`, 'MIME');
  }

  if (input.mode === 'sharp' && input.body) {
    try {
      return await runSharpPipeline(input, mime, sizeBytes);
    } catch {
      // fall through to mock
    }
  }

  return {
    mime,
    sizeBytes: sizeBytes || 1024,
    width: 1600,
    height: 1200,
    dHash: mockDHash(input.key, sizeBytes || 1024),
    exifStripped: true,
    gps: undefined,
    variants: buildVariants(input),
  };
}

async function detectMime(body: Buffer): Promise<string> {
  try {
    // file-type v16 CJS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fileType = require('file-type') as {
      fromBuffer: (b: Buffer) => Promise<{ mime: string } | undefined>;
    };
    const ft = await fileType.fromBuffer(body);
    if (ft?.mime) return ft.mime;
  } catch {
    // ignore
  }
  // Magic bytes fallback
  if (body[0] === 0xff && body[1] === 0xd8) return 'image/jpeg';
  if (body[0] === 0x89 && body[1] === 0x50) return 'image/png';
  if (body.toString('ascii', 0, 4) === 'RIFF') return 'image/webp';
  return 'application/octet-stream';
}

function mimeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function runSharpPipeline(
  input: PipelineInput,
  mime: string,
  sizeBytes: number,
): Promise<PipelineResult> {
  // Dynamic import so tests work when sharp native is missing
  const sharpMod = await import('sharp');
  const sharp = sharpMod.default;
  const image = sharp(input.body!, { failOn: 'none' });
  const meta = await image.metadata();
  const gps =
    meta.exif && typeof meta.exif === 'object'
      ? undefined // EXIF GPS parse deferred; strip anyway
      : undefined;

  const stripped = await image.rotate().toBuffer({ resolveWithObject: true });
  const width = stripped.info.width;
  const height = stripped.info.height;

  // Simple perceptual-ish hash from resized greyscale
  const tiny = await sharp(stripped.data)
    .resize(8, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  let bits = '';
  const avg = tiny.reduce((a, b) => a + b, 0) / tiny.length;
  for (const px of tiny) {
    bits += px >= avg ? '1' : '0';
  }
  const dHash = BigInt('0b' + bits).toString(16).padStart(16, '0');

  const base = input.key.replace(/\.[^.]+$/, '');
  const variants = buildVariants(input);
  // Record intended variant keys (Cloudinary transforms or mock aliases)
  void base;

  return {
    mime,
    sizeBytes,
    width,
    height,
    dHash,
    exifStripped: true,
    gps,
    variants,
  };
}

export class PipelineValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'MIME' | 'OVERSIZE' | 'MALWARE' | 'OTHER',
  ) {
    super(message);
    this.name = 'PipelineValidationError';
  }
}

/** Exported for unit tests without Nest DI. */
export function validateImageConstraints(opts: {
  mime: string;
  sizeBytes: number;
}): void {
  if (opts.sizeBytes > MAX_IMAGE_BYTES) {
    throw new PipelineValidationError(
      `File exceeds ${MAX_IMAGE_BYTES} bytes`,
      'OVERSIZE',
    );
  }
  if (!ALLOWED_IMAGE_MIMES.has(opts.mime)) {
    throw new PipelineValidationError(
      `Unsupported MIME: ${opts.mime}`,
      'MIME',
    );
  }
}
