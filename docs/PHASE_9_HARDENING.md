# Phase 9 hardening — Risk, Moderation & Security (tag kept)

> **Tag:** `v0.9-risk-security` (`4e38447`) — **not moved**.  
> **Branch:** `phase-9-risk-harden`

## Closed in this harden

| Gap | Fix |
| --- | --- |
| Seller appeal UX | Mobile `SellFlow` + web `/sell` show rejection reasons + appeal form |
| Admin appeals queue | `/appeals` page wired to `GET/POST /admin/appeals*` |
| Explainability | Fraud queue joins latest `RiskAssessment.rulesFired` |
| Rejected publish payload | Returns `moderationReasons` to the seller |
| Risk engine test | `evaluateOnPublish` HIGH path (synthetic bad actor effects) |
| SECURITY.md | Align audit CI wording with `--audit-level=critical` |

## Acceptance

1. Synthetic bad actor (duplicate + low price + rapid) → HIGH + under review + events — unit + engine service test  
2. Prohibited keyword → REJECTED + appeal → admin queue — API + UI  
3. k6 staging p95 &lt; 500ms — **scripts + local results committed**; cloud staging certification remains Phase 10 UAT (`docs/PERF.md`)  
4. `docs/SECURITY.md` + `docs/PRIVACY.md` present; CI audit gate green  
5. Docs updated; **tag unchanged**

## Verify

```bash
pnpm --filter @reworth/api exec jest src/risk/risk-engine.service.spec.ts src/moderation/moderation.service.spec.ts src/common/security-posture.spec.ts --no-coverage
```
