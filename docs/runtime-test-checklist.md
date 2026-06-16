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
- [x] PM2 survives reboot
- [x] Nginx survives reboot
- [x] PostgreSQL survives reboot

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

### Reboot Persistence Runtime Test

- [x] VM reboot completed successfully.
- [x] SSH reconnect after reboot worked.
- [x] Git working tree remained clean after reboot.
- [x] PM2 systemd service `pm2-sh002.service` was enabled and active after reboot.
- [x] PM2 resurrect restored the saved process list from `/home/sh002/.pm2/dump.pm2`.
- [x] PM2 process `lexora-api` came back online automatically after reboot.
- [x] Nginx remained enabled and active after reboot.
- [x] PostgreSQL remained enabled and active after reboot.
- [x] API health worked through Nginx inside VM:
  - `http://localhost/api/v1/health`
- [x] API health worked through direct localhost app port inside VM:
  - `http://localhost:4000/api/v1/health`
- [x] API health worked from Windows host through Nginx:
  - `http://192.168.197.130/api/v1/health`
- [x] Direct API port access from Windows host remained blocked:
  - `http://192.168.197.130:4000/api/v1/health`
  - Result: connection failed / could not connect to server

Post-reboot port verification:

- PostgreSQL listened on `127.0.0.1:5432`.
- Lexora API listened on `127.0.0.1:4000`.
- Nginx listened on `0.0.0.0:80`.

Verdict:

- PM2 survives reboot.
- Nginx survives reboot.
- PostgreSQL survives reboot.
- Reverse proxy routing survives reboot.
- Direct application port hardening survives reboot.

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
- [x] Student cannot access another student’s data
- [x] Teacher cannot access unassigned course data
- [x] Admin cannot access another department’s data
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
- Student-specific own-resource enrollment isolation has now been tested and passed.
- Teacher assigned-course isolation has now been tested and passed.
- Cross-department admin isolation has now been tested for programs, courses, course offerings, and enrollments.

### Cross-Department Admin Isolation Runtime Test

- [x] Created controlled second runtime department:
  - Department ID: `dept_bus_test`
  - Code: `BUS`
  - Name: `Department of Business Runtime Test`

- [x] Created controlled BUS runtime department admin:
  - User ID: `user_bus_runtime_admin`
  - Email: `runtime-business-admin@cu.ac.bd`
  - Role: `department_admin`
  - Department: `dept_bus_test`

- [x] Created BUS runtime academic data:
  - Program ID: `program_bus_runtime_bba`
  - Course ID: `course_bus_101_runtime`
  - Academic Year ID: `ay_bus_2025_2026`
  - Academic Term ID: `term_bus_2025_2026_s1`
  - Course Offering ID: `offering_bus_101_runtime`
  - Enrollment ID: `cmp2sh3ny000d2ig48elycts9`

Runtime test result:

- LAW admin listed programs and saw only LAW program data.
- LAW admin used `x-department-id: dept_bus_test`, but still saw only LAW program data.
- BUS admin listed programs and saw only BUS program data.
- BUS admin used `x-department-id: dept_law_test`, but still saw only BUS program data.

- LAW admin listed courses and saw only LAW courses.
- LAW admin used `x-department-id: dept_bus_test`, but still saw only LAW courses.
- BUS admin listed courses and saw only BUS courses.
- BUS admin used `x-department-id: dept_law_test`, but still saw only BUS courses.

- LAW admin direct-read attempt against BUS course returned `NotFoundException`.
- BUS admin direct-read attempt against LAW course returned `NotFoundException`.

- LAW admin listed course offerings and saw only LAW course offerings.
- LAW admin used `x-department-id: dept_bus_test`, but still saw only LAW course offerings.
- BUS admin listed course offerings and saw only BUS course offerings.
- BUS admin used `x-department-id: dept_law_test`, but still saw only BUS course offerings.

- LAW admin direct-read attempt against BUS course offering returned `NotFoundException`.
- BUS admin direct-read attempt against LAW course offering returned `NotFoundException`.

- LAW admin listed enrollments and saw only LAW enrollments.
- LAW admin used `x-department-id: dept_bus_test`, but still saw only LAW enrollments.
- BUS admin listed enrollments and saw only BUS enrollments.
- BUS admin used `x-department-id: dept_law_test`, but still saw only BUS enrollments.

- LAW admin direct-read attempt against BUS enrollment returned `NotFoundException`.
- BUS admin direct-read attempt against LAW enrollment returned `NotFoundException`.

Verdict:

- Cross-department admin isolation passed for:
  - Programs
  - Courses
  - Course offerings
  - Enrollments
- `x-department-id` header abuse did not allow cross-department access.
- Direct object ID access did not leak opposite department records.
- Request context / principal department scoping is working as expected.

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
- [x] Assign teacher to course offering
- [x] Enroll student
- [ ] Validate student course visibility rules — dedicated student course-offering visibility endpoint not implemented yet

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

### Academic Year / Academic Term API Implementation

Runtime verification status:

- [x] Runtime verified on Ubuntu VM after follow-up empty PATCH validation fix.

Verified commits:

| Purpose | Commit |
|---|---|
| Academic Year / Academic Term API foundation | `88c2b9e` |
| Empty PATCH validation fix | `97733c5` |

Runtime environment:

- Repo path: `~/lexora_lms`
- API process: PM2 app `lexora-api`
- API via Nginx: `http://localhost/api/v1`
- Direct API port remained bound to `127.0.0.1:4000`
- Law department login code used: `0421`
- Canonical runtime accounts used:
  - `admin.law@cu.ac.bd`
  - `teacher.law@cu.ac.bd`
  - `student.law@cu.ac.bd`
- Do not store raw passwords, access tokens, refresh tokens, or password hashes in documentation.

Runtime records created:

| Field | Value |
|---|---|
| Academic Year ID | `cmq5izxji00152ihcx0g9knxg` |
| Academic Year Code | `AY-RT-20260608180951` |
| Academic Term ID | `cmq5izxqi001b2ihcvg5hrfsc` |
| Academic Term Code | `LAW-RT-20260608180951-S1` |
| Department ID observed | `dept_law_test` |

Implementation added:

- `POST /api/v1/academic-years`
- `GET /api/v1/academic-years`
- `GET /api/v1/academic-years/:id`
- `PATCH /api/v1/academic-years/:id`
- `POST /api/v1/academic-terms`
- `GET /api/v1/academic-terms`
- `GET /api/v1/academic-terms/:id`
- `PATCH /api/v1/academic-terms/:id`

Protection:

- All endpoints are protected by `AuthGuard`.
- All endpoints are protected by `PolicyGuard`.
- Academic Year read endpoints use `course-management.term.read`.
- Academic Year create/update endpoints use `course-management.term.manage`.
- Academic Term read endpoints use `course-management.term.read`.
- Academic Term create/update endpoints use `course-management.term.manage`.

Department isolation behavior to verify:

- Create uses the authenticated principal's active department from request context.
- List returns only records in the authenticated principal's active department.
- Direct read/update filters by both record ID and active department.
- Cross-department direct Academic Year ID access should return safe not-found.
- Cross-department direct Academic Term ID access should return safe not-found.
- Sending `x-department-id` for another department must not override a valid authenticated principal's real department scope.
- Academic Term create/update must reject an `academicYearId` that is not in the active department.

Validation behavior to verify:

- Academic Year `endDate` must be after `startDate`.
- Academic Term `endDate` must be after `startDate`.
- Academic Term dates must be within the selected Academic Year date range.
- Academic Term `enrollmentEndAt` must be after `enrollmentStartAt` when both are provided.
- Academic Term enrollment dates must stay within the term date range.
- Duplicate Academic Year code in the same department should return conflict.
- Duplicate Academic Term code in the same department should return conflict.

Suggested runtime commands:

```bash
curl -s -X POST "$API_BASE/academic-years" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "AY-2026-2027",
    "name": "Academic Year 2026-2027",
    "startDate": "2026-07-01T00:00:00.000Z",
    "endDate": "2027-06-30T23:59:59.000Z",
    "isCurrent": false,
    "status": "PLANNED"
  }'

curl -s "$API_BASE/academic-years" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -s -X POST "$API_BASE/academic-terms" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "academicYearId": "<academic-year-id>",
    "code": "LAW-2026-2027-S1",
    "name": "Law 2026-2027 Semester 1",
    "sequence": 1,
    "startDate": "2026-07-01T00:00:00.000Z",
    "endDate": "2026-12-31T23:59:59.000Z",
    "enrollmentStartAt": "2026-07-01T00:00:00.000Z",
    "enrollmentEndAt": "2026-08-31T23:59:59.000Z",
    "status": "PLANNED"
  }'

curl -s "$API_BASE/academic-terms?academicYearId=<academic-year-id>&status=PLANNED" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl -s -X PATCH "$API_BASE/academic-years/<academic-year-id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE","isCurrent":true}'

curl -s -X PATCH "$API_BASE/academic-terms/<academic-term-id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ENROLLMENT_OPEN"}'
```

Static verification:

- [x] `pnpm --filter @lexora/api typecheck` passed locally after implementation.
- [x] `pnpm --filter @lexora/api build` passed locally after implementation.

Server deployment / verification evidence:

- [x] Server fast-forwarded from `88c2b9e` to `97733c5`.
- [x] `pnpm --filter @lexora/api typecheck` passed on server.
- [x] `pnpm --filter @lexora/api build` passed on server.
- [x] `pm2 restart lexora-api --update-env` completed.
- [x] Health endpoint returned `200 OK`.
- [x] Admin login worked using `admin.law@cu.ac.bd` with `departmentCode: "0421"`.
- [x] Teacher login worked using `teacher.law@cu.ac.bd` with `departmentCode: "0421"`.
- [x] Student login worked using `student.law@cu.ac.bd` with `departmentCode: "0421"`.
- [x] Final server git status was clean.

Positive API verification:

- [x] Admin created Academic Year successfully.
- [x] Admin listed Academic Years and found runtime year `AY-RT-20260608180951`.
- [x] Admin read Academic Year by ID `cmq5izxji00152ihcx0g9knxg`.
- [x] Admin patched Academic Year name.
- [x] Admin created Academic Term under runtime Academic Year `cmq5izxji00152ihcx0g9knxg`.
- [x] Admin listed Academic Terms for that Academic Year.
- [x] Admin read Academic Term by ID `cmq5izxqi001b2ihcvg5hrfsc`.
- [x] Admin patched Academic Term name.

Negative / security verification:

- [x] Unauthenticated `/academic-years` returned `401 Unauthorized`.
- [x] Teacher Academic Year create returned `403 Forbidden`.
- [x] Student Academic Year create returned `403 Forbidden`.
- [x] Invalid Academic Year date range returned `400 Bad Request`.
- [x] Empty Academic Year PATCH originally returned `404 Academic year not found`.
- [x] Empty Academic Year PATCH was fixed in `97733c5`.
- [x] Empty Academic Year PATCH retest returned `400 Bad Request` with message `At least one academic year field must be provided`.
- [x] Invalid Academic Term outside selected Academic Year returned `400 Bad Request`.
- [x] Teacher Academic Term create returned `403 Forbidden`.
- [x] Student Academic Term create returned `403 Forbidden`.
- [x] Empty Academic Term PATCH originally returned `404 Academic term not found`.
- [x] Empty Academic Term PATCH was fixed in `97733c5`.
- [x] Empty Academic Term PATCH retest returned `400 Bad Request` with message `At least one academic term field must be provided`.
- [x] `x-department-id: dept_bus_test` did not override authenticated Law admin department scope; the Law runtime year was still returned.
- [x] Direct read of BUS Academic Year ID `ay_bus_2025_2026` as Law admin returned safe `404 Not Found`.
- [x] Creating a Law term with BUS Academic Year ID `ay_bus_2025_2026` returned `400 Bad Request` with message `Academic year does not belong to the active department`.
- [x] Existing Academic Year ID `cmq5izxji00152ihcx0g9knxg` remained readable with `200 OK` after the empty PATCH fix.
- [x] Existing Academic Term ID `cmq5izxqi001b2ihcvg5hrfsc` remained readable with `200 OK` after the empty PATCH fix.

Runtime verdict:

- Academic Year / Academic Term API foundation is runtime verified after the follow-up empty PATCH validation fix.
- Department-scoped create/list/read/update behavior passed runtime verification.
- Guard/policy behavior passed runtime verification for admin, teacher, student, and unauthenticated access paths.
- Cross-department direct object access and cross-department `academicYearId` usage were blocked safely.

Pending / intentionally deferred:

- Academic Year `isCurrent` uniqueness / single-current-year behavior is not implemented. This remains a future academic configuration rule and needs a policy decision on whether to auto-unset other current years or reject multiple current years.
- No frontend UI was implemented in this task.
- Teacher Assignment HTTP API is still pending if not already completed elsewhere.
- Student available/eligible course offering endpoint is still pending if not already completed elsewhere.
- Passwords for canonical runtime accounts were accidentally exposed in chat/logs during testing and should be rotated/reset as a security cleanup task. Do not record those passwords in this document.

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

### Teacher Assignment Runtime Test

- [x] Confirmed teacher assignment HTTP API/controller is not currently exposed.
  - `/course-offerings` controller currently supports:
    - create
    - list
    - get by ID
    - update
  - `/enrollments` controller is exposed separately.
  - Teacher assignment exists in Prisma schema/service contract, but no public runtime API route/controller was found.

- [x] Confirmed teacher assignment schema exists.
  - Prisma model: `TeacherCourseAssignment`
  - Mapped table: `teacher_course_assignments`
  - Required runtime fields:
    - `departmentId`
    - `courseOfferingId`
    - `teacherUserId`
    - `roleCode`
  - Default status:
    - `ACTIVE`
  - Unique constraint:
    - `courseOfferingId + teacherUserId + roleCode`

- [x] Confirmed static backend role code for teacher.
  - Authorization static role code: `teacher`
  - Teacher static policies include course/offering read/manage, teacher-assignment manage, assignment, quiz, result draft, notification read/event policies.

- [x] Confirmed LAW test department initially had no teacher role.
  - Existing role before setup:
    - `role_law_department_admin`
    - `department_admin`

- [x] Created controlled runtime teacher role.
  - Role ID: `role_law_teacher`
  - Role code: `teacher`
  - Role name: `Runtime Teacher`
  - Department ID: `dept_law_test`
  - Purpose: Temporary runtime teacher role for teacher assignment testing

- [x] Created controlled runtime teacher user.
  - User ID: `user_law_runtime_teacher`
  - Email: `runtime-test-teacher@cu.ac.bd`
  - Display Name: `Runtime Test Teacher`
  - Department ID: `dept_law_test`
  - Status: `ACTIVE`

- [x] Assigned teacher role to runtime teacher user.
  - User Role ID: `user_role_law_runtime_teacher`
  - User ID: `user_law_runtime_teacher`
  - Role ID: `role_law_teacher`
  - Role code: `teacher`
  - Department ID: `dept_law_test`
  - `revokedAt`: `null`

- [x] Assigned teacher to existing LAW-101 course offering through controlled Prisma DB upsert.
  - Teacher Assignment ID: `teacher_assignment_law_101_runtime`
  - Course Offering ID: `cmozy23xm000r2i0lccmtg7dl`
  - Teacher User ID: `user_law_runtime_teacher`
  - Assignment role code: `primary_instructor`
  - Status: `ACTIVE`
  - `unassignedAt`: `null`

- [x] Verified teacher assignment relation.
  - Course Offering: `cmozy23xm000r2i0lccmtg7dl`
  - Course: `LAW-101 — Constitutional Law I`
  - Academic Term: `LAW-2025-2026-S1`
  - Assigned Teacher: `Runtime Test Teacher`
  - Teacher platform role: `teacher`
  - Assignment role: `primary_instructor`
  - Assignment status: `ACTIVE`

Created runtime teacher role:

| Field | Value |
|---|---|
| Role ID | `role_law_teacher` |
| Department ID | `dept_law_test` |
| Code | `teacher` |
| Name | `Runtime Teacher` |
| Description | `Temporary runtime test teacher role for teacher assignment testing` |

Created runtime teacher user:

| Field | Value |
|---|---|
| User ID | `user_law_runtime_teacher` |
| Department ID | `dept_law_test` |
| Email | `runtime-test-teacher@cu.ac.bd` |
| Display Name | `Runtime Test Teacher` |
| Status | `ACTIVE` |

Created runtime teacher role assignment:

| Field | Value |
|---|---|
| User Role ID | `user_role_law_runtime_teacher` |
| User ID | `user_law_runtime_teacher` |
| Role ID | `role_law_teacher` |
| Department ID | `dept_law_test` |
| Revoked At | `null` |

Created teacher course assignment:

| Field | Value |
|---|---|
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Department ID | `dept_law_test` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Teacher User ID | `user_law_runtime_teacher` |
| Role Code | `primary_instructor` |
| Status | `ACTIVE` |
| Unassigned At | `null` |

Teacher assignment verification result:

| Field | Value |
|---|---|
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Academic Term | `LAW-2025-2026-S1` |
| Section | `A` |
| Course Offering Status | `PLANNED` |
| Teacher | `Runtime Test Teacher` |
| Teacher Email | `runtime-test-teacher@cu.ac.bd` |
| Teacher Platform Role | `teacher` |
| Assignment Role | `primary_instructor` |
| Assignment Status | `ACTIVE` |

Teacher assignment finding:

- Teacher assignment runtime flow could not be completed through HTTP API because no teacher assignment controller/route is currently exposed.
- Runtime teacher assignment was completed through controlled Prisma DB upsert for testing continuity.
- This is acceptable as controlled runtime test data setup, but it should not be the normal production workflow.

Teacher assignment recommendation:

- Implement a department-scoped teacher assignment API/controller later.
- Possible location:
  - Course Management module, or
  - Course Offering nested route
- Suggested future endpoint examples:
  - `POST /api/v1/course-offerings/:id/teacher-assignments`
  - `GET /api/v1/course-offerings/:id/teacher-assignments`
  - `PATCH /api/v1/teacher-assignments/:id`
  - `DELETE` or `PATCH unassign` style endpoint for unassignment
- Future implementation must preserve:
  - `AuthGuard`
  - `PolicyGuard`
  - department isolation
  - assigned-course authorization rules
  - audit logging for teacher assignment/unassignment
  - no weakening of existing authorization or request context logic

### Teacher Assigned-Course Isolation Runtime Test

- [x] Runtime teacher login verified:
  - User ID: `user_law_runtime_teacher`
  - Email: `runtime-test-teacher@cu.ac.bd`
  - Role: `teacher`
  - Department: `dept_law_test`

- [x] Runtime teacher assignment verified:
  - Teacher Assignment ID: `teacher_assignment_law_101_runtime`
  - Assigned Course Offering ID: `cmozy23xm000r2i0lccmtg7dl`
  - Assigned Course: `LAW-101 — Constitutional Law I`
  - Assignment Role Code: `primary_instructor`
  - Assignment Status: `ACTIVE`
  - `unassignedAt`: `null`

- [x] Controlled unassigned offering remained available for negative test:
  - Unassigned Course Offering ID: `offering_law_999_unassigned_runtime`
  - Unassigned Course: `LAW-999 — Unassigned Runtime Test Course`
  - Teacher assignments: none

Runtime test result:

- Teacher successfully logged in with role `teacher`.
- Teacher listed course offerings:
  - `GET /api/v1/course-offerings`
  - Result: returned only assigned offering `cmozy23xm000r2i0lccmtg7dl`
  - Assigned course `LAW-101` appeared.
  - Unassigned course/offering `LAW-999` / `offering_law_999_unassigned_runtime` did not appear.

- Teacher direct-read request to assigned course offering worked:
  - `GET /api/v1/course-offerings/cmozy23xm000r2i0lccmtg7dl`
  - Result: returned assigned `LAW-101` course offering.

- Teacher direct-read request to unassigned course offering was blocked:
  - `GET /api/v1/course-offerings/offering_law_999_unassigned_runtime`
  - Result: `NotFoundException`
  - Message: `Course offering not found`

Verdict:

- Teacher can list only assigned course offerings.
- Teacher can directly read assigned course offering.
- Teacher cannot list unassigned course offering.
- Teacher cannot directly read unassigned course offering.
- Assignment-aware teacher course offering isolation is working as expected.

### Academic Core Runtime Verdict

Current Academic Core runtime status:

- Program creation/listing: Passed
- Course creation/listing: Passed
- Academic Year setup for runtime testing: Passed through manual DB insert
- Academic Term setup for runtime testing: Passed through manual DB insert
- Course Offering creation/listing: Passed
- Teacher assignment: Passed through controlled Prisma DB upsert because no HTTP API route is currently exposed
- Enrollment create/list/get/update: Passed through exposed Enrollment API

Current limitations discovered:

- Academic Term is required for Course Offering creation.
- Academic Term exists in Prisma schema and database.
- No dedicated Academic Term API/controller was found in the Academic module during runtime testing.
- Teacher assignment exists in schema/service contract, but no teacher assignment HTTP controller/route was found during runtime testing.
- For runtime testing, Academic Year and Academic Term were inserted manually through `psql`.
- For runtime testing, teacher assignment was created through controlled Prisma DB upsert.

Recommended follow-up:

- Consider implementing Academic Year and Academic Term management API endpoints later.
- Consider implementing Teacher Assignment management API endpoints later.
- These endpoints should remain department-scoped and protected by appropriate admin/policy guards.
- Manual DB inserts/upserts are acceptable for controlled runtime testing but should not be the normal production workflow.

### Student Own-Resource Enrollment Isolation Runtime Test

- [x] Created controlled runtime student role:
  - Role ID: `role_law_student`
  - Role Code: `student`
  - Department: `dept_law_test`

- [x] Created controlled runtime student users:
  - Own Student User ID: `user_law_runtime_student_own`
  - Own Student Email: `runtime-student-own@cu.ac.bd`
  - Other Student User ID: `user_law_runtime_student_other`
  - Other Student Email: `runtime-student-other@cu.ac.bd`
  - Department: `dept_law_test`
  - Role: `student`

- [x] Created controlled runtime student enrollments:
  - Own Enrollment ID: `enrollment_law_student_own_runtime`
  - Other Enrollment ID: `enrollment_law_student_other_runtime`
  - Course Offering ID: `cmozy23xm000r2i0lccmtg7dl`
  - Academic Term ID: `term_law_2025_2026_s1`

Runtime test result:

- Own student successfully logged in with role `student`.
- Other student successfully logged in with role `student`.

- Own student request to broad admin enrollment list was blocked:
  - `GET /api/v1/enrollments`
  - Result: `ForbiddenException`
  - Message: `Access denied by policy`

- Own student request to self-resource enrollment list worked:
  - `GET /api/v1/enrollments/me`
  - Result: returned only `enrollment_law_student_own_runtime`

- Own student request to own self-resource enrollment detail worked:
  - `GET /api/v1/enrollments/me/enrollment_law_student_own_runtime`
  - Result: returned own enrollment

- Own student request to other student's self-resource enrollment was blocked:
  - `GET /api/v1/enrollments/me/enrollment_law_student_other_runtime`
  - Result: `NotFoundException`
  - Message: `Enrollment not found`

- Own student request to broad admin-style enrollment detail remained blocked:
  - `GET /api/v1/enrollments/enrollment_law_student_own_runtime`
  - Result: `ForbiddenException`
  - Message: `Access denied by policy`

- Other student request to self-resource enrollment list worked:
  - `GET /api/v1/enrollments/me`
  - Result: returned only `enrollment_law_student_other_runtime`

- Other student request to own student's enrollment was blocked:
  - `GET /api/v1/enrollments/me/enrollment_law_student_own_runtime`
  - Result: `NotFoundException`
  - Message: `Enrollment not found`

Verdict:

- Student broad/admin enrollment endpoints remain blocked.
- Student self-resource enrollment endpoint returns only the authenticated student's own enrollment records.
- Student direct access to another student's enrollment is blocked.
- Student direct broad/admin-style access remains blocked even for own enrollment.
- Student-to-student enrollment data isolation is working as expected.

## 5. Enrollment

- [x] Generate fresh admin access token for enrollment testing
- [x] Inspect enrollment DTO/controller
- [x] Create enrollment through `POST /api/v1/enrollments`
- [x] List enrollments through `GET /api/v1/enrollments`
- [x] Get enrollment by ID through `GET /api/v1/enrollments/:id`
- [x] Verify created enrollment relation with student, course offering, course, and academic term
- [x] Update enrollment through `PATCH /api/v1/enrollments/:id`
- [x] Verify updated enrollment state after PATCH
- [ ] Validate student course visibility rules — dedicated student course-offering visibility endpoint not implemented yet
- [ ] Validate student own-enrollment/self-resource rules if supported

### Enrollment Current Status

