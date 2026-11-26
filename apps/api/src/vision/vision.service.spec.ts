import { VisionService, disabledVisionResult } from './vision.service';

describe('VisionService', () => {
  const vision = new VisionService();

  it('returns a neutral result without external image-title checks', async () => {
    const result = await vision.analyzeListing({
      listingId: 'l1',
      title: 'Sunglasses',
      description: 'Used once',
      images: [{ key: 'uploads/a.jpg' }],
    });
    expect(result).toEqual(disabledVisionResult());
    expect(result.needsReview).toBe(false);
    expect(result.match).toBe(true);
  });
});