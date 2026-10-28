import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from './email.provider';
import {
  escapeHtml,
  isNoReplyAddress,
  parseFromAddress,
  renderTransactionalEmail,
} from './email-templates';

export type ResendEmailProviderOptions = {
  replyTo?: string;
};

/**
 * Resend HTTP adapter — EMAIL_PROVIDER=resend + RESEND_API_KEY.
 * Avoids no-reply From when possible; sends matching text+html.
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly replyTo?: string;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    options: ResendEmailProviderOptions = {},
  ) {
    this.replyTo = options.replyTo?.trim() || undefined;
    const domain = parseFromAddress(from).split('@')[1];
    if (domain) {
      this.logger.log(`Resend from-domain=${domain}`);
    }
    if (isNoReplyAddress(from)) {
      this.logger.warn(
        'EMAIL_FROM uses a no-reply address — mailbox providers often treat these as spam. Prefer hello@ / accounts@ on your verified domain.',
      );
    }
    if (this.replyTo && isNoReplyAddress(this.replyTo)) {
      this.logger.warn(
        'EMAIL_REPLY_TO is no-reply — use a monitored inbox on the same verified domain.',
      );
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const html =
      message.html ??
      renderTransactionalEmail({
        title: message.subject,
        paragraphs: message.text
          .split(/\n+/)
          .map((l) => l.trim())
          .filter(Boolean),
      }).html;

    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY missing; logging email instead');
      this.logger.log(
        { to: message.to, subject: message.subject },
        'email:resend-fallback',
      );
      return;
    }

    const category =
      typeof message.meta?.emailCategory === 'string'
        ? message.meta.emailCategory
        : 'transactional';

    const payload: Record<string, unknown> = {
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html,
      tags: [{ name: 'category', value: category.slice(0, 50) }],
    };

    const replyTo = message.replyTo ?? this.replyTo;
    if (replyTo && !isNoReplyAddress(replyTo)) {
      payload.reply_to = replyTo;
    } else if (!isNoReplyAddress(this.from)) {
      // Replyable From is better than omitting Reply-To entirely.
      payload.reply_to = parseFromAddress(this.from);
    }

    if (typeof message.meta?.entityRefId === 'string') {
      payload.headers = {
        'X-Entity-Ref-ID': message.meta.entityRefId,
      };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
      }
      this.logger.log({ to: message.to, subject: message.subject }, 'email:resend');
    } catch (err) {
      this.logger.warn(
        `Resend send failed (${(err as Error).message}); logging instead`,
      );
      this.logger.log(
        {
          to: message.to,
          subject: message.subject,
          text: message.text,
          htmlPreview: escapeHtml(message.subject),
        },
        'email:resend-fallback',
      );
    }
  }
}
