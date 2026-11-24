import { apiFetch } from "./api";

export type WalletEntryState = "escrow" | "sending" | "paid" | "failed";

export type SellerWallet = {
  escrowKobo: number;
  sendingKobo: number;
  withdrawnKobo: number;
  failedKobo: number;
  entries: {
    orderId: string;
    reference: string;
    title: string;
    amountKobo: number;
    at: string;
    state: WalletEntryState;
  }[];
};

export function getSellerWallet(token: string): Promise<SellerWallet> {
  return apiFetch<SellerWallet>("/orders/wallet", { token });
}

export function walletStateLabel(state: WalletEntryState): string {
  switch (state) {
    case "escrow":
      return "Held in escrow";
    case "sending":
      return "Sending to your bank";
    case "paid":
      return "Paid to your bank";
    case "failed":
      return "Transfer failed";
  }
}
