# Payments dry run

Boots the whole app locally against a throwaway database and walks every money
path end to end: pay, cancel, refund, expiry, disputes (partial / cancel / full),
held payouts, transfer failure + retry, boosts, Seller Plus, webhooks.

```bash
bash scripts/dry-run/run.sh            # mock PSP, then Paystack test mode
bash scripts/dry-run/run.sh mock       # mock PSP only (no network to Paystack)
```

Needs Docker Desktop running. Uses its own containers (`reworth-dryrun`,
ports 55432 / 56379, data in tmpfs) and ports 3100 (web), 3101 (API), 3102
(admin). Your `.env` is read, never modified; overrides apply to this process.

Paystack phase: needs `PAYSTACK_SECRET_KEY=sk_test_…` (refuses live keys). It
prints Paystack checkout links (also in `out/pending-payment.json`) and waits
for them to be paid with a Paystack test card. Paystack cannot call localhost,
so refund outcomes are read back from Paystack and relayed as signed webhooks.

Results: `scripts/dry-run/out/report.md`, logs in `scripts/dry-run/out/`.
