import { ConflictException } from '@nestjs/common';
import { ListingStateMachine } from './listing-state.machine';

describe('ListingStateMachine', () => {
  it('allows DRAFT → LIVE', () => {
    expect(ListingStateMachine.canTransition('DRAFT', 'LIVE')).toBe(true);
  });

  it('allows DRAFT → UNDER_REVIEW', () => {
    expect(ListingStateMachine.canTransition('DRAFT', 'UNDER_REVIEW')).toBe(
      true,
    );
  });

  it('allows DRAFT → REJECTED (moderation)', () => {
    expect(ListingStateMachine.canTransition('DRAFT', 'REJECTED')).toBe(true);
  });

  it('allows REJECTED → UNDER_REVIEW (appeal approved)', () => {
    expect(
      ListingStateMachine.canTransition('REJECTED', 'UNDER_REVIEW'),
    ).toBe(true);
  });

  it('throws ConflictException on invalid transition', () => {
    expect(() =>
      ListingStateMachine.assertTransition('SOLD', 'LIVE'),
    ).toThrow(ConflictException);
  });

  it('rejects LIVE → DRAFT', () => {
    expect(ListingStateMachine.canTransition('LIVE', 'DRAFT')).toBe(false);
  });

  it('allows LIVE → EXPIRED', () => {
    expect(ListingStateMachine.canTransition('LIVE', 'EXPIRED')).toBe(true);
  });

  it('allows a rejected listing to be published again', () => {
    expect(ListingStateMachine.canTransition('REJECTED', 'LIVE')).toBe(true);
    expect(ListingStateMachine.canTransition('REJECTED', 'UNDER_REVIEW')).toBe(
      true,
    );
  });

  it('allows a removed listing back to the marketplace or to rejected', () => {
    expect(ListingStateMachine.canTransition('REMOVED', 'LIVE')).toBe(true);
    expect(ListingStateMachine.canTransition('REMOVED', 'REJECTED')).toBe(true);
  });
});
