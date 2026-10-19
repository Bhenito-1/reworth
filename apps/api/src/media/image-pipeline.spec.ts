import {
  PipelineValidationError,
  validateImageConstraints,
  MAX_IMAGE_BYTES,
  runImagePipeline,
} from './image-pipeline';

describe('image pipeline validation', () => {
  it('rejects oversize', () => {
    expect(() =>
      validateImageConstraints({
        mime: 'image/jpeg',
        sizeBytes: MAX_IMAGE_BYTES + 1,
      }),
    ).toThrow(PipelineValidationError);
    try {
      validateImageConstraints({
        mime: 'image/jpeg',
        sizeBytes: MAX_IMAGE_BYTES + 1,
      });
    } catch (e) {
      expect((e as PipelineValidationError).code).toBe('OVERSIZE');
    }
  });

  it('rejects wrong MIME', () => {
    expect(() =>
      validateImageConstraints({
        mime: 'application/pdf',
        sizeBytes: 100,
      }),
    ).toThrow(PipelineValidationError);
    try {
      validateImageConstraints({
        mime: 'application/pdf',
        sizeBytes: 100,
      });
    } catch (e) {
      expect((e as PipelineValidationError).code).toBe('MIME');
    }
  });

  it('mock pipeline produces deterministic dHash and variants', async () => {
    const result = await runImagePipeline({
      key: 'uploads/u/photo.jpg',
      body: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      publicUrl: (k) => `http://cdn/${k}`,
      mode: 'mock',
    });
    expect(result.dHash).toHaveLength(16);
    expect(result.exifStripped).toBe(true);
    expect(result.variants.w640?.webp).toBe('http://cdn/uploads/u/photo.jpg');
    expect(result.variants.original).toBe('http://cdn/uploads/u/photo.jpg');
  });

  it('uses Cloudinary delivery transforms when deliveryUrl is provided', async () => {
    const result = await runImagePipeline({
      key: 'uploads/u/photo.jpg',
      body: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      publicUrl: (k) => `https://res.cloudinary.com/demo/image/upload/${k}`,
      deliveryUrl: (k, t) =>
        t
          ? `https://res.cloudinary.com/demo/image/upload/${t}/${k}`
          : `https://res.cloudinary.com/demo/image/upload/${k}`,
      mode: 'mock',
    });
    expect(result.variants.original).toBe(
      'https://res.cloudinary.com/demo/image/upload/uploads/u/photo.jpg',
    );
    expect(result.variants.w640?.webp).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_640,c_limit,f_webp,q_auto/uploads/u/photo.jpg',
    );
    expect(result.variants.w1080?.webp).toContain('w_1080,c_limit,f_webp');
  });
});
