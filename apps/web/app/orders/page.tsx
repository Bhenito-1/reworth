"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNgn } from "@reworth/shared";
import {
  Button,
  Chip,
  EmptyState,
  Skeleton,
} from "@reworth/ui-web";
import { ApiError, apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import {
  fulfilmentLabel,
  isCancelledOrder,
  isDeliveredOrder,
  listOrders,
  orderStatusLabel,
  sortMyOrders,
  type OrderDto,
} from "../../lib/orders";
import type { MeResponse } from "../../lib/types";

type OrderListTab = "selling" | "buying" | "cancelled";

function tabFromParam(value: string | null): OrderListTab {
  if (value === "buying" || value === "cancelled" || value === "selling") {
    return value;
  }
  return "selling";
}

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

function tabHint(tab: OrderListTab): string {
  if (tab === "selling") {
    return "Orders customers placed on your listings. Accept or reject new ones here.";
  }
  if (tab === "cancelled") {
    return "Orders you cancel, or that a seller rejects, show up here.";
  }
  return "Ongoing orders are listed first. Delivered orders follow, newest first.";
}

function emptyCopy(tab: OrderListTab): { title: string; description: string } {
  if (tab === "selling") {
    return {
      title: "No customer orders",
      description: "When someone orders one of your listings, it shows up here.",
    };
  }
  if (tab === "cancelled") {
    return {
      title: "No cancelled orders",
      description: "Orders you cancel, or that a seller rejects, show up here.",
    };
  }
  return {
    title: "No orders yet",
    description:
      "Orders you place show up here. After the seller accepts, you can pay or cancel.",
  };
}

export default function OrdersListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = tabFromParam(searchParams.get("tab"));
  const [meId, setMeId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [me, list] = await Promise.all([
        apiFetch<MeResponse>("/me", { token }),
        listOrders(token),
      ]);
      setMeId(me.id);
      setOrders(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectTab(next: OrderListTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/orders?${params.toString()}`, { scroll: false });
  }

  const visible = useMemo(
    () => ordersForTab(orders, tab, meId),
    [orders, tab, meId],
  );
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
  const empty = emptyCopy(tab);

  return (
    <main className="relative min-h-[100dvh] bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32vh]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 40% 0%, rgba(14,159,110,0.1), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Orders
        </h1>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Order roles">
          {(
            [
              ["selling", "Customer orders"],
              ["buying", "My orders"],
              ["cancelled", "Cancelled"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={[
                "rounded-full px-4 py-2 text-sm font-semibold",
                tab === id
                  ? "bg-[var(--rw-accent)] text-white"
                  : "border border-[var(--rw-border)] text-[var(--rw-ink)]",
              ].join(" ")}
              onClick={() => selectTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--rw-ink-muted)]">{tabHint(tab)}</p>

        {loading ? (
          <div className="mt-8 space-y-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className="mt-8">
            <EmptyState
              title="Couldn’t load orders"
              description={error}
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-8">
            <EmptyState title={empty.title} description={empty.description} />
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {sections.map((section) => (
              <section key={section.id}>
                {section.title ? (
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--rw-ink-muted)]">
                    {section.title}
                  </h2>
                ) : null}
                <ul className="flex flex-col gap-4">
                  {section.items.map((o) => {
                    const role =
                      meId === o.buyerId
                        ? "Buying"
                        : meId === o.sellerId
                          ? "Selling"
                          : "Order";
                    return (
                      <li
                        key={o.id}
                        className="overflow-hidden rounded-[var(--rw-radius-lg)] border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)]"
                      >
                        <Link
                          href={`/orders/${o.id}?from=${tab}`}
                          className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-[var(--rw-accent-muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {o.listingTitle?.trim() || "Listing"}
                            </p>
                            <p className="mt-0.5 text-sm">
                              {o.quantity && o.quantity > 1 ? `${o.quantity} × ` : ""}
                              {formatNgn({ amountKobo: o.totalKobo })}
                            </p>
                            <p className="mt-0.5 text-sm text-[var(--rw-ink-muted)]">
                              {role} · {fulfilmentLabel(String(o.fulfilmentMethod))}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--rw-ink-muted)]">
                              {new Date(o.createdAt).toLocaleString("en-NG")}
                            </p>
                          </div>
                          <Chip selected className="pointer-events-none shrink-0 self-start sm:self-center">
                            {orderStatusLabel(String(o.status))}
                          </Chip>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
