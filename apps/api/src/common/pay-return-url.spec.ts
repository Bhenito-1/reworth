import { payReturnUrl } from './pay-return-url';

describe('payReturnUrl (Paystack callback)', () => {
  const saved = { web: process.env.WEB_ORIGIN, app: process.env.APP_URL };
  beforeEach(() => {
    // Same shape as production: vercel address first, custom domain last.
    process.env.WEB_ORIGIN =
      'https://reworth-livid.vercel.app, http://localhost:3000, https://www.reworth.com.ng';
    process.env.APP_URL = 'https://reworth-livid.vercel.app';
  });
  afterEach(() => {
    process.env.WEB_ORIGIN = saved.web;
    process.env.APP_URL = saved.app;
  });

  it('sends the payer back to the site they paid from', () => {
    expect(payReturnUrl('paystack', 'https://www.reworth.com.ng')).toBe(
      'https://www.reworth.com.ng/pay/return',
    );
    expect(payReturnUrl('paystack', 'https://reworth-livid.vercel.app')).toBe(
      'https://reworth-livid.vercel.app/pay/return',
    );
  });

  it('ignores origins that are not ours (no open redirect)', () => {
    expect(payReturnUrl('paystack', 'https://evil.example')).toBe(
      'https://reworth-livid.vercel.app/pay/return',
    );
    expect(payReturnUrl('paystack', 'https://www.reworth.com.ng.evil.example')).toBe(
      'https://reworth-livid.vercel.app/pay/return',
    );
  });

  it('falls back to the first web origin without an Origin header (mobile, server calls)', () => {
    expect(payReturnUrl('paystack', undefined)).toBe(
      'https://reworth-livid.vercel.app/pay/return',
    );
    expect(payReturnUrl('paystack', 'null')).toBe(
      'https://reworth-livid.vercel.app/pay/return',
    );
  });

  it('mock PSP has no hosted checkout, so no callback', () => {
    expect(payReturnUrl('mock-psp', 'https://www.reworth.com.ng')).toBeUndefined();
  });
});
