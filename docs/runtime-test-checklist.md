# Lexora LMS Runtime Test Checklist

## Test Environment

- Environment: Local Ubuntu VM
- Server IP: 192.168.197.130
- API via Nginx: http://192.168.197.130/api/v1
- Inside VM API via Nginx: http://localhost/api/v1
- Direct API Port: 4000 bound to 127.0.0.1 only
- Process Manager: PM2
- Reverse Proxy: Nginx
- Database: PostgreSQL
- Package Manager: pnpm

## 1. Deployment / Runtime Checks

- [x] PM2 process `lexora-api` online
- [x] API health works from VM through direct localhost port
- [x] API health works from VM through Nginx
- [x] API health works from Windows host through Nginx
- [x] Direct `192.168.197.130:4000` access blocked from Windows host
- [ ] PM2 survives reboot
- [ ] Nginx survives reboot
- [ ] PostgreSQL survives reboot

### Deployment Test Notes

- API was initially reachable from Windows host through direct port `4000`.
- API binding was changed from all interfaces to localhost-only:
  - From: `*:4000`
  - To: `127.0.0.1:4000`
- After the fix:
  - VM internal direct API access works through `localhost:4000`.
  - Nginx reverse proxy works through port `80`.
  - Windows host can access the API through Nginx.
  - Windows host cannot directly access `192.168.197.130:4000`.
- Deployment hardening change was committed with:
  - Commit: `46a4eaf`
  - Message: `Bind API server to localhost for reverse proxy hardening`

## 2. Auth Checks

- [x] Test department `LAW` created in database
- [x] Register student user
- [x] Email verification token generated
- [x] Verify email
- [x] Login user
- [x] Receive access token
- [x] Receive refresh token/session
- [x] Refresh token works
- [x] Logout works
- [x] Invalid password rejected
- [x] Repeated failed login attempt tracked
- [x] Successful login attempt tracked
- [x] Expired access token rejected with `401 Unauthorized`

### Auth Test Notes

- Test department inserted manually into `departments` table:
  - `id`: `dept_law_test`
  - `code`: `LAW`
  - `slug`: `law`
  - `name`: `Department of Law`
- Runtime test user:
  - Email: `runtime-test-student@cu.ac.bd`
  - Display Name: `Runtime Test Student`
  - Status after verification: `ACTIVE`
  - Department ID: `dept_law_test`
- Do not store raw access tokens, refresh tokens, or email verification tokens in documentation.
- Failed login attempt was recorded in `login_attempts` with:
  - `outcome`: `FAILURE`
  - `failure_reason`: `invalid_credentials`
- Successful login attempt was also recorded with:
  - `outcome`: `SUCCESS`
- Malformed refresh token behavior needs improvement:
  - Current behavior found during testing: `InternalServerError`
  - Expected behavior: `400 Bad Request` or `401 Unauthorized`
- Access tokens are short-lived.
- During testing, an expired access token caused `401 Unauthorized`.
- For protected endpoint testing, always use a freshly generated access token.
- Login response currently returns:
  - `accessToken`
  - `refreshToken`
  - `refreshTokenExpiresAt`
  - `twoFactor` status
- 2FA status during runtime test:
  - `enabled`: `false`
  - `required`: `false`
  - `availableMethods`: `[]`

## 3. Authorization / Department Isolation

- [x] Protected endpoint rejects unauthenticated request
- [x] Authenticated user can access own allowed resources
- [ ] Student cannot access another student’s data
- [ ] Teacher cannot access unassigned course data
- [ ] Admin cannot access another department’s data
- [x] Policy guard works on sensitive endpoints

### Authorization Test Notes

- `GET /api/v1/programs` without token returned `401 Unauthorized`.
- Initially, the logged-in runtime test user had no roles/permissions.
- The same endpoint with a valid token but no required policy returned `403 Forbidden`.
- Policy guard returned: `Access denied by policy`.
- Runtime database initially had no seeded RBAC data:
  - `permissions`: `0`
  - `roles`: `0`
  - `user_roles`: `0`
