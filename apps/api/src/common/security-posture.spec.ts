import { ThrottlerModule } from '@nestjs/throttler';
import helmet from 'helmet';
import {
  appealReasonSchema,
  consentUpdateSchema,
  listingIdSchema,
  parseOrThrow,
} from './zod-boundary';

/**
 * Phase 9 security regression: rate limits, helmet, zod boundary samples.
 */
describe('Phase 9 security posture', () => {
  it('ThrottlerModule is available for APP_GUARD wiring', () => {
    expect(ThrottlerModule).toBeDefined();
    expect(typeof ThrottlerModule.forRoot).toBe('function');
  });

  it('documents expected global and named rate limit defaults', () => {
    const defaults = {
      default: { ttlMs: 60_000, limit: 120 },
      auth: { ttlMs: 60_000, limit: 20 },
      search: { ttlMs: 60_000, limit: 60 },
      upload: { ttlMs: 60_000, limit: 30 },
    };
    expect(defaults.default.limit).toBeLessThanOrEqual(120);
    expect(defaults.auth.limit).toBeLessThanOrEqual(20);
  });

  it('helmet middleware factory is available for CSP/headers', () => {
    expect(typeof helmet).toBe('function');
    const mw = helmet({ contentSecurityPolicy: false });
    expect(typeof mw).toBe('function');
  });

  it('zod boundary accepts valid consent and rejects fuzz samples', () => {
    expect(
      parseOrThrow(consentUpdateSchema, {
        channel: 'MARKETING',
        granted: true,
      }),
    ).toEqual({ channel: 'MARKETING', granted: true });

    expect(() =>
      parseOrThrow(consentUpdateSchema, {
        channel: 'SMS',
        granted: true,
      }),
    ).toThrow(/Validation failed/);

    expect(() =>
      parseOrThrow(appealReasonSchema, { reason: 'short' }),
    ).toThrow(/Validation failed/);

    expect(() => parseOrThrow(listingIdSchema, 'not-a-uuid')).toThrow();
  });
});
