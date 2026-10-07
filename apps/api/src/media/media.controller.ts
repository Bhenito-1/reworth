import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { CompleteMediaDto, PresignMediaDto } from './dto/media.dto';
import { MediaService } from './media.service';
import { MAX_IMAGE_BYTES } from './image-pipeline';

@Controller('media')
@UseGuards(JwtAuthGuard)
@Throttle({ upload: { limit: 30, ttl: 60_000 } })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  presign(@CurrentUser() user: AuthUser, @Body() dto: PresignMediaDto) {
    return this.media.presign(user.id, dto);
  }

  @Post('complete')
  complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteMediaDto) {
    return this.media.complete(user.id, dto);
  }

  /**
   * Multipart direct upload — stores to disk/S3 then runs pipeline.
   * Field: `file`; body: listingId, sortOrder (optional).
   */
  @Post('direct')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async direct(
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
          size: number;
        }
      | undefined,
    @Body() body: { listingId?: string; sortOrder?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    if (!body.listingId) {
      throw new BadRequestException('listingId is required');
    }
    const sortOrder = Number(body.sortOrder ?? 0);
    const contentType =
      file.mimetype && file.mimetype !== 'application/octet-stream'
        ? file.mimetype
        : file.originalname?.toLowerCase().endsWith('.png')
          ? 'image/png'
          : file.originalname?.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
    return this.media.uploadDirect(user.id, {
      listingId: body.listingId,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      fileName: file.originalname || 'photo.jpg',
      contentType,
      body: file.buffer,
    });
  }
}