- A temporary runtime role was created for testing:
  - Role ID: `role_law_department_admin`
  - Role code: `department_admin`
  - Role name: `Runtime Department Admin`
  - Department: `dept_law_test`
- Runtime test user was assigned the temporary `department_admin` role.
- Fresh login returned:
  - `roles`: `["department_admin"]`
  - `permissions`: `[]`
- `department_admin` uses static policies from the authorization service, including:
  - `identity-access.*`
  - `department-config.*`
  - `course-management.*`
  - `enrollment.*`
  - `attendance.*`
  - `assignment.*`
  - `submission.*`
  - `quiz.*`
  - `attempt.*`
  - `result-processing.*`
  - `transcript-verification.*`
  - `notification.*`
  - `audit-compliance.*`
  - `file-storage.*`
  - `reporting-dashboard.*`
  - `system-configuration.*`
- AuthorizationService supports:
  - Direct policy match
  - Wildcard match such as `*`
  - Prefix-style match such as `course-management.*`
- `department_admin` role works because static role policies include module-level wildcard policies.
- `Authenticated user can access own allowed resources` is currently verified using the temporary `department_admin` runtime role, not a normal student self-resource flow.
- Student-specific own-resource isolation still needs separate testing.
- Teacher assigned-course isolation still needs separate testing.
- Cross-department admin isolation still needs separate testing.

### Department Context Notes

- Department context header discovered:
  - Header name: `x-department-id`
  - Runtime value used: `dept_law_test`
- DepartmentContextResolver resolves department context from:
  1. Public verification path
  2. Authenticated principal active department
  3. `x-department-id` header
  4. Unresolved fallback
- During testing, a valid token with `department_admin` role still failed at service layer before the request-context fix.
- Error before fix:
  - `Active department context is required`
- After the request-context propagation fix, the same endpoint worked.

### Request Context Bug Notes

- Root cause of request-context bug:
  - AuthGuard set `request.principal`.
  - RequestContextInterceptor initialized a new request context with `principal: null`.
  - AcademicService read principal from RequestContextService.
  - Because the request context principal was null, AcademicService failed with `Active department context is required`.
- Fix:
  - RequestContextInterceptor now initializes `principal` from `request.principal ?? null`.
  - Department context is initialized from `principal.activeDepartmentId` when available.
  - Audit department context is initialized from the resolved department context.
- No AuthGuard, PolicyGuard, department isolation, or authorization logic was changed.
- Request-context fix commit:
  - Commit: `025f8ba`
  - File changed: `apps/api/src/common/request-context/request-context.interceptor.ts`

### Request Context Fix Verification

- Codex/build verification:
  - `pnpm --filter @lexora/api build` passed.
  - `pnpm --filter @lexora/api typecheck` passed.
- Focused propagation check confirmed:
  - `principalActor`: `user_runtime_department_admin`
  - `department.kind`: `department`
  - `department.departmentId`: `dept_law_test`
  - `department.source`: `principal`
  - `auditDepartmentId`: `dept_law_test`
- Live VM verification after fix:
  - Pulled commit `025f8ba`.
  - Built API successfully.
  - Restarted `lexora-api` with PM2.
  - Fresh login returned `roles:["department_admin"]`.
  - `GET /api/v1/programs` with valid token and `x-department-id: dept_law_test` returned `200 OK`.
  - Initial response was an empty list `[]`, which was expected because no academic programs had been created yet.

## 4. Academic Core

- [x] Create academic program
- [x] List academic programs
- [x] Create course
- [x] List courses
- [x] Create academic year for runtime testing
- [x] Create academic term for runtime testing
- [x] Create course offering
- [x] List course offerings
- [ ] Assign teacher to course offering
- [ ] Enroll student
- [ ] Validate student course visibility rules

### Academic Core Runtime Context

- Academic Core protected requests used:
  - `Authorization: Bearer <access-token>`
  - `x-department-id: dept_law_test`
