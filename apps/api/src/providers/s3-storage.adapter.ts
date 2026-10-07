import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';
import type {
  GetSignedUrlInput,
  PutObjectInput,
  PutObjectResult,
  StorageProvider,
} from './storage.provider';

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
  publicUrl?: string;
};

/**
 * S3 API client. Local compose uses adobe/s3mock (`S3_ENDPOINT`, default
 * http://localhost:9000). The same client talks to AWS S3 when the endpoint changes.
 * Used whenever STORAGE_DRIVER=s3.
 */
export class S3StorageAdapter implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;
  readonly bucket: string;
  private readonly publicBase: string;
  private readonly logger = new Logger(S3StorageAdapter.name);

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.publicBase =
      config.publicUrl ??
      `${config.endpoint.replace(/\/$/, '')}/${config.bucket}`;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Ensure the bucket exists. adobe/s3mock does not implement PutBucketCors. */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket ready: ${this.bucket}`);
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket: ${this.bucket}`);
    }
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const body = Buffer.isBuffer(input.body)
      ? input.body
      : Buffer.from(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
      }),
    );
    return {
      bucket: input.bucket,
      key: input.key,
      url: this.publicUrl(input.key),
    };
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    const expires = input.expiresInSeconds ?? 3600;
    if (input.method === 'PUT') {
      const cmd = new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
      });
      return getSignedUrl(this.client, cmd, { expiresIn: expires });
    }
    const cmd = new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expires });
  }

  async getObject(bucket: string, key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  publicUrl(key: string): string {
    const encoded = key
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    return `${this.publicBase.replace(/\/$/, '')}/${encoded}`;
  }
}
