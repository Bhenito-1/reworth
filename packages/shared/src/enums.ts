export enum ListingStatus {
  Draft = "DRAFT",
  UnderReview = "UNDER_REVIEW",
  Live = "LIVE",
  Reserved = "RESERVED",
  Sold = "SOLD",
  Expired = "EXPIRED",
  Removed = "REMOVED",
  Rejected = "REJECTED",
}

export enum SellingMode {
  Sell = "SELL",
  Swap = "SWAP",
  GiveAway = "GIVE_AWAY",
}

export enum TransactionType {
  Cash = "CASH",
  Swap = "SWAP",
  GiveAway = "GIVEAWAY",
}

export enum SwapProposalStatus {
  Pending = "PENDING",
  Accepted = "ACCEPTED",
  Rejected = "REJECTED",
  Countered = "COUNTERED",
  Withdrawn = "WITHDRAWN",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
  Expired = "EXPIRED",
}

export enum GiveawayClaimStatus {
  Claimed = "CLAIMED",
  Approved = "APPROVED",
  Rejected = "REJECTED",
  Completed = "COMPLETED",
  Expired = "EXPIRED",
}

export enum SwapLegStatus {
  Pending = "PENDING",
  HandedOver = "HANDED_OVER",
  Received = "RECEIVED",
  Failed = "FAILED",
  Returned = "RETURNED",
}

export enum ItemCondition {
  New = "NEW",
  LikeNew = "LIKE_NEW",
  VeryGood = "VERY_GOOD",
  Good = "GOOD",
  Fair = "FAIR",
  ForParts = "FOR_PARTS",
}

export enum VerificationLevel {
  None = "NONE",
  Phone = "PHONE",
  Identity = "IDENTITY",
  Trusted = "TRUSTED",
}

/** Lagos community labels for local discovery. */
export enum CommunityLabel {
  LekkiPh1 = "LEKKI_PH1",
  Ikoyi = "IKOYI",
  VI = "VI",
  Oniru = "ONIRU",
  VGC = "VGC",
  Chevron = "CHEVRON",
  Ajah = "AJAH",
  OtherLagos = "OTHER_LAGOS",
}

export const COMMUNITY_LABEL_DISPLAY: Record<CommunityLabel, string> = {
  [CommunityLabel.LekkiPh1]: "Lekki Ph1",
  [CommunityLabel.Ikoyi]: "Ikoyi",
  [CommunityLabel.VI]: "VI",
  [CommunityLabel.Oniru]: "Oniru",
  [CommunityLabel.VGC]: "VGC",
  [CommunityLabel.Chevron]: "Chevron",
  [CommunityLabel.Ajah]: "Ajah",
  [CommunityLabel.OtherLagos]: "Other Lagos",
};

export enum AdminRole {
  SuperAdmin = "SUPER_ADMIN",
  Moderator = "MODERATOR",
  Support = "SUPPORT",
  Finance = "FINANCE",
  Ops = "OPS",
}

export enum MovingSaleStatus {
  Active = "ACTIVE",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
}

export enum CommunityType {
  Estate = "ESTATE",
  Corporate = "CORPORATE",
  Church = "CHURCH",
  Alumni = "ALUMNI",
  Public = "PUBLIC",
}

export enum CommunityPrivacy {
  Public = "PUBLIC",
  SemiPrivate = "SEMI_PRIVATE",
  Private = "PRIVATE",
}

export enum CommunityMembershipStatus {
  Invited = "INVITED",
  Approved = "APPROVED",
  Member = "MEMBER",
  Suspended = "SUSPENDED",
  Left = "LEFT",
}

export enum OrderStatus {
  Created = "CREATED",
  PaymentPending = "PAYMENT_PENDING",
  Funded = "FUNDED",
  InAuthentication = "IN_AUTHENTICATION",
  Shipped = "SHIPPED",
  HandedOver = "HANDED_OVER",
  Delivered = "DELIVERED",
  Received = "RECEIVED",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
  DisputeHold = "DISPUTE_HOLD",
  RefundRequested = "REFUND_REQUESTED",
  RefundIssued = "REFUND_ISSUED",
}

export enum InspectionStatus {
  Requested = "REQUESTED",
  PaymentPending = "PAYMENT_PENDING",
  Scheduled = "SCHEDULED",
  InProgress = "IN_PROGRESS",
  Completed = "COMPLETED",
  Failed = "FAILED",
  Expired = "EXPIRED",
  Cancelled = "CANCELLED",
}

export enum AuthenticationStatus {
  NotRequired = "NOT_REQUIRED",
  Required = "REQUIRED",
  Pending = "PENDING",
  Passed = "PASSED",
  Failed = "FAILED",
  OptedOut = "OPTED_OUT",
}

export enum LuxuryAuthJobStatus {
  Pending = "PENDING",
  InProgress = "IN_PROGRESS",
  Passed = "PASSED",
  Failed = "FAILED",
  Cancelled = "CANCELLED",
}

export enum ProAccountStatus {
  Applied = "APPLIED",
  Approved = "APPROVED",
  Active = "ACTIVE",
  Grace = "GRACE",
  Suspended = "SUSPENDED",
  Rejected = "REJECTED",
}

export enum BulkUploadStatus {
  Pending = "PENDING",
  Processing = "PROCESSING",
  Completed = "COMPLETED",
  Failed = "FAILED",
}

export enum ReferralRewardStatus {
  Pending = "PENDING",
  Granted = "GRANTED",
  Blocked = "BLOCKED",
  Flagged = "FLAGGED",
}

export enum AssistantMessageRole {
  User = "USER",
  Assistant = "ASSISTANT",
  System = "SYSTEM",
  Tool = "TOOL",
}

export enum RoomScanStatus {
  Uploaded = "UPLOADED",
  Detecting = "DETECTING",
  Ready = "READY",
  DraftsCreated = "DRAFTS_CREATED",
  Failed = "FAILED",
  Cancelled = "CANCELLED",
}

export enum ConsignmentStatus {
  Intake = "INTAKE",
  Listed = "LISTED",
  Sold = "SOLD",
  Returned = "RETURNED",
  Expired = "EXPIRED",
  Cancelled = "CANCELLED",
}

export enum ManagedPickupStatus {
  Booked = "BOOKED",
  Assigned = "ASSIGNED",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
  NoShow = "NO_SHOW",
}

export enum CorporateAccountStatus {
  Applied = "APPLIED",
  Approved = "APPROVED",
  Active = "ACTIVE",
  Suspended = "SUSPENDED",
  Rejected = "REJECTED",
}

export enum RelocationProjectStatus {
  Draft = "DRAFT",
  Intake = "INTAKE",
  Listed = "LISTED",
  InFulfilment = "IN_FULFILMENT",
  Completing = "COMPLETING",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
}

export enum EstatePartnerStatus {
  Applied = "APPLIED",
  Active = "ACTIVE",
  Suspended = "SUSPENDED",
  Revoked = "REVOKED",
}

export enum CircularPartnerKind {
  Charity = "CHARITY",
  Recycler = "RECYCLER",
}

export enum CircularHandoffStatus {
  Scheduled = "SCHEDULED",
  PickedUp = "PICKED_UP",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
}

export enum AssistantToolName {
  Search = "search",
  Bundle = "bundle",
  Valuation = "valuation",
  ListingHelp = "listing_help",
  OrderHelp = "order_help",
  MarketplaceQa = "marketplace_qa",
  CreateListing = "create_listing",
  MakeOffer = "make_offer",
}
