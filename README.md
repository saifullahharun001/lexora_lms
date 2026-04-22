# Lexora LMS

Lexora LMS is a security-first, future-proof modular monolith academic platform. This repository contains foundation code only: a Turborepo + pnpm monorepo, a Next.js web shell, a NestJS API shell, shared packages, local infrastructure, and architecture guardrails for department-scoped multi-tenancy.

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
- There is no super-admin role; administration is department-scoped only
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

PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Start local services:

```powershell
docker compose up -d
```

4. Install workspace dependencies:

```powershell
pnpm install
```

5. Generate the Prisma client:

```powershell
pnpm db:generate
```

6. Push the foundation schema to the local database:

```powershell
pnpm db:push
```

7. Start the apps:

```powershell
pnpm dev
```

The web app runs on `http://localhost:3000` and the API runs on `http://localhost:4000`.

## Local Development

- `pnpm dev:web` runs only the Next.js app
- `pnpm dev:api` runs only the NestJS app
- `pnpm lint` runs workspace linting
- `pnpm typecheck` runs workspace type-checking
- `pnpm db:push` pushes the current Prisma schema to the local database
- `docker compose --profile mail up -d` enables MailPit
- `docker compose --profile admin up -d` enables pgAdmin
- MinIO is available at `http://localhost:9001` and the `lexora-local` bucket is created automatically by `minio-init`

## Architecture Overview

The codebase is organized as a modular monolith. Each backend module owns its own application, domain, and infrastructure boundary. Cross-module collaboration must happen through explicit exports and interfaces, never by reaching into another module's database models or internal services. The frontend is segmented by application area (`sign-in`, `forgot-password`, `admin`, `teacher`, `student`, and public verification) with a shared shell and shared package imports for consistency.

Department context is a first-class backend concern. Authenticated requests derive active department scope from the principal context, while public verification flows are isolated exceptions with explicit read-only handling and no ambient department privileges.

Detailed architecture rules are defined in [docs/architecture-rules.md](docs/architecture-rules.md).
