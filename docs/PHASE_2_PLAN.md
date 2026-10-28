# Phase 2 plan — Listings, Media & AI-Assisted Listing

**Branch:** `phase-2-listings` · **Tag:** `v0.2-listings`  
**Depends on:** Phase 1 (`v0.1-auth`)

## Schema
- Category (+ subcategory parent), Listing (PRD §9 + vehicle JSONB), ListingImage, ListingEvent, RiskEvent (stub)
- Seed 16 top-level categories from PRD §26

## Media
- Presign PUT to adobe/s3mock; BullMQ image pipeline (validate → EXIF strip → resize 640/1080/1600 → WebP/AVIF → dHash)
- MalwareScanProvider mock; StorageProvider S3 adapter + mock

## Listings
- State machine via events; AI assist (ListingAssistProvider + rule mock); price intel v1; geocoding mock
- Risk: duplicate dHash + low price → under_review
- 7-day expiry cron (BullMQ repeatable)
- Public DTO: never expose address string

## UI
- Web/mobile: SELL 60s path + PDP (PRD §24)
- Swap/Give Away selectable; purchase flows deferred

## Risks
- Sharp/AVIF may need platform libs — fall back to WebP-only in mock pipeline if Sharp unavailable in CI
- adobe/s3mock optional in unit tests (mock storage)
