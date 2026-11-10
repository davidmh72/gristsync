# GristSync - Architecture, Standards & Developer Guidance

## Overview
GristSync is a high-reliability, multi-tenant bidirectional synchronization service between Grist (relational database/spreadsheet) and Mailchimp (audience & email marketing platform). It is built with Node.js, Express, TypeScript, BullMQ, and Redis.

## Core Architectural Principles
1. **Asynchronous Webhook Ingestion**: Inbound webhooks (`/webhook/:tenantId/mailchimp`) and outbound triggers (`/api/sync/outbound/:tenantId`) acknowledge immediately with `200 OK` and delegate payload processing to BullMQ to prevent timeouts and duplicate webhooks.
2. **Loop Prevention & Idempotency**:
   - Checksum tracking and timestamp verification (`safety.service.ts`) prevent infinite sync loops between Grist and Mailchimp.
   - Deduping ensures webhook replays or concurrent delivery do not corrupt state.
3. **Field Locking**:
   - When configured (e.g. `lockEmailIfMailchimpIdExists`), protected fields like email addresses in Grist cannot be overwritten if an external provider ID already links the record.
4. **Resilience & Dead-Letter Handling**:
   - Exponential backoff with full jitter for rate-limited external APIs.
   - Exhausted retries route to DLQ logging in Grist's `Sync_Logs` table.

## Testing & Local Development Rules
- **100% Offline Unit Tests**: Unit tests (`npm test`) must run cleanly without external dependencies (no live Redis or network access required).
- **No Eager Network Connections**: Never instantiate eager network clients at module import scope without `lazyConnect: true`. Redis connections in `connection.ts` must not cause hanging open handles or DNS lookup loops when running tests outside Docker.
- **Mocking**: BullMQ `Queue` and `Worker` instances, as well as `IORedis`, must be properly mocked or lazily evaluated in test suites (`worker.test.ts`, `routes.test.ts`).
- **Pre-Commit Verification Gate**:
  - Always run `npm test` (all test suites must pass).
  - Always run `npm run build` (TypeScript compiler must compile with zero errors).

## CI/CD Standards (GitHub Actions)
- All branches and pull requests are verified via GitHub Actions (`.github/workflows/ci.yml`).
- CI runs TypeScript validation, unit test execution, and integration testing using a dedicated Redis service container (`redis:7-alpine`).

## Configuration & Deployment
- Tenant configurations are stored as individual JSON files in `/app/configs` (mounted read-only).
- In Docker environments, services communicate via the internal Docker network (e.g., `REDIS_HOST=gristsync-redis`).