- Runtime user used for Academic Core testing:
  - Email: `runtime-test-student@cu.ac.bd`
  - Runtime role: `department_admin`
  - Department: `dept_law_test`
- Access tokens are short-lived.
- A fresh login was required again before creating the course offering because the previous access token expired.

### Academic Program Runtime Test

- [x] Inspected `create-program.dto.ts`
- [x] Confirmed `CreateProgramDto` accepts:
  - `code`
  - `name`
  - `description?`
  - `status?`
- [x] Confirmed `POST /api/v1/programs` is protected by:
  - `AuthGuard`
  - `PolicyGuard`
  - `PROGRAM_MANAGE` policy
- [x] Confirmed `GET /api/v1/programs` is protected by:
  - `AuthGuard`
  - `PolicyGuard`
  - `PROGRAM_READ` policy
- [x] Created academic program under `dept_law_test`
- [x] Listed academic programs and confirmed created program appears

Created program:

| Field | Value |
|---|---|
| Program ID | `cmozwlcul000d2i0lgujx0pw5` |
| Department ID | `dept_law_test` |
| Code | `LLB` |
| Name | `Bachelor of Laws` |
| Description | `Runtime test academic program for Department of Law` |
| Status | `ACTIVE` |

Result:

- `POST /api/v1/programs` returned `201 Created`.
- `GET /api/v1/programs` returned `200 OK`.
- Created program appeared in the list response.

### Course Runtime Test

- [x] Inspected `create-course.dto.ts`
- [x] Confirmed `CreateCourseDto` accepts:
  - `academicProgramId?`
  - `code`
  - `title`
  - `description?`
  - `creditHours`
  - `lectureHours?`
  - `labHours?`
  - `status?`
- [x] Confirmed `creditHours`, `lectureHours`, and `labHours` must be sent as decimal strings.
- [x] Confirmed `POST /api/v1/courses` is protected by:
  - `AuthGuard`
  - `PolicyGuard`
  - `COURSE_MANAGE` policy
- [x] Confirmed `GET /api/v1/courses` is protected by:
  - `AuthGuard`
  - `PolicyGuard`
  - `COURSE_READ` policy
- [x] Created course under the Law academic program.
- [x] Listed courses and confirmed created course appears.

Created course:

| Field | Value |
|---|---|
| Course ID | `cmozwxq8r000h2i0lg9hhmeyg` |
| Department ID | `dept_law_test` |
| Academic Program ID | `cmozwlcul000d2i0lgujx0pw5` |
| Code | `LAW-101` |
| Title | `Constitutional Law I` |
| Description | `Runtime test course under Bachelor of Laws program` |
| Credit Hours | `3` |
| Lecture Hours | `3` |
| Lab Hours | `0` |
| Status | `ACTIVE` |

Result:

- `POST /api/v1/courses` returned `201 Created`.
- `GET /api/v1/courses` returned `200 OK`.
- Created course appeared in the list response.
- Course response included linked academic program data.

### Academic Year and Academic Term Runtime Setup

Course offering creation required an `academicTermId`.

- [x] Inspected `create-course-offering.dto.ts`
- [x] Confirmed course offering requires:
  - `courseId`
  - `academicTermId`
  - `sectionCode`
- [x] Searched Academic module for Academic Term controller/DTO.
- [x] Confirmed no separate Academic Term API/controller was found in the Academic module during runtime testing.
- [x] Inspected Prisma schema for `AcademicYear`.
- [x] Inspected Prisma schema for `AcademicTerm`.
- [x] Confirmed `AcademicTerm` requires an `academicYearId`.
- [x] Checked existing `academic_years` records for `dept_law_test`.
- [x] Checked existing `academic_terms` records for `dept_law_test`.
- [x] Confirmed both tables had no existing runtime records for `dept_law_test`.
- [x] Manually inserted runtime academic year through `psql`.
- [x] Manually inserted runtime academic term through `psql`.
- [x] Verified inserted academic year and academic term records.

Created academic year:

