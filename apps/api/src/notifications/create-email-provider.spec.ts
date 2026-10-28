import { ConfigService } from '@nestjs/config';
import { createEmailProvider } from './notifications.module';
import { MockEmailProvider } from '../providers/mock-email.provider';
import { ResendEmailProvider } from '../providers/resend-email.provider';

describe('createEmailProvider', () => {
  it('defaults to mock', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    expect(createEmailProvider(config)).toBeInstanceOf(MockEmailProvider);
  });

  it('returns Resend when EMAIL_PROVIDER=resend', () => {
    const config = {
      get: (key: string) => {
        if (key === 'EMAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_test';
        if (key === 'EMAIL_FROM') return 'noreply@reworth.ng';
        return undefined;
      },
    } as unknown as ConfigService;
    const provider = createEmailProvider(config);
    expect(provider).toBeInstanceOf(ResendEmailProvider);
    expect(provider.name).toBe('resend');
  });
});
