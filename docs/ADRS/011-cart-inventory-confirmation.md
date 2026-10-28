# ADR-011: Cart, unit inventory, and seller confirmation

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Product / Backend

## Context

Buyers need a cart that is not an order. Sellers need to list more than one unit at a per-unit price. Units must be held while an order waits for the seller, returned if it is cancelled or rejected, and counted as sold only after payment. A separate product catalog would duplicate listings.

## Decision

1. Stock lives on `Listing`: `quantityTotal`, `quantityAvailable`, `quantityReserved`, `quantitySold`. `priceKobo` is the price per unit.
2. The marketplace shows a listing only while it is `LIVE` and `quantityAvailable > 0`. At zero available units the listing leaves browse, search, and home. Seller **inventory** (`GET /inventory`) still lists every listing, including sold ones.
3. `CartItem` saves a listing and a quantity. It does not reserve stock and does not create an order. Checkout creates one order per line, because escrow is per seller.
4. A new cash order stays `CREATED` with `confirmationStatus = PENDING`. The ordered units move from available to reserved, and the seller is notified.
5. The seller confirms with a delivery date (and an optional note), which moves the order to `PAYMENT_PENDING` and notifies the buyer. Rejection requires a reason, cancels the order, restores the units, and notifies the buyer.
6. The buyer can cancel before payment. Reserved units return to available and the seller is notified.
7. Successful payment moves reserved units to sold. When nothing remains available or reserved, the listing becomes `SOLD`.
8. Orders that already existed stay `CONFIRMED`, so they can still be paid. Swap and give-away orders are unchanged and settle stock when they complete.
9. A seller removes a listing with `DELETE /listings/:id`, which sets status `REMOVED`. The row is never hard-deleted. Removal is refused when the listing is sold out, units are reserved, or an order, dispute, swap, giveaway claim, checkout hold, or open offer is still active. A sold-out listing stays in inventory and off the marketplace.

## Consequences

- Notifications use the existing `Notification` table with categories `ORDER_PLACED`, `ORDER_CONFIRMED`, `ORDER_REJECTED`, and `ORDER_CANCELLED`.
- Partial sales stay on the marketplace. Only the units just ordered are held.
- Apply migration `20260930190000_cart_inventory`.

## References

- ADR-002 (escrow payments)