| Field | Value |
|---|---|
| Academic Year ID | `ay_law_2025_2026` |
| Department ID | `dept_law_test` |
| Code | `AY-2025-2026` |
| Name | `Academic Year 2025-2026` |
| Start Date | `2025-07-01 00:00:00` |
| End Date | `2026-06-30 23:59:59` |
| Is Current | `true` |
| Status | `PLANNED` |

Created academic term:

| Field | Value |
|---|---|
| Academic Term ID | `term_law_2025_2026_s1` |
| Department ID | `dept_law_test` |
| Academic Year ID | `ay_law_2025_2026` |
| Code | `LAW-2025-2026-S1` |
| Name | `Law 2025-2026 Semester 1` |
| Sequence | `1` |
| Start Date | `2025-07-01 00:00:00` |
| End Date | `2025-12-31 23:59:59` |
| Enrollment Start At | `2025-07-01 00:00:00` |
| Enrollment End At | `2025-08-31 23:59:59` |
| Status | `PLANNED` |

Important runtime notes:

- `DATABASE_URL` was not initially available in the shell.
- Without `DATABASE_URL`, `psql "$DATABASE_URL"` attempted to connect through local socket as Linux user `sh002`.
- This failed with:
  - `FATAL: role "sh002" does not exist`
- `.env` was loaded manually before using `psql`.
- While loading `.env`, shell printed:
  - `LMS: command not found`
- Likely cause:
  - One or more `.env` values may contain spaces without quotes, for example a value similar to `Lexora LMS`.
- Despite that warning, `DATABASE_URL` was loaded successfully.
- Prisma connection string included `?schema=public`, which caused `psql` to fail with:
  - `invalid URI query parameter: "schema"`
- A temporary `PSQL_URL` was prepared by stripping the Prisma `?schema=...` query parameter.
- Manual raw `psql` inserts required explicit `created_at` and `updated_at` values.
- Reason:
  - Prisma `@updatedAt` is handled by Prisma during application writes.
  - It does not automatically run during raw SQL inserts.

### Course Offering Runtime Test

- [x] Confirmed `POST /api/v1/course-offerings` is protected by:
  - `AuthGuard`
  - `PolicyGuard`
  - `OFFERING_MANAGE` policy
- [x] Confirmed `GET /api/v1/course-offerings` is protected by:
  - `AuthGuard`
  - `PolicyGuard`
  - `OFFERING_READ` policy
- [x] Attempted course offering creation with expired access token.
- [x] Confirmed expired/invalid token returned `401 Unauthorized`.
- [x] Refreshed login and set a fresh access token.
- [x] Created course offering.
- [x] Listed course offerings and confirmed created offering appears.

Created course offering:

| Field | Value |
|---|---|
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Department ID | `dept_law_test` |
| Course ID | `cmozwxq8r000h2i0lg9hhmeyg` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Section Code | `A` |
| Capacity | `60` |
| Status | `PLANNED` |

Linked course:

| Field | Value |
|---|---|
| Course Code | `LAW-101` |
| Course Title | `Constitutional Law I` |
| Academic Program ID | `cmozwlcul000d2i0lgujx0pw5` |

Linked academic term:

| Field | Value |
|---|---|
| Academic Term Code | `LAW-2025-2026-S1` |
| Academic Term Name | `Law 2025-2026 Semester 1` |
| Academic Year ID | `ay_law_2025_2026` |

Result:

- Initial request with expired access token returned `401 Unauthorized`.
- Fresh login generated a valid access token.
- `POST /api/v1/course-offerings` returned `201 Created`.
- `GET /api/v1/course-offerings` returned `200 OK`.
- Created course offering appeared in the list response.
- Course offering response included linked course and academic term data.

### Academic Core Runtime Verdict

Current Academic Core runtime status:

- Program creation/listing: Passed
- Course creation/listing: Passed
- Academic Year setup for runtime testing: Passed through manual DB insert
- Academic Term setup for runtime testing: Passed through manual DB insert
- Course Offering creation/listing: Passed

Current limitation discovered:

