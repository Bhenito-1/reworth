import { createHmac } from 'crypto';
import { PaystackAdapter } from './paystack.adapter';

const sign = (secret: string, body: string) =>
  createHmac('sha512', secret).update(body).digest('hex');

describe('PaystackAdapter webhook signature', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'r1' } });
  const saved = process.env.PAYSTACK_WEBHOOK_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.PAYSTACK_WEBHOOK_SECRET;
    else process.env.PAYSTACK_WEBHOOK_SECRET = saved;
  });

  it('empty PAYSTACK_WEBHOOK_SECRET falls back to the secret key (what Paystack signs with)', () => {
    process.env.PAYSTACK_WEBHOOK_SECRET = '';
    const psp = new PaystackAdapter('sk_test_abc', '');
    expect(psp.verifyWebhookSignature(body, sign('sk_test_abc', body))).toBe(true);
    expect(psp.verifyWebhookSignature(body, sign('', body))).toBe(false);
  });

  it('uses an explicit webhook secret when one is set', () => {
    const psp = new PaystackAdapter('sk_test_abc', 'whsec_1');
    expect(psp.verifyWebhookSignature(body, sign('whsec_1', body))).toBe(true);
    expect(psp.verifyWebhookSignature(body, sign('sk_test_abc', body))).toBe(false);
  });

  it('rejects a wrong or missing signature', () => {
    const psp = new PaystackAdapter('sk_test_abc');
    expect(psp.verifyWebhookSignature(body, 'nope')).toBe(false);
    expect(psp.verifyWebhookSignature(body, '')).toBe(false);
  });
});
