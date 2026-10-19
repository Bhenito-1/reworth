import {
  buildEscrowSnapshot,
  buildOrderLifecycle,
  orderStatusLabel,
  stageIdFromOrderStatus,
} from './order-lifecycle.js';

describe('order escrow lifecycle', () => {
  it('maps funded → payment_confirmed stage', () => {
    expect(stageIdFromOrderStatus('FUNDED')).toBe('payment_confirmed');
  });

  it('builds happy-path stages for DELIVERED awaiting confirm', () => {
    const stages = buildOrderLifecycle({
      status: 'DELIVERED',
      fulfilmentMethod: 'DELIVERY',
    });
    const current = stages.find((s) => s.state === 'current');
    expect(current?.id).toBe('delivered');
    expect(stages.find((s) => s.id === 'payment_confirmed')?.state).toBe(
      'reached',
    );
    expect(stages.find((s) => s.id === 'completed')?.state).toBe('upcoming');
  });

  it('escrow held while FUNDED with SUCCESS payment', () => {
    const e = buildEscrowSnapshot({
      orderStatus: 'FUNDED',
      paymentStatus: 'SUCCESS',
    });
    expect(e.held).toBe(true);
    expect(e.released).toBe(false);
    expect(e.label).toBe('Held in escrow');
  });

  it('escrow released when COMPLETED', () => {
    const e = buildEscrowSnapshot({
      orderStatus: 'COMPLETED',
      paymentStatus: 'RELEASED',
      payoutStatus: 'RELEASED',
    });
    expect(e.released).toBe(true);
    expect(e.label).toBe('Released to seller');
  });

  it('labels match escrow journey language', () => {
    expect(orderStatusLabel('FUNDED')).toMatch(/escrow/i);
    expect(orderStatusLabel('COMPLETED')).toMatch(/released/i);
  });
});
