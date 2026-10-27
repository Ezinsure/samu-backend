# SAMU Backend

Solektra Agent Monitoring Utility (SAMU) — REST API for Solektra’s field-operations platform.

Head Office and Territory Coordinators manage agents, GPS-validated field visits, fraud review, the Community Opportunity (COAP) pipeline, monthly reports and scorecards, and admin tooling. This service is the system of record; the companion UI lives in **samu-frontend**.

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ (22 recommended) |
| Language | TypeScript (strict) |
| Framework | Express.js |
| Validation | Zod |
| Database | PostgreSQL 16 (Prisma ORM) |
| Auth | Argon2id + JWT httpOnly cookies |
| Cache | Redis 7 |
| Object storage | MinIO (local) / S3-compatible (e.g. Cloudflare R2) |
| Email | Resend (optional in development) |
| Logging | Pino |
| Security | Helmet, CORS, rate limiting |

## Prerequisites

- Node.js **20+** and npm **10+**
- Docker Desktop (for local Postgres, Redis, and MinIO)

For hosted environments you can point `DATABASE_URL`, `REDIS_URL`, and the `S3_*` variables at managed services instead of Docker.

## Quick start (local)

### 1. Clone and install

```bash
git clone <your-repo-url> samu-backend
cd samu-backend
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d
docker compose ps   # postgres, redis, and minio should be healthy
```

| Service | Port | Notes |
| --- | --- | --- |
| PostgreSQL | `5432` | user/password/db: `samu` / `samu` / `samu` |
| Redis | `6379` | |
| MinIO API | `9000` | console on `9001` — create bucket `samu-uploads` if needed |
| MinIO console | `9001` | login `samu` / `samu-secret` |

### 3. Configure environment

```bash
cp .env.example .env
```

Defaults in `.env.example` match `docker-compose.yml`. Replace JWT secrets before any shared or production deployment.

### 4. Database migrate and seed

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

### 5. Run the API

```bash
npm run dev
```

| Endpoint | URL |
| --- | --- |
| API | http://localhost:4000 |
| Health | http://localhost:4000/health |
| Auth | http://localhost:4000/api/v1/auth |

Pair with **samu-frontend** on http://localhost:3000. Set `FRONTEND_ORIGIN` to that origin so cookie-based auth and CORS work.

## Environment variables

Copy `.env.example` to `.env`. The process exits on startup if required values are missing or invalid.

### Application

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `4000` | HTTP listen port |
| `APP_URL` | No | `http://localhost:4000` | Public URL of this API (used in links / absolute URLs) |
| `FRONTEND_ORIGIN` | No | `http://localhost:3000` | Allowed browser origin for CORS and auth cookies. **Must match the real UI URL** in staging/production |

### Database & cache

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (Prisma). Example local: `postgresql://samu:samu@localhost:5432/samu?schema=public` |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |

> **Hosted Postgres (e.g. Neon):** use the provider’s connection string. Prefer the pooled / PgBouncer URL when available. This API uses sequential Prisma `$transaction([...])` batches (not interactive transactions), which works with connection poolers.

### Auth (JWT)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | **Yes** | — | Access-token signing secret (**≥ 32 characters**). Generate with `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | **Yes** | — | Refresh-related secret (**≥ 32 characters**). Use a different value from the access secret |
| `JWT_ACCESS_TTL` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | No | `7d` | Refresh token lifetime |

### Object storage (visit photos)

Create the bucket in the provider console first. Local MinIO credentials match Docker Compose.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `S3_ENDPOINT` | No | `http://localhost:9000` | S3-compatible API endpoint |
| `S3_REGION` | No | `us-east-1` | Region (`auto` is fine for Cloudflare R2) |
| `S3_ACCESS_KEY` | No | `samu` | Access key |
| `S3_SECRET_KEY` | No | `samu-secret` | Secret key |
| `S3_BUCKET` | No | `samu-uploads` | Bucket name for visit photos |

**Cloudflare R2 example:**  
`S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`, `S3_REGION=auto`, plus R2 access key / secret / bucket.

### Email (password reset & invites)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | No | unset | [Resend](https://resend.com) API key. If unset, emails are **not** sent; in non-production the message (including the reset/invite link) is printed in the API console |
| `EMAIL_FROM` | No | `SAMU <no-reply@solektra.rw>` | From address (must be allowed by your Resend domain) |
| `PASSWORD_RESET_TTL` | No | `1h` | Forgot-password link lifetime |
| `PASSWORD_INVITE_TTL` | No | `3d` | Set-password link lifetime when an admin creates a user |

### Field validation

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GPS_DISTANCE_METERS` | No | `10` | Max distance (meters) from an agent’s registered location before a visit is flagged |

### Production checklist

- [ ] Strong unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] `NODE_ENV=production`
- [ ] `APP_URL` and `FRONTEND_ORIGIN` set to the public HTTPS URLs
- [ ] Managed Postgres, Redis, and S3/R2 (or equivalent)
- [ ] `RESEND_API_KEY` and a verified `EMAIL_FROM` domain
- [ ] Never commit `.env`

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:deploy` | Apply migrations (CI / production) |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed users, geo, agents, COAP, visits, fraud, reports, settings |

## Seeded demo accounts

Created by `npm run db:seed` (local / demo only — change or remove before real UAT).

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

## What this API covers

| Area | Capabilities |
| --- | --- |
| Auth & users | Login/logout/refresh, register (pending agent), profile, password reset, admin user management |
| Network | Territories, agents, GPS field visits, photo upload, fraud review |
| COAP | Leads, field activities, onboarding, sales, feedback, service workspaces, dashboard insights |
| Oversight | Monthly reports, scorecards, analytics, maps workspace |
| Admin | System settings, audit log, SMS messaging stub |

All versioned routes are under `/api/v1/...`. Auth uses httpOnly cookies (`samu_access`, `samu_refresh`); browser clients must send `credentials: "include"`.

## Project structure

```text
backend/
  docker-compose.yml   # Local Postgres, Redis, MinIO
  prisma/              # Schema, migrations, seed
  src/
    config/            # Env validation
    lib/               # Prisma, auth helpers, storage, audit, GPS, …
    middleware/        # Auth, RBAC, errors
    modules/           # Feature modules (auth, agents, visits, …)
    app.ts
    server.ts
```

## Related

- **samu-frontend** — Next.js web application that consumes this API
- Set `FRONTEND_ORIGIN` on this service to the frontend’s public URL whenever you deploy either side