- Enrollment controller is exposed.
- `/enrollments` controller supports:
  - `POST /api/v1/enrollments`
  - `GET /api/v1/enrollments`
  - `GET /api/v1/enrollments/:id`
  - `PATCH /api/v1/enrollments/:id`
- Enrollment create/list/get/update workflow passed.
- Student visibility and student own-resource rules still need separate testing.

### Enrollment Known Context

Existing runtime student user:

| Field | Value |
|---|---|
| Student User ID | `cmoubvzde00012i216rnx6eaq` |
| Email | `runtime-test-student@cu.ac.bd` |
| Display Name | `Runtime Test Student` |
| Department ID | `dept_law_test` |
| Status | `ACTIVE` |
| Runtime Role | `department_admin` |

Existing runtime course offering:

| Field | Value |
|---|---|
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Section | `A` |
| Status | `PLANNED` |

### Enrollment Runtime Test

- [x] Confirmed `CreateEnrollmentDto` requires:
  - `academicTermId`
  - `courseOfferingId`
  - `studentUserId`

- [x] Confirmed optional enrollment create fields:
  - `sourceType`
  - `status`
  - `eligibilityStatus`
  - `eligibilitySnapshotJson`

- [x] Confirmed `ListEnrollmentsQueryDto` supports filtering by:
  - `academicTermId`
  - `courseOfferingId`
  - `studentUserId`
  - `status`
  - `eligibilityStatus`

- [x] Confirmed `UpdateEnrollmentDto` supports:
  - `sourceType`
  - `status`
  - `eligibilityStatus`
  - `eligibilitySnapshotJson`
  - `enrolledAt`
  - `droppedAt`

- [x] Confirmed valid enum values used for runtime enrollment:
  - `sourceType`: `ADMIN`
  - `status`: `APPROVED`
  - `eligibilityStatus`: `PENDING_REVIEW`, later updated to `CONDITIONAL`

- [x] Initial enrollment create attempt with invalid enum values returned `400 Bad Request`.
  - Invalid values attempted:
    - `sourceType`: `ADMIN_CREATED`
    - `status`: `ENROLLED`
    - `eligibilityStatus`: `PENDING`
  - Finding:
    - Response body showed generic `Bad Request Exception` without detailed validation messages.

- [x] Created enrollment through API.

Created enrollment:

| Field | Value |
|---|---|
| Enrollment ID | `cmp198zg900072ig5ljfjaxwl` |
| Department ID | `dept_law_test` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Student User ID | `cmoubvzde00012i216rnx6eaq` |
| Approved By User ID | `cmoubvzde00012i216rnx6eaq` |
| Source Type | `ADMIN` |
| Initial Status | `APPROVED` |
| Initial Eligibility Status | `PENDING_REVIEW` |
| Enrolled At | `2026-05-11T13:46:10.424Z` |
| Created At | `2026-05-11T13:46:10.425Z` |

Linked enrollment data:

| Field | Value |
|---|---|
| Student | `Runtime Test Student` |
| Student Email | `runtime-test-student@cu.ac.bd` |
| Course | `LAW-101 — Constitutional Law I` |
| Course ID | `cmozwxq8r000h2i0lg9hhmeyg` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Academic Term | `LAW-2025-2026-S1` |
| Academic Year ID | `ay_law_2025_2026` |
| Approved By | `Runtime Test Student` |

Enrollment API results:

- `POST /api/v1/enrollments` with invalid enum values returned `400 Bad Request`.
- `POST /api/v1/enrollments` with valid enum values returned `201 Created`.
- `GET /api/v1/enrollments?courseOfferingId=cmozy23xm000r2i0lccmtg7dl` returned the created enrollment.
- `GET /api/v1/enrollments/cmp198zg900072ig5ljfjaxwl` returned the created enrollment with linked student, course offering, course, academic term, and approver data.
- `PATCH /api/v1/enrollments/cmp198zg900072ig5ljfjaxwl` returned `200 OK`.

Enrollment update test:

| Field | Before | After |
|---|---|---|
| Status | `APPROVED` | `APPROVED` |
| Eligibility Status | `PENDING_REVIEW` | `CONDITIONAL` |
| Snapshot | Runtime create note | Runtime update note |
| Updated At | `2026-05-11T13:46:10.425Z` | `2026-05-11T13:49:06.427Z` |

Final enrollment state verified:

| Field | Value |
|---|---|
| Enrollment ID | `cmp198zg900072ig5ljfjaxwl` |
| Status | `APPROVED` |
| Eligibility Status | `CONDITIONAL` |
| Snapshot Flag | `updatedDuringRuntimeTest: true` |
| Updated At | `2026-05-11T13:49:06.427Z` |


### Student Course Visibility Runtime Test

- [x] Logged in as runtime own student.
- [x] Confirmed runtime own student has role `student`.
- [x] Tested `GET /api/v1/course-offerings` with student access token.
- [x] Confirmed `GET /api/v1/course-offerings` returned `403 Forbidden`.
- [x] Confirmed error response:
  - `code`: `ForbiddenException`
  - `message`: `Access denied by policy`
- [x] Tested `GET /api/v1/enrollments/me` with the same student access token.
- [x] Confirmed `GET /api/v1/enrollments/me` returned `200 OK`.
- [x] Confirmed response included only the runtime own student enrollment:
  - Enrollment ID: `enrollment_law_student_own_runtime`
  - Student User ID: `user_law_runtime_student_own`
  - Course Offering ID: `cmozy23xm000r2i0lccmtg7dl`
  - Course: `LAW-101 — Constitutional Law I`
  - Status: `APPROVED`
  - Eligibility Status: `CONDITIONAL`

Finding:

- Student role does not currently have direct access to `GET /api/v1/course-offerings`.
- `GET /api/v1/course-offerings` is protected by `OFFERING_READ`.
- Current `AcademicService.listCourseOfferings()` includes teacher assigned-course filtering, but no dedicated student enrolled/current-term/eligible course-offering visibility filter.
- Student enrolled-course visibility currently works through `GET /api/v1/enrollments/me`.
- A dedicated student-facing available-course/course-offering visibility endpoint is still needed.

Recommended future endpoint options:

- `GET /api/v1/course-offerings/me`
- `GET /api/v1/student/course-offerings`
- `GET /api/v1/enrollments/available`

Future implementation must enforce:

- own department only
- own program/year/semester only
- eligible/current academic term offerings only
- no other department offerings
- no higher/lower year offerings unless policy allows
- backend-side filtering, not frontend-only filtering

Verdict:

- Student own enrolled-course visibility through `/enrollments/me`: passed.
- Dedicated student course-offering visibility for available/eligible courses: not implemented yet / pending.

### Enrollment Runtime Verdict

- Enrollment create/list/get/update workflow passed.
- Enrollment API correctly returned linked student, course offering, course, academic term, and approver data.
- Enum mismatch causes `400 Bad Request`, but validation response lacks detailed field-level error messages.
- Student visibility and student self-resource rules still need separate testing.

## 6. Assessment

- [x] Create assignment
- [x] List assignments — teacher/student list works, but student can currently see DRAFT assignment visibility gap
- [x] Submit assignment
- [x] Student can only see own submissions
- [x] Teacher can review assigned course submissions
- [x] Create quiz
- [x] Start quiz attempt
- [x] Submit quiz attempt
- [x] Validate quiz access rules — attempt ownership works, but student can currently see DRAFT quiz visibility gap



### Assessment Workflow Runtime Test

Runtime test date: 2026-05-13

Runtime context:

| Item | Value |
|---|---|
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Teacher User ID | `user_law_runtime_teacher` |
| Own Student User ID | `user_law_runtime_student_own` |
| Own Student Enrollment ID | `enrollment_law_student_own_runtime` |
| Other Student User ID | `user_law_runtime_student_other` |
| Other Student Enrollment ID | `enrollment_law_student_other_runtime` |

Created runtime assignment:

| Field | Value |
|---|---|
| Assignment ID | `cmp3g37ba000r2iavun7dkqd6` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Title | `Runtime Assessment Assignment` |
| Status | `DRAFT` |
| Max Points | `10` |
| Max Submission Count | `1` |

Created runtime assignment submission:

| Field | Value |
|---|---|
| Submission ID | `cmp3g3ley000v2iav09wa8nzr` |
| Assignment ID | `cmp3g37ba000r2iavun7dkqd6` |
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Attempt Number | `1` |
| Status | `SUBMITTED` |
| Is Late | `false` |

Assignment workflow verified:

- [x] Teacher login worked with role `teacher`.
- [x] Other student login worked with role `student`.
- [x] Teacher created assignment through `POST /api/v1/assignments`.
- [x] Own student submitted assignment through `POST /api/v1/assignment-submissions`.
- [x] Other student direct read of own student submission was blocked:
  - Endpoint: `GET /api/v1/assignment-submissions/cmp3g3ley000v2iav09wa8nzr`
  - Result: `403 Forbidden`
  - Message: `Students can only access their own assessment records`
- [x] Teacher direct read of the submission worked:
  - Endpoint: `GET /api/v1/assignment-submissions/cmp3g3ley000v2iav09wa8nzr`
  - Result: `200 OK`

Created runtime quiz:

| Field | Value |
|---|---|
| Quiz ID | `cmp3g641e000z2iavjxp5v437` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Title | `Runtime Assessment Quiz` |
| Status | `DRAFT` |
| Max Points | `10` |
| Max Attempts | `1` |
| Time Limit Minutes | `30` |
| Auto Grading Enabled | `false` |

Created runtime quiz attempt:

| Field | Value |
|---|---|
| Quiz Attempt ID | `cmp3g6hkz00132iavif5ah5jc` |
| Quiz ID | `cmp3g641e000z2iavjxp5v437` |
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Attempt Number | `1` |
| Initial Status | `IN_PROGRESS` |
| Final Status | `SUBMITTED` |
| Time Limit Snapshot | `30` |

Quiz workflow verified:

- [x] Teacher created quiz through `POST /api/v1/quizzes`.
- [x] Teacher listed quiz through `GET /api/v1/quizzes?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`.
- [x] Own student listed quiz through `GET /api/v1/quizzes?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`.
- [x] Own student started quiz attempt through `POST /api/v1/quiz-attempts/start`.
- [x] Other student direct read of own student quiz attempt was blocked:
  - Endpoint: `GET /api/v1/quiz-attempts/cmp3g6hkz00132iavif5ah5jc`
  - Result: `403 Forbidden`
  - Message: `Students can only access their own assessment records`
- [x] Own student submitted quiz attempt through `POST /api/v1/quiz-attempts/submit`.
- [x] Teacher direct read of submitted quiz attempt worked:
  - Endpoint: `GET /api/v1/quiz-attempts/cmp3g6hkz00132iavif5ah5jc`
  - Result: `200 OK`

Assessment visibility findings:

- Student submission ownership protection works.
- Student quiz attempt ownership protection works.
- Teacher can create and read assessment records for assigned course offering.
- Student can currently list `DRAFT` assignment through:
  - `GET /api/v1/assignments?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`
- Student can currently list `DRAFT` quiz through:
  - `GET /api/v1/quizzes?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`

Assessment visibility gap:

- Assignment and quiz list endpoints currently allow student role to see DRAFT assessment records.
- Student-facing assignment/quiz list should be filtered by enrollment, visibility window, and published/available status.
- Backend-side filtering is required; frontend-only hiding is not sufficient.
- Recommended future behavior:
  - Students should only see assessments for their own enrolled course offerings.
  - Students should not see `DRAFT` assignments or quizzes.
  - Students should only see published/available assessments.
  - Teachers should only manage assessments for assigned course offerings.
  - Admins should remain department-scoped.

Assessment runtime verdict:

- Assignment create/list/submit basic workflow: passed.
- Assignment submission ownership isolation: passed.
- Quiz create/list/start/submit basic workflow: passed.
- Quiz attempt ownership isolation: passed.
- Student assignment/quiz list visibility filtering: fixed and runtime retested.



### Assessment Visibility Fix Runtime Retest

Runtime retest date: 2026-05-13

Code fix commit:

| Field | Value |
|---|---|
| Commit | `0d93462` |
| Message | `Fix assessment visibility filtering` |

Retest context:

| Item | Value |
|---|---|
| Assignment ID | `cmp3g37ba000r2iavun7dkqd6` |
| Quiz ID | `cmp3g641e000z2iavjxp5v437` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Teacher User ID | `user_law_runtime_teacher` |
| Own Student User ID | `user_law_runtime_student_own` |

Verified behavior after fix:

- [x] API typecheck passed after fix.
- [x] API build passed after fix.
- [x] `lexora-api` restarted with PM2.
- [x] Teacher login worked with role `teacher`.
- [x] Own student login worked with role `student`.
- [x] Teacher can still list DRAFT assignment:
  - Endpoint: `GET /api/v1/assignments?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`
  - Result: `200 OK`
  - DRAFT assignment visible to assigned teacher.
- [x] Teacher can still list DRAFT quiz:
  - Endpoint: `GET /api/v1/quizzes?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`
  - Result: `200 OK`
  - DRAFT quiz visible to assigned teacher.
- [x] Student cannot list DRAFT assignment:
  - Endpoint: `GET /api/v1/assignments?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`
  - Result: `[]`
- [x] Student cannot list DRAFT quiz:
  - Endpoint: `GET /api/v1/quizzes?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`
  - Result: `[]`
- [x] Student direct read of DRAFT assignment is blocked:
  - Endpoint: `GET /api/v1/assignments/cmp3g37ba000r2iavun7dkqd6`
  - Result: `404 Not Found`
  - Message: `Assignment not found`
- [x] Student direct read of DRAFT quiz is blocked:
  - Endpoint: `GET /api/v1/quizzes/cmp3g641e000z2iavjxp5v437`
  - Result: `404 Not Found`
  - Message: `Quiz not found`
- [x] Teacher direct read of DRAFT assignment still works:
  - Endpoint: `GET /api/v1/assignments/cmp3g37ba000r2iavun7dkqd6`
  - Result: `200 OK`
- [x] Teacher direct read of DRAFT quiz still works:
  - Endpoint: `GET /api/v1/quizzes/cmp3g641e000z2iavjxp5v437`
  - Result: `200 OK`

Assessment visibility fix verdict:

- Student DRAFT assignment list visibility gap: fixed.
- Student DRAFT quiz list visibility gap: fixed.
- Student direct object access to DRAFT assignment/quiz: blocked with `404 Not Found`.
- Teacher assigned-course DRAFT assessment visibility: preserved.
- Assessment visibility filtering fix: passed runtime retest.

## 7. Result Processing

- [x] Create/configure grade scale
- [x] Compute result
- [x] Verify result
- [x] Publish result
- [x] Published result becomes locked
- [x] Direct edit after publish blocked
- [x] Amendment request created
- [x] Amendment approved
- [x] Amendment applied
- [x] GPA computed
- [x] CGPA computed

### Result Processing Runtime Test

Runtime test dates: 2026-05-13 and 2026-05-18

Runtime context:

| Item | Value |
|---|---|
| Department ID | `dept_law_test` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Student User ID | `user_law_runtime_student_own` |
| Grade Scale ID | `cmp4ceyyf000d2ixxy9ubtc5r` |
| Result Record ID | `cmp4cpg36000r2ixx5fv5svv5` |
| Amendment ID | `cmp4csl1q00112ixxl5wnxyxh` |
| GPA Record ID | `cmpbeb1yy00072i4hnudbu9pr` |
| CGPA Record ID | `cmpbebghv000b2i4haymf3i6d` |

Created runtime grade scale:

| Field | Value |
|---|---|
| Code | `LAW_RUNTIME_SCALE_20260513` |
| Name | `LAW Runtime Test Grade Scale` |
| Is Default | `true` |
| Is Active | `true` |
| Pass Percentage | `40` |
| Pass Grade Point | `2` |
| Rules | `A+` to `F`, 10 active rules |

Controlled grading records created for runtime result computation:

| Grading Record ID | Target Type | Points Awarded | Source |
|---|---|---:|---|
| `grading_law_assignment_runtime` | `ASSIGNMENT_SUBMISSION` | `8.00` | Assignment submission `cmp3g3ley000v2iav09wa8nzr` |
| `grading_law_quiz_runtime` | `QUIZ_ATTEMPT` | `9.00` | Quiz attempt `cmp3g6hkz00132iavif5ah5jc` |

Result compute verified:

| Field | Value |
|---|---|
| Status after compute | `COMPUTED` |
| Total Raw Score | `17` |
| Normalized Percentage | `85` |
| Letter Grade | `A+` |
| Grade Point | `4` |
| Credit Hours Snapshot | `3` |
| Quality Points | `12` |
| Eligibility Status | `CONDITIONAL` |

Result component verification:

| Component | Raw Score | Max Score | Normalized | Weight | Weighted Score |
|---|---:|---:|---:|---:|---:|
| Assignment | `8` | `10` | `80` | `50` | `40` |
| Quiz | `9` | `10` | `90` | `50` | `45` |

Workflow verified:

- [x] Grade scale created through `POST /api/v1/grade-scales`.
- [x] Grade scale listed through `GET /api/v1/grade-scales?isActive=true`.
- [x] Result computed through `POST /api/v1/results/compute`.
- [x] Result verified through `POST /api/v1/results/:id/verify`.
- [x] Result published through `POST /api/v1/results/:id/publish`.
- [x] Published result read through `GET /api/v1/results/:id`.
- [x] Published result became locked.
- [x] Recompute after publish returned `ConflictException`.
- [x] Recompute after publish returned message: `Published, locked, verified, or amended results require amendment flow`.
- [x] Amendment request created through `POST /api/v1/result-amendments`.
- [x] Amendment approved through `POST /api/v1/result-amendments/:id/approve`.
- [x] Amendment applied through `POST /api/v1/result-amendments/:id/apply`.
- [x] Result status became `AMENDED`.
- [x] Result retained `isPublished: true`.
- [x] Result retained `lockedAt`.
- [x] Result set `amendedAt`.
- [x] GPA computed through `POST /api/v1/gpa/compute-term`.
- [x] GPA listed through `GET /api/v1/gpa`.
- [x] CGPA computed/listed through `GET /api/v1/cgpa`.

Published result lock verification:

| Test | Result |
|---|---|
| Recompute after publish | Blocked |
| Error Code | `ConflictException` |
| Error Message | `Published, locked, verified, or amended results require amendment flow` |

Amendment verification:

| Field | Before | After |
|---|---:|---:|
| Status | `PUBLISHED` | `AMENDED` |
| Normalized Percentage | `85` | `82` |
| Letter Grade | `A+` | `A+` |
| Grade Point | `4` | `4` |
| Quality Points | `12` | `12` |

GPA / CGPA verification after AMENDED result inclusion fix:

| Field | Value |
|---|---|
| GPA Attempted Credits | `3` |
| GPA Earned Credits | `3` |
| GPA Quality Points | `12` |
| GPA | `4` |
| GPA Result Count | `1` |
| CGPA Attempted Credits | `3` |
| CGPA Earned Credits | `3` |
| CGPA Cumulative Quality Points | `12` |
| CGPA | `4` |
| CGPA Term Count | `1` |

Runtime issue found and fixed:

- Initial GPA compute after amendment returned `[]`.
- Cause: GPA computation only included `ResultRecordStatus.PUBLISHED`.
- After amendment apply, the result status became `AMENDED` while `isPublished` remained `true`.
- Fix commit:
  - Commit: `a92f5c4`
  - Message: `Include amended results in GPA computation`
- Fix changed GPA result lookup to include both:
  - `PUBLISHED`
  - `AMENDED`
- API typecheck passed after fix.
- API build passed after fix.
- Runtime retest confirmed GPA and CGPA now include amended published results.

Result Processing runtime verdict:

- Grade scale workflow passed.
- Result compute workflow passed.
- Verify/publish workflow passed.
- Published result lock passed.
- Amendment request/approve/apply workflow passed.
- GPA compute passed after AMENDED inclusion fix.
- CGPA compute/list passed after AMENDED inclusion fix.
- Result Processing runtime workflow passed.

## 8. Transcript Verification

- [x] Create transcript record
- [x] Issue transcript version
- [x] Generate verification token
- [x] Public verification works
- [x] Public verification returns safe/minimal data
- [x] Token expiry respected
- [x] Revoke transcript/token
- [x] Revoked transcript fails or shows revoked status

### Transcript Verification Runtime Test

Runtime test date: 2026-05-18

Runtime context:

| Item | Value |
|---|---|
| Department ID | `dept_law_test` |
| Student User ID | `user_law_runtime_student_own` |
| Source Result Record ID | `cmp4cpg36000r2ixx5fv5svv5` |
| Source GPA Record ID | `cmpbeb1yy00072i4hnudbu9pr` |
| Source CGPA Record ID | `cmpbebghv000b2i4haymf3i6d` |
| Transcript Record ID | `cmpbfkcou000p2i4hiwnpkcrz` |
| Transcript Version ID | `cmpbfkcox000r2i4h01tco1pu` |
| Active Verification Token ID | `cmpbfm02o00102i4h96yw1bnt` |
| Short Expiry Token ID | `cmpbfnu8v00162i4hgvevu4u0` |
| Revocation ID | `cmpbfqlkp001e2i4hiaw6r75r` |

Created transcript record:

| Field | Value |
|---|---|
| Transcript Record ID | `cmpbfkcou000p2i4hiwnpkcrz` |
| Transcript Number | `TR-1779122440237-E11DF0DE` |
| Initial Status | `GENERATED` |
| Latest Version Number | `1` |
| Generated By User ID | `cmoubvzde00012i216rnx6eaq` |

Created transcript version:

| Field | Value |
|---|---|
| Transcript Version ID | `cmpbfkcox000r2i4h01tco1pu` |
| Initial Status | `GENERATED` |
| Version Number | `1` |
| Source CGPA Record ID | `cmpbebghv000b2i4haymf3i6d` |
| Cumulative Attempted Credits | `3` |
| Cumulative Earned Credits | `3` |
| CGPA Snapshot | `4` |

Transcript course line snapshot verification:

| Field | Value |
|---|---|
| Course | `LAW-101 — Constitutional Law I` |
| Credit Hours Snapshot | `3` |
| Normalized Percentage | `82` |
| Letter Grade | `A+` |
| Grade Point | `4` |
| Quality Points | `12` |
| Completion Status | `AMENDED` |
| Source Result Record ID | `cmp4cpg36000r2ixx5fv5svv5` |

Important verification:

- Transcript creation successfully included the amended published result.
- GPA/CGPA snapshots were included correctly from prior result processing records.
- Transcript snapshot preserved course, term, GPA, CGPA, and grade information.

Issue workflow verified:

- [x] Transcript issued through `POST /api/v1/transcripts/:id/issue`.
- [x] Transcript record status changed from `GENERATED` to `ISSUED`.
- [x] Transcript version status changed from `GENERATED` to `ISSUED`.
- [x] `issuedAt` was populated.
- [x] `issuedByUserId` was populated.

Verification token workflow verified:

- [x] Verification token created through `POST /api/v1/transcripts/:id/verification-token`.
- [x] Token status was `ACTIVE`.
- [x] Token expiry was automatically set.
- [x] Raw public token was returned only inside `verificationUrlPath`.
- [x] Database/API `publicCode` field stored a SHA-256 hash, not the raw token.
- [x] Public verification endpoint worked.

Public response safety verification:

- [x] Public verification response returned only safe/minimal summary data.
- [x] Public response did not expose student user ID.
- [x] Public response did not expose student name.
- [x] Public response did not expose course marks.
- [x] Public response did not expose GPA/CGPA.
- [x] Public response did not expose department snapshot.
- [x] Public response did not expose full transcript version snapshot.
- [x] Public response did not expose raw token hash.

Token expiry workflow verified:

- [x] Short-lived token created with explicit near-future `expiresAt`.
- [x] Public verification after expiry returned invalid response.
- [x] Expired token status changed to `EXPIRED`.
- [x] Expired token did not increment `verificationCount`.

Short expiry token:

| Field | Value |
|---|---|
| Token ID | `cmpbfnu8v00162i4hgvevu4u0` |
| Final Status | `EXPIRED` |
| Expires At | `2026-05-18T16:43:23.938Z` |
| Verification Count | `0` |
| Last Verified At | `null` |

Revocation workflow verified:

- [x] Active token was valid before revocation.
- [x] Transcript revoked through `POST /api/v1/transcripts/:id/revoke`.
- [x] Revocation record was created.
- [x] Revocation status was `APPLIED`.
- [x] `appliesToAllTokens: true` revoked active verification token.
- [x] Transcript record status changed to `REVOKED`.
- [x] Transcript version status changed to `REVOKED`.
- [x] Active token status changed to `REVOKED`.
- [x] Public verification after revocation returned invalid response.
- [x] Token creation after revocation was blocked.

Final revoked state:

