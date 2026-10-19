import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import type {
  GetSignedUrlInput,
  PutObjectInput,
  PutObjectResult,
  StorageProvider,
} from './storage.provider';

type CloudinaryUploadResponse = {
  public_id?: string;
  secure_url?: string;
  format?: string;
  bytes?: number;
  error?: { message?: string };
};

export type CloudinaryStorageConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  apiBase: string;
  uploadSigningSecret: string;
  legacyLocalRoot?: string;
};

/** Cloudinary-backed storage. All signed uploads are proxied through the API. */
export class CloudinaryStorageAdapter implements StorageProvider {
  readonly name = 'cloudinary';
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly apiBase: string;
  private readonly uploadSigningSecret: string;
  private readonly legacyLocalRoot?: string;

  constructor(config: CloudinaryStorageConfig) {
    this.cloudName = config.cloudName;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.apiBase = config.apiBase.replace(/\/$/, '');
    this.uploadSigningSecret = config.uploadSigningSecret;
    this.legacyLocalRoot = config.legacyLocalRoot
      ? resolve(config.legacyLocalRoot)
      : undefined;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.isBuffer(input.body)
      ? input.body
      : Buffer.from(input.body);
    const publicId = cloudinaryPublicId(input.key);
    const form = new FormData();
    // Prefer File when available (Node 20+); avoids Uint8Array.from copies on large photos.
    const filePart =
      typeof File !== 'undefined'
        ? new File([body], 'upload', { type: input.contentType })
        : new Blob([body], { type: input.contentType });
    form.set('file', filePart, 'upload');
    form.set('public_id', publicId);
    form.set('overwrite', 'true');
    form.set('api_key', this.apiKey);

    const response = await fetch(this.uploadEndpoint(), {
      method: 'POST',
      headers: { Authorization: this.basicAuth() },
      body: form,
    });
    const result = (await response.json().catch(() => ({}))) as CloudinaryUploadResponse;
    if (!response.ok || !result.secure_url) {
      throw new Error(
        `Cloudinary upload failed (${response.status}): ${result.error?.message ?? 'invalid upload response'}`,
      );
    }

    return {
      bucket: input.bucket,
      key: input.key,
      url: result.secure_url,
      etag: result.public_id,
    };
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    if (input.method !== 'PUT') return this.publicUrl(input.key);

    const expires = Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? 3600);
    const contentType = input.contentType ?? '';
    const signature = this.signUpload(input.key, expires, contentType);
    const query = new URLSearchParams({
      key: input.key,
      expires: String(expires),
      signature,
    });
    if (contentType) query.set('contentType', contentType);
    return `${this.apiBase}/media/upload?${query.toString()}`;
  }

  async getObject(_bucket: string, key: string): Promise<Buffer | null> {
    try {
      const response = await fetch(this.publicUrl(key));
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {
      // Try the old local store below while existing media is migrated.
    }
    return this.getLegacyLocalObject(_bucket, key);
  }

  async deleteObject(_bucket: string, key: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = cloudinaryPublicId(key);
    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${this.apiSecret}`)
      .digest('hex');
    const form = new FormData();
    form.set('public_id', publicId);
    form.set('timestamp', String(timestamp));
    form.set('api_key', this.apiKey);
    form.set('signature', signature);
    const response = await fetch(this.destroyEndpoint(), {
      method: 'POST',
      headers: { Authorization: this.basicAuth() },
      body: form,
    });
    const result = (await response.json().catch(() => ({}))) as {
      result?: string;
      error?: { message?: string };
    };
    if (!response.ok || (result.result && result.result !== 'ok' && result.result !== 'not found')) {
      throw new Error(
        `Cloudinary delete failed (${response.status}): ${result.error?.message ?? result.result ?? 'invalid response'}`,
      );
    }
  }

  publicUrl(key: string): string {
    return this.deliveryUrl(key);
  }

  /**
   * Cloudinary delivery URL. Pass a transformation string for sized/format
   * variants, e.g. `w_640,c_limit,f_webp,q_auto`.
   */
  deliveryUrl(key: string, transformation?: string): string {
    const publicId = cloudinaryPublicId(key)
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const extension = cloudinaryExtension(key);
    const transform = transformation?.trim()
      ? `${transformation.replace(/^\/+|\/+$/g, '')}/`
      : '';
    return `https://res.cloudinary.com/${encodeURIComponent(this.cloudName)}/image/upload/${transform}${publicId}${extension ? `.${extension}` : ''}`;
  }

  signUpload(key: string, expires: number, contentType: string): string {
    return createHmac('sha256', this.uploadSigningSecret)
      .update(`${key}\n${expires}\n${contentType}`)
      .digest('hex');
  }

  verifyUpload(key: string, expires: number, contentType: string, signature: string): boolean {
    if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.signUpload(key, expires, contentType), 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private basicAuth(): string {
    return `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`;
  }

  private uploadEndpoint(): string {
    return `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/upload`;
  }

  private destroyEndpoint(): string {
    return `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/destroy`;
  }

  private getLegacyLocalObject(bucket: string, key: string): Buffer | null {
    if (!this.legacyLocalRoot) return null;
    const bucketRoot = resolve(this.legacyLocalRoot, bucket);
    const filePath = resolve(bucketRoot, key.replace(/^[/\\]+/, ''));
    const relativePath = relative(bucketRoot, filePath);
    if (
      !relativePath ||
      relativePath.startsWith('..') ||
      isAbsolute(relativePath) ||
      !existsSync(filePath)
    ) {
      return null;
    }
    return readFileSync(filePath);
  }
}

function cloudinaryPublicId(key: string): string {
  const normalized = key.replace(/^[/\\]+/, '');
  const lastSlash = normalized.lastIndexOf('/');
  const dot = normalized.lastIndexOf('.');
  return dot > lastSlash ? normalized.slice(0, dot) : normalized;
}

function cloudinaryExtension(key: string): string {
  const lastSegment = key.slice(key.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) return '';
  const extension = lastSegment.slice(dot + 1).toLowerCase();
  if (extension === 'jpeg' || extension === 'jpe') return 'jpg';
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : '';
}
