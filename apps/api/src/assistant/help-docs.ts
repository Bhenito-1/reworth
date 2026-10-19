/**
 * Grounded help docs for marketplace_qa / listing_help / order_help.
 * Never invent money facts outside these strings.
 */
export const HELP_DOCS: Record<string, string> = {
  buyer_protection:
    'Buyer Protection holds payment in escrow until you confirm receipt. Fees are shown at checkout before you pay.',
  escrow:
    'ReWorth escrow holds funds until handover is confirmed. Sellers are paid after successful completion.',
  listing_photos:
    'Use clear, well-lit photos of the item from multiple angles. Remove personal data from backgrounds when possible.',
  listing_price:
    'Set a fair price using sold comps on the create-listing screen. You can mark a listing negotiable to accept offers.',
  offers:
    'Buyers can send offers on negotiable listings. Sellers accept, reject, or counter. Accepted offers create an order intent.',
  orders:
    'After payment, orders move FUNDED → handover → completion. Check My Orders for status and meetup details.',
  pickup_meet:
    'Choose pickup or a public meet point in your community. Never share your private address in chat.',
  swap:
    'Swap and Swap+Cash let you trade items. Cash legs use the same escrow as buy orders.',
  disputes:
    'Open a dispute from the order screen if an item is not as described. Support will mediate with both parties.',
  out_of_scope:
    'I can help with ReWorth marketplace topics (listings, orders, escrow, pickup). I cannot give bank rates, investment advice, or invent fee amounts.',
};

export function answerFromHelpDocs(query: string): {
  answer: string;
  grounded: boolean;
  docKey: string | null;
} {
  const q = query.toLowerCase();
  const pairs: Array<[string, RegExp]> = [
    ['buyer_protection', /protect|buyer\s*protect|guarantee/],
    ['escrow', /escrow|hold\s*funds|when.*paid|payout/],
    ['listing_photos', /photo|picture|image|camera/],
    ['listing_price', /price|pricing|how\s*much\s*should|valu/],
    ['offers', /offer|negotiate|counter/],
    ['orders', /order\s*status|my\s*order|track\s*order|handover/],
    ['pickup_meet', /pickup|pick\s*up|meet\s*point|meetup|delivery/],
    ['swap', /swap|trade\s*item|give\s*away/],
    ['disputes', /dispute|not\s*as\s*described|refund\s*request/],
  ];

  for (const [key, re] of pairs) {
    if (re.test(q)) {
      return { answer: HELP_DOCS[key]!, grounded: true, docKey: key };
    }
  }

  // Money-fact fishing without grounded doc → refuse
  if (
    /interest\s*rate|naira\s*to\s*dollar|bank\s*fee|crypto|investment|loan/.test(
      q,
    )
  ) {
    return {
      answer: HELP_DOCS.out_of_scope!,
      grounded: true,
      docKey: 'out_of_scope',
    };
  }

  return {
    answer: HELP_DOCS.out_of_scope!,
    grounded: true,
    docKey: 'out_of_scope',
  };
}