| Resource | Final Status | Revoked At |
|---|---|---|
| Transcript Record | `REVOKED` | `2026-05-18T16:45:31.701Z` |
| Transcript Version | `REVOKED` | `2026-05-18T16:45:31.701Z` |
| Active Verification Token | `REVOKED` | `2026-05-18T16:45:31.701Z` |
| Short Expiry Token | `EXPIRED` | `null` |

Token creation after revoke:

- Endpoint: `POST /api/v1/transcripts/:id/verification-token`
- Result: `BadRequestException`
- Message: `Only active issued transcripts can receive verification tokens`

Runtime observations:

- Login response for `/api/v1/auth/login` currently returns the auth object directly, not wrapped in `{ success, data }`.
- Failed login/validation responses are wrapped in the global error format.
- Runtime admin test password had to be reset through a controlled local Prisma script because the previously stored password no longer matched the expected runtime password.
- Password hash was not printed or documented.
- Raw access tokens, refresh tokens, and raw transcript verification tokens must not be committed into documentation.

Transcript Verification runtime verdict:

- Transcript creation: Passed
- Transcript issue: Passed
- Verification token generation: Passed
- Public verification: Passed
- Public response safe/minimal: Passed
- Token expiry: Passed
- Revocation: Passed
- Revoked public verification invalidation: Passed
- Token creation after revoke blocked: Passed
- Transcript Verification runtime workflow passed.


## 9. API Quality Checks

- [ ] Pagination works on list endpoints
- [x] Invalid DTO rejected with validation error
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
- Invalid enrollment enum values returned:
  - HTTP status: `400 Bad Request`
  - `code`: `BadRequestException`
  - `message`: `Bad Request Exception`
- Enrollment validation finding:
  - Invalid enum payload is rejected correctly.
  - Response does not currently include detailed field-level validation messages.
  - Recommended improvement: expose safe validation details for DTO errors, such as invalid field names and allowed enum values.

## 10. TypeScript Module Resolution Note

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

## 11. Notes / Issues Found

| Date | Module | Issue | Status | Fix Commit / Note |
|---|---|---|---|---|
| 2026-05-06 | Deployment | Direct API port `4000` exposed to LAN | Fixed | `46a4eaf` |
| 2026-05-06 | Auth | Malformed refresh token on logout returned `InternalServerError` instead of `400 Bad Request` or `401 Unauthorized` | Open | Pending |
| 2026-05-10 | RBAC/Test Data | Runtime database had no seeded permissions, roles, or user-role assignments, so authorized Academic API testing required manual runtime role setup | Documented | Runtime role created |
| 2026-05-10 | Request Context | Authenticated `department_admin` request reached AcademicService but failed because RequestContextInterceptor initialized `principal` as null after guards had already set `request.principal` | Fixed | `025f8ba` |
| 2026-05-10 | Academic Core | Course Offering required `academicTermId`, but no Academic Term API/controller was found in the Academic module during runtime testing | Documented | Manual Academic Year/Term insert used |
| 2026-05-10 | Teacher Assignment | Teacher assignment schema/service contract exists, but no teacher assignment HTTP API/controller was found during runtime testing | Documented | Controlled Prisma DB upsert used |
| 2026-05-10 | Teacher Assignment | LAW test department had no existing teacher role/user, so controlled runtime teacher role and user were created | Documented | `role_law_teacher`, `user_law_runtime_teacher` |
| 2026-05-10 | Runtime DB / psql | Prisma `DATABASE_URL` contained `?schema=public`, which caused `psql` to fail with `invalid URI query parameter: "schema"` | Documented | Temporary `PSQL_URL` used |
| 2026-05-10 | Runtime DB / psql | Raw SQL insert into `academic_years` and `academic_terms` failed until explicit `updated_at` values were provided | Documented | Used `created_at = now()` and `updated_at = now()` |
| 2026-05-10 | Runtime DB / Node Script | `require('dotenv')` failed in ad hoc Node runtime script because `dotenv` was not resolvable from that path | Documented | Manually parsed `DATABASE_URL` from `.env` in script |
| 2026-05-10 | Env Loading | Loading `.env` printed `LMS: command not found`, likely due to an unquoted value containing spaces | Open / Needs cleanup | Review `.env` formatting later |
| 2026-05-10 | TypeScript Config | Attempted `moduleResolution: "node16"` caused project-wide TypeScript/ESM migration errors | Documented / Deferred | Keep stable NestJS/CommonJS-compatible config |
| 2026-05-10 | TypeScript Config | `ignoreDeprecations: "6.0"` was rejected by current TypeScript compiler with `Invalid value for '--ignoreDeprecations'` | Documented / Deferred | Do not use until TypeScript/compiler support is verified |
| 2026-05-11 | Enrollment | Invalid enum values in enrollment create payload returned `400 Bad Request` | Documented | Correct enum values used later |
| 2026-05-11 | Enrollment / API Quality | Invalid enrollment enum response lacked detailed field-level validation messages | Open / Improvement | Consider improving validation error response details |

## 12. Runtime Test Data Created

### Department

| Field | Value |
|---|---|
| ID | `dept_law_test` |
| Code | `LAW` |
| Slug | `law` |
| Name | `Department of Law` |
| Status | `ACTIVE` |

### Runtime Test User / Runtime Admin User

| Field | Value |
|---|---|
| User ID | `cmoubvzde00012i216rnx6eaq` |
| Email | `runtime-test-student@cu.ac.bd` |
| Display Name | `Runtime Test Student` |
| Status | `ACTIVE` |
| Department ID | `dept_law_test` |
| Current Runtime Role | `department_admin` |
| Purpose | Runtime API testing admin actor |

### Runtime Test Admin Role

| Field | Value |
|---|---|
| Role ID | `role_law_department_admin` |
| Role Code | `department_admin` |
| Role Name | `Runtime Department Admin` |
| Department ID | `dept_law_test` |
| Purpose | Temporary runtime testing role |

### Runtime Admin User Role Assignment

| Field | Value |
|---|---|
| User | `runtime-test-student@cu.ac.bd` |
| User ID | `cmoubvzde00012i216rnx6eaq` |
| Role | `department_admin` |
| Role ID | `role_law_department_admin` |
| Department | `dept_law_test` |

### Runtime Teacher Role

| Field | Value |
|---|---|
| Role ID | `role_law_teacher` |
| Role Code | `teacher` |
| Role Name | `Runtime Teacher` |
| Department ID | `dept_law_test` |
| Purpose | Temporary runtime teacher role for teacher assignment testing |

### Runtime Teacher User

| Field | Value |
|---|---|
| User ID | `user_law_runtime_teacher` |
| Email | `runtime-test-teacher@cu.ac.bd` |
| Display Name | `Runtime Test Teacher` |
| Status | `ACTIVE` |
| Department ID | `dept_law_test` |
| Purpose | Runtime teacher assignment testing |

### Runtime Teacher User Role Assignment

| Field | Value |
|---|---|
| User Role ID | `user_role_law_runtime_teacher` |
| User ID | `user_law_runtime_teacher` |
| User Email | `runtime-test-teacher@cu.ac.bd` |
| Role ID | `role_law_teacher` |
| Role Code | `teacher` |
| Department ID | `dept_law_test` |
| Revoked At | `null` |

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

### Runtime Teacher Course Assignment

| Field | Value |
|---|---|
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Department ID | `dept_law_test` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Academic Term | `LAW-2025-2026-S1` |
| Teacher User ID | `user_law_runtime_teacher` |
| Teacher Email | `runtime-test-teacher@cu.ac.bd` |
| Teacher Display Name | `Runtime Test Teacher` |
| Teacher Platform Role | `teacher` |
| Assignment Role Code | `primary_instructor` |
| Assignment Status | `ACTIVE` |
| Unassigned At | `null` |

### Runtime Enrollment

| Field | Value |
|---|---|
| Enrollment ID | `cmp198zg900072ig5ljfjaxwl` |
| Department ID | `dept_law_test` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Student User ID | `cmoubvzde00012i216rnx6eaq` |
| Approved By User ID | `cmoubvzde00012i216rnx6eaq` |
| Source Type | `ADMIN` |
| Status | `APPROVED` |
| Eligibility Status | `CONDITIONAL` |
| Course | `LAW-101 — Constitutional Law I` |
| Student | `Runtime Test Student` |
| Created At | `2026-05-11T13:46:10.425Z` |
| Updated At | `2026-05-11T13:49:06.427Z` |

### Useful Runtime IDs

```bash
PROGRAM_ID='cmozwlcul000d2i0lgujx0pw5'
COURSE_ID='cmozwxq8r000h2i0lg9hhmeyg'
ACADEMIC_YEAR_ID='ay_law_2025_2026'
ACADEMIC_TERM_ID='term_law_2025_2026_s1'
COURSE_OFFERING_ID='cmozy23xm000r2i0lccmtg7dl'
RUNTIME_ADMIN_USER_ID='cmoubvzde00012i216rnx6eaq'
RUNTIME_TEACHER_USER_ID='user_law_runtime_teacher'
RUNTIME_TEACHER_ROLE_ID='role_law_teacher'
RUNTIME_TEACHER_ASSIGNMENT_ID='teacher_assignment_law_101_runtime'
RUNTIME_ENROLLMENT_ID='cmp198zg900072ig5ljfjaxwl'
DEPARTMENT_ID='dept_law_test'
```

### Sensitive Data Rule

- Do not store raw access tokens in documentation.
- Do not store raw refresh tokens in documentation.
- Do not store raw email verification tokens in documentation.
- Do not store database connection strings or passwords in documentation.
- Runtime DB credentials shown in terminal output must not be committed to GitHub.
- Test tokens pasted in terminal/chat should not be reused in production.
- Production/cloud credentials must be rotated if accidentally exposed.
- Runtime test password should not be committed to public documentation beyond controlled runtime notes.

## 13. Current Runtime Verdict

- [x] Existing backend modules runtime-tested
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
- [x] Teacher assignment workflow tested through controlled Prisma DB upsert
- [x] Teacher assignment relation verified
- [x] Enrollment workflow tested
- [x] Enrollment create/list/get/update workflow verified
- [x] Enrollment relation with student, course offering, course, academic term, and approver verified
- [x] API TypeScript typecheck passed after stable config fix
- [x] API TypeScript build passed after stable config fix
- [x] TypeScript Node16/ESM migration risk documented
- [ ] Student visibility rules tested
- [x] Student own-resource rules tested
- [x] Teacher assigned-course isolation tested
- [x] Cross-department admin isolation tested
- [x] Assessment workflow tested
- [x] Result Processing workflow tested
- [x] Transcript Verification workflow tested
- [x] Ready to start Class Session Module

## Class Session Module Runtime Test

Runtime test date: 2026-05-18

Code commit tested:

| Field | Value |
|---|---|
| Commit | `7bf42b8` |
| Message | `Implement class session API foundation` |

Runtime context:

| Item | Value |
|---|---|
| Department ID | `dept_law_test` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Assigned Course | `LAW-101 — Constitutional Law I` |
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Teacher User ID | `user_law_runtime_teacher` |
| Student User ID | `user_law_runtime_student_own` |
| Unassigned Course Offering ID | `offering_law_999_unassigned_runtime` |

Implemented endpoints verified:

- [x] `POST /api/v1/class-sessions`
- [x] `GET /api/v1/class-sessions`
- [x] `GET /api/v1/class-sessions/:id`
- [x] `PATCH /api/v1/class-sessions/:id`
- [x] `POST /api/v1/class-sessions/:id/activate`
- [x] `POST /api/v1/class-sessions/:id/complete`
- [x] `POST /api/v1/class-sessions/:id/cancel`
- [x] `POST /api/v1/class-sessions/:id/lock`
- [x] `POST /api/v1/class-sessions/:id/archive`

Created runtime class session:

| Field | Value |
|---|---|
| Class Session ID | `cmpbijz8700072idedkeqqcxc` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Session Code | `LAW101-CS-RT-001` |
| Initial Title | `Runtime Class Session 001` |
| Updated Title | `Runtime Class Session 001 Updated` |
| Updated Location | `Room 102` |
| Initial Status | `SCHEDULED` |
| Final Status | `ARCHIVED` |

Validation verified:

- [x] Invalid schedule range was rejected.
- [x] `scheduledEndAt` before `scheduledStartAt` returned `BadRequestException`.
- [x] Error message: `scheduledEndAt must be after scheduledStartAt`.

Admin CRUD verified:

- [x] Department admin created a class session.
- [x] Department admin listed class sessions by course offering.
- [x] Department admin read class session by ID.
- [x] Department admin updated editable fields while session was `SCHEDULED`.
- [x] Linked course offering, course, academic term, teacher assignment, and teacher user were returned.

Lifecycle workflow verified:

| Transition / Check | Result |
|---|---|
| `SCHEDULED → ACTIVE` | Passed |
| `ACTIVE → COMPLETED` | Passed |
| `COMPLETED → LOCKED` | Passed |
| `LOCKED → ARCHIVED` | Passed |
| `SCHEDULED → CANCELED` | Passed |
| Update schedule date while `ACTIVE` | Blocked |
| Re-activate `COMPLETED` session | Blocked |
| Update `LOCKED` session | Blocked |

Lifecycle timestamps verified:

| Field | Value |
|---|---|
| `actualStartAt` | populated |
| `actualEndAt` | populated |
| `lockedAt` | populated |
| `archivedAt` | populated |
| `canceledAt` | populated for cancel test session |

Cancel workflow test:

| Field | Value |
|---|---|
| Cancel Session ID | `cmpbis1uw000l2ide44csy6y1` |
| Session Code | `LAW101-CS-RT-CANCEL-001` |
| Initial Status | `SCHEDULED` |
| Final Status | `CANCELED` |
| Canceled At | `2026-05-18T18:10:47.408Z` |

Unassigned teacher isolation setup:

| Field | Value |
|---|---|
| Unassigned Class Session ID | `cmpbiuqrt000r2ide7eyou2ge` |
| Course Offering ID | `offering_law_999_unassigned_runtime` |
| Session Code | `LAW999-CS-RT-UNASSIGNED-001` |
| Status | `SCHEDULED` |

Teacher assigned-course isolation verified:

- [x] Teacher could list class sessions for assigned course offering `cmozy23xm000r2i0lccmtg7dl`.
- [x] Teacher could direct-read assigned class session.
- [x] Teacher could create a class session for assigned course offering.
- [x] Teacher could not list class sessions for unassigned course offering `offering_law_999_unassigned_runtime`.
- [x] Teacher direct-read of unassigned class session returned `NotFoundException`.
- [x] Teacher create attempt for unassigned course offering returned `ForbiddenException`.
- [x] Error message: `Teacher is not assigned to this course offering`.

Teacher-created class session:

| Field | Value |
|---|---|
| Class Session ID | `cmpbj0yob00152idexwimmanr` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Session Code | `LAW101-CS-RT-TEACHER-001` |
| Status | `SCHEDULED` |

Student access verification:

- [x] Student broad list access to `GET /api/v1/class-sessions` was blocked.
- [x] Student direct read access to `GET /api/v1/class-sessions/:id` was blocked.
- [x] Both returned `403 Forbidden`.
- [x] Error message: `Access denied by policy`.

Runtime observations:

- Class Session module routes mapped successfully after PM2 restart.
- Health endpoint remained OK after deployment.
- Runtime test passwords for teacher/student had to be reset through controlled local Prisma scripts because stored passwords did not match expected runtime password.
- Password hashes were not printed or documented.
- Raw access tokens were not committed into documentation.
- Student-facing enrolled/visible class-session endpoint is not implemented yet and should be considered a future enhancement.

Class Session runtime verdict:

- Class Session API foundation: Passed
- Admin CRUD: Passed
- Lifecycle transitions: Passed
- Invalid transition blocking: Passed
- Teacher assigned-course isolation: Passed
- Student broad access blocked: Passed
- API typecheck: Passed
- API build: Passed


## 14. Next Test Steps

1. Commit and push the updated runtime checklist.
2. Start Attendance Sync Module planning/runtime foundation next.
3. Student-facing class-session visibility endpoint remains a future enhancement.
4. Student own-enrollment/self-resource rules test completed.
5. Teacher assigned-course isolation tests completed.
6. Cross-department admin isolation tests completed for programs, courses, course offerings, and enrollments.
7. Reboot persistence completed:
   - PM2 survives reboot
   - Nginx survives reboot
   - PostgreSQL survives reboot
8. Review `.env` formatting issue that printed `LMS: command not found` during shell loading.
9. Consider improving DTO validation error responses so invalid enum values show safe field-level details.
10. Consider implementing Academic Year and Academic Term management API endpoints later.
11. Consider implementing Teacher Assignment API/controller later.
12. Keep the current API TypeScript config stable unless a dedicated Node16/ESM migration task is planned.

## Student Enrollment Access Isolation Runtime Finding

### Student Role/User Runtime Setup

- [x] Created controlled runtime student role:
  - Role ID: `role_law_student`
  - Role Code: `student`
  - Role Name: `Runtime Student`
  - Department ID: `dept_law_test`

- [x] Created controlled runtime own-student user:
  - User ID: `user_law_runtime_student_own`
  - Email: `runtime-student-own@cu.ac.bd`
  - Display Name: `Runtime Own Student`
  - Department ID: `dept_law_test`
  - Role: `student`

- [x] Created controlled runtime other-student user:
  - User ID: `user_law_runtime_student_other`
  - Email: `runtime-student-other@cu.ac.bd`
  - Display Name: `Runtime Other Student`
  - Department ID: `dept_law_test`
  - Role: `student`

- [x] Set bcrypt password hash for both controlled student users.
- [x] Verified `runtime-student-own@cu.ac.bd` can log in successfully.
- [x] Login response returned role: `student`.
- [x] Student access token was generated successfully.

### Student Enrollment API Access Test

- [x] `GET /api/v1/enrollments` as student returned `403 Forbidden`.
- [x] `GET /api/v1/enrollments/:id` as student returned `403 Forbidden`.

### Finding

Student enrollment own-resource behavior is currently not testable through the existing `/enrollments` endpoints.

Reason:

- `EnrollmentsController` requires `ENROLLMENT_READ` for list/get.
- `ENROLLMENT_READ` maps to `enrollment.record.read`.
- Current static `student` role has `enrollment.record.self-request`.
- Current static `student` role does not have `enrollment.record.read`.
- Therefore student requests are blocked at `PolicyGuard` before service-level ownership checks.

### Service/Repository Security Observation

Current enrollment read/list methods are department-scoped but not student ownership-scoped:

- `AcademicService.listEnrollments()` passes department and query filters to repository.
- `AcademicService.getEnrollment(id)` fetches by department and enrollment ID.
- `PrismaAcademicRepository.findEnrollments()` supports optional `studentUserId` filter but does not automatically force it from the authenticated student actor.
- `PrismaAcademicRepository.findEnrollmentById()` filters by `id`, `departmentId`, and `archivedAt`, but not by authenticated student actor.

### Security Decision

Do not give broad `enrollment.record.read` policy to the `student` role unless service-layer ownership filtering is implemented first.

Giving broad enrollment read access to students without enforcing `studentUserId = current principal actorId` could create an IDOR / own-resource isolation risk.

### Recommended Future Implementation

Implement student-specific enrollment access using safe self-resource endpoints, for example:

- `GET /api/v1/enrollments/me`
- `GET /api/v1/enrollments/me/:id`
- `POST /api/v1/enrollments/self-request`

These should use a student-safe policy such as:

- existing: `enrollment.record.self-request`
- or new: `enrollment.record.self-read`

Required service-layer rule:

- For student self-resource reads, always enforce:
  - `studentUserId = principal.actorId`
  - `departmentId = principal.activeDepartmentId`

Do not rely on frontend filtering for this.

### Current Verdict For This Check

- Student login: Passed
- Student token generation: Passed
- Student enrollment API access: Blocked by policy
- Student own-resource isolation: Not fully testable yet
- Required next development: student-safe enrollment self-resource endpoint or ownership-aware service method

### Fix Implemented / Retest Required

- Implemented `GET /api/v1/enrollments/me` and `GET /api/v1/enrollments/me/:id`.
- These endpoints use the existing `enrollment.record.self-request` student policy.
- Service-layer reads now force `departmentId = principal.activeDepartmentId` and `studentUserId = principal.actorId`.
- Any `studentUserId` query value sent to `/enrollments/me` is ignored.
- Retest with fresh student tokens is required.


## Teacher Assigned-Course Isolation Runtime Finding

### Teacher Runtime Setup

- [x] Set bcrypt password hash for runtime teacher user.
- [x] Verified `runtime-test-teacher@cu.ac.bd` can log in successfully.
- [x] Login response returned role: `teacher`.
- [x] Teacher access token was generated successfully.

Runtime teacher:

| Field | Value |
|---|---|
| User ID | `user_law_runtime_teacher` |
| Email | `runtime-test-teacher@cu.ac.bd` |
| Role | `teacher` |
| Department ID | `dept_law_test` |

Assigned course offering:

| Field | Value |
|---|---|
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Assignment Role | `primary_instructor` |
| Assignment Status | `ACTIVE` |

### Unassigned Course Offering Runtime Setup

Created controlled unassigned runtime course/offering for isolation testing.

Unassigned course:

| Field | Value |
|---|---|
| Course ID | `course_law_999_unassigned_runtime` |
| Code | `LAW-999` |
| Title | `Unassigned Runtime Test Course` |
| Department ID | `dept_law_test` |
| Academic Program ID | `cmozwlcul000d2i0lgujx0pw5` |
| Status | `ACTIVE` |

Unassigned course offering:

| Field | Value |
|---|---|
| Course Offering ID | `offering_law_999_unassigned_runtime` |
| Course ID | `course_law_999_unassigned_runtime` |
| Course Code | `LAW-999` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Section Code | `Z` |
| Status | `PLANNED` |
| Teacher Assignments | `[]` |

### Teacher Course Offering Access Test

- [x] `GET /api/v1/course-offerings` as teacher returned assigned offering `LAW-101`.
- [x] `GET /api/v1/course-offerings/cmozy23xm000r2i0lccmtg7dl` as teacher returned assigned offering `LAW-101`.

### Teacher Assigned-Course Isolation Negative Test

- [x] `GET /api/v1/course-offerings` as teacher also returned unassigned offering `LAW-999`.
- [x] `GET /api/v1/course-offerings/offering_law_999_unassigned_runtime` as teacher returned `200 OK`.

### Finding

Teacher assigned-course isolation is not currently enforced for course offering read/list endpoints.

The teacher can view an unassigned course offering in the same department.

Observed unassigned offering exposed to teacher:

| Field | Value |
|---|---|
| Course Offering ID | `offering_law_999_unassigned_runtime` |
| Course | `LAW-999 — Unassigned Runtime Test Course` |
| Section | `Z` |
| Teacher Assignments | none |

### Security Impact

This is an object-level authorization gap.

The teacher role has course/offering read policy, but current course offering read/list behavior appears department-scoped rather than assignment-scoped.

For Lexora LMS, teacher access must be restricted to assigned course offerings only.

### Required Future Fix

Do not solve this by removing teacher course/offering read policies blindly.

Instead, implement assignment-aware service/repository filtering for teacher access.

Required behavior:

- Department admin:
  - Can list/read all course offerings within own department.
- Teacher:
  - Can list/read only course offerings where an active teacher assignment exists:
    - `teacherUserId = principal.actorId`
    - `departmentId = principal.activeDepartmentId`
    - `unassignedAt = null`
    - assignment status active
- Student:
  - Should use separate visibility/enrollment rules, not broad teacher/admin offering access.

Recommended implementation options:

1. Add role-aware filtering inside `AcademicService.listCourseOfferings()` and `AcademicService.getCourseOffering()`.
2. Or create dedicated teacher-safe endpoints such as:
   - `GET /api/v1/teacher/course-offerings`
   - `GET /api/v1/teacher/course-offerings/:id`
3. Ensure direct ID access to unassigned offerings returns `404 Not Found` or `403 Forbidden`.

### Current Verdict For This Check

- Teacher login: Passed
- Teacher assigned offering access: Passed
- Teacher unassigned offering list isolation: Failed / gap detected
- Teacher unassigned offering direct access isolation: Failed / gap detected
- Required next development: teacher assigned-course object-level authorization enforcement

### Fix Implemented / Retest Required

- Course offering list/read now applies assignment-aware filtering for teacher principals.
- Teachers can only list/read offerings with an active assignment in the active department:
  - `teacherUserId = principal.actorId`
  - `departmentId = principal.activeDepartmentId`
  - `status = ACTIVE`
  - `unassignedAt = null`
  - `archivedAt = null`
- Department admins retain department-scoped offering list/read behavior.
- Retest with fresh teacher tokens is required.


## Access Control Fix Runtime Retest Result

### Student Enrollment Self-Resource Retest

