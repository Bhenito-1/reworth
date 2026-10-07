import { ConfigService } from '@nestjs/config';
import { RoboflowService } from './roboflow.service';
import { VisionService } from './vision.service';
import type { VisionHttp } from './vision.types';

const API_KEY = 'rf-test-key-do-not-leak';
const WORKFLOW =
  'https://serverless.roboflow.com/infer/workflows/reworth-pm12p/reworth-image-title-check-1790810818816';

const listing = {
  listingId: 'listing-1',
  title: 'Image of sunglasses',
  description: 'Dark sunglasses',
  images: [{ key: 'uploads/sunglasses.jpg', base64: 'aGVsbG8=' }],
};

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as Response;
}

function setup(opts?: { key?: string; http?: jest.Mock }) {
  const key = opts && 'key' in opts ? opts.key : API_KEY;
  const http = opts?.http ?? jest.fn();
  const config = configWith({
    ROBOFLOW_API_KEY: key,
    ROBOFLOW_WORKSPACE: 'reworth-pm12p',
    ROBOFLOW_WORKFLOW_ID: 'reworth-image-title-check-1790810818816',
  });
  const roboflow = new RoboflowService(config, http as VisionHttp);
  const vision = new VisionService(roboflow, config);
  return { vision, http };
}

describe('VisionService image-title check', () => {
  it('returns a confident title match', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'match',
            needs_review: false,
            confidence: 0.91,
            reason: 'The image shows sunglasses.',
            model_answer:
              '{"decision":"match","match_score":0.91,"reason":"sunglasses on a table"}',
            predictions: [{ class: 'sunglasses', confidence: 0.88 }],
          },
        ],
      }),
    );

    const result = await vision.analyzeListing(listing);

    expect(result.status).toBe('ok');
    expect(result.match).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.decision).toBe('match');
    expect(result.confidence).toBe(0.91);
    expect(result.labels).toContain('sunglasses');
    expect(result.signals).toEqual(['VISION_TITLE_MATCH']);
    expect(result).not.toHaveProperty('reject');
    expect(result).not.toHaveProperty('outcome');

    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WORKFLOW);
    expect(url).not.toContain(API_KEY);
    const body = JSON.parse(String(init.body)) as {
      api_key: string;
      inputs: {
        title: string;
        description: string;
        image: { type: string; value: string };
      };
    };
    expect(body.api_key).toBe(API_KEY);
    expect(body.inputs.title).toBe('Image of sunglasses');
    expect(body.inputs.description).toBe('Dark sunglasses');
    expect(body.inputs.image).toEqual({ type: 'base64', value: 'aGVsbG8=' });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('treats an image-title mismatch as review evidence, not a reject decision', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'mismatch',
            needs_review: true,
            reject: true,
            confidence: 0.08,
            reason: 'The image shows books and globes, not sunglasses.',
          },
        ],
      }),
    );

    const result = await vision.analyzeListing(listing);

    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('mismatch');
    expect(result.status).toBe('ok');
    expect(result.signals).toEqual(
      expect.arrayContaining(['VISION_TITLE_MISMATCH', 'VISION_NEEDS_REVIEW']),
    );
    expect(result.signals).not.toContain('VISION_TITLE_MATCH');
    expect(result).not.toHaveProperty('reject');
    expect(result).not.toHaveProperty('outcome');
    expect(result.evidence[0]?.providerReject).toBe(true);
    expect(result.reason).toContain('books and globes');
  });

  it('keeps needs_review when the workflow asks for review on a confident match', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'match',
            needs_review: true,
            confidence: 0.93,
            reason: 'Sunglasses are visible, but the crop is tight.',
          },
        ],
      }),
    );

    const result = await vision.analyzeListing(listing);

    expect(result.match).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('match');
    expect(result.signals).toEqual(
      expect.arrayContaining(['VISION_TITLE_MATCH', 'VISION_NEEDS_REVIEW']),
    );
  });

  it('routes uncertain and low-confidence results to review', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'uncertain',
            needs_review: true,
            confidence: 0.22,
            reason: 'The object is partly hidden, so the title cannot be confirmed.',
          },
        ],
      }),
    );

    const result = await vision.analyzeListing(listing);

    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('uncertain');
    expect(result.lowConfidence).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining([
        'VISION_UNCERTAIN',
        'VISION_LOW_CONFIDENCE',
        'VISION_NEEDS_REVIEW',
      ]),
    );
  });

  it('does not treat a low-confidence match as a confirmed match', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'match',
            needs_review: false,
            confidence: 0.31,
            reason: 'A small object might be sunglasses.',
          },
        ],
      }),
    );

    const result = await vision.analyzeListing(listing);

    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('uncertain');
    expect(result.evidence[0]?.modelDecision).toBe('match');
    expect(result.signals).toContain('VISION_LOW_CONFIDENCE');
    expect(result.signals).not.toContain('VISION_TITLE_MATCH');
  });

  it('returns a review signal when Roboflow is unavailable', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(jsonResponse(503, { message: 'upstream down' }));

    const result = await vision.analyzeListing(listing);

    expect(result.status).toBe('error');
    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('unavailable');
    expect(result.error).toEqual({
      code: 'UNAVAILABLE',
      message: 'Roboflow image-title check is unavailable',
    });
    expect(result.signals).toEqual(
      expect.arrayContaining([
        'VISION_CHECK_FAILED:UNAVAILABLE',
        'VISION_NEEDS_REVIEW',
      ]),
    );
  });

  it('returns a review signal on timeout and rate limit', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const { vision, http } = setup();
    http.mockRejectedValueOnce(timeout);

    const timedOut = await vision.analyzeListing(listing);
    expect(timedOut.error?.code).toBe('TIMEOUT');
    expect(timedOut.needsReview).toBe(true);
    expect(timedOut.match).toBe(false);

    http.mockResolvedValueOnce(jsonResponse(429, { message: 'slow down' }));
    const limited = await vision.analyzeListing(listing);
    expect(limited.error?.code).toBe('RATE_LIMIT');
    expect(limited.needsReview).toBe(true);
    expect(limited.match).toBe(false);
  });

  it('returns a review signal for a malformed Roboflow response', async () => {
    const { vision, http } = setup();
    http.mockResolvedValueOnce(jsonResponse(200, 'not-json'));
    const notJson = await vision.analyzeListing(listing);
    expect(notJson.error?.code).toBe('MALFORMED_RESPONSE');
    expect(notJson.needsReview).toBe(true);
    expect(notJson.match).toBe(false);

    http.mockResolvedValueOnce(
      jsonResponse(200, { outputs: [{ decision: 'not-a-decision' }] }),
    );
    const badDecision = await vision.analyzeListing(listing);
    expect(badDecision.error?.code).toBe('MALFORMED_RESPONSE');
    expect(badDecision.needsReview).toBe(true);
    expect(badDecision.match).toBe(false);
  });

  it('returns a review signal when the API key is not configured', async () => {
    const { vision, http } = setup({ key: undefined });

    const result = await vision.analyzeListing(listing);

    expect(http).not.toHaveBeenCalled();
    expect(result.status).toBe('error');
    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.error).toEqual({
      code: 'MISSING_CONFIG',
      message: 'ROBOFLOW_API_KEY is not configured',
    });
    expect(JSON.stringify(result)).not.toContain('api_key');
  });

  it('returns a review signal for an unreadable image without calling Roboflow', async () => {
    const { vision, http } = setup();

    const result = await vision.analyzeListing({
      ...listing,
      images: [{ key: 'uploads/missing.jpg' }],
    });

    expect(http).not.toHaveBeenCalled();
    expect(result.error?.code).toBe('INVALID_IMAGE');
    expect(result.needsReview).toBe(true);
    expect(result.match).toBe(false);
  });

  it('strips the API key if Roboflow echoes it in the result', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'match',
            needs_review: false,
            confidence: 0.95,
            reason: `matched ${API_KEY}`,
          },
        ],
      }),
    );

    const result = await vision.analyzeListing(listing);

    expect(result.reason).toContain('matched [redacted]');
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('keeps a strong title match when the description does not match', async () => {
    const { vision, http } = setup();
    http
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'match',
              needs_review: false,
              confidence: 0.93,
              reason: 'The image shows sunglasses.',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'mismatch',
              needs_review: true,
              confidence: 0.11,
              reason: 'The image shows sunglasses, not a blue leather sofa.',
            },
          ],
        }),
      );

    const result = await vision.analyzeListing({
      ...listing,
      title: 'Image of sunglasses',
      description: 'Blue leather sofa with two seat cushions',
    });

    expect(http).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      String((http.mock.calls[1] as [string, RequestInit])[1].body),
    ) as { inputs: { title: string; description: string } };
    expect(secondBody.inputs.title).toBe('Blue leather sofa with two seat cushions');
    expect(result.match).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.decision).toBe('match');
    expect(result.confidence).toBe(0.65);
    expect(result.signals).toContain('VISION_TITLE_MATCH');
    expect(result.signals).toContain('VISION_DESCRIPTION_MISMATCH');
    expect(result.signals).not.toContain('VISION_NEEDS_REVIEW');
    expect(result.reason).toContain('blue leather sofa');
  });

  it('lets description attributes pull a weaker title match into review', async () => {
    const { vision, http } = setup();
    http
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'match',
              needs_review: false,
              confidence: 0.55,
              reason: 'The image may show sunglasses.',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'mismatch',
              needs_review: true,
              confidence: 0.1,
              reason: 'The described color and material are not visible.',
            },
          ],
        }),
      );

    const result = await vision.analyzeListing({
      ...listing,
      description: 'Blue leather sunglasses',
    });

    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('uncertain');
    expect(result.confidence).toBe(0.39);
    expect(result.signals).toContain('VISION_DESCRIPTION_MISMATCH');
    expect(result.signals).not.toContain('VISION_TITLE_MISMATCH');
  });

  it('does not let a matching description override a title mismatch', async () => {
    const { vision, http } = setup();
    http
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'mismatch',
              reject: true,
              confidence: 0.9,
              reason: 'The image shows books, not sunglasses.',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'match',
              needs_review: false,
              confidence: 0.95,
              reason: 'The description matches the books in the image.',
            },
          ],
        }),
      );

    const result = await vision.analyzeListing({
      ...listing,
      description: 'Stack of books on a desk',
    });

    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.decision).toBe('mismatch');
    expect(result.confidence).toBeLessThanOrEqual(0.2);
    expect(result.signals).toContain('VISION_TITLE_MISMATCH');
  });

  it('does not run a second check when the description repeats the title', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            decision: 'match',
            needs_review: false,
            confidence: 0.9,
            reason: 'The image shows sunglasses.',
          },
        ],
      }),
    );

    const result = await vision.analyzeListing({
      ...listing,
      title: 'Sunglasses',
      description: '  sunglasses  ',
    });

    expect(http).toHaveBeenCalledTimes(1);
    expect(result.match).toBe(true);
    expect(result.needsReview).toBe(false);
  });

  it('treats a description attribute mismatch from the workflow as review evidence', async () => {
    const { vision, http } = setup();
    http.mockResolvedValue(
      jsonResponse(200, {
        outputs: [
          {
            confidence: 0.72,
            needs_review: false,
            primary_item_match: {
              expected: 'sunglasses',
              observed: 'sunglasses',
              match: 'match',
              confidence: 0.94,
            },
            attribute_matches: [
              {
                name: 'color',
                expected: 'blue',
                observed: 'black',
                status: 'mismatch',
                confidence: 0.9,
              },
            ],
            detected_items: [{ label: 'sunglasses', confidence: 0.94 }],
            reason: 'Sunglasses are visible, but they are black rather than blue.',
          },
        ],
      }),
    );

    const result = await vision.analyzeListing({
      ...listing,
      description: 'Blue sunglasses',
    });

    expect(http).toHaveBeenCalledTimes(1);
    expect(result.match).toBe(true);
    expect(result.needsReview).toBe(false);
    expect(result.decision).toBe('match');
    expect(result.confidence).toBe(0.72);
    expect(result.labels).toContain('sunglasses');
    expect(result.signals).toContain('VISION_TITLE_MATCH');
    expect(result.signals).toContain('VISION_DESCRIPTION_MISMATCH');
    expect(result.signals).not.toContain('VISION_NEEDS_REVIEW');
    expect(result.evidence[0]?.attributes?.[0]?.status).toBe('mismatch');
  });

  it('does not approve when the description check fails', async () => {
    const { vision, http } = setup();
    http
      .mockResolvedValueOnce(
        jsonResponse(200, {
          outputs: [
            {
              decision: 'match',
              needs_review: false,
              confidence: 0.9,
              reason: 'The image shows sunglasses.',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(503, { message: 'upstream down' }));

    const result = await vision.analyzeListing(listing);

    expect(result.match).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('UNAVAILABLE');
  });
});
