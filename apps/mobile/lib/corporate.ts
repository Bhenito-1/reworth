/**
 * Corporate relocation workspace (Persona C) — mobile client.
 */

import { API_URL, apiFetch, ApiError } from "./api";

export type CorporateAccountStatus =
  | "APPLIED"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | string;

export type RelocationProjectStatus =
  | "DRAFT"
  | "INTAKE"
  | "LISTED"
  | "IN_FULFILMENT"
  | "COMPLETING"
  | "COMPLETED"
  | "CANCELLED"
  | string;

export type CorporateAccount = {
  id: string;
  companyName: string;
  billingContact: string;
  billingEmail: string;
  dpaRecordRef?: string | null;
  supportTier?: string;
  status: CorporateAccountStatus;
  reviewedAt?: string | null;
  role?: string;
};

export type CorporateApplyBody = {
  companyName: string;
  billingContact: string;
  billingEmail: string;
  dpaRecordRef?: string;
  supportTier?: string;
};

export type RelocationItem = {
  id: string;
  projectId?: string;
  title: string;
  notes?: string;
  listingId?: string | null;
};

export type RelocationProject = {
  id: string;
  corporateAccountId: string;
  title: string;
  employeeName: string;
  deadline: string;
  cityFrom: string;
  cityTo: string;
  communityFrom?: string;
  communityTo?: string;
  status: RelocationProjectStatus;
  movingSaleId?: string | null;
  invoiceNumber?: string | null;
  invoicePdfKey?: string | null;
  settledAt?: string | null;
  items?: RelocationItem[];
  timeline?: { status: string; at?: string; label?: string }[];
  createdAt?: string;
};

export type CreateRelocationProjectBody = {
  title: string;
  employeeName: string;
  deadline: string;
  cityFrom: string;
  cityTo: string;
  communityFrom?: string;
  communityTo?: string;
};

function asList<T>(
  res: T[] | { items?: T[]; projects?: T[] } | null | undefined,
): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.projects)) return res.projects;
  return [];
}

export async function applyCorporate(
  token: string,
  body: CorporateApplyBody,
): Promise<CorporateAccount> {
  return apiFetch<CorporateAccount>("/corporate/apply", {
    method: "POST",
    token,
    body,
  });
}

export async function getMyCorporate(
  token: string,
): Promise<CorporateAccount | null> {
  try {
    return await apiFetch<CorporateAccount>("/me/corporate", { token });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function listRelocationProjects(
  token: string,
): Promise<RelocationProject[]> {
  const res = await apiFetch<
    | RelocationProject[]
    | { items?: RelocationProject[]; projects?: RelocationProject[] }
  >("/corporate/projects", { token });
  return asList(res);
}

export async function createRelocationProject(
  token: string,
  body: CreateRelocationProjectBody,
): Promise<RelocationProject> {
  return apiFetch<RelocationProject>("/corporate/projects", {
    method: "POST",
    token,
    body,
  });
}

export async function getRelocationProject(
  token: string,
  projectId: string,
): Promise<RelocationProject> {
  return apiFetch<RelocationProject>(
    `/corporate/projects/${encodeURIComponent(projectId)}`,
    { token },
  );
}

export async function intakeRelocationItems(
  token: string,
  projectId: string,
  body: { items: { title: string; notes?: string }[] },
): Promise<RelocationProject> {
  return apiFetch<RelocationProject>(
    `/corporate/projects/${encodeURIComponent(projectId)}/intake`,
    { method: "POST", token, body },
  );
}

export async function completeRelocationProject(
  token: string,
  projectId: string,
): Promise<RelocationProject> {
  return apiFetch<RelocationProject>(
    `/corporate/projects/${encodeURIComponent(projectId)}/complete`,
    { method: "POST", token, body: {} },
  );
}

/** Fetch invoice payload as text for Share sheet (RN). */
export async function fetchRelocationInvoiceText(
  token: string,
  projectId: string,
): Promise<string> {
  const res = await fetch(
    `${API_URL}/corporate/projects/${encodeURIComponent(projectId)}/invoice`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf,application/octet-stream,text/plain,*/*",
      },
    },
  );
  if (!res.ok) {
    throw new ApiError("Invoice download failed", res.status);
  }
  return res.text();
}

export const PROJECT_STATUS_ORDER: RelocationProjectStatus[] = [
  "DRAFT",
  "INTAKE",
  "LISTED",
  "IN_FULFILMENT",
  "COMPLETING",
  "COMPLETED",
];

export function projectStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Draft",
    INTAKE: "Intake",
    LISTED: "Listed",
    IN_FULFILMENT: "In fulfilment",
    COMPLETING: "Completing",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return map[status] ?? status;
}

export function corporateStatusLabel(status: string): string {
  const map: Record<string, string> = {
    APPLIED: "Applied",
    APPROVED: "Approved",
    ACTIVE: "Active",
    SUSPENDED: "Suspended",
    REJECTED: "Rejected",
  };
  return map[status] ?? status;
}
