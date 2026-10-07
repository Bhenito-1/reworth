/**
 * Canonical ReWorth brand image sources (Expo Metro requires static paths).
 */
export const brandAssets = {
  // Logos
  logo: require("../assets/brand/logos/reworth-logo-primary.png"),
  logoMark: require("../assets/brand/logos/reworth-logo.png"),
  logoDark: require("../assets/brand/logos/reworth-logo-dark.png"),

  // App / action icons
  favicon: require("../assets/brand/icons/favicon.png"),
  appIcon: require("../assets/brand/icons/app-icon.png"),
  actionBuy: require("../assets/brand/icons/action-buy.png"),
  actionSell: require("../assets/brand/icons/action-sell.png"),
  actionChat: require("../assets/brand/icons/action-chat.png"),
  actionOffer: require("../assets/brand/icons/action-make-offer.png"),
  actionDelivery: require("../assets/brand/icons/action-delivery.png"),
  actionSave: require("../assets/brand/icons/action-save.png"),
  actionShare: require("../assets/brand/icons/action-share.png"),
  actionGive: require("../assets/brand/icons/action-give.png"),
  actionLocation: require("../assets/brand/icons/action-location.png"),

  // Categories
  catAppliances: require("../assets/brand/categories/appliances.png"),
  catBabyKids: require("../assets/brand/categories/baby-kids.png"),
  catElectronics: require("../assets/brand/categories/electronics.png"),
  catFashion: require("../assets/brand/categories/fashion.png"),
  catFurniture: require("../assets/brand/categories/furniture.png"),
  catHomeLiving: require("../assets/brand/categories/home-living.png"),
  catLuxury: require("../assets/brand/categories/luxury.png"),
  catOthers: require("../assets/brand/categories/others.png"),
  catPhones: require("../assets/brand/categories/phones.png"),
  catSports: require("../assets/brand/categories/sports.png"),
  catVehicles: require("../assets/brand/categories/vehicles.png"),

  // Community types
  communityAlumni: require("../assets/brand/categories/community-alumni.png"),
  communityChurch: require("../assets/brand/categories/community-church.png"),
  communityNeighbourhood: require("../assets/brand/categories/community-neighbourhood.png"),
  communityOffice: require("../assets/brand/categories/community-office.png"),
  communityPrivateGroup: require("../assets/brand/categories/community-private-group.png"),
  communityCorporate: require("../assets/brand/categories/community-corporate.png"),

  // Trust
  verified: require("../assets/brand/badges/verified.png"),
  verifiedSeller: require("../assets/brand/trust/verified-seller.png"),
  trustBuyerProtection: require("../assets/brand/trust/buyer-protection.png"),
  trustIdentityChecked: require("../assets/brand/trust/identity-checked.png"),
  trustSafeMeetup: require("../assets/brand/trust/safe-meetup.png"),
  trustSecurePayment: require("../assets/brand/trust/secure-payment.png"),
  trustTrustedDelivery: require("../assets/brand/trust/trusted-delivery.png"),

  // Condition badges
  conditionFair: require("../assets/brand/badges/condition-fair.png"),
  conditionGood: require("../assets/brand/badges/condition-good.png"),
  conditionLikeNew: require("../assets/brand/badges/condition-like-new.png"),
  conditionNew: require("../assets/brand/badges/condition-new.png"),
  conditionUsed: require("../assets/brand/badges/condition-used.png"),

  // Order / offer status
  statusCompleted: require("../assets/brand/badges/status-completed.png"),
  statusDelivered: require("../assets/brand/badges/status-delivered.png"),
  statusDisputed: require("../assets/brand/badges/status-disputed.png"),
  statusInDelivery: require("../assets/brand/badges/status-in-delivery.png"),
  statusOfferAccepted: require("../assets/brand/badges/status-offer-accepted.png"),
  statusOfferSent: require("../assets/brand/badges/status-offer-sent.png"),
  statusPaid: require("../assets/brand/badges/status-paid.png"),
  statusPaymentPending: require("../assets/brand/badges/status-payment-pending.png"),
  statusReadyForPickup: require("../assets/brand/badges/status-ready-for-pickup.png"),

  // Empty / onboarding / social
  emptyListings: require("../assets/brand/empty-states/no-listings-yet.png"),
  emptyMessages: require("../assets/brand/empty-states/no-messages.png"),
  emptyOffers: require("../assets/brand/empty-states/no-offers.png"),
  emptySaved: require("../assets/brand/empty-states/no-saved-items.png"),
  emptySearch: require("../assets/brand/empty-states/no-search-results.png"),
  onboarding: require("../assets/brand/onboarding/login-illustration.png"),
  movingSale: require("../assets/brand/social/moving-sale.png"),
  splash: require("../assets/brand/social/splash-logo-centred.png"),
  splashWide: require("../assets/brand/social/splash.png"),
  landingPage: require("../assets/brand/landing-page.png"),
  invite: require("../assets/brand/social/invite-someone.png"),
  listingPlaceholder: require("../assets/brand/illustrations/listing-placeholder.png"),
  profileAvatar: require("../assets/brand/social/profile-image.png"),
} as const;

