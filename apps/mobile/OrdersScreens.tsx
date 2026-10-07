import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, apiFetch } from "./lib/api";
import { getAccessToken } from "./lib/auth";
import {
  discloseOrderAddress,
  fallbackDeliveryDestination,
  getDeliveryQuote,
  getOrderShipment,
  listMeetPoints,
  setOrderMeetPoint,
  shipmentStatusLabel,
  type DeliveryShipment,
  type MeetPoint,
} from "./lib/delivery";
import { getListing } from "./lib/listings";
import {
  addDisputeEvidence,
  cancelOrder,
  computeOrderTotalKobo,
  computeProtectionFeeKobo,
  confirmReceipt,
  confirmSellerOrder,
  createOrder,
  DISPUTE_REASONS,
  disputeIdFromEvents,
  disputeReasonLabel,
  disputeStatusLabel,
  fulfilmentLabel,
  getDispute,
  getOrder,
  initiatePayment,
  isMockPsp,
  listOrders,
  markHandedOver,
  isCancelledOrder,
  isDeliveredOrder,
  newIdempotencyKey,
  openDispute,
  orderStatusLabel,
  sortMyOrders,
  rejectSellerOrder,
  paymentStatusFromOrder,
  refundStatusFromOrder,
  sellerRespondDispute,
  simulateMockPspCharge,
  type DisputeDto,
  type DisputeReason,
  type FulfilmentMethod,
  type OrderDetail,
  type OrderDto,
  type PaymentDto,
} from "./lib/orders";
import {
  formatNgnFromKobo,
  listingImageUrl,
  type MeResponse,
  type PublicListing,
} from "./lib/types";
import {
  createOrderReview,
  markOrderReviewPending,
  resolveOrderReviewState,
  type CreateReviewBody,
  type OrderReviewUiState,
} from "./lib/trust";

type CheckoutParams = {
  listingId: string;
  offerId?: string;
  orderIntentId?: string;
  quantity?: number;
};

type Props = {
  meId: string | null;
  onOpenOrder?: (orderId: string) => void;
};

type OrderListTab = "selling" | "buying" | "cancelled";

