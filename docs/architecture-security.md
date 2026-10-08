# Architecture and security

**Classification:** durable rules plus implemented identity/authorization foundation; specific academic controls have runtime evidence. Full identity security is **partial**. Evidence: [runtime checklist](runtime-test-checklist.md#current-verified-baseline-index). Academic workflows extend beyond the original foundation.

## Implemented request and authorization boundary

`AuthGuard` validates the access JWT and loads the principal from the database. `PolicyGuard` evaluates the string policy declared with `@RequirePolicy()` against role permissions and department context. Every sensitive route must declare its policy and enforce object authority in policies/application services.

The authenticated principal's active department is authoritative. Request context must remain available across guard/service execution. A caller's `x-department-id` never overrides it. Object reads/writes must constrain both identifier and department; ownership/assignment checks are additional requirements. Student self-resource scope and current Teacher assigned-course scope are mandatory. Foreign or unauthorized object identifiers fail safely, often with `404`; missing/invalid authentication is `401`, and policy denial normally `403`. A safe-not-found denial is not an authorization failure.

Policies normalize DB grants and may include static named fallback prefixes. Department Admin has no universal `*` grant. Sensitive academic workflows additionally require exact permission provenance and live appointments; generic module prefixes cannot confer Examiner, Committee or Chairman authority. Principal, permission, resource state and assignment must be revalidated at the protected transaction boundary where required.

Generic policy resolution matches normalized grants directly or through supported wildcard/prefix rules. New sensitive handlers must declare the applicable policy, establish its explicit grant and enforce ownership/assignment and record-state checks when introduced; those checks must not be deferred merely because a role matches.

**Current limitations:** the generic `PolicyGuard` allows a request when no policy metadata is present. This is a gap against deny-by-default route design, not permission to omit metadata. Generic policy matching/fallbacks remain simple; policy cache is process-local and manual invalidation hooks (`clearPrincipalCache(userId)`, `clearAllPolicyCache()`) are not a distributed revocation mechanism. Older statements that all ownership is placeholder-only are superseded for runtime-tested module paths, but do not establish universal object-check coverage.

The design's `AuthorizationGuard`, `@RequirePermissions`, `@RequirePolicies`, `@RequireStepUp` and `@AuditAction` patterns describe target architecture; do not substitute them for the current `AuthGuard` / `PolicyGuard` / `@RequirePolicy()` contract or claim full step-up enforcement.

## Administrative Model

- Lexora LMS does not have a super-admin role.
- Administrative authority is department-scoped only.
- A department administrator may act only within the department attached to the active request context.
- There is no bypass role that can silently cross department boundaries.

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
- No cross-module table access is allowed without an interface contract that is explicitly exported by the owning module.

## Department Scoping Rules

- Department is the default tenant boundary for academic data.
- Every department-scoped record must carry a department identifier or derive one through a constrained aggregate root.
- Incoming requests must resolve department scope before any business operation.
- Authenticated users derive department scope from their authenticated principal context and active department assignment.
- Backend services must read department scope from request context, not from ad hoc controller parameters alone.
- Cross-department reads and writes are forbidden by default.
- When a principal's active department and target resource department do not match, access must be denied and the denial must be auditable.
- Public transcript verification and similar public verification flows are explicit exceptions. They run in an isolated public-verification context, not in an administrative or instructional department context.
- Global configuration is allowed only for explicitly platform-level technical settings, never as a hidden bypass around department isolation.

## Authorization Rules

- Authorization is deny-by-default.
- A successful role match alone is insufficient for access.
- Every sensitive action must evaluate role, permission, and resource scope.
- RBAC is only the first gate; scoped policy checks are mandatory.
- Object-level authorization is mandatory for records that can differ by department, course, class, or ownership.
- Authorization checks must be centralized in policies, guards, or application services rather than scattered through controllers.
- Public verification routes must use separate policy rules that grant only the minimal read scope required for verification output.

## Audit Requirements

- Sensitive actions must write an audit record.
- Sensitive actions include authentication events, permission changes, user lifecycle changes, department configuration changes, storage access, and academic record modifications.
- Audit events must capture actor, action, target type, target identifier, department scope, request metadata, and outcome.
- Audit logging must be append-oriented and resistant to silent deletion from application code paths.
- Audit context for sensitive actions must include the resolved department scope or the explicit public-verification exception context.

## File and Storage Rules

- File uploads must enter through the `file-storage` module only.
- File metadata and access permissions must be enforced before object retrieval.
- Malware scanning must be part of the file pipeline whenever enabled by configuration.
- Public file exposure requires explicit, revocable policy.

## Integration Rules

- The `integration-layer` module owns inbound and outbound external system integration patterns.
- External integrations may not bypass internal authorization, audit, or department scoping rules.
- Background jobs and async handlers must preserve tenant scope and actor provenance when relevant.

## Config-Driven Rules

- Academic rules must be configuration-driven, versionable, and scoped deliberately.
- Department-level academic configuration belongs in department-scoped settings, not hard-coded conditionals.

## Public Verification Isolation

- Public verification is a narrow, isolated read-only surface.
- Public verification requests must not receive administrative, teacher, student, or department-admin privileges.
- Verification handlers must not load unrelated department data beyond the minimum verification payload.
- Public verification results must be safe to return without ambient session state.

## Frontend Rules

- App Router route groups define the top-level application areas.
- Shared layouts, providers, and navigation live in shared locations and must not embed module-specific business logic.
- Frontend route protection must complement, not replace, backend authorization.


## Identity implementation and limitations

The identity MVP implements registration, login/logout, refresh rotation foundation, persisted sessions, login-attempt tracking and temporary lockout foundation. Email verification/password reset and 2FA remain incomplete security workflows. Authenticated runtime campaigns prove working login/protected-route behavior; they do not prove delivery, recovery or comprehensive session security.

## Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/request-password-reset`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/verify-email`

## Notes

- new users are created in `INVITED` state and become `ACTIVE` after email verification
- default student-role assignment is attempted if a `student` role exists in the target department
- refresh tokens are stored hashed in `Session.refreshTokenHash`
- cookie delivery is ready for `httpOnly` refresh-token usage, while response-body fallback still exists for development/testing
- current refresh-cookie behavior uses `SameSite=lax`; production should prefer `SameSite=strict` where UX allows or add a CSRF-token strategy for refresh flows
- email verification and password-reset endpoints return raw tokens only outside production because mail delivery is still a skeleton
- suspicious login events are recorded as a placeholder when lockout threshold is exceeded
- auth endpoints use a stricter throttler profile based on the existing auth rate-limit config

## Known MVP Limitations

- email transport is not implemented; verification and reset rely on skeleton token issuance only
- 2FA is readiness-only and does not yet implement TOTP enrollment, challenge, backup codes, or recovery UX
- CSRF protections for cookie-based refresh are documented but not fully implemented
- device trust, device naming, and broader session-management UX are still minimal
- refresh-token revocation is session-based but does not yet include richer anomaly response flows
- suspicious login handling is placeholder-only and does not yet enforce adaptive challenge workflows
- bcrypt is used for the MVP; an Argon2 migration is still recommended for production hardening

## Production Hardening Checklist

- implement real email delivery for verification, password reset, and security notifications
- add full 2FA flows, including enrollment, verification, backup recovery, and step-up enforcement
- harden refresh-cookie CSRF protection with `SameSite=strict` where possible or a dedicated CSRF token strategy
- confirm reverse-proxy and platform rate limiting align with the Nest auth throttler profile
- migrate password hashing to Argon2 if operationally feasible
- expand device and session management, including user-visible session listing and selective revocation
- add stronger suspicious-login detection and response workflows
- move development token fallbacks out of API responses in production environments


## Security target contracts (pending where not separately verified)

The following role, permission and policy catalog is a preserved design contract. It is not a runtime grant inventory. Role names never bypass module object authorization or the newer Chairman/Controller separation in [Result Domain](result-domain.md). References to mandatory 2FA or step-up below are requirements; real challenge/enrollment enforcement is pending.

## RBAC Model

### `department_admin`

- Administrative authority inside one department only
- Manages users, role assignments, department settings, operational reporting, file governance, and security overrides
- Cannot bypass department scoping
- Step-up authentication required for high-impact actions such as role changes, override approval, forced logout, bulk session revocation, sensitive department settings, and audit export
- Mandatory 2FA

### `teacher`

- Instruction-facing role with access to teaching resources assigned inside the active department
- Access depends on ownership or assignment checks for courses, sessions, assessments, and discussions
- Cannot manage department-wide identity settings or cross-user administrative actions
- Mandatory 2FA

### `student`

- Learner-facing role limited to self records and explicitly assigned course context
- Mostly `self` or enrollment-based access, never department-wide administration
- Optional multi-device login with risk controls
- 2FA optional by default, but step-up may be required for transcript access, sensitive file retrieval, or account recovery confirmation

### `auditor`

- Read-focused compliance role within a department
- Can inspect audit, reporting, selected academic evidence, and verification-related artifacts
- Cannot mutate academic records except explicitly modeled audit/compliance acknowledgements if introduced later
- Step-up required for audit export and override review
- Mandatory 2FA

### `support`

- Operational support role inside a department with narrow assistance privileges
- Can assist with account unlock, session revocation, password reset initiation, and troubleshooting reads
- Cannot change role assignments, department security baselines, or academic records beyond tightly defined support actions
- Step-up required for forced logout, account recovery assistance, and sensitive identity actions
- Mandatory 2FA

## Permission Catalog

Each permission is encoded as `domain.resource.action`, mapped to a scope of `department`, `self`, or `public_verification`.

### identity-access

- `identity-access.session.read_department`
- `identity-access.session.read_self`
- `identity-access.session.revoke_department`
- `identity-access.session.revoke_self`
- `identity-access.session.force_logout`
- `identity-access.auth.step_up`
- `identity-access.auth.manage_2fa_department`
- `identity-access.auth.manage_2fa_self`
- `identity-access.auth.password_reset_initiate_department`
- `identity-access.auth.password_reset_initiate_self`
- `identity-access.auth.password_reset_complete_self`
- `identity-access.auth.email_verification_issue_department`
- `identity-access.auth.email_verification_resend_self`
- `identity-access.auth.account_unlock_department`
- `identity-access.auth.login_risk_review_department`

### user-management

- `user-management.user.read_department`
- `user-management.user.read_self`
- `user-management.user.create_department`
- `user-management.user.update_department`
- `user-management.user.update_self`
- `user-management.user.archive_department`
- `user-management.user.assign_role_department`
- `user-management.user.revoke_role_department`
- `user-management.user.read_roles_self`

### department-config

- `department-config.department.read_department`
- `department-config.department.update_department`
- `department-config.settings.read_department`
- `department-config.settings.update_department`
- `department-config.rules.read_department`
- `department-config.rules.update_department`

### course-management

- `course-management.course.read_department`
- `course-management.course.read_assigned`
- `course-management.course.read_enrolled`
- `course-management.course.create_department`
- `course-management.course.update_assigned`
- `course-management.course.archive_department`

### enrollment

- `enrollment.enrollment.read_department`
- `enrollment.enrollment.read_self`
- `enrollment.enrollment.create_department`
- `enrollment.enrollment.update_department`
- `enrollment.enrollment.archive_department`

### attendance

- `attendance.record.read_department`
- `attendance.record.read_assigned`
- `attendance.record.read_self`
- `attendance.record.create_assigned`
- `attendance.record.update_assigned`
- `attendance.record.archive_department`

### assignment

- `assignment.assignment.read_department`
- `assignment.assignment.read_assigned`
- `assignment.assignment.read_self`
- `assignment.assignment.create_assigned`
- `assignment.assignment.update_assigned`
- `assignment.assignment.archive_assigned`
- `assignment.submission.read_department`
- `assignment.submission.read_assigned`
- `assignment.submission.read_self`
- `assignment.submission.create_self`
- `assignment.submission.update_self_draft`
- `assignment.submission.grade_assigned`

### quiz

- `quiz.quiz.read_department`
- `quiz.quiz.read_assigned`
- `quiz.quiz.read_self`
- `quiz.quiz.create_assigned`
- `quiz.quiz.update_assigned`
- `quiz.quiz.archive_assigned`
- `quiz.attempt.read_assigned`
- `quiz.attempt.read_self`
- `quiz.attempt.create_self`
- `quiz.attempt.submit_self`
- `quiz.attempt.grade_assigned`

### result-processing

- `result-processing.result.read_department`
- `result-processing.result.read_self`
- `result-processing.result.generate_department`
- `result-processing.result.update_department`
- `result-processing.result.publish_department`
- `result-processing.result.override_department`

### transcript-verification

- `transcript-verification.transcript.read_department`
- `transcript-verification.transcript.read_self`
- `transcript-verification.transcript.issue_department`
- `transcript-verification.transcript.revoke_department`
- `transcript-verification.verification.read_public`
- `transcript-verification.verification.issue_department`

### discussion

- `discussion.thread.read_department`
- `discussion.thread.read_assigned`
- `discussion.thread.read_self`
- `discussion.thread.create_assigned`
- `discussion.thread.update_owner`
- `discussion.thread.moderate_department`
- `discussion.post.create_assigned`
- `discussion.post.update_owner`
- `discussion.post.moderate_department`

### notification

- `notification.notification.read_department`
- `notification.notification.read_self`
- `notification.notification.create_department`
- `notification.notification.create_assigned`
- `notification.notification.update_department`
- `notification.notification.dismiss_self`

### file-storage

- `file-storage.file.read_department`
- `file-storage.file.read_owner`
- `file-storage.file.read_public_verification`
- `file-storage.file.create_department`
- `file-storage.file.create_self`
- `file-storage.file.update_owner`
- `file-storage.file.quarantine_department`
- `file-storage.file.delete_department`

### audit-compliance

- `audit-compliance.audit.read_department`
- `audit-compliance.audit.export_department`
- `audit-compliance.override.read_department`
- `audit-compliance.override.request_department`
- `audit-compliance.override.approve_department`
- `audit-compliance.override.execute_department`

### reporting-dashboard

- `reporting-dashboard.dashboard.read_department`
- `reporting-dashboard.dashboard.export_department`

### system-configuration

- `system-configuration.security.read_department`
- `system-configuration.security.update_department`
- `system-configuration.integration.read_department`
- `system-configuration.integration.update_department`

## Role-Permission Matrix

Legend:

- `D`: department-wide base permission
- `O`: ownership, assignment, or enrollment check also required
- `A`: audit mandatory
- `S`: step-up authentication required

| Permission | department_admin | teacher | student | auditor | support | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `identity-access.session.read_department` | D |  |  | D | D | A for privileged reads |
| `identity-access.session.read_self` |  |  | O |  |  | Self only |
| `identity-access.session.revoke_department` | D/A/S |  |  |  | D/A/S | Cannot cross departments |
| `identity-access.session.revoke_self` |  |  | O/A |  |  | Self session revocation |
| `identity-access.session.force_logout` | D/A/S |  |  |  | D/A/S | High-impact |
| `identity-access.auth.step_up` | D/O/A | O/A | O/A | O/A | O/A | Internal auth operation |
| `identity-access.auth.manage_2fa_department` | D/A/S |  |  |  | D/A/S | Support limited to recovery assistance |
| `identity-access.auth.manage_2fa_self` |  | O/A | O/A |  |  | Self only |
| `identity-access.auth.password_reset_initiate_department` | D/A/S |  |  |  | D/A/S | For admin/support assistance |
| `identity-access.auth.password_reset_initiate_self` |  |  | O/A |  |  | Self recovery start |
| `identity-access.auth.password_reset_complete_self` |  |  | O/A/S |  |  | Step-up if risk detected |
| `identity-access.auth.email_verification_issue_department` | D/A |  |  |  | D/A | Limited operational use |
| `identity-access.auth.email_verification_resend_self` |  |  | O |  |  | Self only |
| `identity-access.auth.account_unlock_department` | D/A/S |  |  |  | D/A/S | Lockout recovery |
| `identity-access.auth.login_risk_review_department` | D/A/S |  |  | D/A/S | D/A/S | Security review |
| `user-management.user.read_department` | D |  |  | D | D | Filter sensitive fields by role |
| `user-management.user.read_self` |  |  | O |  |  | Self profile |
| `user-management.user.create_department` | D/A/S |  |  |  |  | User provisioning |
| `user-management.user.update_department` | D/A |  |  |  | D/A | Support limited by field policy |
| `user-management.user.update_self` |  | O | O |  |  | Self-maintained profile subset |
| `user-management.user.archive_department` | D/A/S |  |  |  |  | High-impact lifecycle action |
| `user-management.user.assign_role_department` | D/A/S |  |  |  |  | Restricted to allowed roles |
| `user-management.user.revoke_role_department` | D/A/S |  |  |  |  | Restricted to allowed roles |
| `user-management.user.read_roles_self` |  | O | O |  |  | Visibility only |
| `department-config.department.read_department` | D |  |  | D | D | Department metadata |
| `department-config.department.update_department` | D/A/S |  |  |  |  | High-impact |
| `department-config.settings.read_department` | D |  |  | D | D | Some secrets redacted |
| `department-config.settings.update_department` | D/A/S |  |  |  |  | Config-driven rules |
| `department-config.rules.read_department` | D |  |  | D | D | Academic/security rules |
| `department-config.rules.update_department` | D/A/S |  |  |  |  | High-impact |
| `course-management.course.read_department` | D |  |  | D |  | Full department read |
| `course-management.course.read_assigned` |  | O |  |  |  | Assigned teaching context |
| `course-management.course.read_enrolled` |  |  | O |  |  | Enrolled context |
| `course-management.course.create_department` | D/A |  |  |  |  | Future module action |
| `course-management.course.update_assigned` |  | O/A |  |  |  | Assignment required |
| `course-management.course.archive_department` | D/A/S |  |  |  |  | High-impact |
| `enrollment.enrollment.read_department` | D |  |  | D |  | Department reports/compliance |
| `enrollment.enrollment.read_self` |  |  | O |  |  | Student self |
| `enrollment.enrollment.create_department` | D/A |  |  |  |  | Future module action |
| `enrollment.enrollment.update_department` | D/A |  |  |  |  | Future module action |
| `enrollment.enrollment.archive_department` | D/A/S |  |  |  |  | High-impact |
| `attendance.record.read_department` | D |  |  | D |  | Compliance reporting |
| `attendance.record.read_assigned` |  | O |  |  |  | Teacher assigned classes |
| `attendance.record.read_self` |  |  | O |  |  | Student self |
| `attendance.record.create_assigned` |  | O/A |  |  |  | Teacher assignment required |
| `attendance.record.update_assigned` |  | O/A |  |  |  | Before lock/finalization |
| `attendance.record.archive_department` | D/A/S |  |  |  |  | High-impact |
| `assignment.assignment.read_department` | D |  |  | D |  | Broad review |
| `assignment.assignment.read_assigned` |  | O |  |  |  | Teacher assignment |
| `assignment.assignment.read_self` |  |  | O |  |  | Student enrollment |
| `assignment.assignment.create_assigned` |  | O/A |  |  |  | Teacher assignment |
| `assignment.assignment.update_assigned` |  | O/A |  |  |  | Pre-publish or editable state |
| `assignment.assignment.archive_assigned` |  | O/A/S |  |  |  | Sensitive archive |
| `assignment.submission.read_department` | D |  |  | D |  | Compliance read |
| `assignment.submission.read_assigned` |  | O |  |  |  | Teacher grading context |
| `assignment.submission.read_self` |  |  | O |  |  | Submitter only |
| `assignment.submission.create_self` |  |  | O/A |  |  | Enrolled and open window |
| `assignment.submission.update_self_draft` |  |  | O/A |  |  | Draft/open only |
| `assignment.submission.grade_assigned` |  | O/A/S |  |  |  | Sensitive academic action |
| `quiz.quiz.read_department` | D |  |  | D |  | Department read |
| `quiz.quiz.read_assigned` |  | O |  |  |  | Teacher assignment |
| `quiz.quiz.read_self` |  |  | O |  |  | Student eligible view |
| `quiz.quiz.create_assigned` |  | O/A |  |  |  | Teacher assignment |
| `quiz.quiz.update_assigned` |  | O/A |  |  |  | Editable state only |
| `quiz.quiz.archive_assigned` |  | O/A/S |  |  |  | Sensitive |
| `quiz.attempt.read_assigned` |  | O |  |  |  | Teacher grading review |
| `quiz.attempt.read_self` |  |  | O |  |  | Student self |
| `quiz.attempt.create_self` |  |  | O/A |  |  | Enrolled and available |
| `quiz.attempt.submit_self` |  |  | O/A |  |  | Open attempt only |
| `quiz.attempt.grade_assigned` |  | O/A/S |  |  |  | Sensitive |
| `result-processing.result.read_department` | D |  |  | D |  | Restricted by sensitivity |
| `result-processing.result.read_self` |  |  | O |  |  | Student self |
| `result-processing.result.generate_department` | D/A/S |  |  |  |  | Sensitive bulk operation |
| `result-processing.result.update_department` | D/A/S |  |  |  |  | Sensitive academic record |
| `result-processing.result.publish_department` | D/A/S |  |  |  |  | High-impact |
| `result-processing.result.override_department` | D/A/S |  |  |  |  | Override workflow |
| `transcript-verification.transcript.read_department` | D |  |  | D |  | Sensitive read |
| `transcript-verification.transcript.read_self` |  |  | O/S |  |  | Step-up recommended |
| `transcript-verification.transcript.issue_department` | D/A/S |  |  |  |  | High-impact |
| `transcript-verification.transcript.revoke_department` | D/A/S |  |  |  |  | High-impact |
| `transcript-verification.verification.read_public` |  |  |  |  |  | Public scope only |
| `transcript-verification.verification.issue_department` | D/A/S |  |  |  |  | Public artifact issuance |
| `discussion.thread.read_department` | D |  |  | D |  | Moderation/compliance |
| `discussion.thread.read_assigned` |  | O |  |  |  | Teacher teaching context |
| `discussion.thread.read_self` |  |  | O |  |  | Student enrolled context |
| `discussion.thread.create_assigned` |  | O/A | O/A |  |  | Role-specific context |
| `discussion.thread.update_owner` |  | O/A | O/A |  |  | Owner plus state checks |
| `discussion.thread.moderate_department` | D/A |  |  |  | D/A | Moderation |
| `discussion.post.create_assigned` |  | O/A | O/A |  |  | Thread access required |
| `discussion.post.update_owner` |  | O/A | O/A |  |  | Owner and open state |
| `discussion.post.moderate_department` | D/A |  |  |  | D/A | Moderation |
| `notification.notification.read_department` | D |  |  | D | D | Operational visibility |
| `notification.notification.read_self` |  | O | O |  |  | Own inbox |
| `notification.notification.create_department` | D/A |  |  |  | D/A | Broadcast/admin |
| `notification.notification.create_assigned` |  | O/A |  |  |  | Teacher assigned courses |
| `notification.notification.update_department` | D/A |  |  |  | D/A | Draft/cancel |
| `notification.notification.dismiss_self` |  | O | O |  |  | Self only |
| `file-storage.file.read_department` | D |  |  | D | D | Filter by sensitivity |
| `file-storage.file.read_owner` |  | O | O |  |  | Owner/attached record access |
| `file-storage.file.read_public_verification` |  |  |  |  |  | Public scope only |
| `file-storage.file.create_department` | D/A | O/A |  |  | D/A | Depending on module use |
| `file-storage.file.create_self` |  |  | O/A |  |  | Self submission/profile evidence |
| `file-storage.file.update_owner` |  | O/A | O/A |  |  | Mutable metadata only |
| `file-storage.file.quarantine_department` | D/A/S |  |  | D/A/S | D/A/S | Security action |
| `file-storage.file.delete_department` | D/A/S |  |  |  |  | High-impact |
| `audit-compliance.audit.read_department` | D |  |  | D |  | Sensitive read |
| `audit-compliance.audit.export_department` | D/A/S |  |  | D/A/S |  | Step-up mandatory |
| `audit-compliance.override.read_department` | D |  |  | D | D | Sensitive read |
| `audit-compliance.override.request_department` | D/A/S |  |  |  | D/A/S | Support/admin only |
| `audit-compliance.override.approve_department` | D/A/S |  |  | D/A/S |  | Segregation of duties preferred |
| `audit-compliance.override.execute_department` | D/A/S |  |  |  |  | Post-approval only |
| `reporting-dashboard.dashboard.read_department` | D |  |  | D | D | Aggregated read |
| `reporting-dashboard.dashboard.export_department` | D/A/S |  |  | D/A/S |  | Export sensitive |
| `system-configuration.security.read_department` | D |  |  | D | D | Secrets masked |
| `system-configuration.security.update_department` | D/A/S |  |  |  |  | High-impact |
| `system-configuration.integration.read_department` | D |  |  | D | D | Mask secrets |
| `system-configuration.integration.update_department` | D/A/S |  |  |  |  | High-impact |

## Policy Rule Catalog

### users

- Read:
  - `department_admin`, `support`, `auditor` can read department users
  - `teacher` and `student` can read self only
- Create:
  - `department_admin` only
- Update:
  - `department_admin` can update department users except immutable security anchors without step-up
  - `support` can update limited operational fields
  - users can update self profile subset
- Archive/Delete:
  - `department_admin` only, archive preferred over delete
- Ownership:
  - self-service changes limited to own profile
- Department scope:
  - user and actor department must match
- Record state:
  - archived users cannot be modified except restoration workflow
- Audit:
  - mandatory for create, archive, role changes, security-sensitive field changes
- Step-up:
  - required for archive, role assignment, email change by admin/support, forced unlock

### departments

- Read:
  - `department_admin`, `support`, `auditor`
- Create:
  - not exposed in department-scoped administration baseline
- Update:
  - `department_admin`
- Archive/Delete:
  - not routine; archive via controlled platform process if ever introduced
- Ownership:
  - none
- Department scope:
  - only active department record
- Record state:
  - disabled/archived departments become read-only
- Audit:
  - mandatory
- Step-up:
  - required

### courses

- Read:
  - admin/auditor department-wide
  - teacher if assigned
  - student if enrolled
- Create:
  - department admin
- Update:
  - admin department-wide
  - teacher only if assigned and editable fields are teacher-managed
- Archive/Delete:
  - admin only
- Ownership:
  - teacher assignment required for teacher mutation
- Department scope:
  - target course department must equal active department
- Record state:
  - archived courses are read-only
- Audit:
  - create, archive, ownership changes
- Step-up:
  - archive and reassignment

### enrollments

- Read:
  - admin/auditor department-wide
  - student self
- Create/Update:
  - department admin
- Archive/Delete:
  - department admin
- Ownership:
  - self read only for enrolled student
- Department scope:
  - enrollment, user, and course must share department
- Record state:
  - finalized/archived enrollment blocks destructive change
- Audit:
  - mandatory for create, status change, archive
- Step-up:
  - not for routine create; yes for override/forced status change

### sessions

- Read:
  - admin/support/auditor department-wide
  - user self sessions
- Create:
  - internal auth flow only
- Update:
  - internal auth flow only
- Archive/Delete:
  - revoke rather than delete
- Ownership:
  - self revoke allowed for own sessions
- Department scope:
  - session department must match active department
- Record state:
  - revoked/expired sessions are immutable except audit annotations
- Audit:
  - mandatory for creation, revocation, forced logout, suspicious flags
- Step-up:
  - required for forced logout and broad revocation

### attendance records

- Read:
  - admin/auditor department-wide
  - teacher assigned
  - student self
- Create/Update:
  - teacher assigned
  - admin by override only
- Archive/Delete:
  - admin only through override path
- Ownership:
  - teacher must be assigned to class/session
- Department scope:
  - class session and student must share department
- Record state:
  - locked/finalized attendance cannot be changed without override
- Audit:
  - mandatory
- Step-up:
  - required for override or post-finalization change

### assignments

- Read:
  - admin/auditor department-wide
  - teacher assigned
  - student enrolled
- Create/Update:
  - teacher assigned
  - admin by department oversight
- Archive/Delete:
  - teacher assigned or admin, depending on final policy
- Ownership:
  - teacher assignment required
- Department scope:
  - assignment department must equal active department
- Record state:
  - published/closed assignments have restricted mutation
- Audit:
  - mandatory for archive and deadline/security-sensitive changes
- Step-up:
  - required for archive or retroactive deadline changes

### submissions

- Read:
  - teacher grading context
  - admin/auditor department-wide
  - student own submission
- Create:
  - student self
- Update:
  - student while draft/open
  - teacher grade/feedback if assigned
- Archive/Delete:
  - archive only through controlled workflow
- Ownership:
  - submitter owns draft updates
  - teacher ownership comes from assignment ownership
- Department scope:
  - submission, assignment, and student must share department
- Record state:
  - submitted/graded/finalized states restrict mutation
- Audit:
  - mandatory for grade changes
- Step-up:
  - required for final grade override

### quizzes

- Read:
  - admin/auditor department-wide
  - teacher assigned
  - student eligible participant
- Create/Update:
  - teacher assigned
- Archive/Delete:
  - teacher assigned or admin by policy
- Ownership:
  - teacher assignment required
- Department scope:
  - department match required
- Record state:
  - active quiz cannot be materially altered without override
- Audit:
  - mandatory for publish/archive/security-sensitive timing changes
- Step-up:
  - required for post-publication high-impact changes

### results

- Read:
  - admin/auditor department-wide
  - student self
- Create/Update:
  - result-processing service or department admin workflow
- Archive/Delete:
  - not routine; use supersede/override patterns
- Ownership:
  - self read only for student result
- Department scope:
  - department match required
- Record state:
  - published/finalized results require override path to change
- Audit:
  - mandatory
- Step-up:
  - required for generation, publish, override

### transcripts

- Read:
  - admin/auditor department-wide
  - student self
  - public verification only through isolated verification artifact
- Create:
  - department admin issuance workflow
- Update:
  - not direct; supersede/reissue preferred
- Archive/Delete:
  - revoke/reissue instead of delete
- Ownership:
  - student self access only to own transcript
- Department scope:
  - transcript and student department must match
- Record state:
  - issued transcripts immutable except revocation metadata
- Audit:
  - mandatory
- Step-up:
  - required for issue, revoke, export, self transcript retrieval if sensitive

### file objects

- Read:
  - admin/support/auditor department-wide as allowed by attachment context
  - owner or attached-resource participants
  - public verification only if explicitly marked
- Create:
  - admin/support/teacher/student depending on attachment flow
- Update:
  - owner metadata only while not archived/quarantined
- Archive/Delete:
  - admin only
  - quarantine by admin/auditor/support security path
- Ownership:
  - uploader alone is not enough if resource-based access is stricter
- Department scope:
  - file department must equal active department unless public verification object
- Record state:
  - quarantined/deleted objects unavailable except compliance review
- Audit:
  - mandatory for delete, quarantine, sensitive reads
- Step-up:
  - required for delete/quarantine and high-sensitivity retrieval

### discussions

- Read:
  - admin/auditor department-wide
  - teacher assigned
  - student enrolled/participant
- Create:
  - teacher/student within authorized course context
- Update:
  - owner while editable
  - moderators through moderation privilege
- Archive/Delete:
  - moderation/admin only or owner before replies if policy allows
- Ownership:
  - owner-based update rule
- Department scope:
  - thread/post must remain in active department
- Record state:
  - locked/moderated/archived threads restrict mutation
- Audit:
  - mandatory for moderation actions
- Step-up:
  - only for exceptional moderation overrides

### audit logs

- Read:
  - auditor and department admin
  - support only when explicitly granted narrow troubleshooting scope
- Create:
  - system only
- Update:
  - append-only annotations only if ever allowed
- Archive/Delete:
  - never through routine application flow
- Ownership:
  - not applicable
- Department scope:
  - only logs for active department, except public verification logs tagged as exception context
- Record state:
  - immutable
- Audit:
  - access itself should be audited
- Step-up:
  - required for export

### override actions

- Read:
  - admin, auditor, support as scoped
- Create:
  - admin/support can request
- Update:
  - approve/execute by allowed actors only
- Archive/Delete:
  - revoke, not delete
- Ownership:
  - requester cannot be sole approver for highest-risk categories where segregation is enabled
- Department scope:
  - request and target must stay in same department
- Record state:
  - executed/revoked/rejected are terminal
- Audit:
  - mandatory at every stage
- Step-up:
  - required for request, approval, and execution

## Security Rules

### Brute-force Protection

- Rate limit by IP, normalized email, and device fingerprint
- Progressive backoff after repeated failures
- Distinct auth limiter stricter than general API limiter

### Failed Login Lockout

- Lock account temporarily after threshold failures
- Department admins and support can unlock with audit and step-up
- Lockout windows increase on repeated abuse

### Concurrent Session Rules

- Teachers, admins, auditors, and support have stricter concurrent session caps
- Students may keep multiple active sessions within configurable limits
- High-risk session creation can revoke older sessions automatically

### Suspicious IP/Device Login Detection

- Flag first-seen device, unusual geo/IP shifts, impossible travel heuristics, rapid device churn, and repeated failed step-up attempts
- Require step-up or block depending on policy

### Session Revocation

- Self revocation for own sessions
- Department admin/support can revoke department user sessions with step-up and audit
- Security-triggered revocation on password reset, role downgrade, 2FA reset, or suspicious activity

### Forced Logout

- Allowed only for department admin/support with step-up
- Always audited

### Password Reset Token Rules

- Single-use, hashed at rest, short TTL
- Invalidated on password change
- Completion may require step-up when risk signals exist

### Email Verification Token Rules

- Single-use, hashed at rest, short TTL
- Resend throttled
- Prior tokens invalidated on reissue

### Teacher/Admin Mandatory 2FA

- `department_admin`, `teacher`, `auditor`, and `support` must enroll 2FA before privileged access
- Fallback recovery requires audited support/admin flow with step-up

### Student Optional Multi-Device Login

- Allowed within configurable session cap
- Risk engine may require step-up for transcript access, suspicious login, recovery completion, or new device


## Audit and public-surface assurance

Audit sensitive allow/deny outcomes with actor, action, target, department, request metadata and outcome. Capture high-risk intent when required and transactionally bind required success audits to academic mutations. Protected immutability and rollback proofs are specific to the recorded module matrices, not an assertion that every audit row has identical database protections. Preserve amendment history and authoritative source versions.

Public transcript verification is isolated from administrative/principal department work and exposes only the minimal current API summary. Tokens are hashed, finite-lived and revocable; it must never disclose full transcripts or ambient role privileges.

Sensitive-data handling is mandatory across logs, audit metadata, exports and documentation: do not expose raw passwords, password hashes, access/refresh tokens, cookies, database credentials or verification tokens. Public and notification payloads must omit full confidential academic records; audit evidence retains necessary provenance with privacy-safe metadata.

The permitted Final Formative shared read projection is an explicit exported service/internal SQL contract, documented in [Formative Assessment](formative-assessment.md), not permission for arbitrary cross-module queries.

Pending 2FA, CSRF, cache invalidation, session/risk controls, email, upload operations and production infrastructure are tracked in the [hardening backlog](security-and-production-hardening-backlog.md).
