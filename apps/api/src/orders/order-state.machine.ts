import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // CREATED → COMPLETED / DISPUTE_HOLD: pure swap & give-away (no payment)
  CREATED: ['PAYMENT_PENDING', 'CANCELLED', 'COMPLETED', 'DISPUTE_HOLD'],
  PAYMENT_PENDING: ['FUNDED', 'CANCELLED', 'DISPUTE_HOLD'],
  FUNDED: [
    'IN_AUTHENTICATION',
    'SHIPPED',
    'HANDED_OVER',
    'DELIVERED',
    'DISPUTE_HOLD',
    'COMPLETED',
    'CANCELLED',
    'REFUND_REQUESTED',
    'REFUND_ISSUED',
  ],
  IN_AUTHENTICATION: [
    'FUNDED',
    'SHIPPED',
    'HANDED_OVER',
    'CANCELLED',
    'REFUND_REQUESTED',
    'DISPUTE_HOLD',
  ],
  SHIPPED: ['DELIVERED', 'HANDED_OVER', 'RECEIVED', 'DISPUTE_HOLD', 'COMPLETED'],
  HANDED_OVER: ['DELIVERED', 'RECEIVED', 'DISPUTE_HOLD', 'COMPLETED'],
  DELIVERED: ['RECEIVED', 'DISPUTE_HOLD', 'COMPLETED'],
  RECEIVED: ['COMPLETED', 'DISPUTE_HOLD'],
  COMPLETED: ['DISPUTE_HOLD'],
  CANCELLED: [],
  DISPUTE_HOLD: [
    'COMPLETED',
    'REFUND_REQUESTED',
    'REFUND_ISSUED',
    'RECEIVED',
    'DELIVERED',
  ],
  REFUND_REQUESTED: ['REFUND_ISSUED', 'COMPLETED'],
  REFUND_ISSUED: [],
};

export class OrderStateMachine {
  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException(
        `Invalid order status transition: ${from} → ${to}`,
      );
    }
  }

  static allowedFrom(from: OrderStatus): OrderStatus[] {
    return [...(TRANSITIONS[from] ?? [])];
  }
}
