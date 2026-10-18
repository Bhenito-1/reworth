import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from './email.provider';
import { parseFromAddress } from './email-templates';

@Injectable()
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock-email';
  private readonly logger = new Logger(MockEmailProvider.name);
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(
      { to: message.to, subject: message.subject },
      'email:mock',
    );
  }
}

/**
 * Mailhog SMTP adapter — uses raw TCP SMTP when SMTP_HOST is reachable.
 * Falls back to console log if connection fails (dev-friendly).
 */
@Injectable()
export class MailhogEmailProvider implements EmailProvider {
  readonly name = 'mailhog';
  private readonly logger = new Logger(MailhogEmailProvider.name);

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const envelopeFrom = parseFromAddress(this.from);
    try {
      // Lazy require to avoid hard dep on nodemailer in unit tests
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const net = require('net') as typeof import('net');
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(
          { host: this.host, port: this.port },
          () => {
            const boundary = `reworth_${Date.now()}`;
            const body = message.html
              ? [
                  `Content-Type: multipart/alternative; boundary="${boundary}"`,
                  ``,
                  `--${boundary}`,
                  `Content-Type: text/plain; charset=utf-8`,
                  ``,
                  message.text,
                  `--${boundary}`,
                  `Content-Type: text/html; charset=utf-8`,
                  ``,
                  message.html,
                  `--${boundary}--`,
                ].join('\r\n')
              : message.text;

            const payload = [
              `EHLO reworth.local`,
              `MAIL FROM:<${envelopeFrom}>`,
              `RCPT TO:<${message.to}>`,
              `DATA`,
              `From: ${this.from}`,
              `To: ${message.to}`,
              `Subject: ${message.subject}`,
              `MIME-Version: 1.0`,
              body,
              `.`,
              `QUIT`,
            ].join('\r\n');
            socket.write(payload + '\r\n');
            socket.end();
            resolve();
          },
        );
        socket.on('error', reject);
        setTimeout(() => {
          socket.destroy();
          reject(new Error('SMTP timeout'));
        }, 3000);
      });
      this.logger.log({ to: message.to, subject: message.subject }, 'email:mailhog');
    } catch (err) {
      this.logger.warn(
        `Mailhog send failed (${(err as Error).message}); logging instead`,
      );
      this.logger.log(
        { to: message.to, subject: message.subject, text: message.text },
        'email:fallback',
      );
    }
  }
}
