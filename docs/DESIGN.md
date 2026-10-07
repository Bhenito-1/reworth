# ReWorth Design System — `v1.0.3-design-elevation`

> Single source of truth for consumer surfaces (mobile first, web companion).  
> Admin keeps a utilitarian shell. **Not legal advice.**

## Brand discipline

| Role | Light | Dark | Rule |
| --- | --- | --- | --- |
| Canvas | `#FAF9F7` | `#0F1214` | Page background |
| Surface | `#FFFFFF` | `#171B1E` | Cards / sheets |
| Ink | `#101418` | `#F2F0EC` | Primary text |
| Muted | `#5C6470` | `#9AA1A8` | Meta / captions |
| Border | `#E5E1DA` | `#2A3036` | Hairlines only |
| Emerald | `#0E9F6E` | `#12A170` | **Only** brand/action colour (dark tuned for AA large CTA) |
| Emerald pressed | `#0B7A55` | `#0E9F6E` | Pressed CTAs |
| Emerald wash | `#E6F6EF` | `#064E3B` | Selected chips |
| Gold | `#C9A227` | `#E0B84A` | **Verification / Top Seller only** |
| Success / warn / error | `#12A150` / `#E8A13C` / `#D64545` | semantic only |

Hardcoded hex outside token files = audit failure.

## Type

Family: **Geist / Inter** only. Scale: 28 / 24 / 20 / 17 / 15 / 13. Weights 400–700.  
Prices always **700 ink**. Metadata always **13 muted**. Line-height 1.2–1.4.

## Space

8pt grid (4pt half-steps). Gutters 16 (12 compact). Card padding 12–16. Section 24–32.  
Generous whitespace is correct.

## Elevation & motion

Hairline borders default. Soft shadow only for floating layers (nav, sheets).  
Motion: 150ms micro · 250ms standard · ease-out. Respect Reduce Motion.  
No bounce, glass, confetti — celebrate only with publish checkmark.

## Components

Documented in `packages/ui-web`: Button, ListingCard, Chip, Input, BottomNav, Modal, Toast, Skeleton, EmptyState.  
Mobile tokens: `apps/mobile/theme/tokens.ts`.

## Auth / onboarding pattern

1. Welcome slides (skippable)  
2. **Method:** phone **or** email  
3. Email register/login (+ OAuth where enabled)  
4. Profile customise: avatar (optional), name, bio, community  

## Do / don’t

| Do | Don’t |
| --- | --- |
| Emerald for primary actions | Gold for CTAs or marketing |
| Bottom sheets for filters/offers | Nested page stacks for tiny tasks |
| Skeleton loaders | Spinners on content screens |
| 44pt tap targets | Tiny icon-only hits |

## A11y

WCAG AA on token pairs (script: `scripts/contrast-audit.mjs`). Focus-visible on web. Labels on every control.

## Performance budgets

Lighthouse mobile 3G-sim: Home / PDP / Search performance ≥ 90, LCP &lt; 3s (`apps/web/lighthouserc.js`).
