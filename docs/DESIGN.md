# ReWorth Design System — brand palette

> Single source of truth for consumer + admin visual tokens.  
> References Moving Sale creative. **Not legal advice.**

## Brand feel

Trusted · Warm · Premium · Human · Modern · Optimistic · Clean  
Not: recycling, charity, generic classifieds, cold corporate banking.

## Colour hierarchy (~)

| Share | Token | Hex | Role |
| --- | --- | --- | --- |
| ~55% | Soft White | `#FCFAF6` | Canvas / content |
| ~20% | Warm Beige | `#F2E7D5` | Soft surfaces, chips, empty states |
| ~15% | Midnight Navy | `#172A3A` | Text, nav, secondary CTAs, trust |
| ~7% | Burnt Orange | `#D96A32` | Primary CTAs, Sell, active, highlights |
| ~3% | Slate Grey | `#59636D` | Meta / labels / inactive |

### Semantic (state only)

| Role | Hex |
| --- | --- |
| Success / Verified | `#2F7D5B` |
| Warning | `#D99632` |
| Error | `#C94A3A` |
| Border | `#E4DDD4` |
| Disabled | `#B6B4B0` |

Gold `#C9A227` remains reserved for Founding / Top Seller marks only.

**On-accent text** `#FFFFFF` — always white for labels/icons on Burnt Orange or Midnight Navy filled CTAs (`onAccent` / `--rw-on-accent`). Do not use surface white for CTA copy (breaks dark mode).

## Dark mode

| Role | Hex |
| --- | --- |
| Canvas | `#172A3A` |
| Surface | `#203747` |
| Text | `#FCFAF6` |
| Muted | `#CFD4D7` |
| Accent | `#D96A32` |

## Buttons

| Variant | Fill | Text |
| --- | --- | --- |
| Primary / Sell | Burnt Orange | White |
| Secondary | Midnight Navy | White |
| Tertiary (ghost) | Transparent + navy border | Navy |
| Soft | Warm Beige | Navy |

## Type

**Inter** (primary) · **Plus Jakarta Sans** (secondary headings where loaded).  
Scale: 28 / 24 / 20 / 17 / 15 / 13. Prices **700 navy**. Meta **13 slate**.

## Space & motion

8pt grid. Hairline borders. Soft shadow only on floating layers.  
150ms micro · 250ms standard · ease-out.

## Token sources

- Web / admin: `packages/ui-web/src/tokens.css` (`--rw-*`)
- Mobile: `apps/mobile/theme/tokens.ts`
- Tailwind: `reworth-navy`, `reworth-orange`, `reworth-beige`, `reworth-slate`, `reworth-white`

## Brand assets

```
apps/web/public/brand/
  logos/ icons/ categories/ trust/ badges/
  empty-states/ onboarding/ social/ illustrations/
```

Mobile: `apps/mobile/assets/brand/`. See `apps/web/public/brand/README.md`.

## Components

`packages/ui-web` + `apps/mobile/components` — ListingCard, BottomNav (orange SELL FAB), Button, Chip, Skeleton, EmptyState, BottomSheet.

## Auth / onboarding

Email only (ADR-010). No phone or SMS step.

1. Welcome slides (skippable)
2. Email register/login (+ OAuth where enabled)
3. Profile customise: avatar (optional), name, bio, community

## Chat

Buyer bubbles: Warm Beige · Seller / mine: soft orange wash · Send: Burnt Orange · Unread: Orange.

## Do / don’t

| Do | Don’t |
| --- | --- |
| Burnt Orange for primary actions | Gold for CTAs or marketing |
| Bottom sheets for filters/offers | Nested page stacks for tiny tasks |
| Skeleton loaders | Spinners on content screens |
| 44pt tap targets | Tiny icon-only hits |

## A11y

WCAG AA via `scripts/contrast-audit.mjs`. Orange for CTAs/icons — not small body text on white.
