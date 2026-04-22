# Lexora LMS

Lexora LMS is a security-first, future-proof modular monolith academic platform. This repository contains the project foundation only: a Turborepo + pnpm monorepo, a Next.js web app shell, a NestJS API shell, shared packages, local infrastructure, and architecture guardrails for department-scoped multi-tenancy.

## Technology Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui-compatible package patterns, React Query, React Hook Form, Zod, Zustand
- Backend: NestJS, TypeScript
- Database: PostgreSQL with Prisma ORM
- Cache, queue, session, and rate limiting support: Redis
- Storage: S3-compatible object storage through adapter-ready configuration
- Architecture: modular monolith with strict module boundaries

## Security-First Principles

- Deny by default for every privileged action
- RBAC is necessary but never sufficient; resource-scope checks are mandatory
- Department scoping is enforced from day one
- Sensitive actions must emit audit records
- File handling must pass through a controlled storage and malware-scanning pipeline
- Business rules live in application and domain layers, not controllers or repositories

## Monorepo Layout

```text
apps/
  api/        NestJS API
  web/        Next.js web application
packages/
  config/     Shared runtime-safe configuration and constants
  eslint-config/
  tsconfig/
  types/      Shared platform contracts and types
  ui/         Shared React UI primitives and layouts
docs/
  architecture-rules.md
```

## Backend Module List

- identity-access
- department-config
- user-management
- course-management
- enrollment
- class-session
- attendance
- assignment
- quiz
- result-processing
- transcript-verification
- discussion
- notification
- file-storage
- audit-compliance
- reporting-dashboard
- system-configuration
- integration-layer

## Setup

1. Install Node.js 22+ and pnpm 10+.
2. Copy `.env.example` to `.env`.
3. Start local services:

```bash
docker compose up -d
```

4. Install workspace dependencies:

```bash
pnpm install
```

5. Generate the Prisma client:

```bash
pnpm db:generate
```

6. Start the apps:

```bash
pnpm dev
```

The web app runs on `http://localhost:3000` and the API runs on `http://localhost:4000`.

## Local Development

- `pnpm dev:web` runs only the Next.js app
- `pnpm dev:api` runs only the NestJS app
- `pnpm lint` runs workspace linting
- `pnpm typecheck` runs workspace type-checking
- `pnpm db:push` pushes the current Prisma schema to the local database
- `docker compose --profile mail up -d` enables Mailpit
- `docker compose --profile admin up -d` enables pgAdmin

## Architecture Overview

The codebase is organized as a modular monolith. Each backend module owns its own application, domain, and infrastructure boundary. Cross-module collaboration must happen through explicit exports and interfaces, never by reaching into another module's database models or internal services. The frontend is segmented by application area (`auth`, `admin`, `teacher`, `student`, and public verification) with a shared shell and shared package imports for consistency.

Detailed architecture rules are defined in `docs/architecture-rules.md`.
