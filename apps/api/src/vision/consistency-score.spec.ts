import { consistencyScore } from './consistency-score';

describe('consistencyScore', () => {
  it('gives the title 70% and description attributes 30%', () => {
    const scored = consistencyScore({
      titleDecision: 'match',
      titleConfidence: 1,
      attributeStatuses: ['mismatch'],
    });
    expect(scored.score).toBe(0.7);
    expect(scored.needsReview).toBe(false);
  });

  it('lets matching attributes raise a title match without exceeding it', () => {
    const scored = consistencyScore({
      titleDecision: 'match',
      titleConfidence: 0.8,
      attributeStatuses: ['match', 'match'],
    });
    expect(scored.score).toBe(0.86);
    expect(scored.needsReview).toBe(false);
  });

  it('sends the listing to review when attributes pull a weaker title below 0.50', () => {
    const scored = consistencyScore({
      titleDecision: 'match',
      titleConfidence: 0.55,
      attributeStatuses: ['mismatch', 'mismatch'],
    });
    expect(scored.score).toBe(0.39);
    expect(scored.needsReview).toBe(true);
  });

  it('does not let attributes rescue a title mismatch', () => {
    const scored = consistencyScore({
      titleDecision: 'mismatch',
      titleConfidence: 0.9,
      attributeStatuses: ['match', 'match'],
    });
    expect(scored.score).toBeLessThanOrEqual(0.2);
    expect(scored.needsReview).toBe(true);
  });

  it('treats an unknown attribute as partial support', () => {
    const scored = consistencyScore({
      titleDecision: 'match',
      titleConfidence: 1,
      attributeStatuses: ['unknown'],
    });
    expect(scored.score).toBe(0.94);
    expect(scored.needsReview).toBe(false);
  });
});
