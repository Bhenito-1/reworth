"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@reworth/ui-web";
import { AdminAlertsBell } from "./AdminAlertsBell";
import {
  forceLoginRedirect,
  hasAnyRole,
  NAV_ROLES,
  useAdminEmail,
  useAdminRoles,
} from "../lib/auth";

const NAV: { href: string; label: string; roles: readonly string[] }[] = [
  { href: "/", label: "Dashboard", roles: NAV_ROLES.dashboard },
  { href: "/users", label: "Users", roles: NAV_ROLES.users },
  { href: "/listings", label: "Listings", roles: NAV_ROLES.listings },
  { href: "/orders", label: "Orders", roles: NAV_ROLES.orders },
  { href: "/disputes", label: "Disputes", roles: NAV_ROLES.disputes },
  {
    href: "/verifications",
    label: "Verifications",
    roles: NAV_ROLES.verifications,
  },
  { href: "/reports", label: "Reports", roles: NAV_ROLES.reports },
  { href: "/appeals", label: "Appeals", roles: NAV_ROLES.reports },
  { href: "/fraud", label: "Fraud", roles: NAV_ROLES.fraud },
  { href: "/support", label: "Support", roles: NAV_ROLES.support },
  { href: "/catalog", label: "Catalog", roles: NAV_ROLES.catalog },
  { href: "/communities", label: "Communities", roles: NAV_ROLES.catalog },
  { href: "/pro-sellers", label: "Pro sellers", roles: NAV_ROLES.listings },
  { href: "/corporate", label: "Corporate", roles: NAV_ROLES.listings },
  { href: "/partners", label: "Partners", roles: NAV_ROLES.catalog },
  { href: "/inspections", label: "Inspections", roles: NAV_ROLES.orders },
  { href: "/referrals", label: "Referrals", roles: NAV_ROLES.promotions },
  { href: "/promotions", label: "Promotions", roles: NAV_ROLES.promotions },
  { href: "/analytics", label: "Analytics", roles: NAV_ROLES.analytics },
  { href: "/finance", label: "Finance", roles: NAV_ROLES.finance },
  { href: "/audit", label: "Audit", roles: NAV_ROLES.audit },
  { href: "/security", label: "Security", roles: NAV_ROLES.security },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const roles = useAdminRoles();
  const email = useAdminEmail();

  function signOut() {
    forceLoginRedirect();
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--rw-bg)] text-[var(--rw-ink)]">
      <aside
        className="hidden h-dvh w-56 shrink-0 flex-col overflow-hidden border-r border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-6 md:flex"
        aria-label="Admin navigation"
      >
        <p className="px-2 text-lg font-semibold tracking-tight">ReWorth</p>
        <p className="mb-6 px-2 text-xs text-[var(--rw-ink-muted)]">Ops</p>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {NAV.map((item) => {
            if (!hasAnyRole(roles, item.roles)) return null;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[var(--rw-radius)] px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] ${
                  active
                    ? "bg-[var(--rw-accent-muted)] text-[var(--rw-ink)]"
                    : "text-[var(--rw-ink-muted)] hover:bg-[var(--rw-accent-muted)] hover:text-[var(--rw-ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 shrink-0 space-y-2 border-t border-[var(--rw-border)] pt-4">
          {email ? (
            <p className="truncate px-2 text-xs text-[var(--rw-ink-muted)]">
              {email}
            </p>
          ) : null}
          <Button variant="ghost" size="sm" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] px-4 py-3">
          <p className="font-semibold md:sr-only">ReWorth Ops</p>
          <div className="ml-auto flex items-center gap-1">
            <AdminAlertsBell />
            <Button variant="ghost" size="sm" className="md:hidden" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