- Academic Term is required for Course Offering creation.
- Academic Term exists in Prisma schema and database.
- No dedicated Academic Term API/controller was found in the Academic module during this runtime testing session.
- For runtime testing, Academic Year and Academic Term were inserted manually through `psql`.

Recommended follow-up:

- Consider implementing Academic Year and Academic Term management API endpoints later.
- These endpoints should remain department-scoped and protected by appropriate admin/policy guards.
- Manual DB inserts are acceptable for controlled runtime testing but should not be the normal production workflow.

## 5. Assessment

- [ ] Create assignment
- [ ] List assignments
- [ ] Submit assignment
- [ ] Student can only see own submissions
- [ ] Teacher can review assigned course submissions
- [ ] Create quiz
- [ ] Start quiz attempt
- [ ] Submit quiz attempt
- [ ] Validate quiz access rules

## 6. Result Processing

- [ ] Create/configure grade scale
- [ ] Compute result
- [ ] Verify result
- [ ] Publish result
- [ ] Published result becomes locked
- [ ] Direct edit after publish blocked
- [ ] Amendment request created
- [ ] Amendment approved
- [ ] Amendment applied
- [ ] GPA computed
- [ ] CGPA computed

## 7. Transcript Verification

- [ ] Create transcript record
- [ ] Issue transcript version
- [ ] Generate verification token
- [ ] Public verification works
- [ ] Public verification returns safe/minimal data
- [ ] Token expiry respected
- [ ] Revoke transcript/token
- [ ] Revoked transcript fails or shows revoked status

## 8. API Quality Checks

- [ ] Pagination works on list endpoints
- [ ] Invalid DTO rejected with validation error
- [ ] Rate limit works on public transcript verification endpoint
- [ ] Error responses include request ID
- [ ] Sensitive endpoints do not expose excessive data

### API Quality Notes

- Security headers are present in API responses through Nginx/API middleware.
- Error responses currently include structured error objects.
- Some error responses had empty `meta` objects.
- Malformed refresh token handling should be improved to avoid `InternalServerError`.
- Invalid password login returns structured unauthorized response:
  - `code`: `UnauthorizedException`
  - `message`: `Invalid credentials`
- Unauthenticated protected endpoint access returns:
  - `401 Unauthorized`
  - `message`: `Authentication is required`
- Authenticated request without required policy returns:
  - `403 Forbidden`
  - `message`: `Access denied by policy`
- Expired or invalid access token returns:
  - `401 Unauthorized`
  - `message`: `Authentication is required`
- Expired access token was confirmed during Course Offering runtime test.

## 9. TypeScript Module Resolution Note

Current API TypeScript configuration intentionally avoids a full Node16/ESM migration.

### Current Stable Decision

The API currently uses a NestJS/CommonJS-compatible TypeScript setup.

The attempted `moduleResolution: "node16"` migration caused project-wide TypeScript errors, including:

- `module` must be set to `Node16`
- ESM import/export extension requirements such as `./audit.js`
- path alias resolution issues
- package export/type resolution issues involving `@lexora/types`

Because of this, the project should not be migrated to Node16/ESM casually.

### Current Safe Configuration

For `apps/api/tsconfig.json`, keep the current stable approach:

- `moduleResolution: "node"`
- `baseUrl: "."`
- `rootDir: "."`
- `paths` alias for `@/*`

This keeps the API typecheck/build stable while preserving existing NestJS/CommonJS-compatible behavior.

### Important Warning

Do not change the API TypeScript module system to `Node16`, `NodeNext`, or ESM without a dedicated migration task.

A proper future migration must handle all of the following together:

- `module: "Node16"` or equivalent
- `moduleResolution: "node16"` or `nodenext`
- package-level `type` behavior
- relative import/export `.js` extensions where required
- `packages/types` export compatibility
- `@/*` alias compile-time and runtime behavior
- NestJS build/runtime compatibility
- full monorepo typecheck/build validation

### Validation Requirement

After any TypeScript config change, always run:

```bash
pnpm --filter @lexora/api typecheck
pnpm --filter @lexora/api build
```