function ordersForTab(
  orders: OrderDto[],
  tab: OrderListTab,
  meId: string | null,
): OrderDto[] {
  if (!meId) return [];
  if (tab === "cancelled") {
    return orders
      .filter(
        (order) =>
          (order.buyerId === meId || order.sellerId === meId) &&
          isCancelledOrder(order),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }
  if (tab === "selling") {
    return orders.filter(
      (order) => order.sellerId === meId && !isCancelledOrder(order),
    );
  }
  return sortMyOrders(
    orders.filter((order) => order.buyerId === meId && !isCancelledOrder(order)),
  );
}

function emptyTitle(tab: OrderListTab): string {
  if (tab === "selling") return "No customer orders";
  if (tab === "cancelled") return "No cancelled orders";
  return "No orders yet";
}

function emptyBody(tab: OrderListTab): string {
  if (tab === "selling") {
    return "When someone orders one of your listings, it shows up here.";
  }
  if (tab === "cancelled") {
    return "Orders you cancel, or that a seller rejects, show up here.";
  }
  return "Ongoing orders are listed first. Delivered orders follow, newest first.";
}

function OrderRoleTabs({
  tab,
  onChange,
}: {
  tab: OrderListTab;
  onChange: (tab: OrderListTab) => void;
}) {
  const items: { id: OrderListTab; label: string }[] = [
    { id: "selling", label: "Customer orders" },
    { id: "buying", label: "My orders" },
    { id: "cancelled", label: "Cancelled" },
  ];
  return (
    <View style={styles.roleTabs}>
      {items.map((item) => {
        const selected = tab === item.id;
        return (
          <Pressable
            key={item.id}
            style={[styles.roleTab, selected && styles.roleTabOn]}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.roleTabText, selected && styles.roleTabTextOn]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function OrdersPanel({ meId, onOpenOrder }: Props) {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [tab, setTab] = useState<OrderListTab>("selling");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setError("Sign in to view orders");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOrders(await listOrders(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#0E9F6E" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.pad}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => void load()}>
          <Text style={styles.secondaryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!orders.length && !loading) {
    return (
      <View style={styles.pad}>
        <Text style={styles.brand}>Orders</Text>
        <OrderRoleTabs tab={tab} onChange={setTab} />
        <Text style={styles.emptyTitle}>{emptyTitle(tab)}</Text>
        <Text style={styles.muted}>{emptyBody(tab)}</Text>
      </View>
    );
  }

  const visible = ordersForTab(orders, tab, meId);
  const sections =
    tab === "buying"
      ? [
          {
            id: "ongoing",
            title: "Ongoing",
            items: visible.filter((order) => !isDeliveredOrder(order)),
          },
          {
            id: "delivered",
            title: "Delivered",
            items: visible.filter((order) => isDeliveredOrder(order)),
          },
        ].filter((section) => section.items.length > 0)
      : [{ id: "all", title: null as string | null, items: visible }];

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.brand}>Orders</Text>
      <OrderRoleTabs tab={tab} onChange={setTab} />
      {visible.length === 0 ? (
        <Text style={styles.muted}>{emptyBody(tab)}</Text>
      ) : null}
      {sections.map((section) => (
        <View key={section.id} style={styles.sectionBlock}>
          {section.title ? (
            <Text style={styles.sectionLabel}>{section.title}</Text>
          ) : null}
          {section.items.map((o) => {
        const role =
          meId === o.buyerId
            ? "Buying"
            : meId === o.sellerId
              ? "Selling"
              : "Order";
        return (
          <Pressable
            key={o.id}
            style={styles.card}
            onPress={() => onOpenOrder?.(o.id)}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>
              {o.listingTitle?.trim() || "Listing"}
            </Text>
            <Text style={styles.muted}>
              {o.quantity && o.quantity > 1 ? `${o.quantity} × ` : ""}
              {formatNgnFromKobo(o.totalKobo)}
            </Text>
            <Text style={styles.muted}>
              {role} · {fulfilmentLabel(String(o.fulfilmentMethod))}
            </Text>
            <Text style={styles.badge}>
              {orderStatusLabel(String(o.status))}
            </Text>
          </Pressable>
        );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

export function CheckoutModal({
  params,
  onClose,
  onPaid,
}: {
  params: CheckoutParams | null;
  onClose: () => void;
  onPaid: (orderId: string) => void;
}) {
  const listingId = params?.listingId ?? null;
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>("MEET_POINT");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [meetPoints, setMeetPoints] = useState<MeetPoint[]>([]);
  const [meetPointId, setMeetPointId] = useState<string | null>(null);
  const [deliveryFeeKobo, setDeliveryFeeKobo] = useState(0);
  const [quoteBusy, setQuoteBusy] = useState(false);

  useEffect(() => {
    if (!listingId) {
      setListing(null);
      setPayment(null);
      setOrderId(null);
      setMeetPoints([]);
      setMeetPointId(null);
      setDeliveryFeeKobo(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPayment(null);
      setOrderId(null);
      setDeliveryFeeKobo(0);
      try {
        const token = await getAccessToken();
        const data = await getListing(listingId, token);
        if (cancelled) return;
        setListing(data);
        setFulfilment(
          data.fulfilmentPickup
            ? "PICKUP"
            : data.fulfilmentMeet
              ? "MEET_POINT"
              : data.fulfilmentDelivery
                ? "DELIVERY"
                : "MEET_POINT",
        );
        if (token && data.fulfilmentMeet !== false) {
          try {
            const points = await listMeetPoints(
              token,
              data.community || undefined,
            );
            if (!cancelled) {
              setMeetPoints(points);
              setMeetPointId(points[0]?.id ?? null);
            }
          } catch {
            if (!cancelled) setMeetPoints([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const quantity = Math.max(1, params?.quantity ?? 1);
  const unitKobo = listing?.priceKobo ?? 0;
  const amountKobo =
    params?.offerId || params?.orderIntentId ? unitKobo : unitKobo * quantity;
  const fee = useMemo(() => computeProtectionFeeKobo(amountKobo), [amountKobo]);
  const total = useMemo(
    () =>
      computeOrderTotalKobo({
        amountKobo,
        protectionFeeKobo: fee,
        deliveryFeeKobo: fulfilment === "DELIVERY" ? deliveryFeeKobo : 0,
      }),
    [amountKobo, fee, fulfilment, deliveryFeeKobo],
  );

  async function placeAndPay() {
    const token = await getAccessToken();
    if (!token || !listingId) return;
    setBusy(true);
    setError(null);
    try {
      const order = await createOrder(token, {
        listingId,
        fulfilmentMethod: fulfilment,
        ...(quantity > 1 ? { quantity } : {}),
        ...(params?.orderIntentId
          ? { orderIntentId: params.orderIntentId }
          : params?.offerId
            ? { offerId: params.offerId }
            : { buyNow: true }),
      });
      setOrderId(order.id);

      if (order.confirmationStatus === "PENDING" || order.status === "CREATED") {
        onPaid(order.id);
        return;
      }

      if (fulfilment === "MEET_POINT" && meetPointId) {
        await setOrderMeetPoint(token, order.id, meetPointId);
      }

      if (fulfilment === "DELIVERY") {
        setQuoteBusy(true);
        const dest = fallbackDeliveryDestination(
          (listing as { geoLat?: number | null })?.geoLat,
          (listing as { geoLng?: number | null })?.geoLng,
        );
        const quote = await getDeliveryQuote(
          token,
          order.id,
          dest.toLat,
          dest.toLng,
        );
        setDeliveryFeeKobo(quote.deliveryFeeKobo ?? quote.feeKobo);
        setQuoteBusy(false);
      }

      const pay = await initiatePayment(token, {
        orderId: order.id,
        idempotencyKey: newIdempotencyKey(),
      });
      setPayment(pay);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
      setQuoteBusy(false);
    }
  }

  async function simulatePay() {
    if (!payment || !orderId) return;
    setSimulating(true);
    try {
      await simulateMockPspCharge({
        reference: payment.reference,
        event: "charge.success",
      });
      onPaid(orderId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Simulate failed");
    } finally {
      setSimulating(false);
    }
  }

  const thumb = listing
    ? listingImageUrl(
        [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder)[0],
      )
    : null;

  return (
    <Modal visible={Boolean(params)} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
          <Text style={styles.brand}>Checkout</Text>
          <View style={{ width: 48 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#0E9F6E" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {listing ? (
              <>
                <Text style={styles.cardTitle}>
                  {listing.title || "Untitled"}
                </Text>
                <Text style={styles.price}>{formatNgnFromKobo(amountKobo)}</Text>

                <View style={styles.protect}>
                  <Text style={styles.protectTitle}>Buyer protection</Text>
                  <Text style={styles.muted}>
                    Funds held until you confirm receipt. Fee covers eligible
                    claims.
                  </Text>
                </View>

                <Text style={styles.section}>Fulfilment</Text>
                <View style={styles.rowWrap}>
                  {(
                    [
                      listing.fulfilmentPickup
                        ? (["PICKUP", "Pickup"] as const)
                        : null,
                      listing.fulfilmentMeet
                        ? (["MEET_POINT", "Meet"] as const)
                        : null,
                      listing.fulfilmentDelivery
                        ? (["DELIVERY", "Delivery"] as const)
                        : null,
                    ].filter(Boolean) as [FulfilmentMethod, string][]
                  )
                    .concat(
                      !listing.fulfilmentPickup &&
                        !listing.fulfilmentMeet &&
                        !listing.fulfilmentDelivery
                        ? [
                            ["PICKUP", "Pickup"],
                            ["MEET_POINT", "Meet"],
                            ["DELIVERY", "Delivery"],
                          ]
                        : [],
                    )
                    .map(([value, label]) => (
                      <Pressable
                        key={value}
                        style={[
                          styles.chip,
                          fulfilment === value && styles.chipOn,
                        ]}
                        onPress={() => setFulfilment(value)}
                        disabled={Boolean(payment)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            fulfilment === value && styles.chipTextOn,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                </View>

                {fulfilment === "MEET_POINT" && meetPoints.length > 0 ? (
                  <>
                    <Text style={styles.section}>Safe meet point</Text>
                    <View style={styles.rowWrap}>
                      {meetPoints.map((p) => (
                        <Pressable
                          key={p.id}
                          style={[
                            styles.chip,
                            meetPointId === p.id && styles.chipOn,
                          ]}
                          onPress={() => setMeetPointId(p.id)}
                          disabled={Boolean(payment)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              meetPointId === p.id && styles.chipTextOn,
                            ]}
                          >
                            {p.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {meetPointId ? (
                      <Text style={styles.muted}>
                        {meetPoints.find((p) => p.id === meetPointId)?.landmark}
                      </Text>
                    ) : null}
                  </>
                ) : null}

                {fulfilment === "DELIVERY" ? (
                  <Text style={styles.muted}>
                    Delivery quote is calculated after you create the order
                    (₦1,500 + ₦150/km). Fee joins the total before payment.
                    {quoteBusy ? " Quoting…" : ""}
                  </Text>
                ) : null}

                <View style={styles.breakdown}>
                  <Row label="Item" value={formatNgnFromKobo(amountKobo)} />
                  <Row label="Protection fee" value={formatNgnFromKobo(fee)} />
                  {fulfilment === "DELIVERY" && deliveryFeeKobo > 0 ? (
                    <Row
                      label="Delivery"
                      value={formatNgnFromKobo(deliveryFeeKobo)}
                    />
                  ) : null}
                  <Row
                    label="Total"
                    value={formatNgnFromKobo(total)}
                    bold
                  />
                </View>

                {!payment ? (
                  <Pressable
                    style={[styles.primaryBtn, busy && styles.disabled]}
                    disabled={busy}
                    onPress={() => void placeAndPay()}
                  >
                    <Text style={styles.primaryBtnText}>
                      {busy ? "Creating…" : "Place order"}
                    </Text>
                  </Pressable>
                ) : (
                  <>
                    <Text style={styles.muted}>
                      Ref: {payment.reference}
                    </Text>
                    {isMockPsp(payment) ? (
                      <Pressable
                        style={[
                          styles.primaryBtn,
                          simulating && styles.disabled,
                        ]}
                        disabled={simulating}
                        onPress={() => void simulatePay()}
                      >
                        <Text style={styles.primaryBtnText}>
                          {simulating ? "Confirming…" : "Simulate pay"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
                {thumb ? (
                  <Text style={[styles.muted, { marginTop: 12 }]}>
                    Item photo loaded
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export function OrderDetailModal({
  orderId,
  meId,
  onClose,
  onOpenDispute,
}: {
  orderId: string | null;
  meId: string | null;
  onClose: () => void;
  onOpenDispute: (disputeId: string) => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [sellerNote, setSellerNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [disputeReason, setDisputeReason] =
    useState<DisputeReason>("NEVER_RECEIVED");
  const [disputeDetail, setDisputeDetail] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [reviewState, setReviewState] = useState<OrderReviewUiState | null>(
    null,
  );
  const [reviewBusy, setReviewBusy] = useState(false);
  const [overall, setOverall] = useState(5);
  const [accuracy, setAccuracy] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [punctuality, setPunctuality] = useState(5);
  const [experience, setExperience] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [shipment, setShipment] = useState<DeliveryShipment | null>(null);
  const [discloseBusy, setDiscloseBusy] = useState(false);
  const [disclosedAddress, setDisclosedAddress] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await getOrder(token, orderId);
      setOrder(detail);
      if (detail.fulfilmentMethod === "DELIVERY") {
        try {
          const ship = await getOrderShipment(token, orderId);
          setShipment(ship);
        } catch {
          setShipment(null);
        }
      } else {
        setShipment(null);
      }
      if (detail.status === "COMPLETED" && meId) {
        const counterpartId =
          meId === detail.buyerId ? detail.sellerId : detail.buyerId;
        const resolved = await resolveOrderReviewState({
          orderId: detail.id,
          meId,
          counterpartId,
        });
        setReviewState(resolved.state);
      } else {
        setReviewState(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Not found");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, meId]);

  useEffect(() => {
    if (orderId) void load();
    else setOrder(null);
  }, [orderId, load]);

  async function run(action: "handed-over" | "confirm" | "cancel") {
    const token = await getAccessToken();
    if (!token || !orderId) return;
    setBusy(true);
    try {
      if (action === "handed-over") await markHandedOver(token, orderId);
      else if (action === "confirm") await confirmReceipt(token, orderId);
      else await cancelOrder(token, orderId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitDispute() {
    const token = await getAccessToken();
    if (!token || !orderId) return;
    setBusy(true);
    try {
      const d = await openDispute(token, orderId, {
        reason: disputeReason,
        detail: disputeDetail.trim() || undefined,
      });
      setShowDispute(false);
      onOpenDispute(d.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dispute failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    const token = await getAccessToken();
    if (!token || !orderId) return;
    setReviewBusy(true);
    const body: CreateReviewBody = {
      overall,
      accuracy,
      communication,
      punctuality,
      transactionExperience: experience,
      body: reviewBody.trim() || undefined,
    };
    try {
      const created = await createOrderReview(token, orderId, body);
      if (created.status === "PUBLISHED") {
        setReviewState("done");
      } else {
        await markOrderReviewPending(orderId);
        setReviewState("waiting");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Could not submit review";
      if (/already reviewed/i.test(msg)) {
        await markOrderReviewPending(orderId);
        setReviewState("waiting");
      } else {
        setError(msg);
      }
    } finally {
      setReviewBusy(false);
    }
  }

  const isBuyer = order && meId === order.buyerId;
  const isSeller = order && meId === order.sellerId;
  const disputeId = order ? disputeIdFromEvents(order.events) : null;

  return (
    <Modal
      visible={Boolean(orderId)}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
          <Text style={styles.brand}>Order</Text>
          <View style={{ width: 48 }} />
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#0E9F6E" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {order ? (
              <>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {order.listingTitle?.trim() || "Listing"}
                </Text>
                <Text style={styles.price}>
                  {formatNgnFromKobo(order.totalKobo)}
                </Text>
                <Text style={styles.badge}>
                  {orderStatusLabel(String(order.status))}
                </Text>
                <Text style={styles.muted}>
                  {isBuyer ? "Buying" : isSeller ? "Selling" : "Order"} ·{" "}
                  {fulfilmentLabel(String(order.fulfilmentMethod))}
                </Text>

                <View style={styles.breakdown}>
                  <Row
                    label="Payment"
                    value={paymentStatusFromOrder(order)}
                  />
                  <Row label="Refund" value={refundStatusFromOrder(order)} />
                  <Row
                    label="Protection fee"
                    value={formatNgnFromKobo(order.protectionFeeKobo)}
                  />
                  {order.deliveryFeeKobo > 0 ? (
                    <Row
                      label="Delivery"
                      value={formatNgnFromKobo(order.deliveryFeeKobo)}
                    />
                  ) : null}
                </View>

                {shipment ? (
                  <View style={styles.protect}>
                    <Text style={styles.protectTitle}>Delivery tracking</Text>
                    <Text style={styles.badge}>
                      {shipmentStatusLabel(shipment.status)}
                    </Text>
                    {shipment.events?.map((e) => (
                      <Text key={e.id} style={styles.muted}>
                        {shipmentStatusLabel(e.status)} ·{" "}
                        {new Date(e.createdAt).toLocaleString()}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {isSeller &&
                order.fulfilmentMethod === "PICKUP" &&
                ["FUNDED", "IN_AUTHENTICATION", "SHIPPED", "HANDED_OVER", "DELIVERED"].includes(String(order.status)) ? (
                  <View style={styles.protect}>
                    <Text style={styles.protectTitle}>Pickup address</Text>
                    <Text style={styles.muted}>
                      Share your exact address only after payment. This cannot
                      be revoked.
                    </Text>
                    {disclosedAddress ? (
                      <Text style={styles.cardTitle}>{disclosedAddress}</Text>
                    ) : (
                      <Pressable
                        style={[styles.secondaryBtn, discloseBusy && styles.disabled]}
                        disabled={discloseBusy}
                        onPress={() =>
                          void (async () => {
                            const token = await getAccessToken();
                            if (!token || !orderId) return;
                            setDiscloseBusy(true);
                            try {
                              const res = await discloseOrderAddress(
                                token,
                                orderId,
                              );
                              setDisclosedAddress(res.addressSnapshot);
                            } catch (err) {
                              setError(
                                err instanceof ApiError
                                  ? err.message
                                  : "Disclose failed",
                              );
                            } finally {
                              setDiscloseBusy(false);
                            }
                          })()
                        }
                      >
                        <Text style={styles.secondaryBtnText}>
                          {discloseBusy ? "…" : "Disclose address to buyer"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}

                {disputeId ? (
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => onOpenDispute(disputeId)}
                  >
                    <Text style={styles.secondaryBtnText}>View dispute</Text>
                  </Pressable>
                ) : null}

                <Text style={styles.section}>Timeline</Text>
                {order.events.map((ev) => (
                  <View key={ev.id} style={styles.event}>
                    <Text style={styles.eventType}>
                      {ev.type.replace(/_/g, " ")}
                    </Text>
                    <Text style={styles.muted}>
                      {new Date(ev.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))}

                <View style={styles.actionsCol}>
                  {isSeller &&
                  order.confirmationStatus === "PENDING" &&
                  order.status === "CREATED" ? (
                    <View style={{ gap: 8 }}>
                      <Text style={styles.section}>Confirm this order</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Delivery date (YYYY-MM-DD)"
                        value={deliveryDate}
                        onChangeText={setDeliveryDate}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Note for the buyer"
                        value={sellerNote}
                        onChangeText={setSellerNote}
                      />
                      <ActionBtn
                        label="Accept order"
                        disabled={busy || deliveryDate.trim().length < 8}
                        onPress={() => {
                          void (async () => {
                            const token = await getAccessToken();
                            if (!token || !orderId) return;
                            setBusy(true);
                            try {
                              await confirmSellerOrder(token, orderId, {
                                deliveryDate: new Date(deliveryDate).toISOString(),
                                sellerNote: sellerNote.trim() || undefined,
                              });
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof ApiError
                                  ? err.message
                                  : "Could not confirm",
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Reason if you reject"
                        value={rejectReason}
                        onChangeText={setRejectReason}
                      />
                      <ActionBtn
                        label="Reject order"
                        disabled={busy || rejectReason.trim().length < 3}
                        onPress={() => {
                          void (async () => {
                            const token = await getAccessToken();
                            if (!token || !orderId) return;
                            setBusy(true);
                            try {
                              await rejectSellerOrder(
                                token,
                                orderId,
                                rejectReason.trim(),
                              );
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof ApiError
                                  ? err.message
                                  : "Could not reject",
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      />
                    </View>
                  ) : null}
                  {order.rejectionReason ? (
                    <Text style={styles.muted}>Rejected: {order.rejectionReason}</Text>
                  ) : null}
                  {isSeller &&
                  ["FUNDED", "IN_AUTHENTICATION"].includes(String(order.status)) ? (
                    <ActionBtn
                      label="Mark handed over"
                      disabled={busy}
                      onPress={() => void run("handed-over")}
                    />
                  ) : null}
                  {isBuyer &&
                  ["HANDED_OVER", "DELIVERED", "SHIPPED"].includes(
                    String(order.status),
                  ) ? (
                    <ActionBtn
                      label="Confirm receipt"
                      disabled={busy}
                      onPress={() => void run("confirm")}
                    />
                  ) : null}
                  {isBuyer && order.status === "PAYMENT_PENDING" ? (
                    <ActionBtn
                      label={busy ? "Starting payment…" : "Complete payment"}
                      disabled={busy}
                      onPress={() => {
                        void (async () => {
                          const token = await getAccessToken();
                          if (!token || !orderId) return;
                          setBusy(true);
                          try {
                            const pay = await initiatePayment(token, {
                              orderId,
                              idempotencyKey: newIdempotencyKey(),
                            });
                            if (isMockPsp(pay)) {
                              await simulateMockPspCharge({
                                reference: pay.reference,
                                event: "charge.success",
                              });
                              await load();
                            }
                          } catch (err) {
                            setError(
                              err instanceof ApiError
                                ? err.message
                                : "Could not start payment",
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    />
                  ) : null}
                  {isBuyer &&
                  (order.status === "CREATED" ||
                    order.status === "PAYMENT_PENDING") ? (
                    <ActionBtn
                      label="Cancel"
                      danger
                      disabled={busy}
                      onPress={() => void run("cancel")}
                    />
                  ) : null}
                  {isBuyer &&
                  (order.status === "RECEIVED" ||
                    order.status === "COMPLETED") &&
                  !disputeId ? (
                    <ActionBtn
                      label="Open dispute"
                      disabled={busy}
                      onPress={() => setShowDispute(true)}
                    />
                  ) : null}
                </View>

                {showDispute ? (
                  <View style={styles.disputeBox}>
                    <Text style={styles.section}>Dispute reason</Text>
                    <View style={styles.rowWrap}>
                      {DISPUTE_REASONS.map((r) => (
                        <Pressable
                          key={r.value}
                          style={[
                            styles.chip,
                            disputeReason === r.value && styles.chipOn,
                          ]}
                          onPress={() => setDisputeReason(r.value)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              disputeReason === r.value && styles.chipTextOn,
                            ]}
                          >
                            {r.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      style={styles.input}
                      value={disputeDetail}
                      onChangeText={setDisputeDetail}
                      placeholder="Details (optional)"
                      multiline
                    />
                    <ActionBtn
                      label={busy ? "Submitting…" : "Submit dispute"}
                      disabled={busy}
                      onPress={() => void submitDispute()}
                    />
                  </View>
                ) : null}

                {order.status === "COMPLETED" ? (
                  <View style={styles.reviewBox}>
                    {reviewState === "form" ? (
                      <>
                        <Text style={styles.section}>Leave a review</Text>
                        <Text style={styles.muted}>
                          Publishes when both sides have rated.
                        </Text>
                        <StarRow
                          label="Overall"
                          value={overall}
                          onChange={setOverall}
                        />
                        <StarRow
                          label="Accuracy"
                          value={accuracy}
                          onChange={setAccuracy}
                        />
                        <StarRow
                          label="Communication"
                          value={communication}
                          onChange={setCommunication}
                        />
                        <StarRow
                          label="Punctuality"
                          value={punctuality}
                          onChange={setPunctuality}
                        />
                        <StarRow
                          label="Experience"
                          value={experience}
                          onChange={setExperience}
                        />
                        <TextInput
                          style={styles.input}
                          value={reviewBody}
                          onChangeText={setReviewBody}
                          placeholder="Comments (optional)"
                          maxLength={500}
                          multiline
                        />
                        <ActionBtn
                          label={
                            reviewBusy ? "Submitting…" : "Submit review"
                          }
                          disabled={reviewBusy}
                          onPress={() => void submitReview()}
                        />
                      </>
                    ) : null}
                    {reviewState === "waiting" ? (
                      <View style={styles.waitCard}>
                        <Text style={styles.waitTitle}>
                          Waiting for other party
                        </Text>
                        <Text style={styles.muted}>
                          Your review is saved. It publishes when they leave
                          theirs.
                        </Text>
                      </View>
                    ) : null}
                    {reviewState === "done" ? (
                      <View style={styles.doneCard}>
                        <Text style={styles.doneTitle}>Review published</Text>
                        <Text style={styles.muted}>
                          Thanks — both sides have rated this order.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export function DisputeModal({
  disputeId,
  meId,
  onClose,
}: {
  disputeId: string | null;
  meId: string | null;
  onClose: () => void;
}) {
  const [dispute, setDispute] = useState<DisputeDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [sellerText, setSellerText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!disputeId) return;
    const token = await getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setDispute(await getDispute(token, disputeId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Not found");
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    if (disputeId) void load();
    else setDispute(null);
  }, [disputeId, load]);

  async function submitEvidence() {
    const token = await getAccessToken();
    if (!token || !disputeId) return;
    if (!evidenceText.trim() && !imageKey.trim()) {
      setError("Add text or image key");
      return;
    }
    setBusy(true);
    try {
      await addDisputeEvidence(token, disputeId, {
        text: evidenceText.trim() || undefined,
        imageKey: imageKey.trim() || undefined,
      });
      setEvidenceText("");
      setImageKey("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSeller() {
    const token = await getAccessToken();
    if (!token || !disputeId || !sellerText.trim()) return;
    setBusy(true);
    try {
      await sellerRespondDispute(token, disputeId, {
        text: sellerText.trim(),
      });
      setSellerText("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const isSeller = dispute && meId === dispute.order?.sellerId;
  const resolved = dispute?.status === "RESOLVED";
  const canSellerRespond =
    isSeller &&
    !resolved &&
    !dispute?.sellerResponse &&
    (dispute?.status === "AWAITING_SELLER" || dispute?.status === "OPENED");

  return (
    <Modal
      visible={Boolean(disputeId)}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Close</Text>
          </Pressable>
          <Text style={styles.brand}>Dispute</Text>
          <View style={{ width: 48 }} />
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#0E9F6E" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.pad}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {dispute ? (
              <>
                <Text style={styles.cardTitle}>
                  {disputeReasonLabel(String(dispute.reason))}
                </Text>
                <Text style={styles.badge}>
                  {disputeStatusLabel(String(dispute.status))}
                </Text>
                {dispute.detail ? (
                  <Text style={styles.muted}>{dispute.detail}</Text>
                ) : null}
                {dispute.sellerResponse ? (
                  <View style={styles.card}>
                    <Text style={styles.section}>Seller response</Text>
                    <Text style={styles.muted}>{dispute.sellerResponse}</Text>
                  </View>
                ) : null}
                {resolved ? (
                  <View style={styles.protect}>
                    <Text style={styles.protectTitle}>Resolution</Text>
                    <Text style={styles.muted}>
                      {String(dispute.resolution ?? "").replace(/_/g, " ")}
                    </Text>
                    {dispute.resolutionNote ? (
                      <Text style={styles.muted}>{dispute.resolutionNote}</Text>
                    ) : null}
                  </View>
                ) : null}

                <Text style={styles.section}>Evidence</Text>
                {(dispute.evidence ?? []).map((ev) => (
                  <View key={ev.id} style={styles.event}>
                    {ev.text ? <Text>{ev.text}</Text> : null}
                    {ev.imageKey ? (
                      <Text style={styles.muted}>key: {ev.imageKey}</Text>
                    ) : null}
                  </View>
                ))}

                {!resolved ? (
                  <View style={styles.disputeBox}>
                    <TextInput
                      style={styles.input}
                      value={evidenceText}
                      onChangeText={setEvidenceText}
                      placeholder="Evidence text"
                      multiline
                    />
                    <TextInput
                      style={styles.input}
                      value={imageKey}
                      onChangeText={setImageKey}
                      placeholder="imageKey (optional)"
                    />
                    <ActionBtn
                      label={busy ? "Saving…" : "Add evidence"}
                      disabled={busy}
                      onPress={() => void submitEvidence()}
                    />
                  </View>
                ) : null}

                {canSellerRespond ? (
                  <View style={styles.disputeBox}>
                    <TextInput
                      style={styles.input}
                      value={sellerText}
                      onChangeText={setSellerText}
                      placeholder="Your response"
                      multiline
                    />
                    <ActionBtn
                      label={busy ? "Sending…" : "Send response"}
                      disabled={busy}
                      onPress={() => void submitSeller()}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={bold ? styles.bold : undefined}>{value}</Text>
    </View>
  );
}

function ActionBtn({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={[
        danger ? styles.dangerBtn : styles.primaryBtn,
        disabled && styles.disabled,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      <Text style={styles.starLabel}>{label}</Text>
      <View style={styles.starBtns}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${n} stars`}
            style={[styles.starBtn, n <= value && styles.starBtnOn]}
          >
            <Text style={styles.starGlyph}>{n <= value ? "★" : "☆"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Prefetch current user id when a parent needs it without Me in scope. */
export async function fetchMeId(): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const me = await apiFetch<MeResponse>("/me", { token });
    return me.id;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "#FAF9F7" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E2DC",
  },
  brand: { fontSize: 18, fontWeight: "700", color: "#1A1A1A" },
  roleTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  sectionBlock: { gap: 16 },
  sectionLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  roleTab: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  roleTabOn: { backgroundColor: "#0E9F6E", borderColor: "#0E9F6E" },
  roleTabText: { fontSize: 13, fontWeight: "700", color: "#111315" },
  roleTabTextOn: { color: "#fff" },
  link: { color: "#0E9F6E", fontWeight: "600", fontSize: 15 },
  pad: { padding: 16, paddingBottom: 40, gap: 10 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#B42318", marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  muted: { color: "#6B7280", fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: "600", color: "#1A1A1A" },
  price: { fontSize: 28, fontWeight: "700", color: "#1A1A1A" },
  badge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#D1FAE5",
    color: "#065F46",
    overflow: "hidden",
    fontSize: 13,
    fontWeight: "600",
  },
  protect: {
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(14,159,110,0.3)",
    padding: 12,
  },
  protectTitle: { fontWeight: "700", color: "#0E9F6E", marginBottom: 4 },
  section: { fontSize: 16, fontWeight: "600", marginTop: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#0E9F6E", borderColor: "#0E9F6E" },
  chipText: { fontSize: 13, color: "#1A1A1A" },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  breakdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bold: { fontWeight: "700", fontSize: 16 },
  primaryBtn: {
    backgroundColor: "#0E9F6E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  dangerBtn: {
    backgroundColor: "#B42318",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
    marginTop: 8,
  },
  secondaryBtnText: { fontWeight: "600", color: "#1A1A1A" },
  disabled: { opacity: 0.5 },
  event: {
    borderLeftWidth: 2,
    borderLeftColor: "#0E9F6E",
    paddingLeft: 10,
    marginBottom: 8,
  },
  eventType: { fontWeight: "600", textTransform: "capitalize" },
  actionsCol: { gap: 4, marginTop: 8 },
  disputeBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#fff",
    gap: 8,
  },
  reviewBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E2DC",
    backgroundColor: "#fff",
    gap: 10,
  },
  waitCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F5EDD0",
    gap: 4,
  },
  waitTitle: { fontWeight: "700", color: "#1A1A1A", fontSize: 16 },
  doneCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#D1FAE5",
    gap: 4,
  },
  doneTitle: { fontWeight: "700", color: "#0E9F6E", fontSize: 16 },
  starRow: { gap: 6 },
  starLabel: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  starBtns: { flexDirection: "row", gap: 6 },
  starBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAF9F7",
  },
  starBtnOn: { backgroundColor: "#F5EDD0" },
  starGlyph: { fontSize: 18, color: "#C9A227" },
  input: {
    borderWidth: 1,
    borderColor: "#E5E2DC",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#FAF9F7",
    minHeight: 44,
    textAlignVertical: "top",
  },
});
