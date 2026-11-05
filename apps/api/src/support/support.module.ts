import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
