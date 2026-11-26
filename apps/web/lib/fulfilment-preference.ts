export type FulfilmentPreference = "DELIVERY" | "MEET_POINT" | "EITHER";

export type SellerFulfilmentChoice = "delivery" | "meetup" | "any";

export function sellerChoiceToPreference(
  choice: SellerFulfilmentChoice,
): FulfilmentPreference {
  switch (choice) {
    case "delivery":
      return "DELIVERY";
    case "meetup":
      return "MEET_POINT";
    case "any":
      return "EITHER";
  }
}

export function preferenceToSellerChoice(
  pref: FulfilmentPreference,
): SellerFulfilmentChoice {
  switch (pref) {
    case "DELIVERY":
      return "delivery";
    case "MEET_POINT":
      return "meetup";
    case "EITHER":
      return "any";
  }
}

export function readFulfilmentPreference(listing: {
  fulfilmentPreference?: FulfilmentPreference | null;
  fulfilmentDelivery?: boolean;
  fulfilmentMeet?: boolean;
}): FulfilmentPreference {
  if (listing.fulfilmentPreference) return listing.fulfilmentPreference;
  const delivery = listing.fulfilmentDelivery !== false;
  const meet = Boolean(listing.fulfilmentMeet);
  if (delivery && !meet) return "DELIVERY";
  if (meet && !delivery) return "MEET_POINT";
  return "EITHER";
}

export function fulfilmentPreferenceLabel(
  pref: FulfilmentPreference,
): string {
  switch (pref) {
    case "DELIVERY":
      return "ReWorth delivery";
    case "MEET_POINT":
      return "Meetup point";
    case "EITHER":
      return "Delivery or meetup";
  }
}

export function defaultCheckoutFulfilment(
  pref: FulfilmentPreference,
): "DELIVERY" | "MEET_POINT" {
  return pref === "MEET_POINT" ? "MEET_POINT" : "DELIVERY";
}