The TypeScript config change must not be committed unless both commands pass.

### Current TypeScript Config Issue Status

- Current API typecheck passed with the stable configuration.
- Current API build passed with the stable configuration.
- `moduleResolution: "node16"` is deferred.
- `ignoreDeprecations: "6.0"` was tested but rejected by the current TypeScript compiler with `Invalid value for '--ignoreDeprecations'`.
- VS Code may still show deprecation warnings for `moduleResolution=node10`/`node` behavior and `baseUrl`.
- These warnings are documented and should not be “fixed” by moving to Node16/ESM casually.

## 10. Notes / Issues Found

| Date | Module | Issue | Status | Fix Commit / Note |
|---|---|---|---|---|
| 2026-05-06 | Deployment | Direct API port `4000` exposed to LAN | Fixed | `46a4eaf` |
| 2026-05-06 | Auth | Malformed refresh token on logout returned `InternalServerError` instead of `400 Bad Request` or `401 Unauthorized` | Open | Pending |
| 2026-05-10 | RBAC/Test Data | Runtime database had no seeded permissions, roles, or user-role assignments, so authorized Academic API testing required manual runtime role setup | Documented | Runtime role created |
| 2026-05-10 | Request Context | Authenticated `department_admin` request reached AcademicService but failed because RequestContextInterceptor initialized `principal` as null after guards had already set `request.principal` | Fixed | `025f8ba` |
| 2026-05-10 | Academic Core | Course Offering required `academicTermId`, but no Academic Term API/controller was found in the Academic module during runtime testing | Documented | Manual Academic Year/Term insert used |
| 2026-05-10 | Runtime DB / psql | Prisma `DATABASE_URL` contained `?schema=public`, which caused `psql` to fail with `invalid URI query parameter: "schema"` | Documented | Temporary `PSQL_URL` used |
| 2026-05-10 | Runtime DB / psql | Raw SQL insert into `academic_years` and `academic_terms` failed until explicit `updated_at` values were provided | Documented | Used `created_at = now()` and `updated_at = now()` |
| 2026-05-10 | Env Loading | Loading `.env` printed `LMS: command not found`, likely due to an unquoted value containing spaces | Open / Needs cleanup | Review `.env` formatting later |
| 2026-05-10 | TypeScript Config | Attempted `moduleResolution: "node16"` caused project-wide TypeScript/ESM migration errors | Documented / Deferred | Keep stable NestJS/CommonJS-compatible config |
| 2026-05-10 | TypeScript Config | `ignoreDeprecations: "6.0"` was rejected by current TypeScript compiler with `Invalid value for '--ignoreDeprecations'` | Documented / Deferred | Do not use until TypeScript/compiler support is verified |

## 11. Runtime Test Data Created

### Department

| Field | Value |
|---|---|
| ID | `dept_law_test` |
| Code | `LAW` |
| Slug | `law` |
| Name | `Department of Law` |
| Status | `ACTIVE` |

### Runtime Test User

| Field | Value |
|---|---|
| Email | `runtime-test-student@cu.ac.bd` |
| Display Name | `Runtime Test Student` |
| Status | `ACTIVE` |
| Department ID | `dept_law_test` |

### Runtime Test Role

| Field | Value |
|---|---|
| Role ID | `role_law_department_admin` |
| Role Code | `department_admin` |
| Role Name | `Runtime Department Admin` |
| Department ID | `dept_law_test` |
| Purpose | Temporary runtime testing role |

### Runtime User Role Assignment

| Field | Value |
|---|---|
| User | `runtime-test-student@cu.ac.bd` |
| Role | `department_admin` |
| Department | `dept_law_test` |

### Runtime Academic Program

| Field | Value |
|---|---|
| Program ID | `cmozwlcul000d2i0lgujx0pw5` |
| Department ID | `dept_law_test` |
| Code | `LLB` |
| Name | `Bachelor of Laws` |
| Status | `ACTIVE` |

### Runtime Course

