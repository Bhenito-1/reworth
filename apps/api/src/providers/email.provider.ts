export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body; providers fall back to styled text wrap when omitted. */
  html?: string;
  /** Override Reply-To for this message. */
  replyTo?: string;
  meta?: Record<string, unknown>;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