- [x] Pulled fix commit `52c3b7d` into Ubuntu VM.
- [x] Rebuilt API successfully with `pnpm --filter @lexora/api build`.
- [x] Restarted `lexora-api` with PM2.
- [x] Health check passed after PM2 entry path correction.
- [x] Logged in as `runtime-student-own@cu.ac.bd`.
- [x] Student access token generated successfully.
- [x] `GET /api/v1/enrollments/me` returned `200 OK`.
- [x] Response was `[]`, expected because `runtime-student-own@cu.ac.bd` currently has no own enrollment.
- [x] `GET /api/v1/enrollments` as student still returned `403 Forbidden`.

Student retest verdict:

- Student self-resource endpoint works.
- Student broad/admin enrollment endpoint remains blocked.
- Student enrollment access-control fix passed initial runtime retest.

### Teacher Assigned-Course Isolation Retest

- [x] Logged in as `runtime-test-teacher@cu.ac.bd`.
- [x] Teacher access token generated successfully.
- [x] `GET /api/v1/course-offerings` as teacher returned only assigned offering:
  - `LAW-101 — Constitutional Law I`
  - Course Offering ID: `cmozy23xm000r2i0lccmtg7dl`
- [x] Unassigned offering `LAW-999` no longer appeared in teacher course offering list.
- [x] `GET /api/v1/course-offerings/offering_law_999_unassigned_runtime` as teacher returned `NotFoundException`.
- [x] Direct access to unassigned course offering is now blocked for teacher.

Teacher retest verdict:

- Teacher assigned offering access works.
- Teacher unassigned offering list isolation works.
- Teacher unassigned offering direct access isolation works.
- Teacher assigned-course object-level authorization fix passed runtime retest.

### PM2 Runtime Note

During retest, PM2 initially failed because it was still trying to run:

- `apps/api/dist/main.js`

Actual build output was:

- `apps/api/dist/src/main.js`

PM2 process was recreated with the correct entry path:

- `node -r ./apps/api/register-paths.js apps/api/dist/src/main.js`

After that:

- `pm2 save` completed.
- `lexora-api` became online.
- `/api/v1/health` returned successful health response.


## Attendance Sync Module Runtime Test

Runtime test date: 2026-05-19

Code commits tested:

| Field | Value |
|---|---|
| Attendance API foundation commit | `62bae08` |
| Message | `Implement attendance sync API foundation` |
| Teacher-only capture patch commit | `629a1b4` |
| Message | `Restrict attendance capture to assigned teachers` |

Runtime context:

| Item | Value |
|---|---|
| Department ID | `dept_law_test` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Class Session ID | `cmpbj0yob00152idexwimmanr` |
| Class Session Code | `LAW101-CS-RT-TEACHER-001` |
| Teacher Assignment ID | `teacher_assignment_law_101_runtime` |
| Teacher User ID | `user_law_runtime_teacher` |
| Student User ID | `user_law_runtime_student_own` |
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Attendance Import Batch ID | `cmpcov0ih000f2ife7t2unpj6` |
| Attendance Record ID | `cmpcoytqo000n2ifensuu4gvn` |

Implemented endpoints verified:

- [x] `POST /api/v1/attendance/import-batches`
- [x] `GET /api/v1/attendance/import-batches`
- [x] `GET /api/v1/attendance/import-batches/:id`
- [x] `POST /api/v1/attendance/import-batches/:id/cancel`
- [x] `POST /api/v1/attendance/records`
- [x] `GET /api/v1/attendance/records`
- [x] `GET /api/v1/attendance/records/:id`
- [x] `GET /api/v1/attendance/me`
- [x] `PATCH /api/v1/attendance/records/:id/override`

Attendance import batch workflow verified:

- [x] Department admin created attendance import batch.
- [x] Import batch was linked to course offering and class session.
- [x] Import batch source type was `BIOMETRIC`.
- [x] Import batch status was initially `RECEIVED`.
- [x] Department admin listed import batches by course offering.
- [x] Department admin read import batch by ID.
- [x] Department admin canceled import batch.
- [x] Canceled import batch status became `CANCELED`.
- [x] `reviewedByUserId` was set to the admin runtime user after cancel.

Created attendance import batch:

| Field | Value |
|---|---|
| Attendance Import Batch ID | `cmpcov0ih000f2ife7t2unpj6` |
| Department ID | `dept_law_test` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Class Session ID | `cmpbj0yob00152idexwimmanr` |
| Uploaded By User ID | `cmoubvzde00012i216rnx6eaq` |
| Reviewed By User ID | `cmoubvzde00012i216rnx6eaq` |
| Source Type | `BIOMETRIC` |
| External System Name | `Runtime Biometric Test Source` |
| External Batch Ref | `ATT-RT-20260519-001` |
| Initial Status | `RECEIVED` |
| Final Status | `CANCELED` |

Attendance capture lifecycle verified:

- [x] Attendance capture against `SCHEDULED` class session was blocked.
- [x] Error message: `Attendance can only be captured for active class sessions`.
- [x] Class session was activated through `POST /api/v1/class-sessions/:id/activate`.
- [x] Class session status became `ACTIVE`.
- [x] `actualStartAt` was populated.
- [x] Attendance capture succeeded after class session became `ACTIVE`.

Strict attendance capture rule verified:

- [x] Department admin cannot capture/mark attendance.
- [x] Admin capture attempt returned `ForbiddenException`.
- [x] Error message: `Only assigned teachers can capture attendance`.
- [x] Student cannot capture/mark attendance.
- [x] Student capture attempt returned `ForbiddenException`.
- [x] Error message: `Access denied by policy`.
- [x] Assigned teacher can capture attendance for assigned active class session.
- [x] Teacher capture updated the attendance record.
- [x] `markedByUserId` became `user_law_runtime_teacher`.
- [x] `markedByUser` resolved to `Runtime Test Teacher`.
- [x] Student self-read endpoint remained read-only and worked through `/api/v1/attendance/me`.

Final attendance capture policy decision:

- Admin manages attendance infrastructure.
- Admin can schedule classes, view attendance records, manage import batches, and perform audited overrides.
- Admin cannot directly capture/mark attendance through `POST /api/v1/attendance/records`.
- Attendance capture is allowed only from a teacher account.
- The teacher must be actively assigned to the class session course offering.
- The class session must be `ACTIVE`.
- Student cannot mark attendance.
- Student can only view own attendance through `/api/v1/attendance/me`.

Attendance record state after assigned teacher capture:

| Field | Value |
|---|---|
| Attendance Record ID | `cmpcoytqo000n2ifensuu4gvn` |
| Department ID | `dept_law_test` |
| Class Session ID | `cmpbj0yob00152idexwimmanr` |
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Student User ID | `user_law_runtime_student_own` |
| Marked By User ID | `user_law_runtime_teacher` |
| Marked By User | `Runtime Test Teacher` |
| Status after teacher capture | `PRESENT` |
| Source Type after teacher capture | `MANUAL` |
| External Source Ref | `TEACHER-CAPTURE-RT-20260519` |

Student attendance access verified:

- [x] Student self-read endpoint worked:
  - `GET /api/v1/attendance/me?classSessionId=cmpbj0yob00152idexwimmanr`
- [x] Student self-read returned only the authenticated student's attendance record.
- [x] Student broad attendance record endpoint was blocked:
  - `GET /api/v1/attendance/records?classSessionId=cmpbj0yob00152idexwimmanr`
- [x] Broad endpoint block message: `Students must use the attendance self endpoint`.
- [x] Student attendance create/capture was blocked by policy:
  - `POST /api/v1/attendance/records`
- [x] Student capture block message: `Access denied by policy`.

Admin override workflow verified:

- [x] Override without reason was blocked.
- [x] Empty `overrideReason` returned `BadRequestException`.
- [x] Override with documented reason succeeded.
- [x] Final attendance status became `EXCUSED`.
- [x] `overrideByUserId` was set to admin runtime user.
- [x] `overrideReason` was stored.
- [x] Original teacher marker was preserved.

Attendance record state after admin override:

| Field | Value |
|---|---|
| Attendance Record ID | `cmpcoytqo000n2ifensuu4gvn` |
| Marked By User ID | `user_law_runtime_teacher` |
| Override By User ID | `cmoubvzde00012i216rnx6eaq` |
| Final Status | `EXCUSED` |
| Source Type | `MANUAL` |
| Override Reason | `Runtime test admin correction with documented reason` |

Security and architecture findings:

- Student self-marking is not possible through the API.
- Admin direct attendance capture is blocked after teacher-only capture patch.
- Teacher attendance capture is assignment-aware.
- Attendance capture requires an active class session.
- Enrollment must belong to the same course offering as the class session.
- `studentUserId` must match the enrollment student.
- Student self-read is isolated to the authenticated student.
- Admin override requires a reason and preserves teacher marking context.
- Biometric source is represented as external verified data only; fingerprint templates are not stored in LMS.
- Direct biometric device integration is not implemented and remains intentionally out of scope.

Attendance runtime verdict:

- Attendance API foundation: Passed
- Import batch create/list/read/cancel: Passed
- Non-active session attendance capture block: Passed
- Admin direct capture block: Passed
- Assigned teacher active-session capture: Passed
- Student capture block: Passed
- Student own attendance read: Passed
- Student broad attendance endpoint block: Passed
- Admin override without reason block: Passed
- Admin override with reason: Passed


## Eligibility Engine Runtime Test

Runtime test date: 2026-05-19

Code commit tested:

| Field | Value |
|---|---|
| Eligibility Engine foundation commit | `2f3e936` |
| Message | `Implement eligibility engine foundation` |

Runtime context:

| Item | Value |
|---|---|
| Department ID | `dept_law_test` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Academic Term ID | `term_law_2025_2026_s1` |
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Student User ID | `user_law_runtime_student_own` |
| Teacher User ID | `user_law_runtime_teacher` |
| Attendance Record ID | `cmpcoytqo000n2ifensuu4gvn` |

Implemented endpoints verified:

- [x] `POST /api/v1/eligibility/compute/enrollment/:enrollmentId`
- [x] `POST /api/v1/eligibility/compute/course-offering/:courseOfferingId`
- [x] `GET /api/v1/eligibility/enrollments/:enrollmentId`
- [x] `GET /api/v1/eligibility/me`
- [x] `PATCH /api/v1/eligibility/enrollments/:enrollmentId/override`

Eligibility computation rule verified:

- [x] Attendance-based eligibility calculation uses counted attendance records for the enrollment and course offering.
- [x] `PRESENT`, `LATE`, and `EXCUSED` are treated as attended/allowed for MVP.
- [x] `ABSENT` is treated as not attended.
- [x] Default eligible threshold is `75%`.
- [x] Conditional threshold is `65%`.
- [x] No attendance records result in `PENDING_REVIEW`.

Single enrollment compute verified:

- [x] Admin computed eligibility for one enrollment.
- [x] Enrollment eligibility status updated to `ELIGIBLE`.
- [x] `eligibilitySnapshotJson` was written.
- [x] Snapshot stored rule, counts, percentage, enrollment ID, course offering ID, computed actor, and computed timestamp.

Computed eligibility snapshot:

| Field | Value |
|---|---|
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Computed By | `cmoubvzde00012i216rnx6eaq` |
| Rule Type | `attendance_percentage` |
| Threshold Percentage | `75` |
| Conditional Threshold Percentage | `65` |
| Total Counted Sessions | `1` |
| Present Count | `0` |
| Late Count | `0` |
| Excused Count | `1` |
| Absent Count | `0` |
| Attendance Percentage | `100` |
| Computed Status | `ELIGIBLE` |

Course offering bulk compute verified:

- [x] Admin computed eligibility for all approved enrollments in course offering.
- [x] Summary returned successfully.
- [x] Total approved enrollments: `3`.
- [x] Computed count: `3`.
- [x] Eligible count: `1`.
- [x] Conditional count: `0`.
- [x] Ineligible count: `0`.
- [x] Pending review count: `2`.
- [x] Enrollments without attendance records remained `PENDING_REVIEW`.

Eligibility read access verified:

- [x] Admin read enrollment eligibility by enrollment ID.
- [x] Student self endpoint worked:
  - `GET /api/v1/eligibility/me?courseOfferingId=cmozy23xm000r2i0lccmtg7dl`
- [x] Student saw only own enrollment eligibility.
- [x] Assigned teacher read eligibility by enrollment ID.
- [x] Teacher read was scoped to assigned course offering.
- [x] Eligibility result included student, term, course offering, course, and snapshot details.

Admin override workflow verified:

- [x] Override without reason was blocked.
- [x] Empty `overrideReason` returned `BadRequestException`.
- [x] Override with documented reason succeeded.
- [x] Final eligibility status became `CONDITIONAL`.
- [x] Override metadata was stored in `eligibilitySnapshotJson`.
- [x] Previous eligibility status was preserved.
- [x] Previous computed snapshot was preserved.

Eligibility override final state:

| Field | Value |
|---|---|
| Enrollment ID | `enrollment_law_student_own_runtime` |
| Final Eligibility Status | `CONDITIONAL` |
| Overridden By | `cmoubvzde00012i216rnx6eaq` |
| Override Reason | `Runtime test eligibility correction with documented reason` |
| Previous Eligibility Status | `ELIGIBLE` |
| Previous Attendance Percentage | `100` |
| Previous Total Counted Sessions | `1` |
| Previous Excused Count | `1` |

Security and architecture findings:

- Eligibility computation is admin-only.
- Student self-read is restricted to the authenticated student's own enrollments.
- Teacher eligibility read is assignment-scoped.
- Admin override requires non-empty reason.
- Override preserves previous computed eligibility status and snapshot.
- Result Processing compatibility is preserved because eligibility continues to be stored on enrollment.
- No new Prisma migration was required.
- TypeScript module configuration was not changed.

Eligibility runtime verdict:

- Eligibility Engine API foundation: Passed
- Single enrollment compute: Passed
- Course offering bulk compute: Passed
- Admin eligibility read: Passed
- Student self eligibility read: Passed
- Assigned teacher eligibility read: Passed
- Override without reason block: Passed
- Override with reason: Passed
- Snapshot preservation: Passed


## Notification / Alert Foundation

Implementation summary:

- Notification / Alert API foundation has been added on top of the existing notification Prisma models.
- The module now exposes event emission, in-app notification list/read/read-status/dismiss flows, department-scoped template management, current-user preference updates, and placeholder delivery records for future email/push.
- Real email sending, browser push sending, background workers, queues, and frontend work remain intentionally out of scope for this foundation.
- The implementation uses the existing Prisma enums/models:
  - `NotificationEventStatus`
  - `NotificationRecordStatus`
  - `NotificationDeliveryStatus`
  - `NotificationTemplateStatus`
  - `NotificationChannel`
  - `NotificationEvent`
  - `Notification`
  - `NotificationDelivery`
  - `NotificationTemplate`
  - `NotificationPreference`
  - `PushSubscription`

Endpoints added:

- [ ] `POST /api/v1/notifications/events`
- [ ] `GET /api/v1/notifications`
- [ ] `GET /api/v1/notifications/:id`
- [ ] `PATCH /api/v1/notifications/:id/read`
- [ ] `PATCH /api/v1/notifications/:id/dismiss`
- [ ] `POST /api/v1/notification-templates`
- [ ] `GET /api/v1/notification-templates`
- [ ] `PATCH /api/v1/notification-templates/:id`
- [ ] `GET /api/v1/notification-preferences/me`
- [ ] `PATCH /api/v1/notification-preferences/me`

Security rules to verify at runtime:

- [ ] Department admin can list/read notification records only within their active department.
- [ ] Department admin can filter notifications by `recipientUserId` only within the active department.
- [ ] Student notification list/read/read-status/dismiss is forced to `principal.actorId`.
- [ ] Teacher notification list/read/read-status/dismiss is forced to `principal.actorId`.
- [ ] Direct ID access to another user's notification returns a safe not-found response for teacher/student users.
- [ ] Direct ID access to a notification in another department returns a safe not-found response.
- [ ] Client-supplied department IDs are not accepted by DTOs and cannot override request context.
- [ ] Critical locked notification preferences cannot be disabled.
- [ ] Event dedupe keys return the existing event safely instead of crashing on the unique constraint.

Runtime test checklist placeholders:

- [ ] Department admin emits an `IN_APP` notification event for one or more recipients.
- [ ] Emitted event creates `NotificationEvent` with status `PROCESSED`.
- [ ] Emitted `IN_APP` event creates `Notification` rows with status `READY`.
- [ ] Emitted `EMAIL` or `PUSH` target creates `NotificationDelivery` placeholder rows with status `PENDING`.
- [ ] No external email or push provider is called.
- [ ] Student can list own notification.
- [ ] Student can read own notification by ID.
- [ ] Student can mark own notification as `READ`.
- [ ] Student can dismiss own notification.
- [ ] Student cannot read or dismiss another user's notification.
- [ ] Teacher can list/read/dismiss only own notifications.
- [ ] Department admin can create a notification template.
- [ ] Department admin can list templates in own department.
- [ ] Department admin can update a template in own department.
- [ ] User can read own notification preferences.
- [ ] User can upsert own notification preference.
- [ ] User cannot disable an existing or requested critical-locked preference.

Architecture notes:

- Event emission uses request-context department and actor information.
- The event endpoint stores channel targets and optional payload/context JSON.
- In-app notification creation is synchronous and minimal.
- Email/push delivery rows are placeholders for future delivery workers.
- Notification template storage does not render templates yet.
- Preference updates are current-user only and upsert by the existing unique key.
- Audit events are written for event emission, notification creation, dismissals, template create/update, and preference updates.


## Notification / Alert Foundation Runtime Test

Runtime test date: 2026-05-19

Code commit tested:

| Field | Value |
|---|---|
| Commit | `9ba4016` |
| Message | `Implement notification alert API foundation` |

Runtime context:

| Item | Value |
|---|---|
| Department ID | `dept_law_test` |
| Department Code | `LAW` |
| Runtime Admin User ID | `cmoubvzde00012i216rnx6eaq` |
| Runtime Admin Email | `runtime-test-student@cu.ac.bd` |
| Student Own User ID | `user_law_runtime_student_own` |
| Student Own Email | `runtime-student-own@cu.ac.bd` |
| Other Student User ID | `user_law_runtime_student_other` |
| Other Student Email | `runtime-student-other@cu.ac.bd` |
| Course Offering ID | `cmozy23xm000r2i0lccmtg7dl` |
| Course | `LAW-101 — Constitutional Law I` |
| Enrollment ID | `enrollment_law_student_own_runtime` |

Deployment/runtime verification:

- [x] Ubuntu server repo pulled latest `origin/main`.
- [x] Fast-forwarded from `049986c` to `9ba4016`.
- [x] API typecheck passed.
- [x] API build passed.
- [x] PM2 process `lexora-api` restarted successfully.
- [x] Health endpoint returned `status: ok`.
- [x] Notification routes were mapped successfully.
- [x] Nest application started successfully.

Mapped Notification routes verified:

- [x] `POST /api/v1/notifications/events`
- [x] `GET /api/v1/notifications`
- [x] `GET /api/v1/notifications/:id`
- [x] `PATCH /api/v1/notifications/:id/read`
- [x] `PATCH /api/v1/notifications/:id/dismiss`
- [x] `POST /api/v1/notification-templates`
- [x] `GET /api/v1/notification-templates`
- [x] `PATCH /api/v1/notification-templates/:id`
- [x] `GET /api/v1/notification-preferences/me`
- [x] `PATCH /api/v1/notification-preferences/me`

Runtime authentication notes:

- Runtime admin login initially failed until the required `departmentCode` field was included.
- Runtime admin password was reset through a controlled local Prisma script for test continuity.
- Runtime own-student password was reset through a controlled local Prisma script for test continuity.
- Runtime other-student password was reset through a controlled local Prisma script for isolation testing.
- Password hashes were not printed or documented.
- Raw access tokens and refresh tokens must not be committed into documentation.

### Notification Event Runtime Test

Created runtime in-app notification event:

| Field | Value |
|---|---|
| Notification Event ID | `cmpcwk9ic000b2i6xasby3jun` |
| Department ID | `dept_law_test` |
| Triggered By User ID | `cmoubvzde00012i216rnx6eaq` |
| Event Code | `attendance.low-warning.runtime` |
| Channel Targets | `IN_APP` |
| Status | `PROCESSED` |
| Recipient Count | `1` |
| Recipient User ID | `user_law_runtime_student_own` |
| Dedupe Key | `notification-runtime-low-attendance-20260519-001` |

Created runtime notification:

| Field | Value |
|---|---|
| Notification ID | `cmpcwk9im000d2i6xbyh14qjq` |
| Notification Event ID | `cmpcwk9ic000b2i6xasby3jun` |
| Recipient User ID | `user_law_runtime_student_own` |
| Primary Channel | `IN_APP` |
| Initial Status | `READY` |
| Event Code | `attendance.low-warning.runtime` |
| Title | `Runtime attendance warning` |
| Body | `Runtime test notification for low attendance warning.` |

Event emission verification:

- [x] Department admin emitted an `IN_APP` notification event.
- [x] Event was created with department context from request/principal.
- [x] Event status became `PROCESSED`.
- [x] Recipient count was `1`.
- [x] In-app notification row was created.
- [x] Notification status was initially `READY`.
- [x] Payload JSON preserved `courseOfferingId`, `studentUserId`, and runtime source context.

### Student Notification Self-Read Runtime Test

Student own notification behavior:

- [x] Own student logged in successfully.
- [x] `GET /api/v1/notifications?eventCode=attendance.low-warning.runtime` returned the student's own notification only.
- [x] `GET /api/v1/notifications/:id` returned the own notification.
- [x] `PATCH /api/v1/notifications/:id/read` marked the notification as `READ`.
- [x] `readAt` was populated.
- [x] `PATCH /api/v1/notifications/:id/dismiss` marked the notification as `DISMISSED`.
- [x] `dismissedAt` was populated.

Notification lifecycle verification:

| Step | Result |
|---|---|
| Initial student list | `READY` |
| Direct read | `READY` |
| Mark read | `READ` with `readAt` |
| Dismiss | `DISMISSED` with `dismissedAt` |

### Student-to-Student Notification Isolation Runtime Test

Other student isolation behavior:

- [x] Other student logged in successfully.
- [x] Other student direct-read attempt against own student's notification was blocked.
- [x] Other student dismiss attempt against own student's notification was blocked.

Isolation result:

| Request | Result |
|---|---|
| `GET /api/v1/notifications/:id` as other student | `NotFoundException` |
| `PATCH /api/v1/notifications/:id/dismiss` as other student | `NotFoundException` |

Verdict:

- Student users can only access their own notifications.
- Direct ID access to another student's notification returns a safe not-found response.
- No notification data was leaked across student accounts.

### Admin Notification Read Runtime Test

Admin behavior:

- [x] Department admin listed notifications filtered by `recipientUserId`.
- [x] Department admin listed notifications filtered by `eventCode`.
- [x] Department admin directly read the notification by ID.
- [x] Returned notification stayed department-scoped to `dept_law_test`.

Admin verification result:

| Field | Value |
|---|---|
| Notification ID | `cmpcwk9im000d2i6xbyh14qjq` |
| Recipient User ID | `user_law_runtime_student_own` |
| Event Code | `attendance.low-warning.runtime` |
| Final Status | `DISMISSED` |

Verdict:

- Department admin can list/read notification records within own department.
- Admin recipient filtering works for own department records.

### Dedupe Key Runtime Test

Dedupe test:

- [x] Re-sent notification event with the same dedupe key:
  - `notification-runtime-low-attendance-20260519-001`
- [x] API returned the existing event instead of creating a duplicate.
- [x] Returned event ID matched the original event ID:
  - `cmpcwk9ic000b2i6xasby3jun`

Verdict:

- Dedupe key behavior passed.
- Duplicate event requests safely return existing event data.

### Email/Push Placeholder Delivery Runtime Test

Created runtime mixed-channel event:

| Field | Value |
|---|---|
| Notification Event ID | `cmpcwukvh00192i6xwlxxiils` |
| Department ID | `dept_law_test` |
| Triggered By User ID | `cmoubvzde00012i216rnx6eaq` |
| Event Code | `eligibility.warning.runtime` |
| Channel Targets | `IN_APP`, `EMAIL`, `PUSH` |
| Status | `PROCESSED` |
| Recipient Count | `1` |
| Dedupe Key | `notification-runtime-eligibility-warning-20260519-001` |
| Is Critical | `true` |

Created runtime mixed-channel notification:

| Field | Value |
|---|---|
| Notification ID | `cmpcwukvk001b2i6x4y199p0g` |
| Primary Channel | `IN_APP` |
| Status | `READY` |
| Recipient User ID | `user_law_runtime_student_own` |
| Event Code | `eligibility.warning.runtime` |
| Is Critical | `true` |

Delivery placeholder rows verified through Prisma query:

