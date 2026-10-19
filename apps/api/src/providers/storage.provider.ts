export type PutObjectInput = {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
};

export type PutObjectResult = {
  bucket: string;
  key: string;
  url: string;
  etag?: string;
};

export type GetSignedUrlInput = {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
  /** HTTP method for upload (PUT) or download (GET). */
  method?: 'GET' | 'PUT';
  contentType?: string;
};

export type PresignUploadResult = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
};

/** Object storage abstraction (adobe/s3mock locally, AWS S3 in prod). */
export interface StorageProvider {
  readonly name: string;
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getSignedUrl(input: GetSignedUrlInput): Promise<string>;
  getObject?(bucket: string, key: string): Promise<Buffer | null>;
  deleteObject(bucket: string, key: string): Promise<void>;
  publicUrl(key: string): string;
  /**
   * Optional CDN delivery URL with provider-native transforms
   * (e.g. Cloudinary `w_640,f_webp`). Falls back to publicUrl when omitted.
   */
  deliveryUrl?(key: string, transformation?: string): string;
  /** Validate an API-proxied upload URL when direct object-store PUTs aren't used. */
  verifyUpload?(key: string, expires: number, contentType: string, signature: string): boolean;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** In-memory adapter for tests and local mock mode. */
export class MockStorageAdapter implements StorageProvider {
  readonly name: string = 'mock-storage';
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  private readonly publicBase: string;
  private readonly bucket: string;

  constructor(opts?: { bucket?: string; publicBase?: string }) {
    this.bucket = opts?.bucket ?? 'reworth-media';
    this.publicBase = opts?.publicBase ?? `http://localhost:9000/${this.bucket}`;
  }

  private id(bucket: string, key: string) {
    return `${bucket}/${key}`;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.isBuffer(input.body)
      ? input.body
      : Buffer.from(input.body);
    this.objects.set(this.id(input.bucket, input.key), {
      body,
      contentType: input.contentType,
    });
    return {
      bucket: input.bucket,
      key: input.key,
      url: this.publicUrl(input.key),
      etag: `mock-${body.length}`,
    };
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    const expires = input.expiresInSeconds ?? 3600;
    const method = input.method ?? 'GET';
    return `${this.publicBase}/${input.key}?X-Amz-Expires=${expires}&method=${method}&stub=1`;
  }

  async getObject(bucket: string, key: string): Promise<Buffer | null> {
    return this.objects.get(this.id(bucket, key))?.body ?? null;
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    this.objects.delete(this.id(bucket, key));
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /** Test helper: seed an uploaded object. */
  seed(key: string, body: Buffer, contentType = 'image/jpeg') {
    this.objects.set(this.id(this.bucket, key), { body, contentType });
  }
}

/** Local stub that records operations without talking to S3. */
export class S3StorageStub extends MockStorageAdapter {
  readonly name = 's3-stub';
}
