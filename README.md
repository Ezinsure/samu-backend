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

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:deploy` | Apply migrations (CI/prod) |
| `npm run db:seed` | Seed users + geo + agents + full COAP sample (through feedback) |

## Project structure

```text
backend/
  prisma/           # schema + migrations + seed
  src/
    config/         # env validation
    lib/            # prisma, logger, errors, tokens, cookies, tc-scope
    middleware/     # authenticate, rbac, error + 404
    modules/        # health, auth, …
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
| B9 — Insights aggregates | Next |

See `../DOCs/SAMU-Backend-Implementation-Phases.md`.