export type EmptyIllustration =
  | "listings"
  | "messages"
  | "offers"
  | "saved"
  | "search"
  | "generic";

export function emptyIllustrationSource(kind: EmptyIllustration) {
  switch (kind) {
    case "listings":
      return brandAssets.emptyListings;
    case "messages":
      return brandAssets.emptyMessages;
    case "offers":
      return brandAssets.emptyOffers;
    case "saved":
      return brandAssets.emptySaved;
    case "search":
      return brandAssets.emptySearch;
    default:
      return brandAssets.onboarding;
  }
}

/** Home / Discover category chip map */
export const HOME_CATEGORIES: {
  label: string;
  icon: keyof typeof brandAssets;
}[] = [
  { label: "Home", icon: "catHomeLiving" },
  { label: "Electronics", icon: "catElectronics" },
  { label: "Phones", icon: "catPhones" },
  { label: "Fashion", icon: "catFashion" },
  { label: "Kids", icon: "catBabyKids" },
  { label: "Sports", icon: "catSports" },
  { label: "Furniture", icon: "catFurniture" },
  { label: "Appliances", icon: "catAppliances" },
  { label: "Vehicles", icon: "catVehicles" },
  { label: "Luxury", icon: "catLuxury" },
  { label: "Other", icon: "catOthers" },
];

export function conditionBadgeSource(condition: string) {
  switch (condition.toUpperCase()) {
    case "LIKE_NEW":
    case "LIKE NEW":
      return brandAssets.conditionLikeNew;
    case "NEW":
      return brandAssets.conditionNew;
    case "VERY_GOOD":
    case "GOOD":
      return brandAssets.conditionGood;
    case "FAIR":
      return brandAssets.conditionFair;
    case "USED":
    case "FOR_PARTS":
      return brandAssets.conditionUsed;
    default:
      return brandAssets.conditionGood;
  }
}

/** Order / offer pipeline status → brand badge art */
export function orderStatusBadgeSource(status: string) {
  switch (status.toUpperCase()) {
    case "PENDING_PAYMENT":
    case "AWAITING_PAYMENT":
    case "PAYMENT_PENDING":
      return brandAssets.statusPaymentPending;
    case "PAID":
    case "PAYMENT_RECEIVED":
      return brandAssets.statusPaid;
    case "READY_FOR_PICKUP":
    case "READY_PICKUP":
      return brandAssets.statusReadyForPickup;
    case "IN_DELIVERY":
    case "OUT_FOR_DELIVERY":
    case "SHIPPED":
      return brandAssets.statusInDelivery;
    case "DELIVERED":
    case "HANDED_OVER":
      return brandAssets.statusDelivered;
    case "COMPLETED":
    case "CLOSED":
      return brandAssets.statusCompleted;
    case "DISPUTED":
    case "IN_DISPUTE":
    case "DISPUTE_HOLD":
    case "OPENED":
    case "AWAITING_SELLER":
      return brandAssets.statusDisputed;
    case "OFFER_SENT":
    case "PENDING":
      return brandAssets.statusOfferSent;
    case "OFFER_ACCEPTED":
    case "ACCEPTED":
      return brandAssets.statusOfferAccepted;
    default:
      return brandAssets.statusOfferSent;
  }
}
