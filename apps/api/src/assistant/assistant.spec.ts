import {
  ASSISTANT_INTENT_FIXTURES,
  MockAssistantProvider,
  parseBudgetKobo,
  routeIntent,
} from './mock-assistant.provider';
import { MUTATION_TOOLS } from './assistant.provider';
import { answerFromHelpDocs } from './help-docs';

describe('Assistant (Phase 3.1)', () => {
  const provider = new MockAssistantProvider();

  it('routes ≥10 of 20 fixture intents correctly', () => {
    let ok = 0;
    for (const fx of ASSISTANT_INTENT_FIXTURES) {
      if (routeIntent(fx.content) === fx.expectedTool) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(10);
    expect(ASSISTANT_INTENT_FIXTURES).toHaveLength(20);
  });

  it('confirm gate: mutations without confirmToken return proposal only', async () => {
    const turn = await provider.routeAndRun({
      sessionId: 'sess-1',
      userId: 'user-1',
      city: 'Lagos',
      content: 'create a listing for my dining table',
    });
    expect(MUTATION_TOOLS.has(turn.toolResult.toolName)).toBe(true);
    expect(turn.toolResult.proposal).toBeDefined();
    expect(turn.toolResult.proposal?.confirmToken).toMatch(/^confirm_/);
    expect(turn.toolResult.payload).toHaveProperty('proposal');
    expect(turn.confirmed).toBe(false);
  });

  it('confirm gate: with confirmToken executes mutation (no proposal)', async () => {
    const first = await provider.routeAndRun({
      sessionId: 'sess-1',
      userId: 'user-1',
      city: 'Lagos',
      content: 'make an offer of 50000 on this item',
    });
    const token = first.toolResult.proposal!.confirmToken;
    const second = await provider.routeAndRun({
      sessionId: 'sess-1',
      userId: 'user-1',
      city: 'Lagos',
      content: 'make an offer of 50000 on this item',
      confirmToken: token,
    });
    expect(second.toolResult.proposal).toBeUndefined();
    expect(second.toolResult.payload.confirmed).toBe(true);
  });

  it('degrade path: provider failure → structured search with degraded=true', async () => {
    const failing = new MockAssistantProvider();
    failing.forceFail = true;
    const turn = await failing.routeAndRun({
      sessionId: 'sess-1',
      userId: 'user-1',
      city: 'Lagos',
      content: 'furnish a one-bed with 1.5 million',
      listingCatalog: [
        {
          id: 'l1',
          title: 'Sofa',
          priceKobo: 100_000_00,
          city: 'Lagos',
          categoryId: 'c1',
        },
      ],
    });
    expect(turn.toolResult.degraded).toBe(true);
    expect(turn.toolResult.toolName).toBe('search');
    expect(turn.toolResult.payload.degraded).toBe(true);
  });

  it('help docs refuse out-of-scope money facts', () => {
    const ans = answerFromHelpDocs('what is the USD exchange rate today?');
    expect(ans.docKey).toBe('out_of_scope');
    expect(ans.grounded).toBe(true);
  });

  it('reads ₦1.5m as 1.5 million naira and filters search words', async () => {
    expect(parseBudgetKobo('Furnish a one-bed in Lekki with ₦1.5m')).toBe(
      150_000_000,
    );
    const turn = await provider.routeAndRun({
      sessionId: 'sess-1',
      userId: 'user-1',
      city: 'Lagos',
      content: 'Find a sofa in Lekki',
      listingCatalog: [
        {
          id: 'sofa',
          title: 'Leather sofa',
          priceKobo: 80_000_00,
          city: 'Lagos',
          categoryId: null,
        },
        {
          id: 'tv',
          title: 'Samsung TV',
          priceKobo: 90_000_00,
          city: 'Lagos',
          categoryId: null,
        },
      ],
    });
    const results = (
      turn.toolResult.payload as { results: { id: string }[] }
    ).results;
    expect(results.map((row) => row.id)).toEqual(['sofa']);
  });
});
