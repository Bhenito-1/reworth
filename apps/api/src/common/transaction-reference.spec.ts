import {
  newOrderReference,
  newPaymentReference,
} from './transaction-reference';

describe('transaction-reference', () => {
  it('generates prefixed order references', () => {
    const ref = newOrderReference();
    expect(ref).toMatch(/^RW-ORD-[A-Z0-9]{8,12}$/);
  });

  it('generates prefixed payment references', () => {
    const ref = newPaymentReference();
    expect(ref).toMatch(/^RW-PAY-[A-Z0-9]{8,12}$/);
  });

  it('generates distinct values', () => {
    const set = new Set(Array.from({ length: 20 }, () => newOrderReference()));
    expect(set.size).toBe(20);
  });
});