| Delivery ID | Channel | Status | Placeholder |
|---|---|---|---|
| `cmpcwukvm001d2i6x67c3qfqh` | `EMAIL` | `PENDING` | `true` |
| `cmpcwukvs001f2i6xslc1azkn` | `PUSH` | `PENDING` | `true` |

Delivery verification:

- [x] Mixed channel event created successfully.
- [x] In-app notification row was created with `READY` status.
- [x] EMAIL delivery placeholder row was created with `PENDING` status.
- [x] PUSH delivery placeholder row was created with `PENDING` status.
- [x] Placeholder metadata stated external delivery is intentionally out of scope.
- [x] No provider, provider message ID, sent timestamp, or delivered timestamp was set.
- [x] No real email sending occurred.
- [x] No real push sending occurred.

### Notification Template Runtime Test

Created notification template:

| Field | Value |
|---|---|
| Template ID | `228e79a9-0133-42ea-94ef-5adafa954432` |
| Department ID | `dept_law_test` |
| Code | `runtime_eligibility_warning_in_app` |
| Initial Name | `Runtime Eligibility Warning In-App` |
| Updated Name | `Runtime Eligibility Warning In-App Updated` |
| Event Code | `eligibility.warning.runtime` |
| Channel | `IN_APP` |
| Status | `ACTIVE` |
| Locale | `en` |
| Is Critical | `true` |

Template workflow verified:

- [x] Department admin created a notification template.
- [x] Department admin listed templates filtered by event code.
- [x] Created template appeared in the list response.
- [x] Department admin updated template name, title template, and body template.
- [x] Updated template response returned the changed fields.

Updated template values:

| Field | Value |
|---|---|
| Name | `Runtime Eligibility Warning In-App Updated` |
| Title Template | `Eligibility warning updated` |
| Body Template | `Your eligibility status requires admin or teacher attention.` |

Verdict:

- Notification template create/list/update foundation passed.
- Template rendering is still intentionally out of scope.

### Notification Preference Runtime Test

Preference list and critical lock behavior:

- [x] Student listed own notification preferences.
- [x] Initial preference list returned `[]`.
- [x] Student attempted to disable a critical-locked preference.
- [x] Critical-locked disable attempt was blocked with `BadRequestException`.
- [x] Error message: `Critical notification preferences cannot be disabled`.

Normal preference upsert:

| Field | Value |
|---|---|
| Preference ID | `5ff9acc2-f23a-4a49-9d4e-bb4d887cd82f` |
| Department ID | `dept_law_test` |
| User ID | `user_law_runtime_student_own` |
| Event Code | `discussion.reply.runtime` |
| Channel | `IN_APP` |
| Is Enabled | `false` |
| Is Critical Locked | `false` |

Preference workflow verified:

- [x] User can list own preferences.
- [x] User can upsert own non-critical preference.
- [x] Upserted preference appeared in own preference list.
- [x] Critical-locked preference cannot be disabled.

### Notification Runtime Verdict

- Notification routes mapped: Passed
- Admin event emission: Passed
- In-app notification creation: Passed
- Student own notification list/read: Passed
- Student mark notification read: Passed
- Student dismiss notification: Passed
- Student-to-student notification isolation: Passed
- Admin department-scoped notification read/list: Passed
- Dedupe key behavior: Passed
- EMAIL/PUSH placeholder delivery row creation: Passed
- No real email/push sending: Passed
- Template create/list/update: Passed
- Own preference list/upsert: Passed
- Critical-locked preference disable block: Passed
- API typecheck after runtime testing: Passed
- API build after runtime testing: Passed
- Git working tree before documentation update: Clean

Current limitations:

- Real email sending is not implemented.
- Real browser/PWA push sending is not implemented.
- Background queue/worker delivery is not implemented.
- Template rendering is not implemented.
- Notification frontend is not implemented.
- Runtime test passwords were reset through controlled local Prisma scripts for test continuity; passwords/hashes/tokens were not documented.


---

## Notice / Announcement Foundation Runtime Test

Date: 2026-05-21  
Runtime environment: Ubuntu Server VM  
API base URL: `http://localhost/api/v1`  
Nginx base URL: `http://localhost/api/v1`  
Department: `dept_law_test` / `LAW`

### Related Commits

| Commit | Message |
|---|---|
| `49285a2` | Add notice foundation schema |
| `22f3f56` | Add notice module API scaffold |
| `79dffaf` | Fix notice notification module dependency |
| `7c2f221` | Add notice policies to authorization mapping |

### Migration / Runtime Boot Verification

Notice migration applied successfully:

- [x] Prisma migration `20260521_add_notice_foundation` applied.
- [x] `notices` table created.
- [x] `NoticeAudienceType` enum created.
- [x] `NoticePriority` enum created.
- [x] `NoticeStatus` enum created.
- [x] Prisma Client regenerated after migration.
- [x] API typecheck passed after migration.
- [x] API build passed after migration.
- [x] PM2 `lexora-api` restarted successfully.
- [x] Direct health check passed at `http://localhost:4000/api/v1/health`.
- [x] Nginx health check passed at `http://localhost/api/v1/health`.

Runtime backup note:

- A local PostgreSQL backup was created before applying the notice migration.
- Backup folder is ignored by Git through `.gitignore`.
- Backup files were not committed.

### Route Mapping Verification

Notice routes mapped successfully after `NoticeModule` was added to `AppModule` and `NotificationModule` was imported into `NoticeModule`.

Verified mapped routes:

| Method | Route |
|---|---|
| `POST` | `/api/v1/notices` |
| `GET` | `/api/v1/notices` |
| `GET` | `/api/v1/notices/me` |
| `GET` | `/api/v1/notices/me/:id` |
| `GET` | `/api/v1/notices/:id` |
| `PATCH` | `/api/v1/notices/:id` |
| `POST` | `/api/v1/notices/:id/publish` |
| `POST` | `/api/v1/notices/:id/archive` |

Unauthenticated route checks:

- [x] Direct `GET /api/v1/notices` returned `401 Unauthorized`.
- [x] Nginx-proxied `GET /api/v1/notices` returned `401 Unauthorized`.
- [x] AuthGuard remained active.
- [x] No `404` route-missing error occurred.
- [x] No `500` runtime dependency error occurred after dependency fix.

### Authorization Mapping Verification

Initial authenticated admin create attempt failed with:

| Field | Value |
|---|---|
| Error Code | `ForbiddenException` |
| Message | `Access denied by policy` |

Root cause:

- Notice policies were added in the controller but were not yet included in static role policy mapping.

Fix applied:

| Role | Notice Policies Added |
|---|---|
| `department_admin` | `notice.*` |
| `teacher` | `notice.notice.read`, `notice.notice.manage` |
| `student` | `notice.notice.self-read` |

Post-fix verification:

- [x] API typecheck passed.
- [x] API build passed.
- [x] PM2 restart passed.
- [x] Direct health check passed.
- [x] Nginx health check passed.
- [x] Admin notice create passed after policy mapping fix.

### Runtime Test Users

| Role | User ID | Email | Department |
|---|---|---|---|
| Department Admin | `cmoubvzde00012i216rnx6eaq` | `runtime-test-student@cu.ac.bd` | `dept_law_test` |
| Student | `user_law_runtime_student_own` | `runtime-student-own@cu.ac.bd` | `dept_law_test` |

Security note:

- Runtime admin and student passwords were reset through controlled local Prisma scripts for test continuity.
- Passwords, password hashes, access tokens, and refresh tokens are intentionally not documented.
- Existing sessions for reset users were revoked during password reset.

### Admin Notice Workflow Runtime Test

Created notice:

| Field | Value |
|---|---|
| Notice ID | `cmpf8w3e300072ix3ev8hes2c` |
| Department ID | `dept_law_test` |
| Created By User ID | `cmoubvzde00012i216rnx6eaq` |
| Initial Title | `Runtime Notice Test` |
| Initial Body | `This is a runtime notice API test for Lexora LMS.` |
| Audience Type | `DEPARTMENT` |
| Initial Priority | `IMPORTANT` |
| Initial Status | `DRAFT` |
| Publish Notification | `false` |

Admin workflow verified:

- [x] Department admin login succeeded.
- [x] Department admin created draft notice.
- [x] Created notice returned `DRAFT` status.
- [x] Created notice was scoped to `dept_law_test`.
- [x] `createdByUserId` was set correctly.
- [x] Admin listed notices through `GET /api/v1/notices`.
- [x] Admin read notice through `GET /api/v1/notices/:id`.

Updated draft notice:

| Field | Value |
|---|---|
| Updated Title | `Runtime Notice Test Updated` |
| Updated Body | `This notice was updated during runtime testing.` |
| Updated Priority | `URGENT` |
| Updated By User ID | `cmoubvzde00012i216rnx6eaq` |
| Status After Update | `DRAFT` |

Draft update verification:

- [x] Admin updated draft notice.
- [x] `updatedByUserId` was set correctly.
- [x] Title/body/priority updated correctly.
- [x] Notice remained `DRAFT` after update.

### Publish Workflow Runtime Test

Published notice:

| Field | Value |
|---|---|
| Notice ID | `cmpf8w3e300072ix3ev8hes2c` |
| Status | `PUBLISHED` |
| Published By User ID | `cmoubvzde00012i216rnx6eaq` |
| Published At | `2026-05-21T08:45:58.535Z` |
| Notification Event ID | `null` |

Publish verification:

- [x] Admin published draft notice.
- [x] Status changed from `DRAFT` to `PUBLISHED`.
- [x] `publishedByUserId` was set correctly.
- [x] `publishedAt` was set.
- [x] `notificationEventId` remained `null` because `publishNotification=false`.
- [x] Admin could read the notice after publish.

Published notice update block:

- [x] Admin attempted to update published notice.
- [x] Update was blocked with `BadRequestException`.
- [x] Error message: `Only draft notices can be updated`.

### Student Visibility Runtime Test

Student workflow verified:

- [x] Runtime student login succeeded.
- [x] Student listed published notices through `GET /api/v1/notices/me`.
- [x] Published department notice appeared in student `/notices/me`.
- [x] Student read published notice through `GET /api/v1/notices/me/:id`.
- [x] Student broad `GET /api/v1/notices` was blocked with `ForbiddenException`.
- [x] Student cannot access admin/teacher broad notice endpoint.

Student visibility result:

| Endpoint | Result |
|---|---|
| `GET /api/v1/notices/me` | Published notice visible |
| `GET /api/v1/notices/me/:id` | Published notice readable |
| `GET /api/v1/notices` | Blocked by policy |

### Archive Workflow Runtime Test

Archived notice:

| Field | Value |
|---|---|
| Notice ID | `cmpf8w3e300072ix3ev8hes2c` |
| Status | `ARCHIVED` |
| Archived At | `2026-05-21T08:49:30.136Z` |

Archive verification:

- [x] Admin archived published notice.
- [x] Status changed from `PUBLISHED` to `ARCHIVED`.
- [x] `archivedAt` was set.
- [x] Archived notice was hidden from student `/notices/me`.
- [x] Student `/notices/me` returned `[]` after archive.

### Notice Runtime Verdict

- Notice schema foundation: Passed
- Notice migration apply: Passed
- Notice route mapping: Passed
- Notice module dependency resolution: Passed
- Authorization policy mapping: Passed
- Admin draft create/list/read/update: Passed
- Admin publish: Passed
- Published notice update block: Passed
- Student published notice self-list/read: Passed
- Student broad notice endpoint block: Passed
- Admin archive: Passed
- Archived notice hidden from student list: Passed
- API typecheck after runtime testing: Passed
- API build after runtime testing: Passed
- PM2/Nginx health after runtime testing: Passed

Current limitations:

- Notice frontend is not implemented.
- Notice attachment support is not implemented.
- Rich targeting beyond basic department/program/term/course-offering fields is not fully runtime-tested.
- Real email/push delivery remains out of scope and is covered by the Notification foundation limitations.

### Notice Publish Notification Integration Runtime Test

Additional notice created with notification emission enabled:

| Field | Value |
|---|---|
| Notice ID | `cmpf9aa9v000z2ix3gobubqeh` |
| Department ID | `dept_law_test` |
| Title | `Runtime Notice Notification Test` |
| Body | `This notice should emit an in-app notification when published.` |
| Audience Type | `DEPARTMENT` |
| Priority | `URGENT` |
| Publish Notification | `true` |
| Published Status | `PUBLISHED` |
| Notification Event ID | `cmpf9b0xe00132ix3bz9ytst3` |

Notification event verification:

| Field | Value |
|---|---|
| Event ID | `cmpf9b0xe00132ix3bz9ytst3` |
| Event Code | `notice.published` |
| Channel Targets | `{IN_APP}` |
| Event Status | `PROCESSED` |
| Recipient Count | `4` |
| Dedupe Key | `notice.published.cmpf9aa9v000z2ix3gobubqeh` |
| Payload Notice ID | `cmpf9aa9v000z2ix3gobubqeh` |
| Payload Priority | `URGENT` |
| Payload Audience Type | `DEPARTMENT` |

Generated in-app notification rows:

| Recipient User ID | Channel | Status | Critical | Action URL |
|---|---|---|---|---|
| `cmoubvzde00012i216rnx6eaq` | `IN_APP` | `READY` | `true` | `/notices/cmpf9aa9v000z2ix3gobubqeh` |
| `user_law_runtime_student_other` | `IN_APP` | `READY` | `true` | `/notices/cmpf9aa9v000z2ix3gobubqeh` |
| `user_law_runtime_student_own` | `IN_APP` | `READY` | `true` | `/notices/cmpf9aa9v000z2ix3gobubqeh` |
| `user_law_runtime_teacher` | `IN_APP` | `READY` | `true` | `/notices/cmpf9aa9v000z2ix3gobubqeh` |

Notification integration verification:

- [x] Notice with `publishNotification=true` was created as `DRAFT`.
- [x] Publishing the notice changed status to `PUBLISHED`.
- [x] Publishing created a `notification_events` row.
- [x] Notice stored the generated `notificationEventId`.
- [x] Event code was `notice.published`.
- [x] Channel target was `IN_APP`.
- [x] Event status became `PROCESSED`.
- [x] Recipient count was `4`.
- [x] Dedupe key included the notice ID.
- [x] Payload JSON included notice ID, priority, and audience type.
- [x] Four in-app notification rows were created.
- [x] All generated notification rows used primary channel `IN_APP`.
- [x] All generated notification rows had status `READY`.
- [x] All generated notification rows were marked critical because notice priority was `URGENT`.
- [x] All generated notification rows pointed to `/notices/cmpf9aa9v000z2ix3gobubqeh`.

Updated limitation note:

- Notification emission on notice publish with `publishNotification=true` is runtime-tested for `IN_APP`.
- Real email/push delivery remains out of scope.
- Background queue/worker delivery remains out of scope.


---

## Web Frontend Sign-In Foundation Runtime Test

Runtime test date: 2026-05-25

Runtime environment:

| Item | Value |
|---|---|
| Frontend app | `@lexora/web` |
| Frontend framework | Next.js |
| Runtime URL used | `http://192.168.197.129:3000/sign-in` |
| API proxy path | `/api/v1/*` |
| Backend API behind Nginx | `http://localhost/api/v1` |
| Backend direct app port | `127.0.0.1:4000` |
| Backend process | PM2 process `lexora-api` |

Related frontend commits:

| Commit | Message |
|---|---|
| `83e7ed3` | `Add web API base URL environment config` |
| `1bec765` | `Add web API client and API rewrite config` |
| `4cff777` | `Add functional web sign-in form` |

### Frontend Sign-In Foundation Summary

The Lexora LMS web frontend now has a working sign-in foundation.

Implemented and verified:

- [x] Web API base URL environment configuration added.
- [x] Web API client foundation added.
- [x] Next.js API rewrite/proxy foundation added for `/api/v1/*`.
- [x] `/sign-in` page implemented.
- [x] Functional sign-in form implemented.
- [x] Browser login through the web UI succeeded.
- [x] Sign-in success card displayed authenticated user information.
- [x] Runtime user information rendered after successful login:
  - Display name
  - Email
  - Department ID
  - Roles

Runtime sign-in verification:

| Check | Result |
|---|---|
| `/sign-in` route loads | Passed |
| Web form submits to API | Passed |
| Valid runtime credentials authenticate | Passed |
| Login response is consumed by frontend | Passed |
| Success card displays user data | Passed |
| Backend health during frontend test | Passed |
| Web typecheck | Passed |
| Web build | Passed |

Security notes:

- Raw access tokens and refresh tokens were not intentionally documented.
- Runtime credentials, password hashes, and token values must not be committed.
- Runtime test account credentials were used only for controlled local VM testing.

### Web Sign-In Foundation Verdict

- Frontend sign-in foundation: Passed
- API client/rewrite foundation: Passed
- Browser login through `/sign-in`: Passed
- Web build/typecheck after implementation: Passed


---

## Web Auth Session Foundation Runtime Test

Runtime test date: 2026-05-25

Related commits:

| Commit | Message |
|---|---|
| `e9d8a71` | `Add memory-only web auth session handling` |
| `cb4ef60` | `Support refresh token cookie in auth refresh` |
| `5fc458b` | `Allow host-only refresh cookie domain` |

Runtime context:

| Item | Value |
|---|---|
| Frontend URL | `http://192.168.197.129:3000/sign-in` |
| Runtime department code | `LAW` |
| Runtime department ID | `dept_law_test` |
| Runtime login user | `runtime-test-student@cu.ac.bd` |
| Runtime displayed name | `Runtime Test Student` |
| Runtime role displayed | `department_admin` |
| Refresh cookie name | `lexora_rt` |
| Refresh cookie path | `/api/v1/auth` |
| Refresh cookie mode | httpOnly, host-only in VM/IP dev |
| Access token storage strategy | Memory-only frontend state |

### Frontend Memory-Only Auth Session Implementation

Implemented files:

| File | Purpose |
|---|---|
| `apps/web/src/lib/api-client.ts` | Added `refreshSession()` and `logout()` API helpers |
| `apps/web/src/components/providers/auth-provider.tsx` | Added memory-only `AuthProvider` and `useAuth()` |
| `apps/web/src/components/providers/app-providers.tsx` | Wrapped application providers with `AuthProvider` |
| `apps/web/src/components/auth/sign-in-form.tsx` | Updated sign-in form to use shared auth state and logout |

Verified frontend security behavior:

- [x] Access token stored only in React memory state.
- [x] Refresh token is not stored in frontend state.
- [x] Refresh token is not stored in `localStorage`.
- [x] Refresh token is not stored in `sessionStorage`.
- [x] `localStorage` and `sessionStorage` token persistence were not added.
- [x] Login success state is read from shared auth session.
- [x] Logout clears frontend memory state.
- [x] App bootstrap calls `/auth/refresh` to restore session when a valid refresh cookie exists.
- [x] No role redirect or protected dashboard was implemented in this task.
- [x] No frontend dashboard/protected route scope was added.

Frontend verification:

| Command / Check | Result |
|---|---|
| `pnpm --filter @lexora/web typecheck` | Passed |
| `pnpm --filter @lexora/web build` | Passed |
| Browser login | Passed |
| Success card from shared auth state | Passed |
| Logout button clears UI state | Passed |
| Reload after logout shows anonymous sign-in form | Passed |

### Backend Cookie-Based Refresh Support

Initial reload-while-logged-in test revealed that frontend bootstrap was calling `/auth/refresh`, but the backend returned:

| Field | Value |
|---|---|
| HTTP Status | `400 Bad Request` before fix |
| Error Code | `BadRequestException` |
| Error Message | `Refresh token is required` |
| Refresh Payload | `{}` |

Root cause:

- Frontend was intentionally sending an empty refresh payload because refresh token must remain in the httpOnly cookie.
- Backend `/auth/refresh` still expected `refreshToken` in the request body.
- This was incompatible with the memory-only frontend auth strategy.

Backend fix implemented in commit `cb4ef60`:

- `/auth/refresh` now reads refresh token from the configured `lexora_rt` cookie.
- Body `refreshToken` remains supported as fallback.
- Cookie token is preferred when available.
- Missing refresh token now returns `401 UnauthorizedException`.
- Successful refresh keeps existing refresh validation and rotation behavior.
- Successful refresh sets the rotated refresh cookie again.
- Logout was also updated to read cookies from `@Req()` explicitly while preserving body-first behavior.

Backend verification after cookie refresh fix:

| Command / Check | Result |
|---|---|
| Prisma client regenerate after stale client issue | Passed |
| `pnpm --filter @lexora/api typecheck` | Passed |
| `pnpm --filter @lexora/api build` | Passed |
| Server pull/build | Passed |
| PM2 restart | Passed |
| Direct API health | Passed |
| Nginx API health | Passed |

Related runtime note:

- API typecheck initially failed because Prisma Client was stale and did not expose `PrismaService.notice`.
- `Notice` model existed in `schema.prisma`.
- Running Prisma generate fixed the typecheck issue.
- No Notice source-code change was required for that typecheck issue.

### Refresh Cookie Domain Runtime Issue

After backend cookie refresh support, browser reload still failed.

Observed behavior:

| Check | Result |
|---|---|
| Login succeeded | Passed |
| Login response included `Set-Cookie` | Passed |
| `/auth/refresh` request happened on reload | Passed |
| `/auth/refresh` status | `401 Unauthorized` |
| Error message | `Refresh token is required` |
| Refresh request cookie | Missing |
| Application Cookies | `lexora_rt` not stored |

Root cause:

- Backend was sending `Set-Cookie` with `Domain=localhost`.
- Browser was accessing frontend through `192.168.197.129:3000`.
- A cookie with `Domain=localhost` is not valid for the `192.168.197.129` browser origin.
- Therefore the browser did not persist the refresh cookie for the VM IP origin.

Environment/config finding:

- Root `.env` was changed first:
  - `REFRESH_TOKEN_COOKIE_DOMAIN=`
- Raw `Set-Cookie` still showed `Domain=localhost`.
- Further inspection found another runtime env file:
  - `apps/api/.env`
- `apps/api/.env` still had:
  - `REFRESH_TOKEN_COOKIE_DOMAIN=localhost`
- After setting `apps/api/.env` to:
  - `REFRESH_TOKEN_COOKIE_DOMAIN=`
  and restarting PM2 with `--update-env`, raw `Set-Cookie` no longer included `Domain=localhost`.

Backend config fix implemented in commit `5fc458b`:

- `REFRESH_TOKEN_COOKIE_DOMAIN` is now allowed to be empty/optional in env schema.
- Empty cookie domain is normalized to `undefined`.
- Controller reads optional cookie domain via config.
- If no real domain is configured, `Set-Cookie` omits the `Domain` attribute.
- Explicit production cookie domains are still supported.
- `httpOnly`, `sameSite`, `secure`, `path`, expiry, and refresh token validation were not weakened.

Verified fixed raw cookie shape:

| Attribute | Result |
|---|---|
| Cookie name | `lexora_rt` |
| Domain attribute | Omitted |
| Path | `/api/v1/auth` |
| HttpOnly | Enabled |
| SameSite | `Lax` |
| Secure in local VM | `false` |
| Storage behavior | Host-only cookie under `192.168.197.129` |

### Final Browser Runtime Verification

Final verified flow:

- [x] Browser opened `http://192.168.197.129:3000/sign-in`.
- [x] User logged in successfully.
- [x] Success card displayed runtime user information.
- [x] Browser Application Cookies stored `lexora_rt` under `192.168.197.129`.
- [x] Cookie was httpOnly.
- [x] Cookie path was `/api/v1/auth`.
- [x] Cookie domain was host-only / VM IP, not `localhost`.
- [x] Page reload triggered `/api/v1/auth/refresh`.
- [x] Refresh request included `lexora_rt` request cookie.
- [x] Refresh response returned successfully.
- [x] Refresh response rotated/set `lexora_rt`.
- [x] Signed-in success card was restored after reload.
- [x] Logout cleared frontend session state.
- [x] Reload after logout returned to anonymous sign-in form.

Final auth session flow verdict:

| Flow | Result |
|---|---|
| Login | Passed |
| Access token memory state | Passed |
| Refresh cookie storage | Passed |
| Reload bootstrap through `/auth/refresh` | Passed |
| Refresh cookie sent on reload | Passed |
| Refresh cookie rotation/reset | Passed |
| Signed-in card restored after reload | Passed |
| Logout | Passed |
| Reload after logout remains anonymous | Passed |

### Web Auth Session Runtime Verdict

- Minimal frontend memory-only auth session handling: Passed
- Backend cookie-based refresh support: Passed
- Host-only cookie domain support for VM/IP development: Passed
- Full login → reload refresh bootstrap → logout flow: Passed
- Frontend typecheck/build: Passed
- API typecheck/build: Passed
- Local PC repository status after commits: Clean
- Ubuntu server repository status after deployment: Clean

### Security Notes From This Runtime Test

