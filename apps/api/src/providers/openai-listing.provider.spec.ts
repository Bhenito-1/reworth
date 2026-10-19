import { OpenAiListingProvider } from '../providers/openai-listing.provider';

describe('OpenAiListingProvider', () => {
  it('parses vision draft JSON from OpenAI response', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Wooden dining table',
                description:
                  'Solid wood dining table for six. Light wear on top. Pickup in Lekki preferred.',
                suggestedCategory: 'Home',
                suggestedCondition: 'GOOD',
                suggestedPriceNaira: 85000,
                suggestedPriceLowNaira: 70000,
                suggestedPriceHighNaira: 100000,
                brand: null,
                model: null,
                tags: ['home', 'furniture', 'lekki'],
              }),
            },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const ai = new OpenAiListingProvider({
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchImpl,
    });

    const draft = await ai.draftListing({
      communityHint: 'Lekki Ph1',
      imageHints: ['dining-table.jpg'],
      imageUrls: ['data:image/jpeg;base64,abc'],
    });

    expect(draft.title).toMatch(/dining table/i);
    expect(draft.suggestedCategory).toBe('Home');
    expect(draft.suggestedPriceNaira).toBe(85000);
    expect(fetchImpl).toHaveBeenCalled();
    const mockFetch = fetchImpl as unknown as jest.Mock;
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image_url' }),
      ]),
    );
  });

  it('falls back to rule-based mock on API failure', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch;

    const ai = new OpenAiListingProvider({
      apiKey: 'test-key',
      fetchImpl,
    });

    const draft = await ai.draftListing({
      imageHints: ['samsung-tv-front.jpg'],
    });

    expect(draft.title).toMatch(/Samsung/i);
    expect(draft.brand).toBe('Samsung');
  });
});
