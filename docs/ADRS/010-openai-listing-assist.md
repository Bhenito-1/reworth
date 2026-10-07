# ADR-010 — OpenAI listing assist (vision draft)

## Status
Accepted — 2026-09-15

## Context
Sell flow **Analyze** needs photo → title/description/price draft. Until now `AI_PROVIDER` always resolved to the rule-based mock.

## Decision
- `AI_PROVIDER=mock` (default): `RuleBasedAiMock` (deterministic, offline).
- `AI_PROVIDER=openai` + `OPENAI_API_KEY`: `OpenAiListingProvider` (GPT-4o JSON + optional vision).
- On OpenAI failure, fall back to the rule-based mock.
- Images are passed as **data URLs** from storage bytes when available (so localhost MinIO works). Otherwise text hints (filenames) only.

## Consequences
- Real vision requires uploaded image bytes in storage (not empty mock keys).
- Cost/latency on each assist call; keep mock default for CI.
- No new npm dependency — uses `fetch` against OpenAI HTTP API.