- During manual terminal/browser debugging, a runtime test password and raw refresh token were exposed in chat/terminal output.
- These values must not be copied into committed documentation.
- Raw access tokens, raw refresh tokens, raw cookie values, passwords, password hashes, database URLs, and transcript verification tokens must not be committed.
- Recommended cleanup:
  - Reset the affected runtime test account password.
  - Revoke existing sessions for the affected runtime account.
- This was a controlled local VM/runtime test account, not production.
- Production or cloud credentials must be rotated immediately if ever exposed.

### Runtime Environment Notes

- Next.js dev server showed a development warning about cross-origin requests from `192.168.197.129` to `/_next/*`.
- This warning did not block runtime testing.
- It may require `allowedDevOrigins` configuration in a future Next.js major version.
- Nginx `502 Bad Gateway` appeared immediately after PM2 restarts when health was checked too quickly.
- Retesting after a short wait showed both direct and Nginx health endpoints returned OK.
- This was treated as restart timing, not a persistent Nginx failure.

### Current Auth Session Limitation

- Login response still includes `refreshToken` in the JSON response shape.
- The frontend does not persist it and only uses the httpOnly cookie strategy.
- Recommended future hardening:
  - Consider removing raw `refreshToken` from browser-facing login/refresh JSON responses once all clients support cookie-based refresh.
  - Keep refresh token rotation and session validation behavior.
  - Preserve httpOnly refresh cookie flow.


## Web Auth Runtime Issues / Findings Addendum

| Date | Module | Issue | Status | Fix Commit / Note |
|---|---|---|---|---|
| 2026-05-25 | Web Auth | Frontend login worked but session was not shared globally or restored after page reload | Fixed | `e9d8a71` |
| 2026-05-25 | Auth Refresh | `/auth/refresh` expected body `refreshToken`, but memory-only frontend refresh sends `{}` and relies on httpOnly cookie | Fixed | `cb4ef60` |
| 2026-05-25 | Cookie Domain | Refresh cookie was set with `Domain=localhost`, so browser at `192.168.197.129:3000` did not store/send it | Fixed | `5fc458b` |
| 2026-05-25 | Runtime Env | Root `.env` was blanked first, but actual API runtime also used `apps/api/.env`, which still had `REFRESH_TOKEN_COOKIE_DOMAIN=localhost` | Fixed / Documented | Set `apps/api/.env` to `REFRESH_TOKEN_COOKIE_DOMAIN=` and restarted PM2 with `--update-env` |
| 2026-05-25 | Runtime Security | Runtime test password and refresh token were exposed during manual debugging | Cleanup Recommended | Reset runtime test account password and revoke old sessions |
| 2026-05-25 | Dev Server | Next.js dev warning about future `allowedDevOrigins` requirement appeared when accessing dev server by VM IP | Documented | Not blocking |
| 2026-05-25 | PM2/Nginx Timing | Nginx briefly returned `502` immediately after API PM2 restart | Documented | Direct/Nginx health passed after short wait |


## Updated Next Test Steps After Web Auth Session Foundation

1. Reset the affected runtime test account password and revoke old sessions because a runtime password/token appeared during debugging.
2. Keep `REFRESH_TOKEN_COOKIE_DOMAIN=` for local VM/IP development.
3. Use a real domain and HTTPS before production; set cookie `Secure=true` in production.
4. Consider removing raw `refreshToken` from browser-facing JSON responses after cookie-based refresh is fully adopted.
5. Implement minimal auth-aware route foundation next:
   - unauthenticated protected route access should redirect to `/sign-in`
   - authenticated users should route based on role
   - no dashboard feature scope should be added until route guards are stable
6. Implement protected placeholder routes for:
   - admin
   - teacher
   - student
7. Later implement role-specific dashboards after auth-aware routing is verified.
8. Keep token storage memory-only on frontend.
9. Do not introduce `localStorage` or `sessionStorage` token persistence.
10. Continue documenting frontend runtime tests in this checklist after each completed scope.

## Web Auth-Aware Route Foundation Runtime Test

Runtime test date: 2026-05-26

### Scope

Implemented minimal frontend auth-aware route protection for dashboard placeholder routes:

- `/admin`
- `/teacher`
- `/student`

This scope intentionally did **not** implement full dashboards or business feature pages.

### Code Commits Tested

| Commit | Message |
|---|---|
| `4a03fcb` | `Add auth-aware web route guards` |
| `b0f069d` | `Fix dashboard guard shell flash` |

### Files Changed

| File | Purpose |
|---|---|
| `apps/web/src/components/auth/protected-route.tsx` | Added client-side route guard for dashboard workspaces |
| `apps/web/src/app/(dashboard)/layout.tsx` | Wrapped dashboard shell with `ProtectedRoute` |
| `apps/web/src/components/auth/sign-in-form.tsx` | Added role-aware redirect after successful sign-in |
| `apps/web/src/components/providers/auth-provider.tsx` | Updated `signIn()` to return the in-memory authenticated session |

### Verified Behavior

- [x] Unauthenticated access to `/admin` redirects to `/sign-in`.
- [x] Dashboard shell no longer flashes before redirect.
- [x] Login redirects user to role-appropriate workspace.
- [x] `department_admin` routes to `/admin`.
- [x] `teacher` routes to `/teacher`.
- [x] `student` routes to `/student`.
- [x] Authenticated user accessing the wrong role workspace is redirected to own workspace.
- [x] Existing placeholder pages remain minimal.
- [x] No full dashboard/business module was added.

### Security Verification

- [x] No `localStorage` token persistence introduced.
- [x] No `sessionStorage` token persistence introduced.
- [x] Refresh token remains httpOnly cookie-based.
- [x] Access token remains memory-only in React auth state.
- [x] `credentials: "include"` auth request behavior preserved.
- [x] No backend auth, guard, policy, request-context, or department-isolation code changed.
- [x] No Next.js middleware was added.
- [x] Backend remains source of truth for authorization.

### Validation

Local PC validation:

- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact restored before commit.
- [x] Local PC repository clean after commit and push.

Ubuntu server validation:

- [x] Server synced to latest `origin/main`.
- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact restored after validation.
- [x] Server repository clean after validation.

### Browser Runtime Verification

Runtime browser URL:

- `http://192.168.197.129:3000`

Observed route behavior:

- Opening `/admin` while unauthenticated redirected to `/sign-in`.
- Initial implementation briefly showed the dashboard shell before redirect.
- Follow-up fix moved `ProtectedRoute` outside `DashboardShell`.
- After fix, `/admin` no longer showed the "Lexora Control Surface" shell before redirect.
- Login routed the authenticated user back to the correct role workspace.
- `/admin`, `/teacher`, and `/student` routes compiled and loaded during dev-server runtime testing.

### Runtime Environment Notes

- Next.js dev server was run with `pnpm --filter @lexora/web dev --hostname 0.0.0.0`.
- Next.js showed the known development warning about cross-origin requests from `192.168.197.129` to `/_next/*`.
- This warning did not block route-guard runtime testing.
- It may require `allowedDevOrigins` configuration in a future Next.js major version.

### Web Route Guard Runtime Verdict

- Minimal auth-aware frontend route guard foundation: Passed
- Role-aware sign-in redirect: Passed
- Dashboard shell flash fix: Passed
- Token storage security posture: Preserved
- Frontend typecheck/build: Passed
- Local PC repository status after commits: Clean
- Ubuntu server repository status after sync/validation: Clean

## Updated Next Test Steps After Web Route Guard Foundation

1. Keep auth route guards minimal until real dashboards are implemented.
2. Do not add dashboard business features until each role workspace has a clear module plan.
3. Next safe frontend step can be one of:
   - minimal role-aware dashboard landing cards
   - student enrolled-course surface using existing `/enrollments/me`
   - admin/teacher/student navigation cleanup
4. Continue preserving:
   - memory-only access token
   - httpOnly refresh cookie
   - no `localStorage` or `sessionStorage` token persistence
   - backend as the source of truth for authorization

## Web Visual Foundation Refresh and Homepage Workspace Gate Runtime Test

Runtime test date: 2026-05-26

### Scope

Implemented a bright, gentle, minimal academic visual refresh for the existing Lexora LMS frontend foundation.

This scope intentionally remained a visual/UX foundation task. It did not add real LMS dashboard features, enrollment data, course data, result data, attendance data, or backend changes.

### Code Commits Tested

| Commit | Message |
|---|---|
| `065fbb4` | `Refresh web visual foundation` |
| `84a8e6c` | `Gate homepage workspace actions` |

### Visual Design Direction

The frontend was updated away from the previous dark control-surface/security-console look.

New intended style:

- bright
- gentle
- minimal
- academic
- readable
- calm
- trustworthy
- university-portal oriented

The updated foundation uses a light warm academic palette with soft backgrounds, slate text, subtle borders, teal accents, minimal shadows, and cleaner placeholder copy.

### Files Changed for Visual Foundation

| File | Purpose |
|---|---|
| `apps/web/src/app/page.tsx` | Updated public landing page copy and visual style |
| `apps/web/src/app/globals.css` | Switched global base from dark to light visual foundation |
| `apps/web/src/app/(auth)/layout.tsx` | Restyled auth shell as bright centered card |
| `apps/web/src/app/(auth)/forgot-password/page.tsx` | Restyled recovery placeholder copy and colors |
| `apps/web/src/app/(dashboard)/layout.tsx` | Renamed shell wording to `Lexora Workspace` |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | Restyled admin placeholder copy |
| `apps/web/src/app/(dashboard)/teacher/page.tsx` | Restyled teacher placeholder copy |
| `apps/web/src/app/(dashboard)/student/page.tsx` | Restyled student placeholder copy |
| `apps/web/src/app/verify/[code]/page.tsx` | Restyled public verification placeholder |
| `apps/web/src/components/auth/protected-route.tsx` | Restyled route-guard bootstrapping state |
| `apps/web/src/components/auth/sign-in-form.tsx` | Restyled sign-in form, inputs, error, and signed-in card |
| `apps/web/src/components/shell/dashboard-shell.tsx` | Restyled dashboard navigation links |
| `apps/web/src/lib/navigation.ts` | Updated navigation labels |
| `packages/ui/src/components/app-shell.tsx` | Updated shared shell from dark to light foundation |
| `packages/ui/src/components/section-card.tsx` | Updated shared card component from dark to light foundation |

### Homepage Workspace Action Gate

A follow-up UX/auth navigation fix was added after runtime testing showed that the public homepage could display route cards linking directly to protected workspaces.

New component:

| File | Purpose |
|---|---|
| `apps/web/src/components/home/home-route-action.tsx` | Adds auth-aware homepage actions for protected workspace cards |

Updated behavior:

- Homepage `/` remains public.
- Public links such as `/sign-in`, `/forgot-password`, and `/verify/sample-code` remain directly accessible.
- Admin, Teacher, and Student homepage cards are now auth-aware.
- Anonymous users clicking protected workspace cards are sent to `/sign-in`.
- Bootstrapping state disables the protected workspace action and shows `Checking session...`.
- Authenticated users can navigate to workspace routes.
- Existing `ProtectedRoute` remains the final frontend guard for wrong-role redirects.

### Verified Browser Behavior

Runtime browser URL:

- `http://192.168.197.129:3000`

Incognito/private-window verification:

- [x] Homepage `/` loads publicly.
- [x] Anonymous user clicking Admin workspace from homepage goes to `/sign-in`.
- [x] Anonymous user clicking Teacher workspace from homepage goes to `/sign-in`.
- [x] Anonymous user clicking Student workspace from homepage goes to `/sign-in`.
- [x] Direct anonymous visit to `/admin` redirects to `/sign-in`.
- [x] Admin content is not usable before sign-in.
- [x] Public verification placeholder remains accessible.
- [x] Forgot password placeholder remains accessible.
- [x] Sign-in page remains accessible and bright/readable.

Runtime observation:

- Next.js dev server logs may show `GET /admin 200`, `GET /teacher 200`, or `GET /student 200`.
- This is expected for Next.js App Router serving route assets/pages during development.
- The browser-side `ProtectedRoute` and homepage action behavior were verified in incognito state.
- The observed `GET 200` log entries were not treated as route-guard failure.

### Validation

Local PC validation:

- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `git diff --check` had no blocking whitespace errors.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact was restored before commit.
- [x] Local PC repository clean after commit and push.

Ubuntu server validation:

- [x] Server synced to latest `origin/main`.
- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact restored after validation.
- [x] Server repository clean after validation.

### Security and Session Behavior

Preserved:

- [x] Access token remains memory-only in React auth state.
- [x] Refresh token remains httpOnly cookie-based.
- [x] No `localStorage` token persistence introduced.
- [x] No `sessionStorage` token persistence introduced.
- [x] No backend auth code changed.
- [x] No backend policy, guard, request-context, or department-isolation code changed.
- [x] `ProtectedRoute` remains in place for dashboard routes.
- [x] Backend remains the source of truth for authorization.
- [x] No real dashboard business features were added.

### Runtime Environment Notes

- Next.js dev server was run with `pnpm --filter @lexora/web dev --hostname 0.0.0.0`.
- Next.js showed the known development warning about cross-origin requests from `192.168.197.129` to `/_next/*`.
- This warning did not block visual foundation or homepage gate runtime testing.
- It may require `allowedDevOrigins` configuration in a future Next.js major version.

### Web Visual Refresh Runtime Verdict

- Bright academic visual foundation: Passed
- Sign-in visual refresh: Passed
- Dashboard shell visual refresh: Passed
- Placeholder page visual refresh: Passed
- Shared AppShell and SectionCard light foundation: Passed
- Homepage protected workspace action gate: Passed
- Existing auth-aware route guard behavior: Preserved
- Token storage security posture: Preserved
- Frontend typecheck/build: Passed
- Local PC and Ubuntu server repositories: Clean after sync

## Updated Next Test Steps After Web Visual Refresh

1. Document the visual refresh and homepage workspace gate as complete.
2. Keep homepage public but keep protected workspace actions gated.
3. Do not add business widgets/metrics until role-specific dashboard scope is defined.
4. Next safe frontend step can be:
   - student enrolled-course surface using existing `/enrollments/me`
   - role-aware dashboard landing cards without real metrics
   - navigation active-state cleanup
5. Continue preserving:
   - memory-only access token
   - httpOnly refresh cookie
   - no `localStorage` or `sessionStorage` token persistence
   - backend as the source of truth for authorization


---

## Runtime Law Test Account Reset and Role-Aware Frontend Sidebar Runtime Test

Runtime test date: 2026-05-26

### Scope

This runtime update created a safer, repeatable testing foundation for Lexora LMS frontend/backend development.

The scope included:

- Department of Law runtime department code alignment to `0421`
- canonical runtime test accounts for admin, teacher, and student testing
- safe reset script for local/runtime test accounts
- role-aware dashboard sidebar cleanup
- sign-in default department code update from `LAW` to `0421`
- frontend/browser verification using the canonical accounts

This scope intentionally did **not** add real LMS dashboard business features.

### Related Commits

| Commit | Message |
|---|---|
| `03c481c` | `Make dashboard sidebar role aware` |
| `ad144a3` | `Add runtime Law test account reset script` |
| `61592c6` | `Set Law sign-in department code default` |

### Department Code Decision

The Department of Law runtime department now uses the academic/curriculum department code:

| Field | Value |
|---|---|
| Department ID | `dept_law_test` |
| Department Code | `0421` |
| Department Slug | `law` |
| Department Name | `Department of Law` |

Reason:

- The uploaded LL.B. syllabus uses Law course codes beginning with `0421`, such as `0421-1101`, `0421-1201`, and related semester course codes.
- `0421` is now treated as the canonical Department of Law runtime department code.
- The existing department ID `dept_law_test` was preserved to avoid breaking linked runtime records.

Important compatibility note:

- Older sections of this checklist may still mention Department Code `LAW`.
- Current runtime test login and frontend sign-in now use Department Code `0421`.
- The preserved department ID remains `dept_law_test`.

### Runtime Account Reset Script

Runtime-only script added:

| File | Purpose |
|---|---|
| `apps/api/prisma/reset-runtime-law-accounts.ts` | Safe local/runtime reset and seed workflow for canonical Law test accounts |

Package script added:

    pnpm --filter @lexora/api runtime:reset-law-accounts

Safety behavior verified by code review/build/runtime execution:

- [x] Script refuses to run when `NODE_ENV=production`.
- [x] Script ensures `dept_law_test` exists.
- [x] Script safely sets Department of Law code to `0421`.
- [x] Script preserves department ID `dept_law_test`.
- [x] Script refuses to continue if another department already owns code `0421` or slug `law`.
- [x] Script upserts required roles:
  - `department_admin`
  - `teacher`
  - `student`
- [x] Script upserts canonical runtime users.
- [x] Script hashes passwords using the existing backend bcryptjs-based hashing approach.
- [x] Script marks canonical runtime users as `ACTIVE`.
- [x] Script assigns exactly the intended active role to each canonical user.
- [x] Script revokes active sessions for canonical users before fresh login.
- [x] Script suspends clearly runtime-only legacy test users.
- [x] Script revokes active sessions for legacy runtime users.
- [x] Script does not hard-delete users.
- [x] Script does not delete linked academic/runtime records.

Sensitive data rule:

- Raw passwords are intentionally not documented in this checklist.
- Password hashes are intentionally not documented.
- Raw access tokens, refresh tokens, cookie values, and database credentials must not be documented or committed.

### Runtime Script Execution Result

Command executed on Ubuntu server:

    pnpm --filter @lexora/api runtime:reset-law-accounts

Runtime result:

| Field | Value |
|---|---|
| Department ID | `dept_law_test` |
| Department Code | `0421` |
| Department Slug | `law` |
| Department Name | `Department of Law` |
| Canonical Users Upserted | `3` |
| Canonical Sessions Revoked | `0` |
| Legacy Runtime Users Deactivated | `5` |
| Legacy Runtime Sessions Revoked | `28` |

Runtime verdict:

- [x] Runtime Law account reset script executed successfully.
- [x] Canonical test users were created/updated.
- [x] Legacy runtime users were safely suspended.
- [x] Legacy runtime sessions were revoked.
- [x] No hard-delete was performed.

### Canonical Runtime Test Accounts

These accounts are intended for controlled local/runtime testing.

| Role | Email | Expected Role |
|---|---|---|
| Department Admin | `admin.law@cu.ac.bd` | `department_admin` |
| Teacher | `teacher.law@cu.ac.bd` | `teacher` |
| Student | `student.law@cu.ac.bd` | `student` |

Security note:

- Passwords for these accounts must not be documented here.
- These are local/runtime testing accounts only.
- They must not be treated as production onboarding accounts.

### Canonical Account Login Verification

Login verification was performed through the backend API using:

| Field | Value |
|---|---|
| API Endpoint | `POST /api/v1/auth/login` |
| Department Code | `0421` |
| API Base | `http://localhost/api/v1` |
| Token Logging | Raw tokens were not printed or documented |

Verified login results:

| Email | HTTP Status | Returned Role | Department ID | Display Name |
|---|---:|---|---|---|
| `admin.law@cu.ac.bd` | `201` | `department_admin` | `dept_law_test` | `Law Test Admin` |
| `teacher.law@cu.ac.bd` | `201` | `teacher` | `dept_law_test` | `Law Test Teacher` |
| `student.law@cu.ac.bd` | `201` | `student` | `dept_law_test` | `Law Test Student` |

Two-factor status during runtime verification:

| Account Type | 2FA Enabled | 2FA Required | Available Methods |
|---|---|---|---|
| Admin / Teacher / Student runtime accounts | `false` | `false` | `[]` |

Login verification verdict:

- [x] Canonical admin login passed.
- [x] Canonical teacher login passed.
- [x] Canonical student login passed.
- [x] Returned roles matched expected role assignments.
- [x] Department ID remained `dept_law_test`.
- [x] Department code `0421` works for login.

### Role-Aware Dashboard Sidebar Update

Frontend dashboard sidebar was updated to use authenticated session roles.

Changed behavior:

- [x] Dashboard sidebar now filters workspace links by `session.user.roles`.
- [x] Department admin sees admin workspace navigation.
- [x] Teacher sees teacher workspace navigation.
- [x] Student sees student workspace navigation.
- [x] Active route highlighting was added.
- [x] Signed-in user panel was added to the sidebar.
- [x] Sign out button was added to the dashboard sidebar.
- [x] `/sign-in` link was removed from the authenticated dashboard sidebar.
- [x] `/verify/sample-code` link was removed from the authenticated dashboard sidebar.

Files changed:

| File | Purpose |
|---|---|
| `apps/web/src/components/shell/dashboard-shell.tsx` | Role-aware dashboard sidebar, active route styling, signed-in user panel, sign out action |
| `apps/web/src/lib/navigation.ts` | Dashboard navigation metadata with role and description |

Security posture preserved:

- [x] `ProtectedRoute` remained in place.
- [x] Backend authorization remains the source of truth.
- [x] No backend auth/guard/policy/request-context code was changed.
- [x] No `localStorage` token persistence was introduced.
- [x] No `sessionStorage` token persistence was introduced.
- [x] Access token remains memory-only.
- [x] Refresh token remains httpOnly cookie-based.

### Sign-In Department Code Default Update

The sign-in form default department code was updated:

| Field | Previous | Current |
|---|---|---|
| Default Department Code | `LAW` | `0421` |

Changed file:

| File | Purpose |
|---|---|
| `apps/web/src/components/auth/sign-in-form.tsx` | Default department code changed to `0421` |

Reason:

- Backend canonical runtime department code is now `0421`.
- Frontend sign-in default must match the current Department of Law runtime department code.
- Browser users can sign in without manually replacing the old `LAW` value.

### Local PC Validation

Local PC validation passed for the related frontend/backend changes:

| Validation | Result |
|---|---|
| Web typecheck after role-aware sidebar | Passed |
| Web build after role-aware sidebar | Passed |
| API typecheck after reset script | Passed |
| API build after reset script | Passed |
| Web typecheck after sign-in default update | Passed |
| Web build after sign-in default update | Passed |
| Local working tree after commits | Clean |

Build artifact handling:

- `apps/web/tsconfig.tsbuildinfo` changed after web builds.
- It was restored before commits.
- It was not committed.

### Ubuntu Server Validation

Ubuntu server validation passed after pulling latest `origin/main`.

| Validation | Result |
|---|---|
| Server fast-forward to `03c481c` | Passed |
| Web typecheck after role-aware sidebar | Passed |
| Web build after role-aware sidebar | Passed |
| Server fast-forward to `ad144a3` | Passed |
| API typecheck after reset script | Passed |
| API build after reset script | Passed |
| Runtime reset script execution | Passed |
| Canonical account backend login verification | Passed |
| Server fast-forward to `61592c6` | Passed |
| Web typecheck after sign-in default update | Passed |
| Web build after sign-in default update | Passed |
| Server working tree restored/clean after build artifacts | Passed |

### Browser Runtime Verification

Runtime browser URL:

- `http://192.168.197.129:3000/sign-in`

Verified browser behavior:

- [x] Sign-in page loads.
- [x] Department code defaults to `0421`.
- [x] Admin canonical account can sign in.
- [x] Teacher canonical account can sign in.
- [x] Student canonical account can sign in.
- [x] Admin routes to `/admin`.
- [x] Teacher routes to `/teacher`.
- [x] Student routes to `/student`.
- [x] Role-aware sidebar shows only the authenticated user's workspace link.
- [x] Sidebar no longer shows `Sign in`.
- [x] Sidebar no longer shows `Verification`.
- [x] Signed-in user panel appears.
- [x] Sign out button appears.
- [x] Protected dashboard route behavior remains correct.

Runtime browser verdict:

- [x] Canonical accounts work through frontend sign-in.
- [x] Department code `0421` default works.
- [x] Role-aware dashboard sidebar works.
- [x] Existing protected route guard behavior is preserved.

### Current Runtime Status After This Update

- Canonical runtime test accounts are now available for repeatable frontend/backend testing.
- Older clearly-runtime users have been suspended instead of deleted.
- Department of Law runtime code is now `0421`.
- Dashboard sidebar is now cleaner and role-aware.
- Frontend sign-in default aligns with the new department code.
- Existing backend authorization remains unchanged and authoritative.

### Current Limitations / Follow-Up

- The three canonical accounts are for local/runtime testing only.
- Do not store their raw passwords in committed documentation.
- Role-specific dashboards are still placeholder-level.
- Real admin/teacher/student business feature pages are not implemented yet.
- Student enrolled-course UI using `/enrollments/me` remains a safe future frontend step.
- Admin academic management UI remains pending.
- Teacher assigned-course UI was later implemented and runtime verified in the Teacher Assigned Courses Frontend Runtime Test section.
- Notice/notification frontend remains pending.
- Secure file upload frontend remains pending.

### Runtime Verdict

