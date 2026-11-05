import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EMAIL_PROVIDER } from '../providers/email.provider';
import {
  MailhogEmailProvider,
  MockEmailProvider,
} from '../providers/mock-email.provider';
import { ResendEmailProvider } from '../providers/resend-email.provider';
import { MockPushProvider } from '../providers/mock-push.provider';
import { WebPushProvider } from '../providers/web-push.provider';
import { PUSH_PROVIDER } from '../providers/push.provider';
import {
  DevicesController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';

export function createEmailProvider(config: ConfigService) {
  const provider = (
    config.get<string>('EMAIL_PROVIDER') ?? 'mock'
  ).toLowerCase();
  const from =
    config.get<string>('EMAIL_FROM') ?? 'noreply@reworth.local';
  if (provider === 'resend') {
    return new ResendEmailProvider(
      config.get<string>('RESEND_API_KEY') ?? '',
      from,
      {
        replyTo: config.get<string>('EMAIL_REPLY_TO') ?? undefined,
      },
    );
  }
  if (provider === 'mailhog') {
    return new MailhogEmailProvider(
      config.get<string>('SMTP_HOST') ?? 'localhost',
      Number(config.get('SMTP_PORT') ?? 1025),
      from,
    );
  }
  return new MockEmailProvider();
}

export function createPushProvider(config: ConfigService) {
  const provider = (
    config.get<string>('PUSH_PROVIDER') ?? 'mock'
  ).toLowerCase();
  if (provider === 'web-push') {
    const publicKey = config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY') ?? '';
    const privateKey = config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY') ?? '';
    const subject = config.get<string>('WEB_PUSH_VAPID_SUBJECT') ?? '';
    if (!publicKey || !privateKey || !subject) {
      throw new Error('PUSH_PROVIDER=web-push requires WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_VAPID_SUBJECT');
    }
    return new WebPushProvider(
      publicKey,
      privateKey,
      subject,
      config.get<string>('WEB_ORIGIN'),
    );
  }
  return new MockPushProvider();
}

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [NotificationsController, DevicesController],
  providers: [
    NotificationsService,
    {
      provide: PUSH_PROVIDER,
      useFactory: createPushProvider,
      inject: [ConfigService],
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: createEmailProvider,
      inject: [ConfigService],
    },
  ],
  exports: [NotificationsService, PUSH_PROVIDER, EMAIL_PROVIDER],
})
export class NotificationsModule {}
