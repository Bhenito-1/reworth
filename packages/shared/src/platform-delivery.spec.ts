import {
  isPlatformDeliveryCheckoutAllowed,
  PLATFORM_DELIVERY_CHECKOUT_ENABLED,
} from "./platform-delivery.js";

describe("platform delivery checkout", () => {
  it("blocks DELIVERY when checkout is disabled", () => {
    expect(PLATFORM_DELIVERY_CHECKOUT_ENABLED).toBe(false);
    expect(isPlatformDeliveryCheckoutAllowed("DELIVERY")).toBe(false);
    expect(isPlatformDeliveryCheckoutAllowed("MEET_POINT")).toBe(true);
    expect(isPlatformDeliveryCheckoutAllowed("PICKUP")).toBe(true);
  });
});