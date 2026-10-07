import { ConflictException } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';

const TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'LIVE', 'REMOVED', 'REJECTED'],
  UNDER_REVIEW: ['LIVE', 'REJECTED', 'REMOVED'],
  LIVE: ['RESERVED', 'SOLD', 'EXPIRED', 'REMOVED', 'UNDER_REVIEW'],
  RESERVED: ['LIVE', 'SOLD', 'REMOVED'],
  SOLD: [],
  EXPIRED: ['DRAFT', 'REMOVED'],
  REMOVED: ['LIVE', 'REJECTED'],
  REJECTED: ['DRAFT', 'REMOVED', 'UNDER_REVIEW', 'LIVE'],
};

export class ListingStateMachine {
  static canTransition(from: ListingStatus, to: ListingStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: ListingStatus, to: ListingStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException(
        `Invalid listing status transition: ${from} → ${to}`,
      );
    }
  }

  static allowedFrom(from: ListingStatus): ListingStatus[] {
    return [...(TRANSITIONS[from] ?? [])];
  }
}
