# Authorization Layer

## Overview

Lexora authorization is split into two runtime steps:

1. `AuthGuard` verifies the JWT access token and loads the authenticated principal from the database.
2. `PolicyGuard` evaluates the required string policy against the principal's roles, permissions, and department scope.

The system is intentionally simple for the MVP:

- string-based policies
- department-scope enforcement
- role-permission loading from the database
- static fallback role-policy mapping when policy coverage is not yet fully modeled in DB permissions
- lightweight in-memory policy caching
- ownership checks are left as an explicit extension point for later

## How Policies Work

Policies are plain strings, for example:

- `assignment.create`
- `result.publish`
- `user.read.self`

At runtime:

- user roles and role permissions are loaded from the DB
- permission grants are normalized into policy-like strings
- static role policy fallbacks are added
- the requested policy is matched directly or by wildcard/prefix rules

Examples:

- `department_admin` includes explicit broad module prefixes instead of a universal wildcard
- a teacher fallback may include `assignment.record.create`
- a permission such as `user-management.user.read_self` can derive a shorthand policy like `user.read.self`

## 401 vs 403

Lexora separates authentication failures from authorization failures:

- `AuthGuard` returns `401 Unauthorized` when the bearer token is missing, invalid, expired, or when the principal can no longer be loaded
- `PolicyGuard` returns `403 Forbidden` when authentication succeeded but the required policy or department scope check fails

This keeps HTTP semantics predictable for API clients and makes auth troubleshooting clearer.

## Department Scope

Authorization also enforces a basic department check:

- the principal must be authenticated
- the principal must have an active department
- if the resolved request department differs from the principal's active department, access is denied

This is intentionally basic for the MVP and is designed to be extended later with ownership/resource checks.

## Decorator

Use `@RequirePolicy("policy.name")` to mark protected handlers.

If no policy is present, `PolicyGuard` allows the request.

## Usage Example

```ts
import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { RequirePolicy } from "@/modules/authorization/decorators/require-policy.decorator";

@Controller({ path: "example", version: "1" })
export class ExampleController {
  @Get()
  @UseGuards(AuthGuard, PolicyGuard)
  @RequirePolicy("result.publish")
  list() {
    return { ok: true };
  }
}
```

## Adding a New Policy

1. Add a new policy string constant in the relevant module domain file if that module already uses policy-name constants.
2. Protect the route with `@RequirePolicy("your.policy.name")`.
3. Ensure the policy is reachable either:
   - through DB-backed role permissions that normalize to that policy, or
   - through the simple static fallback role-policy map in `AuthorizationService`
4. Add a stronger ownership/resource check later if the endpoint needs more than department scope.

## Cache Invalidation

`AuthorizationService` keeps a short-lived in-memory cache of resolved principal policies.

Available invalidation hooks:

- `clearPrincipalCache(userId: string)`
- `clearAllPolicyCache()`

This cache is intentionally local to the current process. When user roles or role permissions change, the future user-management or role-management flow must call one of these invalidation methods so policy decisions are refreshed immediately instead of waiting for TTL expiry.

## Why Wildcard Admin Was Removed

The original MVP fallback granted `department_admin` a universal `*` policy. That made the MVP convenient, but it also bypassed policy naming discipline and made it too easy for new modules to become implicitly exposed without an explicit authorization decision.

The fallback now uses broad but named module prefixes such as `result-processing.*` and `notification.*`. This keeps the admin role practical while still requiring every area of the system to fit into an intentional policy namespace.

## Current Limitations

- policy matching is intentionally simple
- ownership checks are placeholder-level only
- static fallback role-policy mappings are still a bootstrap layer and should shrink as DB-backed permission coverage becomes authoritative
- there is no distributed cache yet; policy resolution uses lightweight in-memory caching only
- cache invalidation is manual for now and is not yet wired into role or permission update flows
- department scope checks are request-context based and do not yet enforce resource ownership or cross-department exception workflows
