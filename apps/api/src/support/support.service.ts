import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER, type EmailProvider } from '../providers/email.provider';
import {
  renderSupportAcknowledgementEmail,
  renderSupportRequestEmail,
  resolvePublicAppUrl,
} from '../providers/email-templates';
import { SupportRequestDto } from './dto/support-request.dto';

const SUPPORT_INBOX = 'reworthhub@gmail.com';

@Injectable()
export class SupportService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: SupportRequestDto) {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const message = dto.message.trim();
    if (!name || message.length < 10) {
      throw new BadRequestException(
        'Please provide your name and a message of at least 10 characters',
      );
    }

    const appUrl = resolvePublicAppUrl(
      this.config.get<string>('EMAIL_APP_URL'),
      this.config.get<string>('APP_URL'),
      this.config.get<string>('WEB_URL'),
    );

    const inbound = renderSupportRequestEmail({ name, email, message, appUrl });
    await this.emailProvider.send({
      to: SUPPORT_INBOX,
      subject: inbound.subject,
      text: inbound.text,
      html: inbound.html,
      replyTo: email,
      meta: { emailCategory: 'support_request' },
    });

    const ack = renderSupportAcknowledgementEmail({
      name,
      email,
      message,
      appUrl,
    });
    await this.emailProvider.send({
      to: email,
      subject: ack.subject,
      text: ack.text,
      html: ack.html,
      meta: { emailCategory: 'support_acknowledgement' },
    });

    return { success: true };
  }
}
