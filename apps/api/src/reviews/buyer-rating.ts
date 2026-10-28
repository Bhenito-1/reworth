/**
 * One buyer score per order.
 * Several different items in one checkout are separate orders, so each counts.
 * A quantity of the same item bought together is one order and one score.
 * The same item ordered again later is a new order and a new score.
 */
export type BuyerRatingInput = {
  buyerId: string;
  orderId: string;
  checkoutId?: string | null;
  score: number;
};

export function aggregateBuyerRatings(rows: BuyerRatingInput[]): {
  average: number | null;
  count: number;
} {
  const byOrder = new Map<string, number[]>();
  for (const row of rows) {
    const scores = byOrder.get(row.orderId) ?? [];
    scores.push(row.score);
    byOrder.set(row.orderId, scores);
  }

  const units = [...byOrder.values()].map(
    (scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
  if (units.length === 0) return { average: null, count: 0 };

  const average =
    Math.round(
      (units.reduce((sum, score) => sum + score, 0) / units.length) * 10,
    ) / 10;
  return { average, count: units.length };
}
