# SAMU Backend

Solektra Agent Monitoring Utility — Express.js API (modular monolith).

Architecture, security, and phase plans live in `/DOCs` (start with `SAMU-Backend-Architecture.md`).

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ (22 recommended) |
| Language | TypeScript (strict) |
| Framework | Express.js |
| Validation | Zod |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Auth | Argon2id + JWT httpOnly cookies |
| Cache / queues | Redis 7 |
| Object storage | MinIO (local) / S3 (prod) |
| Logging | Pino |
| Security headers | Helmet |

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for Postgres, Redis, MinIO)

## How to run (local)

### 1. Start infrastructure

Requires **Docker Desktop running** on Windows/macOS.

From the **repository root** (`SAMU/`):

```bash
docker compose up -d
```

Verify containers: `docker compose ps` (postgres, redis, minio should be healthy).

### 2. Configure environment

```bash
cd backend
cp .env.example .env
```

Defaults match `docker-compose.yml` (`samu` / `samu` on port `5432`). JWT secrets in `.env.example` are for local only.

### 3. Install, migrate, seed, start API

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

- API: [http://localhost:4000](http://localhost:4000)
- Health: [http://localhost:4000/health](http://localhost:4000/health)
- Auth base: [http://localhost:4000/api/v1/auth](http://localhost:4000/api/v1/auth)

### 4. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Until the auth adapter is wired, the UI still uses the demo store.

## Auth (Phase B1)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Creates **pending** AGENT (cannot log in yet) |
| `POST` | `/api/v1/auth/login` | Sets `samu_access` + `samu_refresh` httpOnly cookies |
| `POST` | `/api/v1/auth/logout` | Revokes refresh; clears cookies |
| `POST` | `/api/v1/auth/refresh` | Rotates refresh token |
| `GET` | `/api/v1/auth/me` | Current user (requires access cookie) |
| `POST` | `/api/v1/auth/rbac-write-check` | Probe: `MD_VIEWER` → 403 |

Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production. Send requests with `credentials: "include"` from the frontend origin.

### Seed users (local / demo only)

| Email | Role | Password |
| --- | --- | --- |
| `admin@solektra.rw` | ADMIN | `Samu@Admin1` |
| `ops@solektra.rw` | OPERATIONS_MANAGER | `Samu@Ops1` |
| `md@solektra.rw` | MD_VIEWER | `Samu@Md1` |
| `tc.kigali@solektra.rw` | TERRITORY_COORDINATOR | `Samu@Tc1` |
| `tc.south@solektra.rw` | TERRITORY_COORDINATOR | `Samu@Tc2` |
| `agent.demo@solektra.rw` | AGENT | `Samu@Agent1` |

Quick login check (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login `
  -ContentType application/json `
  -Body '{"email":"admin@solektra.rw","password":"Samu@Admin1"}' `
  -SessionVariable s
Invoke-RestMethod -Uri http://localhost:4000/api/v1/auth/me -WebSession $s
```

## Territories (Phase B2)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/territories/tree` | Geo tree (TC-scoped); includes coordinators + `canManage` |
| `GET` | `/api/v1/territories/coordinators` | Active TC users |
| `GET` | `/api/v1/territories/:id/workspace` | Detail + assignment history (`agents` empty until B3) |
| `POST` | `/api/v1/territories/:id/assign` | Admin only — body `{ "tcUserId": "…" }` (districts only) |

Seed includes Rwanda sample provinces/districts/sectors/cells (stable ids matching the demo frontend) and assigns Kigali districts → `tc.kigali@…`, Southern → `tc.south@…`. Assigning a district also reassigns agents in that district.

## Agents (Phase B3)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/agents/filters` | Provinces, districts, statuses, coordinators (TC-scoped) |
| `GET` | `/api/v1/agents` | Paginated list — `page`, `pageSize`, `search`, `province`, `district`, `status`, `compliance`, `tcUserId`, `sortBy`, `sortDir` |
| `GET` | `/api/v1/agents/:id` | Detail + assignment history (`visits` empty until B10) |
| `POST` | `/api/v1/agents` | Admin create |
| `PATCH` | `/api/v1/agents/:id` | Admin update (rotates TC assignment history) |

Seed loads 40 demo agents (same ids as the frontend). `agent.demo@solektra.rw` is linked to `agent-001`.

## Leads — COAP (Phase B4)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/leads` | Paginated — `page`, `pageSize`, `search`, `serviceLine`, `status`, `tcUserId` |
| `GET` | `/api/v1/leads/:id` | Single lead (TC-scoped) |
| `POST` | `/api/v1/leads` | Admin / Ops / TC create (TC owns self; Admin/Ops must pass `tcUserId`) |
| `PATCH` | `/api/v1/leads/:id` | Admin / Ops / owning TC; MD is read-only |

Seed loads 8 demo leads matching the frontend COAP sample.

## Field activities — COAP (Phase B5)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/field-activities` | Paginated — `search`, `serviceLine`, `activityType`, `tcUserId` |
| `GET` | `/api/v1/field-activities/:id` | Single activity (TC-scoped) |
| `POST` | `/api/v1/field-activities` | Admin / Ops / TC create |
| `PATCH` | `/api/v1/field-activities/:id` | Admin / Ops / owning TC; optional `leadId` / `agentId` |

Seed loads 6 demo activities (linked to seed leads where applicable).

## Onboarding — COAP (Phase B6)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/onboarding` | Paginated — `search`, `serviceLine`, `status`, `tcUserId` |
| `GET` | `/api/v1/onboarding/:id` | Single case (TC-scoped) |
| `POST` | `/api/v1/onboarding` | Admin / Ops / TC create |
| `PATCH` | `/api/v1/onboarding/:id` | Admin / Ops / owning TC; sets `completedAt` when status → completed |

Seed loads 6 demo onboarding cases linked to seed leads.

## Sales — COAP (Phase B7)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/sales` | Paginated — `search`, `serviceLine`, `tcUserId` |
| `GET` | `/api/v1/sales/:id` | Single sale (TC-scoped) |
| `POST` | `/api/v1/sales` | Admin / Ops / TC create |
| `PATCH` | `/api/v1/sales/:id` | Admin / Ops / owning TC; optional `leadId` / `onboardingId`, deposit/installments |

Seed loads 4 demo sales linked to leads/onboarding where applicable.

## Feedback — COAP (Phase B8)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/feedback` | Paginated — `search`, `serviceLine`, `kind`, `status`, `tcUserId` |
| `GET` | `/api/v1/feedback/:id` | Single item (TC-scoped) |
| `POST` | `/api/v1/feedback` | Admin / Ops / TC create (`serviceLine` optional) |
| `PATCH` | `/api/v1/feedback/:id` | Admin / Ops / owning TC; optional `resolutionNotes` |

Seed loads 4 demo feedback items. **COAP core (B4–B8) is complete.**

## Insights + service workspace (Phase B9)

Composite read models that cut frontend fan-out (TC-scoped; MD/Admin/Ops national).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/insights/coap-dashboard` | KPIs + by-service + recent leads/activities; optional `?month=YYYY-MM` (default: current UTC month) |
| `GET` | `/api/v1/insights/coap-filter-options` | Provinces/districts/sectors + coordinators + service lines |
| `GET` | `/api/v1/coap/services` | Hub — summary card per service line |
| `GET` | `/api/v1/coap/services/:line/workspace` | Cockpit — line summary + recent leads/activities/onboarding/sales |

Seed COAP dates are mostly **2026-09**. For non-empty “this month” KPIs against seed data, call `?month=2026-09`.

## Field visits (Phase B10)

GPS-validated visits with photo evidence in MinIO. Fraud **flags** are opened on GPS mismatch; review APIs are Phase B11.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/visits/filters` | Agents, purposes, validations, `gpsThresholdMeters` |
| `GET` | `/api/v1/visits` | Paginated — `agentId`, `tcUserId`, `validation`, `confirmation`, `purpose`, `search` |
| `GET` | `/api/v1/visits/:id` | Detail + agent snapshot + fraud flags + signed photo URLs |
| `POST` | `/api/v1/visits/photos` | Multipart field `photo` → MinIO; returns `storageKey` |
| `POST` | `/api/v1/visits` | Create (Admin/TC); server recomputes GPS distance; optional `Idempotency-Key` |
| `PATCH` | `/api/v1/visits/:id` | Confirmation / validation / notes (TC cannot change validation) |

Create body requires ≥1 photo ref (`storageKey`, `fileName`, `contentType`, `sizeBytes`) from a prior upload. Threshold: `GPS_DISTANCE_METERS` (default **10**). Seed loads 6 visits + fraud flags; seed photo keys are metadata-only (no MinIO objects).

## Fraud review (Phase B11)

Admin / Ops review queue (MD read-only). Reviewers cannot act on flags for their own visits.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/fraud/filters` | Types, statuses, severities |
| `GET` | `/api/v1/fraud` | Paginated — `status`, `severity`, `type`, `search` (open/escalated first) |
| `GET` | `/api/v1/fraud/:id` | Detail + linked visit + enriched review history |
| `POST` | `/api/v1/fraud/:id/review` | Body `{ "action": "accept"|"escalate"|"dismiss", "notes": "…" }` |

`accept` / `dismiss` → close flag and set visit `validation: accepted`. `escalate` → `escalated` + severity `high` + assign reviewer. Seed: 4 flags (matches frontend demo).

## Monthly reports + scorecards (Phase B12)

TC monthly narratives with KPI snapshots; Head Office scorecards.

### Reports

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/monthly-reports/filters` | Periods, statuses, coordinators, KPI targets |
| `GET` | `/api/v1/monthly-reports` | Paginated — TC-scoped |
| `GET` | `/api/v1/monthly-reports/:id` | Workspace (targets, linked visit count, history) |
| `POST` | `/api/v1/monthly-reports` | Create draft `{ period, tcUserId? }` |
| `PATCH` | `/api/v1/monthly-reports/:id` | Save draft narrative / kpiActuals |
| `POST` | `/api/v1/monthly-reports/:id/refresh-kpis` | Recompute from visits + COAP |
| `POST` | `/api/v1/monthly-reports/:id/submit` | Snapshot agents; submitted / resubmitted |
| `POST` | `/api/v1/monthly-reports/:id/request-changes` | Admin/Ops — `{ notes }` |

### Scorecards

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/scorecards` | Paginated |
| `GET` | `/api/v1/scorecards/:id` | Workspace + criteria defs |
| `POST` | `/api/v1/scorecards/ensure` | `{ monthlyReportId }` → draft scorecard |
| `PATCH` | `/api/v1/scorecards/:id` | Save criteria / decision |
| `POST` | `/api/v1/scorecards/:id/submit` | Marks linked report `evaluated` |

KPI targets are defaults until B14 settings. Sensitization/training/meeting KPIs stay 0 until those entities exist. Seed: 3 reports + 2 scorecards.

## Analytics + maps (Phase B13)

Read-only aggregates over agents, visits, and fraud (no new tables). TC-scoped; Admin/Ops/MD national. Optional filters: `dateFrom`, `dateTo`, `province`, `district`, `tcUserId`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/insights/dashboard` | Compliance, visits by TC/district, monthly trend, leaderboard, overdue list |
| `GET` | `/api/v1/insights/analytics` | Dashboard + SMS confirmation breakdown/trend |
| `GET` | `/api/v1/maps/workspace` | Agent lat/lng points + compliance summary; filters: `compliance`, `status` |

`openActionItems` is `0` until action-item APIs exist. Monthly trend uses live visit months only (no fabricated history).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:deploy` | Apply migrations (CI/prod) |
| `npm run db:seed` | Seed users + geo + agents + COAP + visits + fraud + reports/scorecards |

## Project structure

```text
backend/
  prisma/           # schema + migrations + seed
  src/
    config/         # env validation
    lib/            # prisma, logger, errors, tokens, cookies, tc-scope, gps, storage
    middleware/     # authenticate, rbac, error + 404
    modules/        # health, auth, territories, agents, coap, visits, insights, …
    app.ts          # Express app factory
    server.ts       # HTTP listen + shutdown
```

## Phase status

| Phase | Status |
| --- | --- |
| B0 — Scaffold + Docker + health | Complete |
| B1 — Auth + seed users | Complete |
| B2 — Territories | Complete |
| B3 — Agents | Complete |
| B4 — COAP Leads | Complete |
| B5 — Field activities | Complete |
| B6 — Onboarding | Complete |
| B7 — Sales | Complete |
| B8 — Feedback | Complete |
| B9 — Insights aggregates | Complete |
| B10 — Visits (GPS + MinIO photos) | Complete |
| B11 — Fraud review | Complete |
| B12 — Reporting (monthly + scorecards) | Complete |
| B13 — Analytics / maps | Complete |
| B14 — Admin / audit / messaging | Next |

See `../DOCs/SAMU-Backend-Implementation-Phases.md`.
