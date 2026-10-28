import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { EMAIL_PROVIDER } from '../providers/email.provider';
import { ResendEmailProvider } from '../providers/resend-email.provider';
import {
  MailhogEmailProvider,
  MockEmailProvider,
} from '../providers/mock-email.provider';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
        signOptions: {
          // Consumer mobile default: 24h (refresh still rotates at 30d).
          expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '24h',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (config: ConfigService) => {
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
              replyTo:
                config.get<string>('EMAIL_REPLY_TO') ??
                undefined,
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
      },
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
