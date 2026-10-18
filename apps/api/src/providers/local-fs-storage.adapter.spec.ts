import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalFsStorageAdapter } from './local-fs-storage.adapter';

describe('LocalFsStorageAdapter', () => {
  let root: string;
  let storage: LocalFsStorageAdapter;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reworth-media-'));
    storage = new LocalFsStorageAdapter({
      rootDir: root,
      bucket: 'reworth-media',
      publicBase: 'http://localhost:3001/api/v1/media/files',
      apiBase: 'http://localhost:3001/api/v1',
      signingSecret: 'test-secret',
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('puts and gets objects', async () => {
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await storage.putObject({
      bucket: 'reworth-media',
      key: 'uploads/u/a.jpg',
      body,
      contentType: 'image/jpeg',
    });
    const got = await storage.getObject('reworth-media', 'uploads/u/a.jpg');
    expect(got?.equals(body)).toBe(true);
    expect(storage.publicUrl('uploads/u/a.jpg')).toBe(
      'http://localhost:3001/api/v1/media/files/uploads/u/a.jpg',
    );
  });

  it('issues verifiable upload signatures', async () => {
    const url = await storage.getSignedUrl({
      bucket: 'reworth-media',
      key: 'uploads/u/b.jpg',
      method: 'PUT',
      contentType: 'image/jpeg',
      expiresInSeconds: 60,
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/api/v1/media/upload');
    expect(
      storage.verifyUpload(
        u.searchParams.get('key')!,
        Number(u.searchParams.get('expires')),
        u.searchParams.get('contentType') ?? '',
        u.searchParams.get('signature')!,
      ),
    ).toBe(true);
  });
});
