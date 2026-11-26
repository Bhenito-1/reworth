import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MeetupsController } from './meetups.controller';
import { MeetupsService } from './meetups.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, ChatModule],
  controllers: [MeetupsController],
  providers: [MeetupsService],
  exports: [MeetupsService],
})
export class MeetupsModule {}