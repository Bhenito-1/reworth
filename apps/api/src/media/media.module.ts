import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { resolve } from 'path';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaService, MEDIA_IMAGE_QUEUE } from './media.service';
import { ImagePipelineProcessor } from './image-pipeline.processor';
import { StorageBootstrapService } from './storage-bootstrap.service';
import {
  STORAGE_PROVIDER,
  MockStorageAdapter,
} from '../providers/storage.provider';
import { S3StorageAdapter } from '../providers/s3-storage.adapter';
import { CloudinaryStorageAdapter } from '../providers/cloudinary-storage.adapter';
import {
  LocalFsStorageAdapter,
  defaultMediaRoot,
} from '../providers/local-fs-storage.adapter';
import {
  MALWARE_SCAN_PROVIDER,
  MockMalwareScanProvider,
} from './malware-scan.provider';

function redisConnection(url: string | undefined) {
  if (!url) {
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    };
  }
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password || undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    };
  }
}

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.get<string>('REDIS_URL')),
        defaultJobOptions: { removeOnComplete: true },
      }),
    }),
    BullModule.registerQueue({ name: MEDIA_IMAGE_QUEUE }),
  ],
  controllers: [MediaController, MediaPublicController],
  providers: [
    MediaService,
    ImagePipelineProcessor,
    StorageBootstrapService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('StorageProvider');
        if (process.env.NODE_ENV === 'test') {
          logger.log('Using MockStorageAdapter (test)');
          return new MockStorageAdapter({
            bucket: config.get<string>('S3_BUCKET') ?? 'reworth-media',
            publicBase:
              config.get<string>('S3_PUBLIC_URL') ??
              'http://localhost:9000/reworth-media',
          });
        }

        const driver = (
          config.get<string>('STORAGE_DRIVER') ?? 's3'
        ).toLowerCase();
        const bucket = config.get<string>('S3_BUCKET') ?? 'reworth-media';
        const apiUrl = (
          config.get<string>('API_URL') ?? 'http://localhost:3001'
        ).replace(/\/$/, '');
        const apiBase = `${apiUrl}/api/v1`;
        const endpoint =
          config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
        const publicBase =
          config.get<string>('S3_PUBLIC_URL') ?? `${endpoint.replace(/\/$/, '')}/${bucket}`;

        if (driver === 'mock') {
          logger.log('Using MockStorageAdapter');
          return new MockStorageAdapter({ bucket, publicBase });
        }

        if (driver === 'cloudinary') {
          const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
          const apiKey = config.get<string>('CLOUDINARY_API_KEY');
          const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
          if (!cloudName || !apiKey || !apiSecret) {
            throw new Error(
              'STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET',
            );
          }
          logger.log(`Using CloudinaryStorageAdapter (cloud=${cloudName})`);
          return new CloudinaryStorageAdapter({
            cloudName,
            apiKey,
            apiSecret,
            apiBase,
            uploadSigningSecret:
              config.get<string>('JWT_ACCESS_SECRET') ?? apiSecret,
            legacyLocalRoot:
              config.get<string>('MEDIA_LOCAL_DIR') ?? defaultMediaRoot(),
          });
        }

        if (driver === 'local' || driver === 'fs') {
          const rootDir =
            config.get<string>('MEDIA_LOCAL_DIR') ?? defaultMediaRoot();
          logger.log(`Using LocalFsStorageAdapter (${resolve(rootDir)})`);
          return new LocalFsStorageAdapter({
            rootDir,
            bucket,
            publicBase:
              config.get<string>('S3_PUBLIC_URL') ?? `${apiBase}/media/files`,
            apiBase,
            signingSecret:
              config.get<string>('S3_SECRET_ACCESS_KEY') ??
              config.get<string>('JWT_ACCESS_SECRET') ??
              'dev-media-signing-secret',
          });
        }

        // STORAGE_DRIVER=s3 (legacy alias: minio) → adobe/s3mock locally, AWS S3 in prod
        if (driver === 'minio') {
          logger.warn(
            'STORAGE_DRIVER=minio is deprecated; using the S3 client against S3_ENDPOINT (adobe/s3mock locally)',
          );
        }
        if (!endpoint) {
          throw new Error('STORAGE_DRIVER=s3 requires S3_ENDPOINT');
        }
        logger.log(`Using S3StorageAdapter (${endpoint}, bucket=${bucket})`);
        return new S3StorageAdapter({
          endpoint,
          region: config.get<string>('S3_REGION') ?? 'us-east-1',
          accessKeyId: config.get<string>('S3_ACCESS_KEY_ID') ?? 'reworth',
          secretAccessKey:
            config.get<string>('S3_SECRET_ACCESS_KEY') ?? 'reworthsecret',
          bucket,
          forcePathStyle:
            config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
          publicUrl: publicBase,
        });
      },
    },
    {
      provide: MALWARE_SCAN_PROVIDER,
      useClass: MockMalwareScanProvider,
    },
  ],
  exports: [MediaService, STORAGE_PROVIDER, BullModule],
})
export class MediaModule {}
