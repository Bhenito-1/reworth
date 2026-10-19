import {
  Controller,
  Inject,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../providers/storage.provider';

/**
 * Signed API-proxied upload (no JWT) for storage providers without public PUT URLs.
 */
@Controller('media')
export class MediaPublicController {
  private readonly bucket: string;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'reworth-media';
  }

  @Put('upload')
  async upload(
    @Query('key') key: string,
    @Query('expires') expiresRaw: string,
    @Query('signature') signature: string,
    @Query('contentType') contentType: string | undefined,
    @Req() req: Request & { body?: Buffer },
    @Res() res: Response,
  ) {
    if (!key || !expiresRaw || !signature) {
      throw new UnauthorizedException('Missing upload signature');
    }
    const expires = Number(expiresRaw);
    const signedType = contentType ?? '';
    if (!this.storage.verifyUpload?.(key, expires, signedType, signature)) {
      throw new UnauthorizedException('Invalid or expired upload signature');
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) {
      throw new UnauthorizedException('Empty upload body');
    }

    await this.storage.putObject({
      bucket: this.bucket,
      key,
      body,
      contentType: signedType || 'application/octet-stream',
    });
    res
      .status(200)
      .json({ ok: true, key, publicUrl: this.storage.publicUrl(key) });
  }
}
