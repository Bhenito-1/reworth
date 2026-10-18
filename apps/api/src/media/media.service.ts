import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  MockStorageAdapter,
} from '../providers/storage.provider';
import {
  MALWARE_SCAN_PROVIDER,
  type MalwareScanProvider,
} from './malware-scan.provider';
import {
  PipelineValidationError,
  runImagePipeline,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIMES,
} from './image-pipeline';
import type { CompleteMediaDto, PresignMediaDto } from './dto/media.dto';

export const MEDIA_IMAGE_QUEUE = 'media-image';

/** Minimal valid JPEG (8×8 grey) — used when Sell completes without a PUT. */
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDBYPDQwMDBsUFRAWIB0iIiAdHx8YKDwsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAAAQIDBAUGB//EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAEC/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A1oAAP//Z',
  'base64',
);

export type MediaImageJob = {
  listingImageId: string;
  listingId: string;
  key: string;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly bucket: string;
  private readonly inline: boolean;
  private readonly pipelineMode: 'mock' | 'sharp';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MALWARE_SCAN_PROVIDER)
    private readonly malware: MalwareScanProvider,
    @InjectQueue(MEDIA_IMAGE_QUEUE) private readonly queue: Queue<MediaImageJob>,
  ) {
    this.bucket =
      this.config.get<string>('S3_BUCKET') ?? 'reworth-media';
    const inlineEnv = this.config.get<string>('BULLMQ_INLINE');
    this.inline =
      inlineEnv === 'true' ||
      (inlineEnv === undefined &&
        (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL));
    const mode = this.config.get<string>('MEDIA_PIPELINE') ?? 'mock';
    this.pipelineMode =
      mode === 'sharp' && process.env.NODE_ENV !== 'test' ? 'sharp' : 'mock';
  }

  async presign(userId: string, dto: PresignMediaDto) {
    if (!ALLOWED_IMAGE_MIMES.has(dto.contentType)) {
      throw new BadRequestException(`Unsupported contentType: ${dto.contentType}`);
    }
    if (dto.contentLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException('File exceeds 10MB limit');
    }
    if (dto.listingId) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: dto.listingId },
      });
      if (!listing || listing.sellerId !== userId) {
        throw new BadRequestException('Listing not found or not owned');
      }
    }

    const safeName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${userId}/${randomUUID()}-${safeName}`;
    const uploadUrl = await this.storage.getSignedUrl({
      bucket: this.bucket,
      key,
      method: 'PUT',
      contentType: dto.contentType,
      expiresInSeconds: 900,
    });
    return {
      uploadUrl,
      key,
      publicUrl: this.storage.publicUrl(key),
    };
  }

  async complete(userId: string, dto: CompleteMediaDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });
    if (!listing || listing.sellerId !== userId) {
      throw new BadRequestException('Listing not found or not owned');
    }

    // Persist bytes when client could not PUT to storage (mock / CORS).
    if (dto.inlineBase64) {
      try {
        const body = Buffer.from(dto.inlineBase64, 'base64');
        if (body.length > 0 && body.length <= MAX_IMAGE_BYTES) {
          const contentType = dto.contentType ?? 'image/jpeg';
          if (!ALLOWED_IMAGE_MIMES.has(contentType)) {
            throw new BadRequestException(
              `Unsupported contentType: ${contentType}`,
            );
          }
          await this.storage.putObject({
            bucket: this.bucket,
            key: dto.key,
            body,
            contentType,
          });
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(
          `inlineBase64 putObject failed: ${(err as Error).message}`,
        );
      }
    } else if (this.storage.getObject) {
      // Mock Sell path often completes with a key and no PUT — seed a tiny JPEG
      // so vision assist and the image pipeline have bytes.
      try {
        const existing = await this.storage.getObject(this.bucket, dto.key);
        if (!existing || existing.length === 0) {
          await this.storage.putObject({
            bucket: this.bucket,
            key: dto.key,
            body: PLACEHOLDER_JPEG,
            contentType: 'image/jpeg',
          });
        }
      } catch {
        /* non-fatal */
      }
    }

    const image = await this.prisma.listingImage.create({
      data: {
        listingId: dto.listingId,
        sortOrder: dto.sortOrder,
        originalKey: dto.key,
        status: 'PENDING',
      },
    });

    const job: MediaImageJob = {
      listingImageId: image.id,
      listingId: dto.listingId,
      key: dto.key,
    };

    if (this.inline) {
      await this.processImageJob(job);
    } else {
      try {
        await this.queue.add('process', job, {
          removeOnComplete: true,
          attempts: 2,
        });
      } catch (err) {
        this.logger.warn(
          `Queue enqueue failed, processing inline: ${(err as Error).message}`,
        );
        await this.processImageJob(job);
      }
    }

    return this.prisma.listingImage.findUniqueOrThrow({
      where: { id: image.id },
    });
  }

  async processImageJob(job: MediaImageJob): Promise<void> {
    const scan = await this.malware.scan(job.key);
    if (!scan.clean) {
      await this.prisma.listingImage.update({
        where: { id: job.listingImageId },
        data: { status: 'FAILED' },
      });
      throw new PipelineValidationError(
        scan.reason ?? 'malware',
        'MALWARE',
      );
    }

    let body: Buffer | null = null;
    if (this.storage.getObject) {
      body = await this.storage.getObject(this.bucket, job.key);
    }

    if (!body || body.length === 0) {
      await this.prisma.listingImage.update({
        where: { id: job.listingImageId },
        data: { status: 'FAILED' },
      });
      throw new PipelineValidationError(
        'Uploaded file not found in storage — re-upload the photo',
        'OTHER',
      );
    }

    try {
      const result = await runImagePipeline({
        key: job.key,
        body,
        publicUrl: (k) => this.storage.publicUrl(k),
        mode: this.pipelineMode,
      });

      await this.prisma.listingImage.update({
        where: { id: job.listingImageId },
        data: {
          status: 'READY',
          mime: result.mime,
          sizeBytes: result.sizeBytes,
          width: result.width,
          height: result.height,
          dHash: result.dHash,
          exifStripped: result.exifStripped,
          variants: result.variants as object,
        },
      });

      if (result.gps) {
        const listing = await this.prisma.listing.findUnique({
          where: { id: job.listingId },
        });
        if (listing && listing.geoLat == null) {
          await this.prisma.listing.update({
            where: { id: job.listingId },
            data: { geoLat: result.gps.lat, geoLng: result.gps.lng },
          });
        }
      }
    } catch (err) {
      await this.prisma.listingImage.update({
        where: { id: job.listingImageId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }

  /**
   * Authenticated direct upload — stores bytes then runs the image pipeline.
   * Preferred over silent-failing browser PUT to presigned URLs.
   */
  async uploadDirect(
    userId: string,
    opts: {
      listingId: string;
      sortOrder: number;
      fileName: string;
      contentType: string;
      body: Buffer;
    },
  ) {
    if (!ALLOWED_IMAGE_MIMES.has(opts.contentType)) {
      throw new BadRequestException(
        `Unsupported contentType: ${opts.contentType}`,
      );
    }
    if (!opts.body?.length) {
      throw new BadRequestException('Empty upload body');
    }
    if (opts.body.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: opts.listingId },
    });
    if (!listing || listing.sellerId !== userId) {
      throw new BadRequestException('Listing not found or not owned');
    }

    const safeName = opts.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${userId}/${randomUUID()}-${safeName}`;
    await this.storage.putObject({
      bucket: this.bucket,
      key,
      body: opts.body,
      contentType: opts.contentType,
    });

    return this.complete(userId, {
      key,
      listingId: opts.listingId,
      sortOrder: opts.sortOrder,
    });
  }

  /** Attach already-uploaded keys to a listing (creates PENDING then processes). */
  async attachKeys(
    userId: string,
    listingId: string,
    keys: { key: string; sortOrder: number }[],
  ) {
    const results = [];
    for (const item of keys) {
      results.push(
        await this.complete(userId, {
          key: item.key,
          listingId,
          sortOrder: item.sortOrder,
        }),
      );
    }
    return results;
  }
}

/** Factory helpers for module wiring / tests without Redis. */
export function createMockStorageFromConfig(
  config: ConfigService,
): MockStorageAdapter {
  return new MockStorageAdapter({
    bucket: config.get<string>('S3_BUCKET') ?? 'reworth-media',
    publicBase:
      config.get<string>('S3_PUBLIC_URL') ??
      'http://localhost:9000/reworth-media',
  });
}
