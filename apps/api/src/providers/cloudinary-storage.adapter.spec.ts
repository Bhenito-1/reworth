import { CloudinaryStorageAdapter } from './cloudinary-storage.adapter';

describe('CloudinaryStorageAdapter', () => {
  const originalFetch = global.fetch;
  let storage: CloudinaryStorageAdapter;

  beforeEach(() => {
    storage = new CloudinaryStorageAdapter({
      cloudName: 'reworth-test',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      apiBase: 'https://api.reworth.test',
      uploadSigningSecret: 'test-upload-secret',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uploads through Cloudinary using server credentials and keeps the storage key stable', async () => {
    const fetchMock = jest.fn(
      async (
        _url: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) =>
        new Response(
          JSON.stringify({
            public_id: 'uploads/user-1/photo-123',
            secure_url:
              'https://res.cloudinary.com/reworth-test/image/upload/v123/uploads/user-1/photo-123.jpg',
          }),
          { status: 200 },
        ),
    );
    global.fetch = fetchMock as typeof fetch;

    const uploaded = await storage.putObject({
      bucket: 'reworth-media',
      key: 'uploads/user-1/photo-123.jpg',
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      contentType: 'image/jpeg',
    });

    expect(uploaded.key).toBe('uploads/user-1/photo-123.jpg');
    expect(uploaded.url).toContain('res.cloudinary.com/reworth-test/');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.cloudinary.com/v1_1/reworth-test/image/upload',
    );
    expect(init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from('test-api-key:test-api-secret').toString('base64')}`,
    });
    const form = init?.body as FormData;
    expect(form.get('public_id')).toBe('uploads/user-1/photo-123');
    expect(form.get('api_key')).toBe('test-api-key');
  });

  it('creates and verifies signed API upload URLs without exposing Cloudinary credentials', async () => {
    const url = await storage.getSignedUrl({
      bucket: 'reworth-media',
      key: 'uploads/user-1/photo-123.jpg',
      method: 'PUT',
      contentType: 'image/jpeg',
      expiresInSeconds: 60,
    });
    const parsed = new URL(url);
    const key = parsed.searchParams.get('key')!;
    const expires = Number(parsed.searchParams.get('expires'));
    const contentType = parsed.searchParams.get('contentType')!;
    const signature = parsed.searchParams.get('signature')!;

    expect(parsed.origin).toBe('https://api.reworth.test');
    expect(parsed.pathname).toBe('/media/upload');
    expect(
      storage.verifyUpload(key, expires, contentType, signature),
    ).toBe(true);
    expect(url).not.toContain('test-api-secret');
  });

  it('returns a Cloudinary delivery URL for stored keys', () => {
    expect(storage.publicUrl('uploads/user-1/photo-123.jpeg')).toBe(
      'https://res.cloudinary.com/reworth-test/image/upload/uploads/user-1/photo-123.jpg',
    );
  });

  it('builds transformed delivery URLs for sized variants', () => {
    expect(
      storage.deliveryUrl(
        'uploads/user-1/photo-123.jpg',
        'w_640,c_limit,f_webp,q_auto',
      ),
    ).toBe(
      'https://res.cloudinary.com/reworth-test/image/upload/w_640,c_limit,f_webp,q_auto/uploads/user-1/photo-123.jpg',
    );
  });
});
