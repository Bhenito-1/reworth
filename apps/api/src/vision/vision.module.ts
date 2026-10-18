import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediaModule } from '../media/media.module';
import { RoboflowService } from './roboflow.service';
import { VisionService } from './vision.service';

@Module({
  imports: [ConfigModule, MediaModule],
  providers: [RoboflowService, VisionService],
  exports: [VisionService],
})
export class VisionModule {}
