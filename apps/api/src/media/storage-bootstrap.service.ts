import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../providers/storage.provider';
import { S3StorageAdapter } from '../providers/s3-storage.adapter';

/** Ensures the adobe/s3mock (or other S3) bucket exists when STORAGE_DRIVER=s3. */
@Injectable()
export class StorageBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(StorageBootstrapService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async onModuleInit() {
    if (!(this.storage instanceof S3StorageAdapter)) return;
    try {
      await this.storage.ensureBucket();
    } catch (err) {
      this.logger.error(
        `Object storage bootstrap failed — is S3_ENDPOINT up? ${(err as Error).message}`,
      );
    }
  }
}
