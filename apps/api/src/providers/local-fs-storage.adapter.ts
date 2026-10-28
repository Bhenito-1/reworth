import { createHmac, timingSafeEqual } from 'crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve, sep } from 'path';
import type {
  GetSignedUrlInput,
  PutObjectInput,
  PutObjectResult,
  StorageProvider,
} from './storage.provider';

export type LocalFsStorageConfig = {
  /** Absolute path to media root (bucket folders live underneath). */
  rootDir: string;
  bucket: string;
  /** Public base URL, e.g. http://localhost:3001/api/v1/media/files */
  publicBase: string;
  /** API origin for signed upload URLs, e.g. http://localhost:3001/api/v1 */
  apiBase: string;
  /** HMAC secret for upload signatures. */
  signingSecret: string;
};

/**
 * Disk-backed object store for local/dev when adobe/s3mock is unavailable.
 * Presigned PUT → POST/PUT `/media/upload?...` ; public GET `/media/files/...`.
 */
export class LocalFsStorageAdapter implements StorageProvider {
  readonly name = 'local-fs';
  readonly bucket: string;
  private readonly rootDir: string;
  private readonly publicBase: string;
  private readonly apiBase: string;
  private readonly signingSecret: string;

  constructor(config: LocalFsStorageConfig) {
    this.bucket = config.bucket;
    this.rootDir = resolve(config.rootDir);
    this.publicBase = config.publicBase.replace(/\/$/, '');
    this.apiBase = config.apiBase.replace(/\/$/, '');
    this.signingSecret = config.signingSecret;
    mkdirSync(join(this.rootDir, this.bucket), { recursive: true });
  }

  private objectPath(bucket: string, key: string): string {
    const safeKey = key.replace(/^[/\\]+/, '').replace(/\0/g, '');
    const full = resolve(join(this.rootDir, bucket, safeKey));
    const root = resolve(join(this.rootDir, bucket)) + sep;
    if (!full.startsWith(root) && full !== root.slice(0, -1)) {
      throw new Error('Invalid object key');
    }
    return full;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.isBuffer(input.body)
      ? input.body
      : Buffer.from(input.body);
    const path = this.objectPath(input.bucket, input.key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    return {
      bucket: input.bucket,
      key: input.key,
      url: this.publicUrl(input.key),
      etag: `local-${body.length}`,
    };
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? 3600);
    if (input.method === 'PUT') {
      const sig = this.signUpload(input.key, expires, input.contentType ?? '');
      const q = new URLSearchParams({
        key: input.key,
        expires: String(expires),
        signature: sig,
      });
      if (input.contentType) q.set('contentType', input.contentType);
      return `${this.apiBase}/media/upload?${q.toString()}`;
    }
    return this.publicUrl(input.key);
  }

  async getObject(bucket: string, key: string): Promise<Buffer | null> {
    const path = this.objectPath(bucket, key);
    if (!existsSync(path)) return null;
    return readFileSync(path);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const path = this.objectPath(bucket, key);
    if (existsSync(path)) unlinkSync(path);
  }

  publicUrl(key: string): string {
    const encoded = key
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    return `${this.publicBase}/${encoded}`;
  }

  signUpload(key: string, expires: number, contentType: string): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${key}\n${expires}\n${contentType}`)
      .digest('hex');
  }

  verifyUpload(
    key: string,
    expires: number,
    contentType: string,
    signature: string,
  ): boolean {
    if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
    const expected = this.signUpload(key, expires, contentType);
    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(signature, 'utf8');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  openReadStream(bucket: string, key: string) {
    const path = this.objectPath(bucket, key);
    if (!existsSync(path)) return null;
    return createReadStream(path);
  }

  absolutePath(bucket: string, key: string): string {
    return this.objectPath(bucket, key);
  }
}

export function findMonorepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, 'pnpm-workspace.yaml')) ||
      existsSync(join(dir, 'turbo.json'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start, '../..');
}

export function defaultMediaRoot(): string {
  return join(findMonorepoRoot(), '.data', 'media');
}
