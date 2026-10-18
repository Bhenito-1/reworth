import { ConfigService } from '@nestjs/config';
import { PaystackAccountResolveAdapter } from './paystack-account-resolve.adapter';

function config(): ConfigService {
  return {
    get: (key: string) =>
      key === 'PAYSTACK_SECRET_KEY' ? 'sk_live_test' : undefined,
  } as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('PaystackAccountResolveAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the name from GET /bank/resolve without creating a recipient', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        status: true,
        data: { account_name: 'ADA LOVELACE' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new PaystackAccountResolveAdapter(config()).enquire({
      accountNumber: '0123456789',
      institutionCode: '058',
    });

    expect(result).toEqual({ found: true, accountName: 'ADA LOVELACE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('bank_code=058');
    expect(String(fetchMock.mock.calls[0][0])).toContain('currency=NGN');
  });

  it('reads Ecobank and Zenith names from the transfer recipient when resolve fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, {
          status: false,
          message: 'Could not resolve account name. Check parameters or try again.',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, {
          status: false,
          message: 'Could not resolve account name. Check parameters or try again.',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          status: true,
          message: 'Transfer recipient created successfully',
          data: {
            name: 'ReWorth account check',
            details: { account_name: 'CHIOMA NWANKWO' },
          },
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new PaystackAccountResolveAdapter(config()).enquire({
      accountNumber: '2211334455',
      institutionCode: '050',
    });

    expect(result).toEqual({ found: true, accountName: 'CHIOMA NWANKWO' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const recipientCall = fetchMock.mock.calls[2];
    expect(String(recipientCall[0])).toContain('/transferrecipient');
    expect(JSON.parse(recipientCall[1].body as string)).toMatchObject({
      type: 'nuban',
      account_number: '2211334455',
      bank_code: '050',
      currency: 'NGN',
    });
  });

  it('does not create a recipient when Paystack rejects the secret', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(401, { status: false, message: 'Invalid key' }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new PaystackAccountResolveAdapter(config()).enquire({
      accountNumber: '2211334455',
      institutionCode: '057',
    });

    expect(result).toEqual({ found: false, message: 'Invalid key' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
