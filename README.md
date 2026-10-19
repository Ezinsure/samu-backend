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

Defaults match `docker-compose.yml` (`samu` / `samu` on port `5432`).

### 3. Install, migrate, start API

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

- API: [http://localhost:4000](http://localhost:4000)
- Health: [http://localhost:4000/health](http://localhost:4000/health)
- API root: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)

### 4. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Until Phase B1+ adapters land, the UI still uses the demo store.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:deploy` | Apply migrations (CI/prod) |
| `npm run db:seed` | Seed database (users from Phase B1) |

## Project structure

```text
backend/
  prisma/           # schema + migrations + seed
  src/
    config/         # env validation
    lib/            # prisma, logger, errors
    middleware/     # error + 404 (auth in B1)
    modules/        # domain modules (health, auth, …)
    app.ts          # Express app factory
    server.ts       # HTTP listen + shutdown
```

## Phase status

| Phase | Status |
| --- | --- |
| B0 — Scaffold + Docker + health | Current |
| B1 — Auth + seed users | Next |

See `../DOCs/SAMU-Backend-Implementation-Phases.md`.