- Runtime Law account reset workflow: Passed
- Canonical Department of Law test accounts: Passed
- Department code `0421` login alignment: Passed
- Role-aware dashboard sidebar: Passed
- Sign-in default department code update: Passed
- Frontend typecheck/build: Passed
- API typecheck/build: Passed
- Server/runtime verification: Passed
- Token/password documentation safety: Preserved

## Updated Next Test Steps After Runtime Account and Sidebar Foundation

1. Use the canonical accounts for future frontend/backend runtime testing.
2. Keep Department of Law runtime code as `0421`.
3. Do not hard-delete old runtime users because linked runtime evidence may depend on them.
4. Continue avoiding raw passwords, password hashes, tokens, cookies, and database credentials in documentation.
5. Next safe frontend step can be one of:
   - student enrolled-course surface using existing `/enrollments/me`
   - role-aware dashboard landing cards without real metrics
   - admin academic management UI planning
   - teacher assigned-course UI planning
6. Continue preserving:
   - memory-only access token
   - httpOnly refresh cookie
   - no `localStorage` or `sessionStorage` token persistence
   - backend as the source of truth for authorization

## Admin Programs Panel Frontend Runtime Verification

Runtime test date: 2026-05-26

Tested commit:

| Field | Value |
|---|---|
| Commit | `f4cd8ef` |
| Message | `Connect admin programs panel to API` |

### Implementation Summary

The Admin dashboard was connected to the backend Programs API.

Frontend changes:

| File | Purpose |
|---|---|
| `apps/web/src/lib/api-client.ts` | Added authenticated GET helper and typed Programs API function |
| `apps/web/src/components/admin/admin-programs-panel.tsx` | Added React Query powered Admin Programs panel |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | Mounted Admin Programs panel in the Admin dashboard |

Implemented behavior:

- [x] Added reusable authenticated frontend GET helper.
- [x] Authenticated helper sends `Authorization: Bearer <accessToken>`.
- [x] Authenticated helper sends `x-department-id` from the authenticated user's department ID.
- [x] Added typed Programs API function for `GET /programs`.
- [x] Added Admin Programs panel using React Query.
- [x] Query is gated on memory-only auth session availability.
- [x] Loading, error, empty, and data table states were added.
- [x] Existing admin dashboard context card was preserved.
- [x] No backend code was changed.
- [x] No database schema was changed.
- [x] No token persistence was added.

Security posture preserved:

- [x] Access token remains memory-only through `AuthProvider`.
- [x] No `localStorage` token persistence was introduced.
- [x] No `sessionStorage` token persistence was introduced.
- [x] Backend authorization remains the source of truth.
- [x] Existing `ProtectedRoute` behavior remains in place.
- [x] Existing role-aware sidebar behavior remains in place.
- [x] Department scoping is still enforced by backend policy/request-context logic.

### Local PC Validation

| Validation | Result |
|---|---|
| Web typecheck | Passed |
| Web build | Passed |
| Commit created | Passed |
| Push to `origin/main` | Passed |

Committed change:

| Field | Value |
|---|---|
| Commit | `f4cd8ef` |
| Message | `Connect admin programs panel to API` |

Build artifact handling:

- `apps/web/tsconfig.tsbuildinfo` changed after web builds.
- It was not committed as source work.
- It was restored where needed.

### Ubuntu Server Validation

| Validation | Result |
|---|---|
| Fast-forward from `1dd48d9` to `f4cd8ef` | Passed |
| Web typecheck | Passed |
| Web build | Passed |
| `/admin` route build | Passed |
| Working tree restored after build artifact change | Passed |

Server build summary:

- Next.js production build completed successfully.
- `/admin` route was generated successfully.
- `/sign-in`, `/teacher`, and `/student` routes remained available.

### Runtime Browser Verification

Runtime browser URL:

- `http://192.168.197.129:3000/sign-in`

Runtime server command used:

- `pnpm --filter @lexora/web dev`

Verified browser behavior:

- [x] Sign-in page loaded.
- [x] Admin canonical account could sign in.
- [x] Admin user reached `/admin`.
- [x] Role-aware sidebar showed Admin workspace.
- [x] Admin Programs panel appeared on `/admin`.
- [x] Programs panel loaded real backend data from `GET /programs`.
- [x] Teacher workspace route loaded.
- [x] Student workspace route loaded.
- [x] Existing role-aware sidebar behavior remained functional.

Verified Admin Programs data displayed in browser:

| Code | Program | Status |
|---|---|---|
| `LLB` | `Bachelor of Laws` | `ACTIVE` |

Runtime verdict:

- [x] Frontend authenticated API helper works for the Programs API.
- [x] Admin dashboard can display real department-scoped academic program data.
- [x] Admin dashboard is no longer purely placeholder-level for academic programs.
- [x] Backend Programs API integration through the frontend passed runtime smoke test.

### Development Warning Observed

Next.js dev server showed a cross-origin development warning for `192.168.197.129` access to `/_next/*` resources.

Finding:

- This warning appeared only during development server access from the LAN IP.
- It did not block sign-in.
- It did not block `/admin`.
- It did not block Programs API rendering.

Future optional improvement:

- Configure `allowedDevOrigins` in `apps/web/next.config.ts` if repeated LAN-based Next.js dev testing needs warning-free operation.

This is not treated as a production blocker.

### Updated Current Limitations / Follow-Up

Superseded limitation:

- Previous note said role-specific dashboards were still placeholder-level.
- Updated status: Admin dashboard now has one real API-connected section: Academic Programs.

Still pending:

- Admin create/update academic program UI is not implemented yet.
- Admin courses UI remains pending.
- Admin course offerings UI remains pending.
- Admin Academic Calendar frontend was later implemented and runtime verified in its dedicated section.
- Teacher assigned-course UI was later implemented and runtime verified in the Teacher Assigned Courses Frontend Runtime Test section.
- Student enrolled-course UI using `/enrollments/me` is now implemented and runtime verified.
- Notice/notification frontend remains pending.
- Secure file upload frontend remains pending.

### Recommended Next Frontend Step

The next safe frontend step can be one of:

1. Add Admin Courses panel using the existing authenticated API helper.
2. Add Student enrolled-course surface using existing `/enrollments/me`.
3. Continue with admin course offerings after checking the current API shape.

For continuity after the Admin Programs panel, the most natural next step is Admin Courses panel connected to `GET /courses`.

## Admin Courses Panel and Official LL.B. Curriculum Runtime Verification

Runtime test date: 2026-05-26

Tested commits:

| Field | Value |
|---|---|
| Courses panel commit | `5fdacf1` |
| Courses panel message | `Connect admin courses panel to API` |
| Active-course filter commit | `0b7db34` |
| Active-course filter message | `Filter admin courses panel to active courses` |

### Source Curriculum

The runtime course seed was based on the official LL.B. (Honours) Semester System curriculum PDF provided for the Department of Law, University of Chittagong.

Curriculum summary:

| Item | Value |
|---|---|
| Programme | LL.B. (Honours) |
| Curriculum model | Semester System / OBE curriculum |
| Total courses | 58 |
| Total credits | 140 |
| Minimum degree credit requirement | 134 |

### Runtime Database Course Seed

The runtime database previously contained legacy/fake test courses:

| Code | Title | Previous Status |
|---|---|---|
| `LAW-101` | `Constitutional Law I` | `ACTIVE` |
| `LAW-999` | `Unassigned Runtime Test Course` | `ACTIVE` |

These old runtime courses were not deleted because existing runtime evidence depends on them through course offerings, teacher assignments, enrollments, result records, and transcript verification history.

Safe runtime data action performed:

- [x] Inserted/upserted 58 official LL.B. curriculum courses.
- [x] Set all official curriculum courses to `ACTIVE`.
- [x] Archived old runtime/fake courses instead of deleting them.
- [x] Preserved old runtime evidence links.
- [x] No backend schema change was made.
- [x] No migration was created.
- [x] No existing course offering, enrollment, result, or transcript evidence was deleted.

Database verification result:

| Status | Count |
|---|---:|
| `ACTIVE` | 58 |
| `ARCHIVED` | 2 |

Archived legacy runtime courses:

| Code | Title |
|---|---|
| `LAW-101` | `Constitutional Law I` |
| `LAW-999` | `Unassigned Runtime Test Course` |

### Frontend Courses Panel Implementation

The Admin dashboard now includes an Academic Courses panel.

Frontend changes:

| File | Purpose |
|---|---|
| `apps/web/src/lib/api-client.ts` | Added typed `AcademicCourse` API support and active course query |
| `apps/web/src/components/admin/admin-courses-panel.tsx` | Added React Query powered Admin Courses panel |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | Mounted Admin Courses panel after Admin Programs panel |

Implemented behavior:

- [x] Admin Courses panel uses the existing authenticated API helper.
- [x] Authenticated helper still sends `Authorization: Bearer <accessToken>`.
- [x] Authenticated helper still sends `x-department-id`.
- [x] Access token remains memory-only through `AuthProvider`.
- [x] No token persistence was introduced.
- [x] Admin Courses panel uses React Query.
- [x] Query is gated on memory-only auth session availability.
- [x] Loading, error, empty, and table states are present.
- [x] Courses table displays code, title, credits, and status.
- [x] Admin Programs panel was not changed.

### Active-Course Filter

Backend already supported course status filtering through:

- `GET /api/v1/courses?status=ACTIVE`

Frontend `getCourses()` was updated to call only active courses:

- `/courses?status=ACTIVE`

Reason:

- Legacy runtime/fake courses remain preserved in the database as `ARCHIVED`.
- Admin dashboard should show real active curriculum courses, not old runtime test data.

### Validation

Local PC validation:

| Validation | Result |
|---|---|
| Web typecheck | Passed |
| Web build | Passed |
| Commit/push for Admin Courses panel | Passed |
| Commit/push for active-course filter | Passed |

Ubuntu server validation:

| Validation | Result |
|---|---|
| Fast-forward pull to `5fdacf1` | Passed |
| Fast-forward pull to `0b7db34` | Passed |
| Web typecheck | Passed |
| Web build | Passed |
| `/admin` route build | Passed |

### Runtime Browser Verification

Runtime browser URL:

- `http://192.168.197.129:3000/admin`

Runtime server command used:

- `pnpm --filter @lexora/web dev`

Verified browser behavior:

- [x] Sign-in page loaded.
- [x] Admin dashboard loaded.
- [x] Academic Programs panel remained functional.
- [x] Academic Courses panel loaded real official curriculum courses.
- [x] Real curriculum course codes appeared, including `0421-1102`, `0421-1103`, `0421-1104`, `0231-1105`, `0311-1106`, `0421-1201`, and `0421-2101`.
- [x] Course credits displayed correctly.
- [x] Course status displayed as `ACTIVE`.
- [x] Archived legacy runtime courses `LAW-101` and `LAW-999` no longer appeared in the Admin Courses panel.

Runtime verdict:

- [x] Official LL.B. curriculum course seed passed.
- [x] Legacy runtime/fake course archival passed.
- [x] Admin Courses panel passed runtime smoke test.
- [x] Active-course filtering passed runtime smoke test.
- [x] Admin dashboard now has two real API-connected academic sections:
  - Academic Programs
  - Academic Courses

### Development Warning Observed

Next.js dev server again showed a cross-origin development warning for LAN IP access to `/_next/*` resources.

Finding:

- This warning is development-only.
- It did not block sign-in.
- It did not block `/admin`.
- It did not block Programs rendering.
- It did not block Courses rendering.

Future optional improvement:

- Configure `allowedDevOrigins` in `apps/web/next.config.ts` if repeated LAN-based Next.js dev testing needs warning-free operation.

This is not treated as a production blocker.

### Updated Current Limitations / Follow-Up

Superseded limitation:

- Previous note said Admin courses UI remained pending.
- Updated status: Admin dashboard now has a real API-connected Academic Courses panel.

Still pending:

- Admin create/update course UI is not implemented yet.
- Admin course offering UI remains pending.
- Admin Academic Calendar frontend was later implemented and runtime verified in its dedicated section.
- Teacher assigned-course UI was later implemented and runtime verified in the Teacher Assigned Courses Frontend Runtime Test section.
- Student enrolled-course UI using `/enrollments/me` is now implemented and runtime verified.
- Notice/notification frontend remains pending.
- Secure file upload frontend remains pending.

Recommended next frontend step:

- Add Admin course offerings panel after checking current course offering API shape, or
- Add Admin create/update course workflow after API/DTO review.

Superseded next-step note:

- Student enrolled-course surface using existing `/enrollments/me` is no longer pending; it was implemented and runtime verified in the next section.

## Student Enrolled-Course Frontend Runtime Verification

Runtime test date: 2026-05-27

Tested commit:

| Field | Value |
|---|---|
| Commit | `079bd9d` |
| Message | `Add student enrolled courses surface` |

### Purpose

The goal of this frontend task was to surface a student's already-enrolled courses in the existing Next.js student dashboard by using the already verified backend self-resource endpoint `GET /api/v1/enrollments/me`.

This task intentionally did not implement the dedicated available/eligible course-offering discovery endpoint.

### Implementation Summary

Frontend changes:

| File | Purpose |
|---|---|
| `apps/web/src/lib/api-client.ts` | Added typed enrollment response support and `getMyEnrollments()` API client wrapper |
| `apps/web/src/app/(dashboard)/student/page.tsx` | Replaced placeholder student page with enrolled-course card surface |

Implemented behavior:

- [x] Student page uses the existing frontend auth session.
- [x] Student page uses the memory-only access token from `AuthProvider`.
- [x] Student page sends the authenticated user's `departmentId` through the existing authenticated API helper.
- [x] Student page fetches data from `GET /api/v1/enrollments/me`.
- [x] Student page does not call broad `GET /api/v1/course-offerings`.
- [x] Student page has loading state.
- [x] Student page has empty state.
- [x] Student page has API error state.
- [x] Student page renders enrolled-course cards when records are returned.

Displayed fields:

- course code
- course title
- section
- academic term
- enrollment status
- eligibility status

### Validation

Local PC validation:

| Validation | Result |
|---|---|
| Web build | Passed |
| Next.js compile | Passed |
| Linting/type validity during build | Passed |
| Commit created | Passed |
| Push to `origin/main` | Passed |

Ubuntu Server validation:

| Validation | Result |
|---|---|
| Fast-forward pull to `079bd9d` | Passed |
| Web build | Passed |
| `/student` route build | Passed |
| Git working tree clean after build | Passed |

Ubuntu Server build command:

- `pnpm --filter @lexora/web build`

Ubuntu Server build result summary:

- Next.js version: `15.5.15`
- Production build completed successfully.
- `/student` route built successfully.
- Linting and type validity checks passed during build.
- Static page generation completed successfully.

### Runtime API / Environment Verification

API health check through Nginx passed:

- `curl -s http://localhost/api/v1/health`

Result:

- API returned `success: true`.
- API service status returned `ok`.

Frontend API base URL behavior:

- `NEXT_PUBLIC_API_BASE_URL` defaults to `/api/v1`.
- Built frontend bundle confirmed the student API wrapper calls `/enrollments/me`.

### Runtime Browser Verification

Runtime browser URL:

- `http://192.168.197.129:3000/student`

Runtime server command used:

- `pnpm exec next dev --hostname 0.0.0.0 --port 3000`

Initial browser behavior:

- [x] Student dashboard loaded successfully.
- [x] Student account `student.law@cu.ac.bd` could access `/student`.
- [x] Empty state appeared when `GET /api/v1/enrollments/me` returned `[]`.

Initial empty-state finding:

- The account `student.law@cu.ac.bd` existed.
- The account had role `student`.
- The account had department `dept_law_test`.
- The account had status `ACTIVE`.
- The account had no enrollment records before this frontend runtime test.
- Therefore the empty state was correct.

### Controlled Runtime Test Data Setup

Important data rule:

- Existing active curriculum courses were used.
- No new course was created.
- First-year first-semester course offerings were created from existing active courses because the curriculum courses existed but had no course offerings yet.
- The student `student.law@cu.ac.bd` was enrolled into the first-year first-semester offerings.

Existing student used:

| Field | Value |
|---|---|
| Email | `student.law@cu.ac.bd` |
| Display Name | `Law Test Student` |
| User ID | `cmpmmnn00000f2imt3sqhgto9` |
| Department ID | `dept_law_test` |
| Role | `student` |
| Status | `ACTIVE` |

Course offering setup:

| Course Code | Course Title | Offering ID | Section | Term |
|---|---|---|---|---|
| `0231-1105` | `General English (GED)` | `offering_0231_1105_2025_2026_s1_a` | `A` | `LAW-2025-2026-S1` |
| `0311-1106` | `Fundamentals of Economics (GED)` | `offering_0311_1106_2025_2026_s1_a` | `A` | `LAW-2025-2026-S1` |
| `0421-1101` | `Jurisprudence-I` | `offering_0421_1101_2025_2026_s1_a` | `A` | `LAW-2025-2026-S1` |
| `0421-1102` | `Muslim Law-I` | `offering_0421_1102_2025_2026_s1_a` | `A` | `LAW-2025-2026-S1` |
| `0421-1103` | `Hindu Law` | `offering_0421_1103_2025_2026_s1_a` | `A` | `LAW-2025-2026-S1` |
| `0421-1104` | `Legal History of Bangladesh and Roman Law` | `offering_0421_1104_2025_2026_s1_a` | `A` | `LAW-2025-2026-S1` |

Runtime enrollments created:

| Enrollment ID | Course Code | Status | Eligibility Status |
|---|---|---|---|
| `enrollment_student_law_0231_1105_2025_2026_s1` | `0231-1105` | `APPROVED` | `PENDING_REVIEW` |
| `enrollment_student_law_0311_1106_2025_2026_s1` | `0311-1106` | `APPROVED` | `PENDING_REVIEW` |
| `enrollment_student_law_0421_1101_2025_2026_s1` | `0421-1101` | `APPROVED` | `PENDING_REVIEW` |
| `enrollment_student_law_0421_1102_2025_2026_s1` | `0421-1102` | `APPROVED` | `PENDING_REVIEW` |
| `enrollment_student_law_0421_1103_2025_2026_s1` | `0421-1103` | `APPROVED` | `PENDING_REVIEW` |
| `enrollment_student_law_0421_1104_2025_2026_s1` | `0421-1104` | `APPROVED` | `PENDING_REVIEW` |

### Final UI Verification

Final browser verification result:

- [x] `/student` dashboard displayed `My enrolled courses`.
- [x] Six enrolled-course cards rendered.
- [x] Course codes appeared correctly.
- [x] Course titles appeared correctly.
- [x] Section `A` appeared correctly.
- [x] Academic term appeared as `Law 2025-2026 Semester 1 (LAW-2025-2026-S1)`.
- [x] Enrollment status appeared as `Approved`.
- [x] Eligibility status appeared as `Pending Review`.

Visible course cards:

- `0231-1105` — `General English (GED)`
- `0311-1106` — `Fundamentals of Economics (GED)`
- `0421-1101` — `Jurisprudence-I`
- `0421-1102` — `Muslim Law-I`
- `0421-1103` — `Hindu Law`
- `0421-1104` — `Legal History of Bangladesh and Roman Law`

### Security Verification

- [x] No backend authorization logic was changed.
- [x] No `AuthGuard` logic was changed.
- [x] No `PolicyGuard` logic was changed.
- [x] No request-context logic was changed.
- [x] No department-isolation logic was changed.
- [x] No broad `OFFERING_READ` access was granted to students.
- [x] Student page uses the existing self-resource endpoint `GET /api/v1/enrollments/me`.
- [x] Student direct/broad `GET /api/v1/course-offerings` access remains intentionally unavailable.
- [x] No access token persistence was introduced.
- [x] Existing memory-only auth posture was preserved.
- [x] Backend remains the source of truth for authorization and department isolation.

### Scope Note

This completed feature is:

- Student enrolled-course frontend surface using `/enrollments/me`.

This is not:

- Student available-course discovery.
- Student eligible-course discovery.
- Student self-enrollment workflow.
- Broad student course-offering access.

The dedicated student-facing available/eligible course-offering endpoint remains pending.

Possible future endpoint options remain:

- `GET /api/v1/course-offerings/me`
- `GET /api/v1/student/course-offerings`
- `GET /api/v1/enrollments/available`

### Runtime Verdict

- [x] Student enrolled-course frontend implementation passed.
- [x] Ubuntu Server sync passed.
- [x] Web production build passed.
- [x] Runtime browser verification passed.
- [x] Existing `/enrollments/me` self-resource model was preserved.
- [x] Student course-offering broad access remained blocked.
- [x] Security boundary was preserved.

Updated frontend status:

- Admin dashboard has API-connected Academic Programs panel.
- Admin dashboard has API-connected Academic Courses panel.
- Student dashboard now has API-connected Enrolled Courses surface.

## Admin Academic Frontend Course and Course Offering Management Runtime Verification

### Runtime Test Date

- 2026-06-11

### Scope

This section documents the newly implemented Admin Academic frontend management work for courses and course offerings.

Included scope:

- [x] Admin course create/edit UI.
- [x] Admin course management bucket UI.
- [x] Admin course status-change cache refresh fix.
- [x] Admin course bucket row ordering fixes.
- [x] Admin course offering create/edit UI.
- [x] Frontend integration with existing protected backend Course, Academic Term, and Course Offering APIs.

Out of scope for this section:

- [ ] Backend authorization or department-isolation changes.
- [ ] Teacher assignment UI.
- [ ] Role-based user creation.
- [ ] Student available/eligible course-offering endpoint.
- [ ] Academic Year/Term management UI.

### Related Commits

| Commit | Purpose |
|---|---|
| `3600cb8` | Add admin course create edit UI |
| `9d56639` | Refine admin course management UI |
| `9abb320` | Add admin course offering management UI |
| `416f3db` | Fix admin course bucket refresh |
| `7ef4fcd` | Sort admin course bucket rows |
| `71585dc` | Fix admin course curriculum ordering |

### Implementation Summary

Admin Courses:

- [x] Added course create/edit UI on the Admin dashboard.
- [x] Course form is collapsed by default behind the `Create course` action.
- [x] Edit opens a prefilled course form.
- [x] Law admin course form does not show lab hours.
- [x] Academic program is selected through a dropdown.
- [x] Course list is grouped into status buckets:
  - Active
  - Inactive
  - Draft
  - Archived
- [x] Active, Inactive, and Draft course rows remain editable.
- [x] Archived course rows remain visible but read-only.
- [x] Course status selector excludes Archived for normal admin editing.
- [x] Course counts and visible bucket rows derive from the same React Query course data.
- [x] Course bucket refresh now updates React Query cache with the server-confirmed course before selecting the returned status bucket.
- [x] Course query is still invalidated/refetched after successful create/update so the backend remains source of truth.

Admin Course Offerings:

- [x] Added course offering create/edit UI on the Admin dashboard.
- [x] Create offering form is collapsed by default behind the `Create offering` action.
- [x] Course offering create uses active courses from the Courses API.
- [x] Course offering create uses academic terms from the Academic Terms API.
- [x] Admin selects Course and Academic Term from dropdowns instead of typing raw IDs.
- [x] Create submits `courseId`, `academicTermId`, `sectionCode`, optional capacity, optional status, and optional visibility dates.
- [x] Edit opens a prefilled offering form.
- [x] Edit preserves immutable course and academic term fields.
- [x] Edit submits only supported mutable fields:
  - `sectionCode`
  - `capacity`
  - `status`
  - `visibilityStartAt`
  - `visibilityEndAt`
- [x] Course offering mutations invalidate/refetch the course offerings query after success.

### Validation

Local PC validation:

- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `git diff --check` passed where run.
- [x] Build artifact `apps/web/tsconfig.tsbuildinfo` was restored before/after commits where needed.
- [x] Local repository was clean after relevant commits.

Ubuntu server validation:

- [x] Fast-forward sync passed.
- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] Build artifact `apps/web/tsconfig.tsbuildinfo` was restored where needed.
- [x] Server repository was clean after relevant sync/build steps.

Build environment note:

- [x] A previous Ubuntu web build failure was traced to a sourced/non-standard `NODE_ENV` value from an API shell session, not to the frontend code.
- [x] After `NODE_ENV` and `NEXT_RUNTIME` were unset, the Ubuntu web build passed.

### Browser Runtime Verification

Runtime frontend URL:

- `http://192.168.197.129:3000`

Admin Courses:

- [x] Admin course create flow passed runtime verification.
- [x] Admin course edit flow passed runtime verification.
- [x] Course form stayed collapsed on initial Admin dashboard load.
- [x] Edit opened a prefilled form.
- [x] Lab hours stayed hidden in the Law admin course form.
- [x] Academic program dropdown was available.
- [x] Course buckets displayed Active, Inactive, Draft, and Archived groups.
- [x] Archived courses remained visible as read-only/no edit.
- [x] Active to Inactive status update passed.
- [x] Inactive to Active status update passed.
- [x] Bucket counts updated after status changes.
- [x] Updated courses appeared in the selected returned-status bucket after save/refetch.