| Field | Value |
|---|---|
| Course ID | `cmozwxq8r000h2i0lg9hhmeyg` |
| Department ID | `dept_law_test` |
| Academic Program ID | `cmozwlcul000d2i0lgujx0pw5` |
| Code | `LAW-101` |
| Title | `Constitutional Law I` |
| Credit Hours | `3` |
| Lecture Hours | `3` |
| Lab Hours | `0` |
| Status | `ACTIVE` |

### Runtime Academic Year

| Field | Value |
|---|---|
| Academic Year ID | `ay_law_2025_2026` |
| Department ID | `dept_law_test` |
| Code | `AY-2025-2026` |
| Name | `Academic Year 2025-2026` |
| Status | `PLANNED` |
| Purpose | Manual runtime test data for Course Offering dependency |

### Runtime Academic Term

| Field | Value |
|---|---|
| Academic Term ID | `term_law_2025_2026_s1` |
| Department ID | `dept_law_test` |
| Academic Year ID | `ay_law_2025_2026` |
| Code | `LAW-2025-2026-S1` |
| Name | `Law 2025-2026 Semester 1` |
| Sequence | `1` |
| Status | `PLANNED` |
| Purpose | Manual runtime test data for Course Offering dependency |

### Runtime Course Offering

| Field | Value |
|---|---|
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Department ID | `dept_law_test` |
| Course ID | `cmozwxq8r000h2i0lg9hhmeyg` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Section Code | `A` |
| Capacity | `60` |
| Status | `PLANNED` |

### Sensitive Data Rule

- Do not store raw access tokens in documentation.
- Do not store raw refresh tokens in documentation.
- Do not store raw email verification tokens in documentation.
- Do not store database connection strings or passwords in documentation.
- Runtime DB credentials shown in terminal output must not be committed to GitHub.
- Test tokens pasted in terminal/chat should not be reused in production.
- Production/cloud credentials must be rotated if accidentally exposed.

## 12. Current Runtime Verdict

- [ ] Existing backend modules runtime-tested
- [x] Critical bugs documented
- [x] Request-context bug fixed and verified
- [x] Deployment hardening fix committed and verified
- [x] Auth runtime checks passed
- [x] Basic Authorization/PolicyGuard checks passed
- [x] Basic authenticated Academic Core read access verified
- [x] Academic Program create/list workflow tested
- [x] Course create/list workflow tested
- [x] Academic Year and Academic Term runtime dependency setup completed
- [x] Course Offering create/list workflow tested
- [x] API TypeScript typecheck passed after stable config fix
- [x] API TypeScript build passed after stable config fix
- [x] TypeScript Node16/ESM migration risk documented
- [ ] Teacher assignment workflow tested
- [ ] Enrollment workflow tested
- [ ] Student visibility rules tested
- [ ] Teacher assigned-course isolation tested
- [ ] Cross-department admin isolation tested
- [ ] Assessment workflow tested
- [ ] Result Processing workflow tested
- [ ] Transcript Verification workflow tested
- [ ] Ready to start Class Session Module

## 13. Next Test Steps

1. Commit and push the updated runtime checklist.
2. Inspect teacher assignment DTO/controller or relevant Academic Core service flow.
3. Identify whether teacher assignment requires a teacher profile, teacher user, or user role setup.
4. Create or prepare runtime teacher test data if required.
5. Assign teacher to course offering.
6. Verify teacher assignment list/get behavior.
7. Inspect enrollment DTO/controller.
8. Identify whether enrollment requires a student profile, student user, academic term, and course offering status.
9. Enroll student into course offering.
10. Validate enrollment listing.
11. Continue student-specific access isolation tests.
12. Continue teacher assigned-course isolation tests.
13. Continue cross-department admin isolation tests.
14. Test reboot persistence:
    - PM2 survives reboot
    - Nginx survives reboot
    - PostgreSQL survives reboot
15. Review `.env` formatting issue that printed `LMS: command not found` during shell loading.
16. Consider implementing Academic Year and Academic Term management API endpoints later.
17. Keep the current API TypeScript config stable unless a dedicated Node16/ESM migration task is planned.