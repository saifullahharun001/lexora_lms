# Lexora LMS Architecture Rules

## Foundation Scope

This repository currently contains foundation code only. It establishes module boundaries, runtime configuration, shared packages, local infrastructure, and security guardrails. It does not contain academic business workflows, feature endpoints, or user-facing feature logic.

## Modular Monolith Boundaries

- Every business capability lives inside a top-level NestJS module.
- Each module owns its internal `application`, `domain`, and `infrastructure` layers.
- A module may export public providers, contracts, DTOs, and interfaces intended for other modules.
- A module may not import another module's internal files directly.
- Shared technical concerns belong in `src/common` or `src/platform`, not inside business modules.

## Business Rules Placement

- Controllers orchestrate transport concerns only.
- Guards and interceptors enforce access and cross-cutting policy checks.
- Repositories and Prisma adapters persist and retrieve data only.
- Business rules, invariants, and transactional decisions must live in the service layer or domain layer.
- Validation at the transport edge is allowed, but domain invariants may not depend on controller validation alone.

## Data Access Rules

- No module may directly query another module's tables through Prisma or raw SQL.
- Cross-module data access must go through exported interfaces or explicit application services.
- Shared read models, if needed later, must be defined intentionally and documented before introduction.
- Raw SQL requires a security and ownership review.

## Department Scoping Rules

- Department is the default tenant boundary for academic data.
- Every department-scoped record must carry a department identifier or derive one through a constrained aggregate root.
- Incoming requests must resolve actor scope before any business operation.
- Cross-department reads or writes are forbidden unless an explicit system-level permission allows them.
- Global configuration is allowed only for explicitly platform-level resources.

## Authorization Rules

- Authorization is deny-by-default.
- A successful role match alone is insufficient for access.
- Every sensitive action must evaluate role, permission, and resource scope.
- Object-level authorization is mandatory for records that can differ by department, course, class, or ownership.
- Authorization checks must be centralized in policies, guards, or application services rather than scattered through controllers.

## Audit Requirements

- Sensitive actions must write an audit record.
- Sensitive actions include authentication events, permission changes, user lifecycle changes, department configuration changes, storage access, and academic record modifications.
- Audit events must capture actor, action, target type, target identifier, department scope, request metadata, and outcome.
- Audit logging must be append-oriented and resistant to silent deletion from application code paths.

## File and Storage Rules

- File uploads must enter through the `file-storage` module only.
- File metadata and access permissions must be enforced before object retrieval.
- Malware scanning must be part of the file pipeline whenever enabled by configuration.
- Public file exposure requires explicit, revocable policy.

## Integration Rules

- The `integration-layer` module owns inbound and outbound external system integration patterns.
- External integrations may not bypass internal authorization, audit, or department scoping rules.
- Background jobs and async handlers must preserve tenant scope and actor provenance when relevant.

## Frontend Rules

- App Router route groups define the top-level application areas.
- Shared layouts, providers, and navigation live in shared locations and must not embed module-specific business logic.
- Frontend route protection must complement, not replace, backend authorization.
- Foundation code may establish forms, stores, providers, and route shells, but must not implement business features yet.