Admin course curriculum ordering:

- [x] Runtime DB evidence confirmed `0421-1101`, `0421-1102`, `0421-1103`, and `0421-1104` existed and were `ACTIVE`.
- [x] Active course count was confirmed as `59`.
- [x] Final ordering fix sorts by the numeric course sequence after the hyphen.
- [x] Active bucket starts with:
  - `0421-1101`
  - `0421-1102`
  - `0421-1103`
  - `0421-1104`
  - `0231-1105`
  - `0311-1106`
- [x] Courses such as `0315-3107` and `0312-4206` no longer appear before `0421-1101`.

Admin Course Offerings:

- [x] Admin course offering create/edit UI loaded.
- [x] Create offering uses active course dropdown data.
- [x] Create offering uses academic term dropdown data.
- [x] Admin did not need to type raw `courseId` or `academicTermId`.
- [x] Create offering flow passed runtime verification.
- [x] Edit offering flow passed runtime verification.
- [x] Edit preserved immutable course and academic term fields.
- [x] Edit updated supported mutable fields only.
- [x] Course offering list refreshed after create/update.

Latest Admin Academic frontend security smoke checks:

- [x] Teacher account attempted direct `/admin` route access.
- [x] Student account attempted direct `/admin` route access.
- [x] Admin panel did not appear for teacher direct `/admin` route access.
- [x] Admin panel did not appear for student direct `/admin` route access.
- [x] Browser Application storage inspection found no token in Local Storage.
- [x] Browser Application storage inspection found no token in Session Storage.
- [x] Refresh cookie was present and marked HttpOnly.
- [x] No raw token values were documented.

### Bug Fixes and Supersession Notes

- [x] Older pending notes that said Admin create/update course UI was pending are superseded by this section.
- [x] Older pending notes that said Admin course offering UI was pending are superseded by this section.
- [x] The first Admin Courses ordering fix sorted by full course code.
- [x] Runtime screenshot showed that full-code ordering was incorrect because `031x`/`022x` prefixes could appear before `0421-1101`.
- [x] DB/runtime evidence confirmed the `0421-1101` through `0421-1104` courses existed and were active; the issue was frontend display ordering, not missing data.
- [x] The final ordering fix uses the numeric segment after the hyphen as the primary curriculum sequence key.
- [x] Full course-code numeric `localeCompare` remains as fallback when sequence numbers are equal or cannot be parsed.

### Security/Architecture Preservation

- [x] Changes were frontend-only.
- [x] No backend files were modified for this Admin Academic frontend work.
- [x] No `AuthProvider` logic was changed.
- [x] No token storage logic was changed.
- [x] No `AuthGuard` logic was changed.
- [x] No `PolicyGuard` logic was changed.
- [x] No request-context logic was changed.
- [x] No department-isolation logic was changed.
- [x] Existing authenticated API helper behavior was preserved.
- [x] Frontend continued to use the authenticated session's `accessToken` and `departmentId`.
- [x] Backend remains the source of truth for authorization and department scoping.
- [x] No secrets, raw tokens, passwords, password hashes, DB credentials, or sensitive runtime tokens are documented here.
- [x] Latest teacher/student `/admin` negative access smoke check passed.
- [x] Latest browser storage token inspection passed.
- [x] Refresh cookie HttpOnly flag was observed during browser storage inspection.
- [x] No backend authorization change is claimed by this frontend/runtime smoke verification.

### Remaining Pending Checks

- [x] Teacher assigned-course surface: read-only frontend runtime verified.
- [ ] Dedicated student available/eligible course-offering endpoint.
- [ ] Notice/notification frontend.
- [ ] Secure file upload frontend.

### Runtime Verdict

- [x] Admin course create/edit UI is implemented and runtime verified.
- [x] Admin course management buckets are implemented and runtime verified.
- [x] Admin course bucket refresh after status changes is fixed and runtime verified.
- [x] Admin course curriculum ordering is fixed and runtime verified.
- [x] Admin course offering create/edit UI is implemented and functional runtime flow passed.
- [x] Existing backend security and department-scoping architecture was preserved.
- [x] Latest separate teacher/student `/admin` negative access check passed.
- [x] Latest separate browser storage token inspection passed.

### Updated Next Test Steps

Recommended next runtime checks:

1. Continue Teacher Assignment HTTP API work if it is not completed elsewhere.
2. Design and implement the dedicated student available/eligible course-offering endpoint before exposing student course discovery.
3. Continue with Notice/notification frontend.
4. Continue with secure file upload frontend only after the secure upload pipeline is ready.

## Teacher Assigned Courses Frontend Runtime Test

### Runtime Verification Status

- [x] Feature status: runtime verified for the read-only Teacher Assigned Courses frontend surface.
- [x] Implemented commit verified on server:
  - Commit: `60671e8`
  - Message: `Add teacher assigned courses surface`
- [x] Implementation files:
  - `apps/web/src/app/(dashboard)/teacher/page.tsx`
  - `apps/web/src/components/teacher/teacher-assigned-courses-panel.tsx`

### Server Verification Evidence

- [x] Ubuntu server repo fast-forwarded from `27e2f21` to `60671e8`.
- [x] `pnpm --filter @lexora/web typecheck` passed on the server.
- [x] `pnpm --filter @lexora/web build` passed on the server.
- [x] `/teacher` route appeared in the Next.js production build output.
- [x] Final server git status was clean after restoring `apps/web/tsconfig.tsbuildinfo`.

### Runtime Browser Verification

- [x] Web dev server launched from `~/lexora_lms/apps/web` with:
  - `pnpm exec next dev --hostname 0.0.0.0 --port 3000`
- [x] Earlier command failed because Next treated `--hostname` as a project directory:
  - `pnpm --filter @lexora/web dev -- --hostname 0.0.0.0 --port 3000`
- [x] Browser opened `/teacher` at:
  - `http://192.168.197.129:3000/teacher`
- [x] Teacher account used:
  - `teacher.law@cu.ac.bd`
- [x] Initial `/teacher` page showed the empty state because canonical `teacher.law@cu.ac.bd` had no active course assignment.
- [x] After controlled runtime test-data setup and hard refresh/sign-in, `/teacher` displayed the assigned course offering table.

Rendered values observed:

| Field | Value |
|---|---|
| Course code | `LAW-101` |
| Course title | `Constitutional Law I` |
| Section | `A` |
| Term | `LAW-2025-2026-S1 - Law 2025-2026 Semester 1` |
| Capacity | `60` |
| Status | `Planned` |
| Visibility | `Not set` |

### Controlled Runtime Test Data Setup

- [x] Read-only DB inspection confirmed:
  - `teacher.law@cu.ac.bd` was `ACTIVE`.
  - `runtime-test-teacher@cu.ac.bd` was `SUSPENDED`.
  - Existing `LAW-101` teacher assignment belonged to `runtime-test-teacher@cu.ac.bd`, not the canonical teacher account.
- [x] Because Teacher Assignment HTTP API is still pending, a controlled runtime DB upsert was used only to assign canonical `teacher.law@cu.ac.bd` to the existing `LAW-101` course offering for verification continuity.
- [x] Controlled assignment created/activated:
  - Assignment ID: `teacher_assignment_law_canonical_101_runtime`
  - Teacher: `teacher.law@cu.ac.bd`
  - Course Offering ID: `cmozy23xm000r2i0lccmtg7dl`
  - Course: `LAW-101 - Constitutional Law I`
  - Section: `A`
  - Term: `LAW-2025-2026-S1 - Law 2025-2026 Semester 1`
  - Assignment role: `primary_instructor`
  - Assignment status: `ACTIVE`
  - `unassigned_at`: null
- [x] This DB upsert was controlled runtime test data setup only, not a production workflow.
- [ ] Teacher Assignment HTTP API remains pending if not completed elsewhere.

### Access And Storage Checks

- [x] No Create/Edit/Delete controls were visible on the teacher surface.
- [x] Teacher account could not access `/admin`; admin route access was blocked/redirected.
- [x] Browser DevTools showed Local Storage empty for the frontend origin.
- [ ] Session Storage verification is not claimed in this section because no separate explicit check is available.

### Security/Architecture Preservation

- [x] This was a frontend-only change.
- [x] No backend `AuthGuard`, `PolicyGuard`, request context, department isolation, token storage, refresh cookie, or backend service authorization behavior was changed.
- [x] Assigned-course filtering still relies on existing backend `GET /api/v1/course-offerings` teacher-scoped behavior.
- [x] The frontend is a read-only surface and is not treated as an authorization boundary.
- [x] No secrets, passwords, access tokens, refresh tokens, DB credentials, raw cookies, or sensitive values are documented here.

### Runtime Verdict

- [x] Teacher dashboard `/teacher` loads the real assigned-course frontend surface.
- [x] Assigned course data is fetched through existing `GET /api/v1/course-offerings`.
- [x] Backend remains the source of truth for teacher-scoped assigned-course filtering.
- [x] Teacher Assigned Courses read-only frontend surface is runtime verified.

## Admin Academic Calendar Frontend Runtime Verification

### Runtime Test Date

- 2026-06-12

### Scope

This section documents the runtime-verified Admin Academic Calendar frontend flow for Academic Year and Academic Term management on the Admin dashboard.

Included scope:

- [x] Admin Academic Calendar panel rendered on `/admin`.
- [x] Academic Year list, create, and edit UI.
- [x] Academic Term list, create, and edit UI.
- [x] Academic Term create/edit uses an Academic Year dropdown instead of raw `academicYearId` entry.
- [x] Academic Terms table layout and dashboard overflow containment fixes.
- [x] Integration with existing protected Academic Year and Academic Term APIs.

Out of scope for this section:

- [ ] Backend authorization or department-isolation changes.
- [ ] Backend Academic Year single-current uniqueness hardening.
- [ ] Dedicated reviewed archive/unarchive workflow.
- [ ] Broad production-readiness claim.

### Related Commits

| Commit | Purpose |
|---|---|
| `72bfc9d` | Add admin academic calendar panel |
| `41bd019` | Improve admin academic calendar table layout |
| `dd974bb` | Contain admin academic calendar table overflow |
| `8e2b571` | Fix dashboard shell content overflow |

### Runtime Environment

- Runtime URL used: `http://192.168.197.129:3000/admin`
- API process: PM2 app `lexora-api`
- API runtime entrypoint: `apps/api/dist/src/main.js`
- Existing authenticated admin session was used.
- No raw access tokens, refresh tokens, cookies, passwords, DB credentials, or secret values are documented here.

### Implemented UI Surface

Admin Academic Calendar:

- [x] Added an Admin dashboard panel for academic calendar management.
- [x] Panel includes separate sections for:
  - Academic Years
  - Academic Terms
- [x] Create forms are collapsed by default.
- [x] Edit opens prefilled forms.
- [x] Date inputs use `datetime-local` UI values and submit ISO strings to the API.
- [x] Optional enrollment dates are omitted when empty.
- [x] Academic Year form supports normal admin statuses:
  - Planned
  - Active
  - Closed
- [x] Academic Term form supports normal admin statuses:
  - Planned
  - Enrollment Open
  - In Progress
  - Closed
- [x] Archived Academic Years and Terms remain visible in lists but are read-only through the normal UI.
- [x] Academic Terms table scrolls horizontally inside its bordered wrapper when needed.
- [x] Shared dashboard shell/card overflow fixes prevent page-level horizontal scrolling.

### Runtime Verified Actions

Academic Year:

- [x] Admin viewed academic years on `/admin`.
- [x] Admin created an Academic Year through the UI.
- [x] Admin edited the Academic Year through the UI.
- [x] Academic Year list updated after create/edit.

Academic Year runtime evidence:

| Field | Value |
|---|---|
| Code | `AY-UI-2026-2027` |
| Name after edit | `UI Runtime Academic Year 2026-2027 Updated` |
| DB row ID | `cmq9r6txx002h2i9aiays3udq` |
| Start Date | `2026-07-01T17:09:00.000Z` |
| End Date | `2027-07-01T17:09:00.000Z` |
| Status | `PLANNED` |
| Is Current | `false` |

Academic Term:

- [x] Admin viewed academic terms on `/admin`.
- [x] Admin created an Academic Term through the UI after API rebuild/restart.
- [x] Admin selected the Academic Year from the dropdown.
- [x] Admin edited the Academic Term through the UI.
- [x] Academic Term list updated after create/edit.

Academic Term runtime evidence:

| Field | Value |
|---|---|
| Code shown in UI | `LAW-UI-2026-2027-S1A` |
| Initial Name | `UI Runtime Law Semester 1` |
| Name after edit | `UI Runtime Law Semester 1 Updated` |
| Academic Year | `AY-UI-2026-2027` |
| Sequence | `1` |
| UI Date Range | Begins `8/1/2026` |
| Status after edit | `Enrollment Open` |

Layout/overflow:

- [x] No browser/page-level horizontal scrollbar after shared shell fix.
- [x] Academic Terms table scrolls inside its own bordered table container.
- [x] Academic Courses section below the calendar remains contained.

### Failure Encountered

Before rebuilding/restarting the API runtime, Academic Term creation returned:

- `BadRequestException`
- `Academic term dates must be within the academic year`

DevTools request payload was valid for the selected Academic Year:

| Field | Value |
|---|---|
| `academicYearId` | `cmq9r6txx002h2i9aiays3udq` |
| `startDate` | `2026-08-01T06:00:00.000Z` |
| `endDate` | `2026-12-31T06:00:00.000Z` |
| Enrollment Range | Within the submitted term date range |

### Diagnosis

- [x] Database check confirmed the selected Academic Year boundaries contained the submitted term dates.
- [x] Standalone JavaScript comparison confirmed `shouldPassWithinYearCheck: true`.
- [x] The failure was diagnosed as stale API dist/runtime behavior because the valid payload passed after API rebuild and PM2 restart, not because of invalid frontend payload data.

Backend validation rule source-review notes:

- `validateAcademicTermDates()` rejects term dates outside the selected Academic Year.
- Enrollment start/end dates cannot violate term boundaries.
- The backend validation rule remains active.
- No backend code change is claimed by this frontend runtime verification section.

### Resolution

The stale API runtime issue was resolved by rebuilding and restarting the API process:

- `pnpm --filter @lexora/api build`
- `pm2 restart lexora-api`

After rebuild/restart:

- [x] Academic Term create passed.
- [x] Academic Term edit passed.
- [x] The final Academic Term list reflected the updated name and status.

### Security/Architecture Preservation

- [x] Existing protected Academic Year and Academic Term APIs were used.
- [x] UI used the existing authenticated admin session.
- [x] No `AuthProvider` logic was changed.
- [x] No token storage logic was changed.
- [x] No `AuthGuard` logic was changed.
- [x] No `PolicyGuard` logic was changed.
- [x] No request-context logic was changed.
- [x] No department-isolation logic was changed.
- [x] Backend remains the source of truth for authorization, validation, and department scoping.
- [x] No raw tokens, cookies, passwords, DB credentials, or secret values are documented.

### Pending / Future Hardening

- [ ] Improve frontend error display/debuggability for API validation failures without exposing secrets.
- [ ] Consider adding a visible deployment/runbook reminder: after API source changes, run API build and PM2 restart before runtime testing.
- [ ] Optional UX improvement: prefill or hint Academic Term date ranges from selected Academic Year boundaries.
- [ ] Academic Year `isCurrent` uniqueness remains a backend hardening item unless separately implemented and runtime verified.
- [ ] Dedicated reviewed archive/unarchive workflow remains future work.

### Supersession Note

- [x] The older pending note for the Academic Calendar frontend is superseded by this section for the tested Admin Academic Calendar UI flow.

### Runtime Verdict

- [x] Admin Academic Calendar panel is implemented on `/admin`.
- [x] Academic Year create/edit flow passed runtime verification.
- [x] Academic Term create/edit flow passed runtime verification after API rebuild/restart.
- [x] Academic Term validation failure was diagnosed and resolved by rebuild/restart of stale API runtime.
- [x] Academic Terms table overflow is contained within its own bordered scroll wrapper.
- [x] Dashboard-wide horizontal overflow is fixed by shared shell/card containment changes.
- [x] Existing backend validation, authorization, and department-scoping architecture was preserved.

## Admin User Creation API and Frontend Runtime Verification

### Implementation Scope

- [x] Added department-scoped User Management API under the existing `UserManagementModule`.
- [x] Added Admin Dashboard Users panel for department admins.
- [x] Backend creates only `User` plus a department-scoped `UserRole`.
- [x] Creation accepts only `student` and `teacher` role codes.
- [x] Creation accepts only safe initial statuses: `ACTIVE` or `INVITED`.
- [x] Creation does not accept `departmentId`, raw role IDs, arbitrary permissions, admin role creation, or Library Admin role creation.
- [x] Existing `AuthGuard`, `PolicyGuard`, and `@RequirePolicy()` are used on every user-management endpoint.
- [x] Department scope is resolved from the authenticated principal/request context.
- [x] No raw passwords, password hashes, access tokens, refresh tokens, cookies, DB credentials, or secrets are documented.

### Backend Endpoints

- [x] `GET /api/v1/users` lists users in the authenticated principal's active department.
- [x] `POST /api/v1/users` creates a department-scoped student or teacher user.
- [x] `GET /api/v1/users/:id` reads only users in the authenticated principal's active department.
- [x] `PATCH /api/v1/users/:id/status` updates status only for managed student/teacher users in the authenticated principal's active department.
- [x] `identity-access.user.read` protects read endpoints.
- [x] `identity-access.user.manage` protects create/status endpoints.
- [x] `department_admin` is covered by the existing `identity-access.*` static policy mapping.
- [x] Teacher and Student roles do not receive the new `identity-access.user.*` policies through static mapping.

### Frontend Panel Behavior

- [x] Added `AdminUsersPanel` to `/admin` after academic setup panels in a People & Access section.
- [x] Create form is collapsed by default.
- [x] Form includes role, display name, email, temporary password, confirmation, and status.
- [x] Client validates temporary password confirmation before submit.
- [x] Users list can be filtered by role and status.
- [x] Successful create invalidates/refetches the users query, resets the form, and collapses it.
- [x] UI does not display password hashes, tokens, refresh tokens, or secrets.
- [x] API client preserves authenticated helper use, memory-only access-token posture, and `credentials: "include"` refresh-cookie behavior.
- [x] Follow-up UI hardening in commit `9fd2574` replaced inline table-row status dropdowns with explicit `Edit` -> `Save update` status editing.

### Implemented Validation Behavior - Static, API, and Browser Runtime Evidence

- [x] Email format is validated by DTO.
- [x] Official university email domain restriction is reused from `auth.universityEmailDomains`.
- [x] Service-side trim validation rejects empty email or display name after trimming.
- [x] Existing password policy is reused for temporary passwords.
- [x] Existing `PasswordHasherService` is reused.
- [x] Weak temporary passwords return `400 Bad Request`; browser flow displayed safe message `Temporary password does not meet password policy`.
- [x] Duplicate normalized emails return conflict.
- [x] Invalid role codes are rejected.
- [x] Extra payload fields such as `departmentId` are rejected by the global validation pipe.
- [x] Responses omit password hashes and raw tokens.

### Positive Runtime Tests

Runtime evidence after server pull of commit `af02095`:

- Route evidence: `/api/v1/users` is live; `/api/users` returned `404`.
- Department ID observed in API responses: `dept_law_test`.
- Runtime Student: `runtime.student.1781576956@cu.ac.bd`, ID `cmqg0x65b000n2ihl2w40re59`.
- Runtime Teacher: `runtime.teacher.1781576956@cu.ac.bd`, ID `cmqg0x6ns00112ihl2slgjc4z`.
- Admin, Teacher, and Student login tokens were captured for runtime testing; token values are not documented.

Frontend browser/runtime evidence:

- Browser URL verified: `http://192.168.197.129:3000/admin`.
- Admin Users / People & access panel loaded successfully on `/admin`.
- Users list, Role filter, Status filter, and Create user button rendered.
- Create form was collapsed by default, opened successfully, and cancel/collapse behavior worked.
- Create role dropdown showed only `Student` and `Teacher`.
- Create initial status dropdown showed only `Active` and `Invited`.
- Temporary password and confirm temporary password fields were present.
- Department Admin / non-managed rows showed `Protected`.
- Student/Teacher managed rows were available for managed actions.
- No password, password hash, raw access token, refresh token, cookie, or secret was displayed in the UI.

Frontend-created runtime user evidence:

- Runtime Student: `runtime.student.16062026@cu.ac.bd`, ID `cmqgtwr7900072iejivwik90y`.
- Department ID: `dept_law_test`.
- Display name: `Frontend Runtime Student`.
- Status: `INVITED`.
- Role: `student`.
- Created at: `2026-06-16T16:00:46.773Z`.
- `lastLoginAt`: `null`.
- Create/list responses did not expose password hashes or raw tokens.

UI hardening evidence after commit `9fd2574` (`Refine admin users status editing UI`):

- Changed file: `apps/web/src/components/admin/admin-users-panel.tsx`.
- `pnpm --filter @lexora/web typecheck` passed before commit.
- `pnpm --filter @lexora/web build` passed before commit.
- Build artifact `apps/web/tsconfig.tsbuildinfo` was restored and not committed.
- Working tree was clean after commit/push.
- Role / Status / Create user controls are no longer visually cramped.
- Managed users no longer have inline status dropdowns in the table.
- Managed Student/Teacher rows show an `Edit` action.
- Department Admin / non-managed rows still show `Protected`.
- Clicking `Edit` opens an explicit edit status form.
- `Cancel` closes the edit form without updating status.
- `Save update` is required before a status update occurs.
- Status update occurs only after explicit save.
- Create user flow still works after the UI hardening.
- Weak temporary password submission still returns `Temporary password does not meet password policy`.

- [x] Department admin can list department users; `GET /api/v1/users` returned `200`.
- [x] Department admin can create a Student user with `ACTIVE` status; `POST /api/v1/users` returned `201`.
- [x] Department admin can create a Teacher user with `INVITED` status; `POST /api/v1/users` returned `201`.
- [x] Created users were returned by API create responses.
- [x] Frontend Admin Users panel browser verification passed for list rendering, create form behavior, protected row display, and no-secret UI display.
- [x] Created frontend runtime user appeared in the refreshed Admin Users panel/list.
- [x] Created user is department-scoped; fake `x-department-id: dept_bus_fake` still returned only `dept_law_test` users for the admin list test.
- [x] Created `ACTIVE` student can log in successfully.
- [x] Department admin can update a managed student's status to `SUSPENDED`; `PATCH /api/v1/users/:id/status` returned `200`.

### Negative / Security Tests

- [x] Unauthenticated `GET /api/v1/users` returns `401`.
- [x] Unauthenticated `POST /api/v1/users` returns `401 Unauthorized` with `UnauthorizedException` and message `Authentication is required`.
- [x] Teacher list users returns `403`.
- [x] Student list users returns `403`.
- [x] Weak password returns `400`.
- [x] Duplicate email returns `409`.
- [x] Invalid `roleCode=department_admin` is rejected with `400`.
- [x] Unsafe initial status `LOCKED` is rejected with `400`.
- [x] Department Admin or otherwise privileged active-role targets cannot be updated through `/users/:id/status`; privileged admin status update returned safe `404`.
- [x] Payload `departmentId` is rejected and is never used for scoping; authenticated Law admin create payload with extra `departmentId` returned `400 Bad Request` / `BadRequestException`.
- [x] `x-department-id` for another department does not override the authenticated Law admin department scope for the verified list test.
- [x] Cross-department direct user ID access returns safe not-found; Law admin `GET /api/v1/users/user_bus_runtime_admin` returned `404 NotFoundException` with message `User not found`.
- [x] Create responses do not expose `passwordHash`, `accessToken`, `refreshToken`, or `token`.
- [x] Verified create responses do not expose password hash, raw tokens, refresh tokens, or secrets.

### Limitations

- [x] `StudentProfile`, `TeacherProfile`, and `AdminProfile` models were not present in the inspected Prisma schema, so profile creation remains pending.
- [x] Runtime data can safely create missing department `student` and `teacher` roles only; it does not auto-create `department_admin` or `library_admin`.
- [x] Audit rows are written through the existing Prisma audit-log pattern used by academic services.

### Future Library Admin Planning Note

- [x] Future role code: `library_admin`.
- [x] Future module: `library`.
- [x] Future policies: `library.book.read`, `library.book.manage`, `library.copy.manage`, `library.borrow.manage`, `library.report.read`.
- [x] Library Admin must be department-scoped.
- [x] Library Admin must not manage academic users, courses, results, attendance, transcripts, or system configuration.
- [x] Activate this role only after Library module/schema/API/dashboard exists.
- [x] No active `library_admin` role, policy mapping, API, schema, or dashboard behavior was implemented in this task.
