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

## Autonomous Development & Verification Guardrails
1. **Red-Green TDD Workflow**:
   - For bug fixes and new features, write or update the unit test first and confirm the failure state before applying the implementation.
   - Iterate against test runner and compiler error feedback until 100% green.
2. **Zero-Placeholder Constraint**:
   - Never output placeholder code, partial implementations, stubbed handlers, or comments like `// TODO: implement later`. All touched code must be production-complete and fully functional.
3. **Micro-Phased Execution**:
   - Decompose multi-step tasks into discrete architectural layers (Types $\rightarrow$ Safety/Services $\rightarrow$ Queue/Routes $\rightarrow$ Tests).
   - Validate each layer with compiler checks (`npm run build`) and test suites (`npm test`) before proceeding to the next.
4. **Proactive Documentation & Learning Capture**:
   - Autonomously capture and persist durable operational lessons, container constraints, and environment requirements into this file without waiting for explicit prompts.

## CI/CD Standards (GitHub Actions)
- All branches and pull requests are verified via GitHub Actions (`.github/workflows/ci.yml`).
- CI runs TypeScript validation, unit test execution, and integration testing using a dedicated Redis service container (`redis:7-alpine`).

## Configuration & Deployment
- Tenant configurations are stored as individual JSON files in `/app/configs` (mounted read-only).
- **Hybrid Auto-Discovery**: When embedded as a Grist Custom Widget, `public/app.js` auto-detects `docId` and server `baseUrl` via `grist.docApi.getAccessToken()`. It queries `GET /api/schema/tenant-by-doc/:docId` to automatically bind configured tenants or presents an in-widget setup wizard (`POST /api/schema/tenant/init`) that persists credentials to `/app/configs/<tenantId>.json` so BullMQ background workers run 24/7 without active browser sessions.
- In Docker environments, services communicate via the internal Docker network (e.g., `REDIS_HOST=gristsync-redis`).
- **Ad-Hoc Container Execution**: When running ad-hoc verification or diagnostic containers via `docker run`, always attach `--network traefik-proxy` so the container can resolve `gristsync-redis` without blocking boot loops.
