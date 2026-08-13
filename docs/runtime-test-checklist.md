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
- Superseded note: Teacher Assignment HTTP API was pending at the time of this Academic Year / Academic Term verification, but it was later implemented and runtime verified in the Teacher Assignment HTTP API Runtime Verification section.
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

- [x] Superseded note: During this earlier runtime test, teacher assignment HTTP API/controller was not exposed.
  - `/course-offerings` controller currently supports:
    - create
    - list
    - get by ID
    - update
  - `/enrollments` controller is exposed separately.
  - Teacher assignment existed in Prisma schema/service contract, but no public runtime API route/controller was found at that time.
  - The Teacher Assignment HTTP API was later implemented and runtime verified in the dedicated section below.

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
- Superseded note: Teacher Assignment management API endpoints were later implemented and runtime verified.
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
11. Superseded note: Teacher Assignment API/controller was later implemented and runtime verified.
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

## Admin Workspace Glass Navigation Runtime Verification

Runtime test date: 2026-07-08

### Scope

This frontend/browser verification covered the refreshed Lexora glass dashboard experience and the reorganized Admin workspace navigation.

Verified scope:

- Admin dashboard module navigation in the left sidebar.
- `/admin` default Overview view.
- Section-based Admin workspace URLs using `section` query state.
- Main workspace rendering only the selected Admin module instead of stacking every Admin panel vertically.
- Overview quick-link cards for Admin modules.
- Glass dashboard readability after sidebar contrast fixes.
- Native select/dropdown readability after scoped glass-theme CSS updates.

This scope intentionally did **not** change backend APIs, authentication, authorization, policy guards, request context, department isolation, database schema, or production deployment behavior.

### Related Commits

| Commit | Message |
|---|---|
| `bf2071b` | `Make Lexora surfaces fully glass themed` |
| `d3157d1` | `Improve Lexora sidebar glass contrast` |
| `8afa7a8` | `Reorganize admin workspace navigation` |

### Browser Runtime Verification

Runtime browser base URL:

- `http://192.168.197.129:3000`

Verified Admin workspace URLs:

- `http://192.168.197.129:3000/admin`
- `http://192.168.197.129:3000/admin?section=programs`
- `http://192.168.197.129:3000/admin?section=calendar`
- `http://192.168.197.129:3000/admin?section=courses`
- `http://192.168.197.129:3000/admin?section=offerings`
- `http://192.168.197.129:3000/admin?section=assignments`
- `http://192.168.197.129:3000/admin?section=users`

Observed behavior:

- [x] `/admin` opens the Overview view.
- [x] Admin modules are visible in the left sidebar.
- [x] Overview quick-link cards are visible in the main workspace.
- [x] Clicking or opening each Admin section URL renders the selected module in the main workspace.
- [x] Admin dashboard no longer requires scrolling through all Admin modules stacked vertically by default.
- [x] Sidebar contrast is readable with the glass theme.
- [x] Native select/dropdown option readability was checked in Chrome runtime and was acceptable after scoped CSS fixes.

### Validation

Local PC validation:

- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact restored before commit.
- [x] Local PC repository clean after commit and push.

Ubuntu server validation:

- [x] Server synced to `8afa7a8`.
- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `/admin` now builds as a dynamic route because it uses `searchParams` for section-based rendering.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact restored after validation.
- [x] Server repository clean after validation.

### Security / Boundary Notes

- [x] `ProtectedRoute` remains in place for dashboard routes.
- [x] No backend authorization or policy logic changed.
- [x] No department-isolation behavior changed.
- [x] No `localStorage` usage was introduced.
- [x] No `sessionStorage` usage was introduced.
- [x] Backend remains the source of truth for authorization.

### Limitations

- This is frontend/browser visual and navigation verification only.
- Native select popup styling can still vary by browser/OS, but runtime Chrome behavior was checked and accepted.
- This does not verify backend security behavior beyond confirming that this UI task did not change backend/auth/security code.

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
- [x] Teacher Assignment HTTP API: runtime verified.
- [x] Admin frontend teacher assignment management UI: runtime verified.
- [x] Dedicated student available/eligible course-offering endpoint: implemented and runtime verified as a safe MVP/foundation via `GET /api/v1/course-offerings/me`; full StudentProfile/progression-based eligibility remains pending.
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

1. Admin frontend teacher assignment management UI is runtime verified.
2. Dedicated student available/eligible course-offering endpoint is implemented and runtime verified as a safe MVP/foundation via `GET /api/v1/course-offerings/me`; full StudentProfile/progression-based eligibility remains pending.
3. Notice/notification frontend remains pending.
4. Secure file upload frontend remains pending until the secure upload pipeline is ready.

## Student Course Offering Visibility Endpoint Runtime Verification

### Runtime Verification Status

- [x] Feature status: implemented and runtime verified as a safe MVP/foundation.
- [x] Implemented endpoint: `GET /api/v1/course-offerings/me`.
- [x] Implementation commit verified on server:
  - Commit: `34748b4`
  - Message: `Add student course offering visibility endpoint`
- [x] Server fast-forwarded from `97bc4d7` to `34748b4`.
- [x] Backend validation passed on server:
  - `pnpm --filter @lexora/api typecheck`
  - `pnpm --filter @lexora/api build`
- [x] API process restarted with `pm2 restart lexora-api --update-env`.
- [x] Health endpoint returned `success: true` and `status: ok`.
- [x] Final server working tree was clean after runtime verification.

### Implementation Files

- `apps/api/src/modules/academic/application/ports/academic.repository.port.ts`
- `apps/api/src/modules/academic/application/services/academic.service.ts`
- `apps/api/src/modules/academic/infrastructure/repositories/prisma-academic.repository.ts`
- `apps/api/src/modules/academic/presentation/dto/list-my-course-offerings-query.dto.ts`
- `apps/api/src/modules/academic/presentation/http/course-offerings.controller.ts`

### Security and Authorization Behavior Verified

- [x] `GET /api/v1/course-offerings/me` is declared before `GET /api/v1/course-offerings/:id`, so `me` is not captured as an object ID.
- [x] Route uses the existing controller-level `AuthGuard` and `PolicyGuard`.
- [x] Route is protected by `ACADEMIC_POLICY_NAMES.ENROLLMENT_SELF_REQUEST`.
- [x] Student role was not granted broad `course-management.offering.read`.
- [x] Service layer includes an explicit student-role semantic check.
- [x] Admin and teacher are blocked from the student-only endpoint.
- [x] Query DTO accepts only `academicTermId`.
- [x] Client cannot provide `studentUserId`.
- [x] Client cannot provide `departmentId`.
- [x] `departmentId` comes from authenticated principal/request context.
- [x] `studentUserId` comes from authenticated actor ID.
- [x] Repository filtering uses own department and own approved enrollment-derived academic-term context.
- [x] Endpoint does not expose other students' enrollments.
- [x] Endpoint does not expose teacher assignments, teacher user details, raw credentials, tokens, or password hashes.
- [x] Response normalizes the authenticated student's own enrollment metadata as `myEnrollment`.
- [x] Raw `enrollments` array is removed from the endpoint response.

### Student-Visible Rule Implemented

- [x] Course offering must belong to the authenticated student's department.
- [x] Course offering must not be archived.
- [x] Course offering status must be `ENROLLMENT_OPEN` or `IN_PROGRESS`.
- [x] Course must be `ACTIVE` and not archived.
- [x] Academic term must belong to the same department and must not be archived.
- [x] Academic-term visibility context is derived from the same student's own non-archived `APPROVED` enrollment.
- [x] Optional `academicTermId` query acts only as an additional filter and cannot bypass the student's own enrollment-derived term context.
- [x] `visibilityStartAt` and `visibilityEndAt` are respected.
- [x] If no own enrollment-derived context exists, the endpoint safely returns an empty list.

### Runtime Fixture

- [x] Canonical student:
  - Email: `student.law@cu.ac.bd`
  - Department ID: `dept_law_test`
  - Status: `ACTIVE`
  - Role: `student`
- [x] Canonical student had approved enrollments in `term_law_2025_2026_s1`.
- [x] Positive visibility test used:
  - Course offering ID: `offering_0421_1101_2025_2026_s1_a`
  - Course code: `0421-1101`
  - Academic term ID: `term_law_2025_2026_s1`
  - Original offering status: `PLANNED`
- [x] The selected offering was temporarily changed to `ENROLLMENT_OPEN` for the positive student visibility test.
- [x] The selected offering was restored to `PLANNED` after testing.
- [x] Final restore verification confirmed:
  - `id`: `offering_0421_1101_2025_2026_s1_a`
  - `status`: `PLANNED`
  - `courseCode`: `0421-1101`
  - `academicTermId`: `term_law_2025_2026_s1`

### Runtime API Test Results

- [x] Admin login returned `HTTP 201`.
- [x] Teacher login returned `HTTP 201`.
- [x] Student login returned `HTTP 201`.
- [x] Unauthenticated `GET /api/v1/course-offerings/me` returned `HTTP 401`.
- [x] Student broad `GET /api/v1/course-offerings` remained blocked with `HTTP 403`.
- [x] Teacher `GET /api/v1/course-offerings/me` returned `HTTP 403`.
- [x] Admin `GET /api/v1/course-offerings/me` returned `HTTP 403`.
- [x] Student `GET /api/v1/course-offerings/me` returned `HTTP 200` with count `1`.
- [x] Student `GET /api/v1/course-offerings/me?academicTermId=term_law_2025_2026_s1` returned `HTTP 200` with count `1`.
- [x] Student `GET /api/v1/course-offerings/me?academicTermId=term_bus_2025_2026_s1` returned `HTTP 200` with count `0`.
- [x] Response forbidden-field scan found no forbidden fields.
- [x] Response included `myEnrollment`.
- [x] Response did not include raw `enrollments`.
- [x] Response did not include `teacherAssignments`.
- [x] Runtime response confirmed:
  - Offering ID: `offering_0421_1101_2025_2026_s1_a`
  - Offering status during positive test: `ENROLLMENT_OPEN`
  - Course code: `0421-1101`
  - Academic term ID: `term_law_2025_2026_s1`
  - `myEnrollment.status`: `APPROVED`
  - `myEnrollment.eligibilityStatus`: `PENDING_REVIEW`
- [x] `lexora-api` remained online in PM2.
- [x] Health endpoint returned `success: true` and `status: ok`.

### Runtime Verdict

- [x] Dedicated student course-offering visibility endpoint is implemented.
- [x] Dedicated student course-offering visibility endpoint is runtime verified as a safe MVP/foundation.
- [x] Student broad course-offering route remains blocked.
- [x] Student-only route blocks unauthenticated, teacher, and admin access.
- [x] Student route enforces authenticated department and own approved enrollment-derived academic-term context.
- [x] Cross-term direct query did not bypass scoping.
- [x] Response shape avoided raw enrollment array, teacher assignments, teacher details, and other student data.

### Remaining Limitation / Future Hardening

- [ ] Full academic progression/profile-based course-offering eligibility remains pending.
- [ ] Current Prisma schema does not yet include a dedicated `StudentProfile`, current semester, batch, program-placement, or progression model.
- [ ] The current implementation intentionally derives student-visible academic-term context from the student's own approved enrollment records.
- [ ] Future progression work should add proper student academic placement/profile metadata and enforce own program/year/semester eligibility directly from that source of truth.
- [ ] Future student self-enrollment flow should reuse this department-scoped, backend-side visibility rule and add any additional approval/self-enrollment configuration checks without weakening existing authorization.


## Landing Carousel and Dashboard Responsive Runtime Verification

Runtime test date: 2026-07-22

### Scope

This runtime update verified two frontend visual/runtime improvements:

- dashboard responsive layout fix for narrow browser widths
- landing page background carousel using the existing Law faculty image plus additional optimized landing images

This scope was intentionally frontend-only visual/runtime work. It did **not** add real LMS dashboard business metrics, backend APIs, database changes, or authorization changes.

### Related Commits

| Commit | Message |
|---|---|
| `97bc4d7` | `Improve dashboard responsive layout` |
| `0265924` | `Add landing background carousel` |

### Dashboard Responsive Layout Verification

Implementation focus:

- dashboard shell layout stacks safely on narrow widths
- sidebar/main content use safer responsive sizing
- admin module navigation remains reachable on small screens
- logout/session block remains visible/reachable on narrow screens
- admin quick links and form grids avoid switching to two columns too early
- student enrolled-course cards wrap safely on narrow screens
- teacher assigned-course table uses horizontal scrolling instead of squeezed/overlapping columns

Runtime/browser result:

- [x] Dashboard responsive layout was browser-verified by the user.
- [x] Narrow browser width behavior was accepted.
- [x] Logout remained visible/reachable.
- [x] Admin dashboard no longer showed the previous cramped/overlap issue.
- [x] Fullscreen dashboard layout remained acceptable.
- [x] Sign-in/dashboard visual behavior remained acceptable after the responsive fix.

### Landing Background Carousel Verification

Implementation files:

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/home/landing-background-carousel.tsx`

Landing image assets added:

- `apps/web/public/images/landing/law-faculty-01.jpg`
- `apps/web/public/images/landing/law-faculty-02.jpg`
- `apps/web/public/images/landing/law-faculty-03.jpg`

Carousel images used:

- `/images/Law_Faculty.jpg`
- `/images/landing/law-faculty-01.jpg`
- `/images/landing/law-faculty-02.jpg`
- `/images/landing/law-faculty-03.jpg`

Carousel behavior:

- [x] Landing-only client component added.
- [x] Smooth opacity crossfade used.
- [x] Slide cycle is `4000ms`.
- [x] Transition duration is `1000ms`.
- [x] Each image remains visually stable for roughly 3 seconds before the fade transition.
- [x] `prefers-reduced-motion` is respected by disabling rotation and showing the first image.
- [x] Landing text, CU logo, HEAT logo, motto, institutional description, and Enter Lexora CTA were preserved.
- [x] Carousel applies only to the public landing page.
- [x] Sign-in and dashboard backgrounds remain unchanged.

Runtime/browser result:

- [x] Landing background carousel was browser-verified by the user.
- [x] Image rotation worked correctly.
- [x] Fade behavior was accepted.
- [x] Text readability remained acceptable.
- [x] Narrow/mobile-like landing layout remained acceptable.
- [x] User final runtime confirmation: `সব ঠিক আছে।`

### Local and Server Validation Evidence

Local PC validation before commit:

- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `git diff --check` passed, with only expected Windows LF/CRLF warnings.
- [x] `apps/web/tsconfig.tsbuildinfo` build artifact restored.
- [x] No `localStorage` or `sessionStorage` usage was introduced.

Server validation:

- [x] Server fast-forwarded from `6c23ed8` to `0265924`.
- [x] Server received the three landing image assets.
- [x] Server received `apps/web/src/components/home/landing-background-carousel.tsx`.
- [x] `pnpm --filter @lexora/web typecheck` passed on server.
- [x] `pnpm --filter @lexora/web build` passed on server.
- [x] Next.js production build included `/`, `/sign-in`, `/admin`, `/teacher`, `/student`, `/forgot-password`, and `/verify/[code]`.
- [x] `/` route size after carousel was `7.92 kB`, which was accepted for this visual enhancement.
- [x] Dev preview started with:
  - `pnpm exec next dev --hostname 0.0.0.0 --port 3000`
- [x] Dev server became ready.
- [x] Browser runtime URL used:
  - `http://192.168.197.129:3000/`

### Security / Boundary Notes

- [x] This work was frontend-only visual/runtime work.
- [x] No backend API files were modified.
- [x] No Prisma schema or migration was changed.
- [x] No `AuthGuard` logic was changed.
- [x] No `PolicyGuard` logic was changed.
- [x] No `@RequirePolicy()` usage was changed.
- [x] No request-context logic was changed.
- [x] No department-isolation behavior was changed.
- [x] No object-level authorization logic was changed.
- [x] `ProtectedRoute` remains in place for dashboard routes.
- [x] Homepage remains public.
- [x] Enter Lexora remains auth-aware:
  - anonymous users route to `/sign-in`
  - `department_admin` users route to `/admin`
  - `teacher` users route to `/teacher`
  - `student` users route to `/student`
- [x] Access token remains memory-only.
- [x] Refresh token remains httpOnly cookie-based.
- [x] No `localStorage` token persistence was introduced.
- [x] No `sessionStorage` token persistence was introduced.
- [x] Backend remains the source of truth for authorization and department scoping.
- [x] No raw access tokens, refresh tokens, cookie values, passwords, password hashes, DB credentials, production secrets, or sensitive runtime tokens are documented here.

### Limitations

- This is frontend/browser visual and responsive runtime verification only.
- This does not verify backend security behavior beyond confirming that this UI task did not change backend/auth/security code.
- Landing image performance is acceptable for current optimized test assets, but should be revisited if many more or larger images are added later.
- No real dashboard business metrics/widgets were added by this task.
- Notice/notification frontend remains pending.
- Secure file upload frontend remains pending until the secure upload pipeline is ready.

### Updated Next Test Steps After Landing Carousel and Responsive Verification

Recommended next runtime/frontend steps:

1. Continue preserving homepage as public while keeping protected workspace actions gated.
2. Continue preserving memory-only access token, httpOnly refresh cookie, and no `localStorage`/`sessionStorage` token persistence.
3. Do not add real dashboard business widgets/metrics until role-specific dashboard scope is defined.
4. Notice/notification frontend remains pending.
5. Secure file upload frontend remains pending until the secure upload pipeline is ready.
6. Future landing image additions should keep file sizes optimized and should not change global backgrounds for sign-in/dashboard pages.


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
- [x] Superseded note: Because Teacher Assignment HTTP API was still pending during this earlier frontend verification, a controlled runtime DB upsert was used only to assign canonical `teacher.law@cu.ac.bd` to the existing `LAW-101` course offering for verification continuity.
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
- [x] Superseded by the Teacher Assignment HTTP API Runtime Verification section; the API foundation is now runtime verified.

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

## Teacher Assignment HTTP API Runtime Verification

### Runtime Verification Status

- [x] Feature status: runtime verified for the Teacher Assignment HTTP API foundation.
- [x] Implemented commit verified on server:
  - Commit: `b6dcb3e`
  - Message: `Add teacher assignment API foundation`

### Implemented

- [x] API foundation for assigning, listing, and unassigning teachers from course offerings.
- [x] Endpoints:
  - `POST /api/v1/course-offerings/:id/teacher-assignments`
  - `GET /api/v1/course-offerings/:id/teacher-assignments`
  - `POST /api/v1/teacher-assignments/:id/unassign`
- [x] Protected by `AuthGuard` and `PolicyGuard`.
- [x] Uses `@RequirePolicy(ACADEMIC_POLICY_NAMES.TEACHER_ASSIGNMENT_MANAGE)`.
- [x] `ACADEMIC_POLICY_NAMES.TEACHER_ASSIGNMENT_MANAGE` maps to `course-management.teacher-assignment.manage`.
- [x] Service-level management requires `department_admin`.
- [x] Teacher assignment create validates:
  - Course offering belongs to the active department.
  - Teacher user belongs to the active department.
  - Teacher user has an active, non-revoked teacher role in the active department.
  - Linked role is department-scoped.
  - `roleCode` uses safe slug-style validation.
- [x] Unassign does not hard-delete.
- [x] Unassign sets status to `INACTIVE` and sets `unassignedAt`.
- [x] Audit events added:
  - `course-management.teacher-assignment.assigned`
  - `course-management.teacher-assignment.unassigned`

### Static And Server Verification

- [x] Local API typecheck passed.
- [x] Local API build passed.
- [x] Server fast-forwarded to `b6dcb3e`.
- [x] Server API typecheck passed.
- [x] Server API build passed.
- [x] PM2 restart `lexora-api` passed.
- [x] Health endpoint through Nginx returned `HTTP 200 OK`.

### Runtime Verified

- [x] Admin login returned `201`.
- [x] Teacher login returned `201`.
- [x] Student login returned `201`.
- [x] Teacher user ID was found.
- [x] Student user ID was found.
- [x] Unassigned test offering was found.
- [x] Unauthenticated list returned `401`.
- [x] Teacher assignment attempt returned `403`.
- [x] Student assignment attempt returned `403`.
- [x] Bad `roleCode` assignment returned `400`.
- [x] Non-teacher user assignment returned `400`.
- [x] Admin assignment returned `201`.
- [x] Assignment ID was returned.
- [x] Admin list assignments returned `200`.
- [x] Listed assignment count was `1`.
- [x] Admin unassign returned `201`.
- [x] Unassigned assignment status was `INACTIVE`.
- [x] `unassignedAt` was present.
- [x] Teacher `GET /api/v1/course-offerings` after assign returned `200`.
- [x] Teacher saw the test offering after assignment.
- [x] Teacher `GET /api/v1/course-offerings` after unassign returned `200`.
- [x] Teacher no longer saw the test offering after unassign.
- [x] `audit_logs` columns include `occurred_at`, not `created_at`.
- [x] Recent teacher assignment audit rows included:
  - `course-management.teacher-assignment.unassigned|teacher_course_assignment`
  - `course-management.teacher-assignment.assigned|teacher_course_assignment`

### Preserved

- [x] Existing teacher-scoped `GET /api/v1/course-offerings` filtering was preserved.
- [x] Department isolation model was preserved.
- [x] `AuthGuard`, `PolicyGuard`, and `@RequirePolicy()` were preserved.
- [x] No hard delete is used for unassign.
- [x] No tokens, passwords, cookies, DB URLs, password hashes, or secrets are documented.

### Script Note

- [x] First runtime script mistakenly treated login `HTTP 201` as failure and used `exit` directly in the interactive SSH shell, which closed the SSH session.
- [x] This was a test-script issue, not an API/server failure.
- [x] Corrected script accepted `200` or `201` login responses and executed from a temporary script file so SSH remained alive.

### Pending

- [x] Superseded note: Admin frontend UI for teacher assignment management was later implemented and runtime verified in the Admin Teacher Assignment Frontend Runtime Verification section.
- [ ] More exhaustive cross-department direct-object negative testing may still be added later if not already covered by broader academic isolation tests.

### Runtime Verdict

- [x] Teacher Assignment HTTP API foundation is implemented and runtime verified.
- [x] Admin assign/list/unassign passed.
- [x] Teacher, student, and unauthenticated assignment management attempts were blocked.
- [x] Invalid `roleCode` and non-teacher assignment attempts were blocked.
- [x] Teacher sees assigned offering after assign and no longer sees it after unassign.
- [x] Assignment audit rows are present.

## Admin Teacher Assignment Frontend Runtime Verification

### Runtime Test Date

- 2026-07-02

### Related Commit

- Commit: `838c9aa`
- Message: `Add admin teacher assignment workflow`

### Implementation Summary

- [x] Added `AdminTeacherAssignmentsPanel` to the Admin dashboard on `/admin` after Course Offerings.
- [x] Added teacher assignment management UI for selecting a course offering, listing assignments, assigning active teachers, and unassigning active assignment rows.
- [x] Used managed users for the teacher dropdown instead of raw `teacherUserId` entry.
- [x] Filtered teacher choices to active users with the `teacher` role.
- [x] Kept the UI minimal and academic.

Implementation files:

- `apps/web/src/components/admin/admin-teacher-assignments-panel.tsx`
- `apps/web/src/app/(dashboard)/admin/page.tsx`
- `apps/web/src/lib/api-client.ts`

### API Helpers Added

- [x] `listTeacherAssignmentsForCourseOffering`
- [x] `assignTeacherToCourseOffering`
- [x] `unassignTeacherAssignment`

### Browser Runtime Verification Checklist

- [x] Admin `/admin` page showed the Teacher assignments panel.
- [x] Course offering dropdown loaded.
- [x] Selecting a course offering loaded teacher assignments.
- [x] Active teacher dropdown loaded.
- [x] `roleCode` defaulted to `primary_instructor`.
- [x] Assign action succeeded and showed a success message.
- [x] Assignment list refreshed and showed the active assignment row.
- [x] Active assignment row showed the Unassign action.
- [x] Unassign action showed a confirmation dialog.
- [x] Confirming unassign changed the assignment to inactive/unassigned state.
- [x] Existing inactive assignment rows remained visible as history.
- [x] UI remained minimal and academic.

### Server Validation Evidence

- [x] Server fast-forwarded to `838c9aa`.
- [x] `pnpm --filter @lexora/web typecheck` passed.
- [x] `pnpm --filter @lexora/web build` passed.
- [x] `/admin` route built successfully.

### Security Posture Preserved

- [x] No backend code changed.
- [x] No `AuthGuard`, `PolicyGuard`, `RequirePolicy`, request context, or department-isolation code changed.
- [x] No `localStorage` or `sessionStorage` token persistence was introduced.
- [x] Access token remains memory-only through the existing `AuthProvider`.
- [x] Refresh token remains httpOnly cookie-based.
- [x] Backend remains the source of truth for assignment authorization.
- [x] UI only calls protected API endpoints.
- [x] No raw tokens, passwords, cookies, DB URLs, password hashes, or secrets are documented.

### Current Limitations / Remaining Pending Work

- [x] This verifies Admin frontend teacher assignment management UI.
- [ ] Dedicated student available/eligible course-offering endpoint remains pending.
- [ ] Notice/notification frontend remains pending.
- [ ] Secure file upload frontend remains pending.

### Runtime Verdict

- [x] Admin Teacher Assignment frontend workflow is implemented and runtime verified.
- [x] Admin can select a course offering, list teacher assignments, assign an active teacher, and unassign an active assignment through the UI.
- [x] Assignment history remains visible after unassign.
- [x] Existing backend authorization, token handling, and department-scoping architecture were preserved.

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


## Secure File Storage Core Foundation Server Deployment and Static Verification

Runtime verification date: 2026-07-23

### Implementation Commit

- [x] Commit: `d58016c`
- [x] Message: `Harden secure file storage core foundation`
- [x] Commit was pushed to `origin/main`.
- [x] Ubuntu runtime server fast-forwarded from `18a199d` to `d58016c`.

### Scope and Implementation Status

This phase implemented and hardened the internal Secure File Storage core foundation.

Implemented foundation:

- [x] Strongly typed file metadata, scan result, lifecycle, archive, and quarantine contracts.
- [x] Internal File Storage application service.
- [x] Department-scoped Prisma repository.
- [x] Object-storage adapter port.
- [x] Malware-scanner adapter port.
- [x] File-content-inspector adapter port.
- [x] File lifecycle transition policy.
- [x] Safe File Storage audit-event constants.
- [x] Dependency-free filename sanitization.
- [x] Pending-file metadata validation.
- [x] Safe diagnostic metadata normalization and hardening.
- [x] Soft archive and delete lifecycle transitions.

This phase intentionally did not add:

- [ ] HTTP upload or download controller.
- [ ] Public or authenticated File Storage route.
- [ ] S3 or MinIO object-storage implementation.
- [ ] Operational malware-scanner implementation.
- [ ] Real content-signature or magic-number inspector.
- [ ] Signed URL or controlled-proxy delivery.
- [ ] Assignment, class-material, notice, discussion, or transcript attachment workflow.
- [ ] Prisma schema change.
- [ ] Prisma migration.
- [ ] Frontend upload or download UI.
- [ ] Docker or environment configuration change.
- [ ] Authorization role-mapping change.

### Security and Lifecycle Behavior

Verified foundation behavior:

- [x] Actor identity and active department are derived from authenticated request context.
- [x] Client-provided department scope cannot replace the authenticated principal's active department.
- [x] Repository reads and writes include department scope.
- [x] Cross-department metadata lookup returns safe not-found behavior.
- [x] Generic safe metadata excludes raw storage bucket and object key.
- [x] The repository token remains internal to the File Storage module.
- [x] Uploader identity alone is not treated as future download authorization.
- [x] Scan results may be persisted only while a file is `PENDING_SCAN`.
- [x] Trusted scan outcomes are restricted to:
  - `CLEAN`
  - `INFECTED`
  - `ERROR`
- [x] `PENDING` and `SKIPPED` are rejected by the trusted scan-recording boundary.
- [x] A file can transition to `AVAILABLE` only when its latest persisted scan is `CLEAN`.
- [x] Missing, `INFECTED`, or `ERROR` latest scan results cannot activate a file.
- [x] `QUARANTINED`, `ARCHIVED`, and `DELETED` files cannot be reactivated.
- [x] Archive and delete are soft lifecycle state changes; no hard-delete repository operation was added.
- [x] Lifecycle and scan persistence use serializable Prisma transactions.
- [x] Audit failures propagate and are not silently ignored.

### Filename and Internal Metadata Hardening

Verified validation behavior:

- [x] Filename traversal and path components are removed.
- [x] Control characters are removed.
- [x] Bidi display controls are removed.
- [x] Zero-width characters and BOM are removed.
- [x] Unicode NFKC normalization is applied.
- [x] Genuine বাংলা and accented Latin filename text is preserved.
- [x] Filename length is bounded.
- [x] SHA-256 must contain exactly 64 hexadecimal characters.
- [x] SHA-256 is normalized to lowercase.
- [x] File size must be a positive safe integer within the current PostgreSQL integer limit.
- [x] Empty MIME, bucket, and object-key values are rejected.
- [x] Leading slash, backslash, control characters, empty segments, `.` segments, and `..` segments are rejected in object keys.
- [x] Object keys whose final segment is derived from the sanitized display filename are rejected.
- [x] Valid opaque internal object keys remain accepted.

### Diagnostic Metadata Hardening

Verified diagnostic metadata behavior:

- [x] Only JSON-safe values are accepted.
- [x] Binary and custom object instances are rejected.
- [x] Non-finite numbers are rejected.
- [x] Serialized size is bounded.
- [x] Nesting depth is bounded.
- [x] Secret, credential, token, raw-content, payload, signed-URL, environment, and file-byte style keys are rejected.
- [x] Prototype-pollution keys are recursively rejected:
  - `__proto__`
  - `prototype`
  - `constructor`
- [x] Root and nested prototype-pollution test cases passed without modifying `Object.prototype`.
- [x] Absent diagnostic metadata is omitted from Prisma JSON create data rather than being written as an unsafe JavaScript `null`.

### Local PC Verification

Local validation before commit:

| Validation | Result |
|---|---|
| API typecheck | Passed |
| API build | Passed |
| Focused File Storage tests | 60 passed, 0 failed, 0 skipped |
| File Storage Prettier check | Passed |
| Git diff integrity check | Passed |
| Staged diff integrity check | Passed |
| Commit and push | Passed |
| Final local working tree | Clean |

Focused tests used:

- a fake File Storage repository;
- pure validation and Prisma JSON helper tests.

No real database or Prisma integration test was performed in this phase.

### Ubuntu Server Deployment and Verification

Server validation after fast-forwarding to `d58016c`:

| Validation | Result |
|---|---|
| Server fast-forward from `18a199d` to `d58016c` | Passed |
| Server API typecheck | Passed |
| Server API build | Passed |
| Focused File Storage tests | 60 passed, 0 failed, 0 skipped |
| PM2 restart | Passed |
| `lexora-api` PM2 status | Online |
| API listener at `127.0.0.1:4000` | Verified |
| Direct API health | Passed |
| Nginx-proxied API health | Passed |
| Nginx service status | Active |
| Nginx boot enablement | Enabled |
| Final server repository status | Clean |

Verified direct health endpoint:

- `http://127.0.0.1:4000/api/v1/health`

Verified Nginx-proxied health endpoint:

- `http://127.0.0.1/api/v1/health`

Both endpoints returned a successful Lexora API health response.

### PM2 Startup-Timing Observation

- The first direct health check was executed immediately after the PM2 restart.
- PM2 uptime was effectively zero at that moment.
- The immediate check returned connection refused because the API listener had not completed startup.
- A retry after startup completed passed on the first retry attempt.
- Direct API health and Nginx-proxied health both passed.
- The API was verified listening only on `127.0.0.1:4000`.
- This matched the previously observed PM2/Nginx startup-timing behavior.
- The initial connection refusal was not treated as a persistent API, Nginx, or File Storage defect.

The PM2 cumulative error log displayed historical `NoticeService` dependency errors dated 2026-05-21. Those entries were not from the current startup. The current process logged `Nest application successfully started` and passed both health checks.

### Security Boundaries Preserved

This implementation did not weaken or change:

- [x] `AuthGuard`
- [x] `PolicyGuard`
- [x] `@RequirePolicy()`
- [x] request-context behavior
- [x] principal department isolation
- [x] object-level authorization rules
- [x] teacher assigned-course checks
- [x] student own-resource checks
- [x] result publication and amendment controls
- [x] transcript immutability and verification controls
- [x] attendance security controls
- [x] notification isolation
- [x] existing sensitive-action audit behavior

No raw token, password, cookie, database credential, production secret, object-storage credential, or private runtime object key was added to documentation.

### Current Limitations and Pending Work

The following remain pending:

- [ ] S3-compatible or MinIO object-storage adapter.
- [ ] Real quarantine byte storage.
- [ ] Magic-number and content-signature inspection.
- [ ] Extension allowlist and canonical MIME consistency pipeline.
- [ ] Operational malware-scanner adapter.
- [ ] Real scan orchestration over stored object bytes.
- [ ] Permission-controlled signed URL or controlled backend proxy delivery.
- [ ] Attachment-resource authorization for assignments, class materials, notices, discussions, and transcript artifacts.
- [ ] Database-backed Prisma repository integration tests.
- [ ] Database-backed concurrency and serializable-transaction tests.
- [ ] Serializable transaction retry handling where required.
- [ ] Storage quotas.
- [ ] Audit and lifecycle mutation atomicity.
- [ ] Secure upload and download frontend.
- [ ] Full upload/download runtime verification.

Audit writes and lifecycle mutations are currently sequential rather than atomic. Audit failures propagate, but a state mutation may already have succeeded before a later audit failure.

### Runtime Verdict

- [x] Secure File Storage core foundation is implemented.
- [x] Security-focused source review passed.
- [x] Commit and push passed.
- [x] Server deployment passed.
- [x] API boot verification passed.
- [x] Sixty focused non-database tests passed locally and on the server.
- [ ] Real object-storage operations are not implemented or runtime verified.
- [ ] Full secure upload/download pipeline is not complete.
- [ ] Production file upload must remain disabled.

Correct status:

> Secure File Storage core foundation is implemented, committed, server-deployed, boot-verified, and covered by 60 focused non-database tests. Real object-storage operations, content inspection, malware-scanner integration, permission-controlled delivery, domain attachment integration, database-backed concurrency testing, audit atomicity, and full upload/download runtime verification remain pending.

### Next Safe File Storage Phase

Recommended next focused phase:

1. Implement an S3-compatible quarantine object-storage adapter.
2. Implement the trusted file-content inspector.
3. Implement the operational malware-scanner adapter.
4. Add database-backed repository and concurrency tests.
5. Preserve production upload as P0-blocked until the complete secure pipeline is runtime verified.
6. Do not enable assignment, class-material, notice, discussion, or other attachment uploads before the secure pipeline is complete.

## S3-Compatible Quarantine Object-Storage Adapter Static Deployment Verification — 2026-07-23

### Scope

This section records implementation, source-review, local verification, server deployment, build, boot, and focused fake-client test evidence for the S3-compatible quarantine object-storage adapter.

This evidence does not claim successful real MinIO or external S3 object operations.

Verified implementation commit:

| Purpose | Commit |
|---|---|
| Secure S3-compatible quarantine object-storage adapter | `06fc4c5` |

Commit message:

- `Add secure S3 quarantine storage adapter`

### Implemented Adapter Foundation

The adapter implements the existing internal `ObjectStoragePort` for:

- quarantine object creation;
- object streaming read;
- object metadata lookup;
- quarantine-to-available promotion;
- object deletion;
- short-lived signed read URL creation for available objects.

Implemented storage commands include:

- `PutObjectCommand`
- `GetObjectCommand`
- `HeadObjectCommand`
- `CopyObjectCommand`
- `DeleteObjectCommand`
- AWS SDK v3 signed URL generation

No upload controller, download controller, frontend upload UI, scanner, content inspector, attachment integration, or production upload enablement was added in this phase.

### Security and Integrity Controls Verified

- [x] The configured private bucket is enforced.
- [x] Callers cannot select arbitrary buckets.
- [x] Quarantine creation accepts only controlled `quarantine/` keys.
- [x] Promotion accepts only deterministic matching `quarantine/` to `available/` keys.
- [x] Available-object signed URLs reject quarantine keys.
- [x] Leading slashes, backslashes, control characters, empty segments, dot segments, traversal segments, uncontrolled prefixes, and segment-edge whitespace are rejected.
- [x] Object keys remain opaque and are not derived from display filenames.
- [x] No public ACL is sent.
- [x] ETags are not treated as SHA-256 checksums.
- [x] Provider ETags are retained only as internal copy-concurrency tokens.
- [x] Source mutation is guarded with `CopySourceIfMatch` when the provider supplies an ETag.
- [x] Quarantine creation uses destination conditional-write protection.
- [x] Promotion uses destination conditional-write protection.
- [x] The custom copy middleware fails closed if mutable serialized request headers are unavailable.
- [x] The real command middleware stack is tested to insert `if-none-match: *`.
- [x] Existing destinations are not accepted through size-only comparison.
- [x] Existing source-plus-destination cleanup requires matching size and trustworthy checksums.
- [x] Missing checksums require reconciliation rather than automatic source deletion.
- [x] Copy, precondition, verification, and conditional-conflict failures retain the quarantine source.
- [x] Source deletion happens only after destination verification.
- [x] Cleanup failure after a verified copy reports reconciliation-required state.
- [x] Raw credentials, signed URLs, endpoint details, object content, and private object keys are not logged.
- [x] Raw S3 client and signer providers remain internal to `FileStorageModule`.
- [x] Adapter registration does not perform an object-storage network request during Nest startup.

### Dependency and Lockfile Evidence

The repository now tracks the root `pnpm-lock.yaml`.

Verified packages:

| Package | Version |
|---|---|
| `@aws-sdk/client-s3` | `3.1093.0` |
| `@aws-sdk/s3-request-presigner` | `3.1093.0` |

Server installation used:

- `pnpm install --frozen-lockfile`
- pnpm version `10.10.0`

The frozen-lockfile installation passed.

### Local Verification Evidence

Local verification passed for:

- [x] focused File Storage lint using the repository's existing legacy ESLint configuration;
- [x] API TypeScript typecheck;
- [x] API build;
- [x] File Storage Prettier check;
- [x] `git diff --check`;
- [x] five compiled File Storage test files;
- [x] 106 focused tests;
- [x] 0 failures;
- [x] 0 skipped tests.

The ESLint legacy `.eslintrc` deprecation warning is a tooling-migration notice and did not represent a lint failure.

### Server Deployment and Verification Evidence

Server repository:

- Path: `~/lexora_lms`
- Previous commit: `12b1899`
- Deployed commit: `06fc4c5`

Verified server results:

| Check | Result |
|---|---|
| Git fast-forward | Passed |
| Server `HEAD` equals `origin/main` | Passed |
| Frozen lockfile installation | Passed |
| AWS SDK dependency verification | Passed |
| API typecheck | Passed |
| API build | Passed |
| Compiled File Storage test files | 5 |
| Focused File Storage tests | 106 passed |
| Failed tests | 0 |
| Skipped tests | 0 |
| PM2 restart | Passed |
| `lexora-api` PM2 status | Online |
| Direct API health | Passed |
| Nginx-proxied API health | Passed |
| API listener | `127.0.0.1:4000` |
| Final server repository status | Clean |

Verified health endpoints:

- Direct API: `http://127.0.0.1:4000/api/v1/health`
- Nginx-proxied API: `http://127.0.0.1/api/v1/health`

### PM2 Startup-Timing Observation

- The first direct health request was executed immediately after PM2 restart.
- That first request returned connection refused because the API listener had not completed startup.
- The second health attempt passed.
- Nginx-proxied health also passed.
- The current process logged `Nest application successfully started`.
- The API was verified listening only on `127.0.0.1:4000`.

PM2 cumulative logs also displayed historical `NoticeService` dependency errors dated `2026-05-21`.

Those errors were not generated by the current `2026-07-23` startup and were superseded by the successful current startup and health evidence.

### Current Limitations and Pending Work

The following remain pending:

- [ ] Real MinIO or external S3 connectivity.
- [ ] Real quarantine object byte upload.
- [ ] Real `HeadObject`, `GetObject`, `CopyObject`, and `DeleteObject` operations.
- [ ] Real destination conditional-write behavior against the selected object-storage provider.
- [ ] Real signed URL creation and external-client delivery.
- [ ] Safe MinIO or S3 infrastructure provisioning.
- [ ] Private bucket policy runtime verification.
- [ ] Persistent object-storage volume verification.
- [ ] Magic-number and content-signature inspection.
- [ ] Extension allowlist and canonical MIME consistency pipeline.
- [ ] Operational malware-scanner adapter.
- [ ] Real scan orchestration over stored object bytes.
- [ ] Permission-controlled signed URL or controlled backend-proxy delivery.
- [ ] Attachment-resource authorization for assignments, class materials, notices, discussions, and transcript artifacts.
- [ ] Database-backed repository and concurrency tests.
- [ ] Serializable transaction retry handling where required.
- [ ] Storage quotas.
- [ ] Audit and lifecycle mutation atomicity.
- [ ] Secure upload and download frontend.
- [ ] Full upload/download runtime verification.

Production file upload must remain disabled.

Assignment, class-material, notice, discussion, recorded-class, transcript-artifact, and other attachment uploads must not be enabled until the complete secure pipeline is implemented and runtime verified.

### Runtime Verdict

- [x] S3-compatible quarantine object-storage adapter is implemented.
- [x] Security-focused source review passed.
- [x] Independent local verification passed.
- [x] Commit and push passed.
- [x] Server deployment passed.
- [x] Frozen lockfile dependency installation passed.
- [x] API typecheck and build passed locally and on the server.
- [x] API boot verification passed.
- [x] 106 focused fake-client tests passed locally and on the server.
- [ ] Real object-storage operations are not runtime verified.
- [ ] Full secure upload/download pipeline is not complete.
- [ ] Production file upload is not enabled.

Correct status:

> The S3-compatible quarantine object-storage adapter is implemented, source-reviewed, independently locally verified, committed, pushed, server-deployed, server-built, boot-verified, and covered by 106 focused fake-client tests locally and on the server. Real MinIO or S3 connectivity, real object operations, content inspection, malware scanning, permission-controlled delivery, attachment integration, and full upload/download runtime verification remain pending.

### Supersession Note

The earlier Secure File Storage core-foundation section listed the S3-compatible or MinIO object-storage adapter as pending.

That specific adapter-implementation item is superseded by this section.

The earlier limitations concerning real object-storage operations, content inspection, malware scanning, permission-controlled delivery, attachment integration, database-backed testing, quotas, audit atomicity, frontend upload/download, and full runtime verification remain valid.

## Isolated MinIO Evaluation Runtime Source Deployment and Static Verification — 2026-07-23

### Scope

This checkpoint records the implementation, security review, commit, server synchronization, and static verification of an isolated MinIO evaluation runtime definition for the Lexora S3-compatible object-storage adapter.

This is an evaluation-only source and infrastructure foundation.

This checkpoint does not claim:

- a successful MinIO image build;
- container startup;
- real MinIO connectivity;
- successful IAM bootstrap execution;
- real object-storage operations;
- persistence verification;
- production object-storage readiness;
- production upload enablement.

### Related Commit

| Purpose | Commit |
|---|---|
| Isolated MinIO evaluation runtime source | `3c8f8a4` |

Commit message:

- `Add isolated MinIO evaluation runtime`

Full verified commit:

- `3c8f8a4514768ef11d5854de21be777ab170c016`

### Implemented Files

The evaluation runtime is isolated under:

- `ops/object-storage/minio-evaluation/`

Tracked files include:

- `compose.yml`
- `Dockerfile.minio`
- `bootstrap.sh`
- `validate.sh`
- `README.md`

Related repository changes include:

- focused LF rules in `.gitattributes`;
- removal of legacy MinIO services from the root `docker-compose.yml`;
- safe example-environment updates;
- repository documentation updates.

### Evaluation Boundary

The dedicated Compose definition contains only:

- `minio`
- `minio-init`

It does not include or modify:

- Lexora API;
- Nginx;
- PostgreSQL;
- Redis;
- pgAdmin;
- MailPit;
- ClamAV.

The existing PM2 API, host PostgreSQL, and Nginx runtime remain separate and unchanged.

### Source-Build Pinning

The evaluation runtime uses immutable upstream source references.

| Component | Reference |
|---|---|
| MinIO release label | `RELEASE.2025-10-15T17-29-55Z` |
| MinIO source commit | `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` |
| MinIO Client source commit | `7394ce0dd2a80935aded936b09fa12cbb3cb8096` |

Verified source-build controls:

- [x] No `latest` image is used.
- [x] The old `RELEASE.2025-04-22T22-12-26Z` server image was removed from the root Compose stack.
- [x] The old MinIO Client image was removed from the root Compose stack.
- [x] MinIO and MinIO Client are designed to build from pinned official source commits.
- [x] Detached commit checkout and exact `HEAD` verification are included.
- [x] Both build stages create the required `/out` directory.
- [x] No credentials are embedded in the Dockerfile or build arguments.

The upstream open-source MinIO repository is archived. This runtime is therefore explicitly classified as evaluation-only and is not the final maintained production provider decision.

### Network Exposure Controls

Verified source configuration:

- [x] S3 API host publication is restricted to `127.0.0.1:9000:9000`.
- [x] Port `9001` is not published to the host.
- [x] The MinIO console remains internal to the dedicated Compose network.
- [x] No Nginx route was added.
- [x] No LAN or public MinIO exposure was introduced.
- [x] The dedicated Compose network is internal.
- [x] The root Compose stack no longer contains MinIO host-port mappings.

### Secret and Identity Controls

The runtime requires an external directory through:

- `LEXORA_MINIO_SECRET_DIR`

Expected external secret files:

- `minio_root_user`
- `minio_root_password`
- `lexora_s3_access_key`
- `lexora_s3_secret_key`

Verified controls:

- [x] Secret values are not stored in tracked Compose, Dockerfile, scripts, README, or example environment files.
- [x] Root credentials and Lexora application credentials are separate.
- [x] Root and application identifiers must differ.
- [x] Root and application secret values must differ.
- [x] Missing, unreadable, empty, multiline, control-character, or whitespace-padded secret values are rejected.
- [x] Credential values are not printed.
- [x] The root identity is limited to startup and bootstrap administration.
- [x] The Lexora API is intended to use a dedicated application identity rather than the root identity.

### IAM and Bucket Policy Foundation

The bootstrap definition is designed to:

- wait for MinIO health;
- authenticate using root bootstrap credentials;
- create the configured bucket idempotently;
- explicitly keep anonymous access private;
- create or update the Lexora application policy;
- inspect an existing application user before modification;
- create or update the dedicated application user;
- attach the expected policy;
- verify the final policy and group state.

The application policy is scoped to:

- the configured Lexora bucket;
- `quarantine/*`;
- `available/*`.

Permitted object operations:

- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject`

Permitted bucket operations:

- `s3:GetBucketLocation`
- prefix-conditioned `s3:ListBucket`

The `s3:ListBucket` permission exists only to support missing-object semantics under:

- `quarantine/*`
- `available/*`

It does not permit unrestricted bucket browsing or access to unrelated prefixes.

Explicitly excluded:

- `admin:*`
- `s3:*`
- `s3:ListAllMyBuckets`
- console administration
- public or anonymous access
- unrelated buckets
- unrelated object prefixes

### Fail-Closed Application Identity State

Verified source behavior:

- [x] Only confirmed `XMinioAdminNoSuchUser` permits new-user creation.
- [x] Authentication, network, malformed JSON, and ambiguous failures stop bootstrap.
- [x] Existing direct policy must be empty or exactly the expected policy.
- [x] Existing group membership must be empty.
- [x] Final direct policy must equal exactly the expected policy.
- [x] Final group membership must be empty.
- [x] Final user state must be enabled.
- [x] Unexpected policy or group state fails closed.
- [x] No unknown policy is automatically detached.
- [x] No user is automatically deleted.
- [x] No group membership is automatically removed.
- [x] No unrelated identity or policy is modified.

### Container Hardening Foundation

The evaluation source includes:

- non-root runtime users;
- all Linux capabilities dropped;
- `no-new-privileges`;
- read-only root filesystems;
- bounded writable `tmpfs`;
- PID limits;
- CPU and memory limits;
- init handling;
- bounded log rotation;
- a dedicated persistent named volume;
- a health-aware `minio-init` dependency;
- no fixed sleep as the sole readiness control.

These settings are source-reviewed but remain runtime-unverified until containers are built and started.

### Local Source Verification

Local PC verification passed for:

- [x] security-focused source review;
- [x] shell syntax validation;
- [x] evaluation static validator;
- [x] YAML and Markdown formatting checks;
- [x] `git diff --check`;
- [x] CR-byte checks;
- [x] focused Git LF attributes;
- [x] exact changed-file review;
- [x] focused commit and push;
- [x] local `HEAD` matched `origin/main`;
- [x] local repository was clean after commit.

### Ubuntu Server Source Deployment and Static Verification

Server repository:

- Path: `~/lexora_lms`
- Previous commit: `804e587`
- Deployed commit: `3c8f8a4`

Verified server results:

| Check | Result |
|---|---|
| Git fetch and fast-forward | Passed |
| Server `HEAD` equals expected commit | Passed |
| Server `HEAD` equals `origin/main` | Passed |
| Expected committed files present | Passed |
| Runtime `.env` owner-only permissions | `600` |
| Runtime `.env` files untracked | Passed |
| Shell syntax validation | Passed |
| Evaluation static validator | Passed |
| CR-byte checks | Passed |
| Git LF attributes | Passed |
| Root Compose legacy MinIO removal | Passed |
| Isolated Compose service count | 2 |
| Isolated services | `minio`, `minio-init` |
| Loopback-only S3 publication | Passed |
| Host-published console absent | Passed |
| Immutable source pins present | Passed |
| External secret references present | Passed |
| Direct API health | Passed |
| Nginx-proxied API health | Passed |
| MinIO listeners on `9000/9001` | Absent |
| Container runtime installed | No |
| Image built | No |
| Container started | No |
| Final server repository status | Clean |

### Runtime Environment State at This Checkpoint

The following container commands were not installed:

- `docker`
- `dockerd`
- `containerd`
- `podman`

No process was listening on:

- port `9000`
- port `9001`

The existing Lexora API remained healthy through:

- `http://127.0.0.1:4000/api/v1/health`
- `http://127.0.0.1/api/v1/health`

No Docker installation, image build, container creation, secret generation, MinIO startup, IAM mutation, object upload, or object deletion occurred during this source-verification phase.

### Security Boundary Preservation

This phase did not:

- add upload or download HTTP routes;
- enable production uploads;
- expose MinIO to LAN or public networks;
- add an Nginx storage route;
- modify department authorization;
- modify object-level authorization;
- modify the File Storage lifecycle policy;
- weaken quarantine requirements;
- weaken scan requirements;
- enable assignment or class-material attachments;
- expose credentials, signed URLs, tokens, object keys, or stored object bytes.

Production upload remains disabled.

### Pending Runtime Work

The following remain pending:

- [ ] Install a reviewed container runtime and Compose plugin.
- [ ] Create the external owner-only secret directory.
- [ ] Generate distinct root and Lexora application credentials.
- [ ] Safely align the API S3 runtime credentials.
- [ ] Validate the Compose model with the installed runtime.
- [ ] Build the pinned MinIO and MinIO Client images.
- [ ] Start the isolated MinIO service.
- [ ] Execute the bootstrap container.
- [ ] Runtime-verify private bucket configuration.
- [ ] Runtime-verify exact application policy and zero group membership.
- [ ] Runtime-test blocked unrelated bucket and prefix access.
- [ ] Runtime-test `PutObject`.
- [ ] Runtime-test `HeadObject`.
- [ ] Runtime-test streaming `GetObject`.
- [ ] Runtime-test conditional destination conflict behavior.
- [ ] Runtime-test quarantine-to-available promotion.
- [ ] Runtime-test source retention on failure.
- [ ] Runtime-test `DeleteObject`.
- [ ] Runtime-test signed URL generation.
- [ ] Runtime-test persistence across container recreation.
- [ ] Runtime-test recovery after server restart.
- [ ] Select a maintained long-term production object-storage provider.
- [ ] Implement trusted content inspection.
- [ ] Implement operational malware scanning.
- [ ] Implement permission-controlled delivery.
- [ ] Implement attachment-resource authorization.
- [ ] Complete full secure upload/download runtime verification.

### Checkpoint Verdict

- [x] Isolated MinIO evaluation runtime source is implemented.
- [x] Security-focused source review is complete.
- [x] Independent local static verification passed.
- [x] Commit and push passed.
- [x] Ubuntu server synchronization passed.
- [x] Ubuntu server static verification passed.
- [x] Existing Lexora API health remained intact.
- [ ] MinIO image build is not verified.
- [ ] MinIO container runtime is not verified.
- [ ] IAM bootstrap is not runtime verified.
- [ ] Real object-storage operations are not runtime verified.
- [ ] Persistence is not runtime verified.
- [ ] Production object storage is not selected.
- [ ] Production file upload is not enabled.

Correct status:

> The isolated MinIO evaluation runtime source is implemented, security-reviewed, committed, pushed, server-synchronized, and statically verified on both the local PC and Ubuntu server. No image has been built and no container has been started. Real MinIO connectivity, IAM bootstrap behavior, object operations, conditional-write behavior, signed URL delivery, persistence, restart recovery, and production suitability remain unverified.

### Supersession Note

The earlier S3 adapter verification section listed safe MinIO or S3 infrastructure provisioning as fully pending.

This section supersedes only the source-definition and server-static-verification portion of that item.

Real container provisioning, MinIO startup, IAM bootstrap execution, object operations, persistence, and production-provider selection remain pending.

### Resume Point After Break

Resume from:

1. Review and install the container runtime and Compose plugin using a safe, official installation method.
2. Provision external owner-only secret files without printing or committing their values.
3. Validate the isolated Compose model before starting containers.
4. Build the pinned evaluation images.
5. Start MinIO and run the bootstrap.
6. Perform least-privilege IAM, real object-operation, conditional-write, signed URL, and persistence tests.

Do not enable production upload or domain attachment features during these steps.

## MinIO IAM, Real S3 Adapter, and API DI Runtime Verification — 2026-07-27

### Scope and Classification

This section records the latest runtime evidence for the isolated MinIO evaluation environment, least-privilege IAM bootstrap, Lexora S3-compatible object-storage adapter, real quarantine object operations, and PM2/NestJS dependency-injection boot.

The MinIO deployment remains evaluation-only. It is not classified as the final institutional production object-storage provider.

Specific quarantine object-storage operations are now runtime verified. The complete secure upload/download pipeline remains incomplete, and production file upload remains disabled.

### Related Commits

| Purpose | Commit |
|---|---|
| Secure S3 quarantine adapter | `06fc4c5` |
| Isolated MinIO evaluation runtime | `3c8f8a4` |
| MinIO client build-provenance hardening | `8268d62` |
| MinIO runtime secret-delivery hardening | `4bcf94b` |
| Static internal MinIO topology | `7b7a755` |
| Required quarantine upload content length | `6656ad7` |

Final verified implementation commit:

- Full commit: `6656ad735ac176cb49e5b6d4e1e80dfef4f595be`
- Subject: `Require content length for S3 quarantine uploads`

### MinIO Runtime and Internal Topology

Verified evaluation runtime:

| Item | Verified value |
|---|---|
| Compose project | `lexora-minio-evaluation` |
| MinIO container short ID | `550f841b7043` |
| Internal MinIO IPv4 | `10.203.250.10` |
| Internal endpoint | `http://10.203.250.10:9000` |
| Internal subnet | `10.203.250.0/24` |
| Internal gateway | `10.203.250.1` |
| Bucket | `lexora-lms-evaluation` |
| Named volume | `lexora_minio_evaluation_data` |

Runtime evidence:

- [x] MinIO remained running and healthy.
- [x] API-to-MinIO access worked through the static internal Docker bridge address.
- [x] No Docker host port was published for ports `9000` or `9001`.
- [x] No Nginx storage route was added.
- [x] No LAN or public MinIO publication was configured.
- [x] The MinIO console was not host-published.
- [x] The named evaluation volume remained preserved.

The absence of published host ports does not mean the Docker host itself cannot route to the internal container address. The verified boundary is that no host-port, Nginx, LAN, or public publication was configured.

### Runtime Images and Secret Boundary

Pinned image identities:

| Component | Image ID |
|---|---|
| MinIO evaluation server | `sha256:d09592223139e1b7e6b2bf45193cd1f5cbd33045e28f6567d6d8c80b3cae5b72` |
| MinIO bootstrap client | `sha256:c9b92b1025620a2ba59676132b4c36055ad301cdf0234a23279c2c72ad40df32` |

Verified secret-delivery boundary:

- Dedicated secret-reader group GID: `982`
- External secret directory: `/secure/external/minio-evaluation`
- The secret directory remained root-owned and restricted.
- Secret files remained regular, non-symlink, nonempty, and restricted.
- Root and application credentials were confirmed to be distinct.
- The unprivileged deployment user could not traverse the secret directory directly.
- No credential value was printed, documented, rotated, or committed.

No raw access key, secret key, MinIO root credential, token, password, cookie, or database credential is recorded here.

### Least-Privilege IAM Runtime Evidence

The following behavior is runtime verified:

- [x] The configured bucket exists and is private.
- [x] The Lexora application user is enabled.
- [x] The exact expected direct application policy is attached.
- [x] Application group membership is empty.
- [x] Controlled `quarantine/` prefix listing is allowed.
- [x] Controlled `available/` prefix listing is allowed.
- [x] Configured-bucket root listing is blocked.
- [x] Unrelated-prefix listing is blocked.
- [x] Access to a temporary unrelated canary bucket is blocked.
- [x] No unauthorized bucket name was exposed.
- [x] Initial bootstrap execution passed.
- [x] Repeated bootstrap execution was idempotent.
- [x] The temporary canary bucket was removed.

The application policy was not broadened with:

- `s3:ListAllMyBuckets`;
- unrestricted bucket-root `s3:ListBucket`;
- `s3:*`;
- `admin:*`.

### IAM Diagnostic False Negatives

Two earlier IAM diagnostics failed because of checker assumptions rather than authorization weaknesses.

1. One checker treated a successful alias-root `mc ls` exit status as proof of unrestricted discovery. The corrected inspection checked the returned entries and confirmed that no unrelated bucket was exposed.

2. Another checker used application `mc stat` against the bare bucket. That operation requires bucket-root listing permission, while the Lexora policy intentionally permits listing only under controlled prefixes.

These diagnostic failures do not indicate privilege escalation or an IAM policy vulnerability.

### Streaming Transport Diagnosis

A real low-level transport matrix established:

- [x] Buffer upload passed.
- [x] Unknown-length Node `Readable` failed during `PutObject`.
- [x] The safe failure classification was `ERR_HTTP_INVALID_HEADER_VALUE`.
- [x] The same `Readable` succeeded with explicit `ContentLength`.
- [x] Explicit-length streaming passed with SDK-default checksum behavior.
- [x] Explicit-length streaming passed with checksum calculation limited to when required.
- [x] IAM, network, bucket, and credentials were not the root cause.
- [x] No SDK checksum-configuration change was required.

Diagnosis:

> The original adapter supplied a Node `Readable` without a trusted explicit byte length. The S3 transport required `ContentLength` for this streaming request path.

### Content-Length Contract Correction

The object-storage contract is now:

    createQuarantineObject(
      location: ObjectLocation,
      content: Readable,
      expectedSizeBytes: number,
    ): Promise<ObjectMetadata>;

Verified behavior:

- [x] `expectedSizeBytes` is mandatory.
- [x] The expected size must be a positive safe integer.
- [x] Invalid size is rejected before any provider request.
- [x] Invalid size maps to sanitized `INVALID_METADATA`.
- [x] `PutObjectCommand.ContentLength` receives the trusted size.
- [x] The original Node `Readable` remains unbuffered.
- [x] `IfNoneMatch: "*"` remains intact.
- [x] No public ACL is added.
- [x] Authoritative post-upload `HeadObject` size must equal the expected size.
- [x] A size mismatch fails closed.
- [x] A verification mismatch does not trigger uncertain automatic deletion.
- [x] Conditional duplicate creation still maps to `DESTINATION_CONFLICT`.

The trusted byte count must eventually originate from a validated server-controlled upload boundary. It must not be inferred from a filename, MIME declaration, arbitrary stream property, or unvalidated client header.

### Static and Focused Test Evidence

Verification completed locally and on the Ubuntu server:

- [x] API typecheck passed.
- [x] API build passed.
- [x] `git diff --check` passed.
- [x] Focused compiled S3 adapter tests: `53`
- [x] Passed: `53`
- [x] Failed: `0`
- [x] Skipped: `0`

These `53` tests are the focused compiled adapter suite after the content-length correction. They are separate from earlier broader Secure File Storage test counts and must not be combined with them.

### Real MinIO-Backed Adapter Operations

The corrected compiled Lexora adapter completed the following operations against the evaluation MinIO runtime:

- [x] Invalid trusted size was rejected before object creation.
- [x] A real Node `Readable` quarantine upload succeeded with explicit `ContentLength`.
- [x] The successful temporary payload size was `8228 bytes`.
- [x] Authoritative post-upload metadata verification passed.
- [x] `statObject` returned the expected metadata.
- [x] A duplicate conditional creation was rejected as `DESTINATION_CONFLICT`.
- [x] The conflicting request did not replace the original object.
- [x] Streaming `readObject` passed.
- [x] Exact SHA-256 content-integrity comparison passed.
- [x] Adapter deletion passed.
- [x] Repeated idempotent deletion passed.
- [x] A separate administrative check independently confirmed the object was absent.
- [x] No temporary runtime object remained.
- [x] No temporary bootstrap container remained.

The AWS SDK emitted a non-retryable streaming-request warning during the intentional duplicate-write test. The adapter mapped the provider response to `DESTINATION_CONFLICT`, the original object remained intact, and the complete runtime harness passed.

The real operations verified in this phase are:

- quarantine `PutObject`;
- authoritative `HeadObject`;
- `statObject`;
- streaming `GetObject`;
- conditional duplicate protection;
- `DeleteObject`;
- repeated idempotent deletion.

Real quarantine-to-available promotion is not included in this verified set.

### FileStorageModule and Provider Wiring

Verified source and compiled registration:

- [x] `AppModule` imports `FileStorageModule`.
- [x] `modules/index.ts` exports `FileStorageModule`.
- [x] The compiled `AppModule` graph reaches `FileStorageModule`.
- [x] `FileStorageService` is registered.
- [x] The Prisma repository provider is registered.
- [x] `RAW_S3_CLIENT` is registered.
- [x] `S3_COMMAND_CLIENT` is registered.
- [x] `S3_URL_SIGNER` is registered.
- [x] `S3ObjectStorageAdapter` is registered.
- [x] `OBJECT_STORAGE_PORT` uses the existing `S3ObjectStorageAdapter`.

### Module-Registration Checker False Negative

An earlier checker searched only the following path selection:

    apps/api/src/**/*.module.ts

That selection missed the root-level application module:

    apps/api/src/app.module.ts

Direct source inspection, historical inspection, compiled metadata inspection, and graph traversal confirmed that `FileStorageModule` remained registered. No module-registration regression occurred.

### PM2 and NestJS DI Boot

Verified PM2 transition:

| Item | Verified value |
|---|---|
| PM2 application ID | `0` |
| Old API PID | `1917` |
| New API PID | `18422` |
| Restart count | `0 → 1` |
| PM2 cwd | `/home/sh002/lexora_lms` |
| Executable | `/usr/bin/bash` |
| Launch command | `node -r ./apps/api/register-paths.js apps/api/dist/src/main.js` |
| Stored aligned S3 key count | `0` |

Runtime results:

- [x] The API restarted exactly once.
- [x] A new PID was created.
- [x] The repository-root PM2 launch contract was preserved.
- [x] NestJS booted with the corrected adapter artifact.
- [x] Current-start logs contained `Nest application successfully started`.
- [x] Current-start dependency-resolution and fatal-pattern scans passed.
- [x] The S3 credential log-leak scan passed.
- [x] Direct API health passed.
- [x] Nginx-proxied API health passed.
- [x] The API remained bound only to `127.0.0.1:4000`.
- [x] MinIO remained running and healthy during the API restart.

The first immediate health request received connection refused while the new listener was still starting. The second health attempt passed with the same new PID and without an additional restart. This was a startup-timing observation, not an API boot failure.

`Stored aligned S3 key count: 0` means no conflicting S3 value was stored in PM2 process metadata. It does not mean PM2 stores or manages the application S3 credentials.

### PM2 Checker False Negative

A previous checker expected the PM2 cwd to be:

    /home/sh002/lexora_lms/apps/api

The verified deployment contract deliberately launches from:

    /home/sh002/lexora_lms

The register-path and compiled-main command depends on this repository-root cwd. The earlier cwd failure was a checker false negative, not a deployment defect.

### Runtime Evidence Reports

Server-side evidence reports:

    /home/sh002/lexora-minio-corrected-iam-authorization-20260727T022320Z.txt
    /home/sh002/lexora-s3-adapter-runtime-harness-inspection-20260727T023247Z.txt
    /home/sh002/lexora-s3-adapter-quarantine-runtime-20260727T024313Z.txt
    /home/sh002/lexora-s3-stream-transport-diagnostic-20260727T025150Z.txt
    /home/sh002/lexora-s3-content-length-server-runtime-20260727T031554Z.txt
    /home/sh002/lexora-file-storage-module-registration-inspection-20260727T033204Z.txt
    /home/sh002/lexora-api-root-cwd-s3-di-boot-20260727T034450Z.txt

The earlier failed quarantine runtime report captured the unknown-length stream defect and verified safe cleanup. It is superseded for corrected adapter behavior by the later successful content-length runtime report.

### Security Boundaries Preserved

This phase did not:

- add a public file-storage HTTP controller or route;
- enable production upload or download;
- enable assignment, class-material, notice, discussion, recorded-class, or transcript-artifact uploads;
- weaken `AuthGuard`, `PolicyGuard`, or `@RequirePolicy()`;
- weaken request context or principal department isolation;
- weaken object-level authorization;
- weaken teacher assigned-course or student own-resource checks;
- expose MinIO through Nginx, LAN, or public host publication;
- expose credentials, tokens, signed URLs, private object keys, or file bytes;
- modify result publication or amendment controls;
- modify transcript immutability or verification controls;
- modify attendance or notification security controls;
- change database records during infrastructure verification.

Production upload remains disabled.

### Pending Secure File Storage Work

The following remain pending:

- [ ] Real quarantine-to-available `CopyObject` promotion.
- [ ] Destination conflict and source-retention behavior during real promotion.
- [ ] Reconciliation paths after partial or uncertain promotion.
- [ ] Real signed URL generation.
- [ ] External-client signed URL delivery.
- [ ] Object persistence across container recreation without deleting the named volume.
- [ ] Persistence and recovery across server reboot.
- [ ] Selection of a maintained long-term production object-storage provider.
- [ ] Magic-number and content-signature inspection.
- [ ] Canonical MIME and extension consistency.
- [ ] Operational malware-scanner adapter.
- [ ] Scan orchestration over stored quarantine bytes.
- [ ] Permission-controlled delivery.
- [ ] Attachment-resource authorization.
- [ ] Database-backed repository and concurrency tests.
- [ ] Serializable transaction retry handling.
- [ ] Storage quotas.
- [ ] Audit and lifecycle mutation atomicity.
- [ ] Secure upload/download frontend.
- [ ] Full secure upload/download runtime verification.

Real attachment uploads must not be enabled until the complete secure pipeline is implemented and runtime verified.

### Runtime Verdict

- [x] Isolated MinIO evaluation runtime is implemented and runtime verified.
- [x] Least-privilege IAM bootstrap and authorization behavior are runtime verified.
- [x] Corrected S3 quarantine adapter is implemented and server deployed.
- [x] Real quarantine upload/read/stat/delete lifecycle is runtime verified.
- [x] Conditional quarantine duplicate protection is runtime verified.
- [x] PM2/NestJS `FileStorageModule` and S3-provider DI boot are runtime verified.
- [ ] Real promotion is not runtime verified.
- [ ] Signed delivery is not runtime verified.
- [ ] Persistence is not runtime verified.
- [ ] The complete secure upload/download pipeline is not complete.
- [ ] Production file upload is not enabled.

Correct status:

> The isolated MinIO evaluation runtime, least-privilege IAM bootstrap, corrected S3 quarantine adapter, real quarantine upload/read/stat/delete lifecycle, conditional duplicate protection, and PM2/NestJS FileStorageModule DI boot are implemented, server-deployed, and runtime verified. The environment remains evaluation-only. Real promotion, signed delivery, persistence, content inspection, malware scanning, attachment authorization, database concurrency, quotas, audit atomicity, and the full secure upload/download workflow remain pending. Production file upload remains disabled.

### Supersession Note

This section supersedes only earlier pending statements concerning:

- MinIO evaluation image and runtime startup;
- external secret delivery;
- IAM bootstrap;
- private bucket verification;
- controlled-prefix authorization;
- real quarantine `PutObject`;
- authoritative `HeadObject`;
- streaming `GetObject`;
- `statObject`;
- `DeleteObject`;
- conditional quarantine duplicate protection;
- corrected API build;
- `FileStorageModule` and S3-provider DI boot.

Earlier pending statements concerning the following remain valid:

- quarantine-to-available promotion;
- destination conflict and reconciliation during promotion;
- signed URL delivery;
- persistence;
- content-signature inspection;
- canonical MIME consistency;
- operational malware scanning;
- attachment integration and authorization;
- database-backed repository and concurrency tests;
- serializable transaction retry handling;
- quotas;
- audit atomicity;
- secure frontend work;
- full secure upload/download runtime verification.

Production file upload remains disabled.

## Real Quarantine-to-Available Promotion Runtime Verification — 2026-07-27

### Scope

This checkpoint records real MinIO-backed runtime verification of the compiled Lexora S3 adapter's normal quarantine-to-available promotion path.

It covers:

- creation of a real quarantine source object;
- deterministic promotion to the corresponding available location;
- destination verification;
- quarantine source deletion after verification;
- streaming content-integrity verification;
- already-moved retry behavior;
- exact cleanup and runtime non-regression.

It does not cover destination-conflict handling, uncertain-copy reconciliation, signed delivery, persistence, content inspection, malware scanning, attachment authorization, or the complete upload/download workflow.

Production file upload remains disabled.

### Repository and Runtime Context

| Item | Verified value |
|---|---|
| Repository commit | `6a657ecf7f13921461a231b5a609d8f2e601c260` |
| Adapter implementation commit | `6656ad735ac176cb49e5b6d4e1e80dfef4f595be` |
| MinIO container short ID | `550f841b7043` |
| MinIO internal IPv4 | `10.203.250.10` |
| Configured bucket | `lexora-lms-evaluation` |
| Secret-reader GID | `982` |
| Temporary payload size | `12321 bytes` |
| API PID at checkpoint start | `1950` |
| API PID at checkpoint end | `1950` |

The documentation-only commit did not alter the previously verified adapter implementation.

### Runtime Evidence Report

Detailed server-side report:

    /home/sh002/lexora-s3-real-promotion-20260727T061622Z.txt

No credential value, private runtime object key, payload content, or raw content hash is recorded in this checklist.

### Real Promotion Behavior

The actual compiled adapter completed the following sequence against the evaluation MinIO runtime:

- [x] Confirmed the temporary quarantine and available locations were initially absent.
- [x] Created a real quarantine object through `createQuarantineObject`.
- [x] Passed the trusted payload size as explicit `ContentLength`.
- [x] Promoted the object through `moveToAvailable`.
- [x] Used the deterministic matching available location.
- [x] Completed real provider-side copy behavior.
- [x] Verified destination metadata after copy.
- [x] Verified destination size matched the source payload size.
- [x] Streamed the available object through `readObject`.
- [x] Verified exact SHA-256 content equality.
- [x] Deleted the quarantine source only after destination verification.
- [x] Confirmed the quarantine source was absent after successful promotion.
- [x] Confirmed the available object remained present and intact.

### Already-Moved Retry

The adapter was called again after:

- the quarantine source was already absent; and
- the verified available destination already existed.

Verified result:

- [x] The retry returned the existing available object safely.
- [x] The available object retained the expected size.
- [x] Streaming content integrity still passed.
- [x] The quarantine source did not reappear.
- [x] No second source object was created.

This verifies the already-moved retry path for a completed normal promotion.

### Cleanup Verification

- [x] Adapter deletion of the temporary available object passed.
- [x] Repeated idempotent deletion passed.
- [x] Source cleanup remained safe and idempotent.
- [x] A separate administrative cleanup check confirmed both exact temporary locations were absent.
- [x] No temporary `minio-init` container remained.
- [x] The named MinIO volume remained preserved.

No broad wildcard deletion was used as runtime evidence.

### MinIO and API Non-Regression

- [x] MinIO remained running.
- [x] MinIO remained healthy.
- [x] MinIO retained the same container identity during the checkpoint.
- [x] No host listener appeared for ports `9000` or `9001`.
- [x] The API remained healthy through the direct localhost endpoint.
- [x] The API remained healthy through Nginx.
- [x] The API PID remained `1950` throughout this checkpoint.
- [x] No API restart was attempted.
- [x] No MinIO restart was attempted.
- [x] The repository remained clean.
- [x] No database record was created or changed.
- [x] No signed URL was generated.
- [x] No public file-storage route was enabled.

An earlier PM2/NestJS DI-boot checkpoint recorded API PID `18422`. This promotion checkpoint began and ended with PID `1950`. The intervening PID change was not investigated by this test, so this section makes no claim about its cause. The verified fact is that the API process did not change during this promotion checkpoint.

### Runtime Verdict

- [x] Real normal quarantine-to-available promotion is runtime verified.
- [x] Real copy, destination verification, and source deletion ordering are runtime verified.
- [x] Available-object streaming integrity is runtime verified.
- [x] Already-moved retry behavior is runtime verified.
- [x] Exact adapter and administrative cleanup are runtime verified.
- [ ] Destination-conflict behavior against real MinIO remains pending.
- [ ] Source-retention behavior during a conflicting destination remains pending.
- [ ] Conditional-copy race reconciliation remains pending.
- [ ] Partial or uncertain promotion reconciliation remains pending.
- [ ] Signed URL generation and delivery remain pending.
- [ ] Persistence verification remains pending.
- [ ] The complete secure upload/download pipeline remains incomplete.
- [ ] Production file upload remains disabled.

Correct status:

> The real normal quarantine-to-available copy-verify-delete lifecycle and already-moved retry path are runtime verified against the isolated MinIO evaluation environment. Destination conflict, source retention under conflict, race and partial-operation reconciliation, signed delivery, persistence, content inspection, malware scanning, attachment authorization, and the complete secure upload/download workflow remain pending. Production file upload remains disabled.

### Supersession Note

This section supersedes earlier pending statements only for:

- real normal quarantine-to-available promotion;
- deterministic available-location mapping;
- real provider-side copy in the normal path;
- post-copy destination verification;
- source deletion after verified destination;
- already-moved retry behavior.

Earlier pending statements remain valid for:

- incompatible existing-destination conflict;
- source retention during conflict;
- conditional-copy race handling;
- uncertain or partial promotion reconciliation;
- signed URL generation and external delivery;
- persistence;
- content-signature and MIME inspection;
- malware scanning;
- attachment authorization;
- database concurrency;
- quotas;
- audit atomicity;
- frontend upload/download;
- full secure upload/download runtime verification.

Production file upload remains disabled.

## Conditional Streaming S3 Promotion Correction and Real MinIO Runtime Verification — 2026-07-27

### Scope

This checkpoint records the provider-compatibility correction and real MinIO runtime verification of the Lexora S3-compatible quarantine-to-available promotion lifecycle.

The corrected implementation replaces the earlier active `CopyObject` promotion path with a fail-closed conditional streaming flow based on:

- trusted expected byte count;
- trusted SHA-256 checksum;
- streamed source verification;
- provider-ETag-guarded second source read;
- conditional destination `PutObject`;
- streamed destination verification;
- source deletion only after destination integrity is verified.

This checkpoint covers the compiled adapter directly against the isolated MinIO evaluation runtime.

It does not enable or expose a production upload route.

Production file upload remains disabled.

### Related Implementation Commit

| Item | Verified value |
|---|---|
| Correction commit | `ba02b1d910537592ae5f0e412bdbfad34cfce916` |
| Commit subject | `Use conditional streaming promotion for S3 storage` |
| Parent commit | `138ddc694a8ed8ad301d8e83958cc3ad6b64749b` |

The correction changed exactly:

- `apps/api/src/modules/file-storage/application/ports/object-storage.port.ts`
- `apps/api/src/modules/file-storage/infrastructure/object-storage/s3-object-storage.adapter.ts`
- `apps/api/src/modules/file-storage/infrastructure/object-storage/s3-object-storage.adapter.test.ts`

No dependency, IAM, MinIO, PM2, Nginx, database, frontend, route, controller, or environment configuration file was changed by this implementation commit.

### Defect That Required the Correction

An earlier real MinIO diagnostic proved that destination-side `If-None-Match: *` attached to `CopyObject` was present in the serialized request but was not enforced by this evaluation MinIO provider.

During an injected destination race:

- a competing destination object was created before the copy;
- MinIO accepted the `CopyObject`;
- the competing destination was overwritten;
- the adapter treated the promotion as successful;
- the quarantine source was deleted.

That behavior was unsafe for file integrity.

The earlier normal-path runtime evidence remains a factual record that the copy-verify-delete sequence completed without a race. However, its provider-side overwrite-protection conclusion is superseded by the later race diagnostic and by this corrected implementation.

### Corrected Promotion Contract

Promotion now requires a trusted expectation containing:

- a positive safe-integer expected byte count;
- an exact 64-character hexadecimal SHA-256 checksum.

Verified behavior:

- [x] Invalid trusted sizes are rejected before provider operations.
- [x] Invalid trusted checksums are rejected before provider operations.
- [x] Checksums are normalized internally.
- [x] Provider ETag is not treated as SHA-256.
- [x] Client filename, client MIME, and arbitrary stream metadata are not used as trusted promotion integrity data.

### Corrected Streaming Algorithm

The real compiled adapter uses the following promotion sequence:

1. Resolve authoritative source and destination metadata.
2. Verify an existing destination by streamed byte count and SHA-256 before accepting it.
3. Stream-read the quarantine source and verify trusted size and SHA-256.
4. Require the authoritative provider ETag for the source.
5. Perform a second source `GetObject` using provider `IfMatch`.
6. Pass the source response stream directly into destination `PutObject`.
7. Set trusted `ContentLength`.
8. Set destination `IfNoneMatch: "*"`.
9. Perform authoritative destination metadata lookup.
10. Stream-read and verify destination byte count and SHA-256.
11. Delete the quarantine source only after destination integrity passes.

The active compiled promotion path contains:

- [x] `PutObjectCommand`
- [x] `IfNoneMatch`
- [x] `ContentLength`
- [x] `IfMatch`
- [x] incremental SHA-256 hashing
- [x] explicit response-stream disposal

The active compiled promotion path does not contain:

- [x] no `CopyObjectCommand`
- [x] no `Buffer.concat`
- [x] no full-object buffering
- [x] no uncertain automatic destination cleanup

### Local and Server Static Verification

Verified before real object operations:

- [x] Independent source and patch review passed.
- [x] Exact reviewed patch hash matched before commit.
- [x] Exact staged patch hash matched before commit.
- [x] API typecheck passed locally.
- [x] API build passed locally.
- [x] Sixty-four focused compiled adapter tests passed locally.
- [x] Focused ESLint passed.
- [x] Prettier passed.
- [x] `git diff --check` passed.
- [x] Focused implementation commit and normal push passed.
- [x] Server fast-forward synchronization passed.
- [x] API typecheck passed on the server.
- [x] API build passed on the server.
- [x] Sixty-four focused compiled adapter tests passed on the server.
- [x] Server repository remained clean.

### Runtime Environment

| Item | Verified value |
|---|---|
| Repository commit | `ba02b1d910537592ae5f0e412bdbfad34cfce916` |
| MinIO container short ID | `550f841b7043` |
| MinIO internal IPv4 | `10.203.250.10` |
| Configured bucket | `lexora-lms-evaluation` |
| Secret-reader GID | `982` |
| API PID at checkpoint start | `1950` |
| API PID at checkpoint end | `1950` |

Detailed server-side runtime report:

    /home/sh002/lexora-s3-conditional-streaming-runtime-20260727T081334Z.txt

No credential value, private runtime object key, payload content, or raw checksum is recorded in this checklist.

### Real Normal Promotion

The real compiled adapter completed a quarantine-to-available promotion against the evaluation MinIO runtime.

Verified:

- [x] Temporary source and destination were initially absent.
- [x] A real quarantine object was created.
- [x] Trusted expected size was supplied.
- [x] Trusted SHA-256 was supplied.
- [x] First-pass streamed source verification passed.
- [x] Second-pass source read used provider `IfMatch`.
- [x] Destination was created through `PutObject`.
- [x] Destination `IfNoneMatch: "*"` was used.
- [x] Trusted `ContentLength` was used.
- [x] Destination metadata verification passed.
- [x] Streamed destination SHA-256 verification passed.
- [x] Source deletion occurred only after destination verification.
- [x] Quarantine source was absent after successful promotion.
- [x] Available destination retained exact expected content.

### Authenticated Source-Missing Retry

After the successful normal promotion, the adapter was called again with:

- the quarantine source absent; and
- the available destination present.

The adapter did not accept destination existence or size alone.

Verified:

- [x] The destination was stream-read.
- [x] Exact expected byte count was verified.
- [x] Exact expected SHA-256 was verified.
- [x] The retry returned the verified available destination safely.
- [x] The quarantine source did not reappear.
- [x] Destination integrity remained intact.

### Existing Same-Size Wrong Destination

A quarantine source and an independently created destination with the same byte count but different content were tested.

Verified:

- [x] The destination was not accepted based on size alone.
- [x] Streamed SHA-256 comparison detected different content.
- [x] Promotion returned `DESTINATION_CONFLICT`.
- [x] The quarantine source remained present and intact.
- [x] The existing destination remained present and intact.
- [x] No source deletion occurred.

### Injected Destination Race

A competing destination was injected immediately before the adapter's conditional destination `PutObject`.

Verified:

- [x] Destination conditional creation was attempted with `IfNoneMatch: "*"`.
- [x] The provider rejected replacement of the competing destination.
- [x] The adapter returned sanitized `RECONCILIATION_REQUIRED`.
- [x] The quarantine source remained present and intact.
- [x] The competing destination remained present and intact.
- [x] No unsafe overwrite occurred.
- [x] No source deletion occurred.

The AWS SDK emitted the diagnostic message:

    An error was encountered in a non-retryable streaming request.

This message occurred during the expected conditional destination race. It did not cause the checkpoint to fail. The adapter mapped the provider outcome to `RECONCILIATION_REQUIRED`, and subsequent integrity checks confirmed that both source and competing destination remained intact.

### Stream and Resource Safety

Verified through focused tests and compiled runtime behavior:

- [x] Second-pass source response streams are disposed after destination write success or failure.
- [x] Stream-disposal failures do not replace the original sanitized storage outcome.
- [x] Oversized verification streams stop immediately after exceeding trusted size.
- [x] Remaining oversized content is not unnecessarily consumed or hashed.
- [x] No full-file buffering is used by the adapter.
- [x] No uncertain destination is automatically deleted.
- [x] Source deletion remains ordered after verified destination integrity.

### Cleanup Verification

- [x] Adapter cleanup of all exact temporary runtime objects passed.
- [x] Repeated idempotent deletion passed.
- [x] Independent administrative exact-object cleanup passed.
- [x] All six exact temporary runtime locations were absent after cleanup.
- [x] No temporary `minio-init` container remained.
- [x] The named MinIO data volume remained preserved.
- [x] No broad wildcard deletion was used as runtime evidence.

### MinIO, API, and Repository Non-Regression

- [x] MinIO remained running.
- [x] MinIO remained healthy.
- [x] MinIO retained the same container identity.
- [x] No MinIO host listener appeared on ports `9000` or `9001`.
- [x] Direct API health passed before and after the test.
- [x] Nginx-proxied API health passed before and after the test.
- [x] API PID remained `1950` throughout the checkpoint.
- [x] No API restart was attempted.
- [x] No MinIO restart was attempted.
- [x] Repository refs remained at the verified correction commit.
- [x] Repository remained clean.
- [x] No database record was created or changed.
- [x] No signed URL was generated.
- [x] No public file-storage route was enabled.
- [x] No documentation file was changed during the runtime harness.

The unchanged PM2 PID proves API non-regression during this checkpoint. It does not prove that the PM2 process was restarted onto the new compiled adapter build. The corrected compiled adapter itself was invoked directly and runtime-verified against MinIO.

### Runtime Verdict

- [x] Conditional streaming normal promotion is runtime verified.
- [x] Trusted size and streamed SHA-256 source verification are runtime verified.
- [x] Provider-ETag-guarded second source read is runtime verified.
- [x] Conditional destination `PutObject` behavior is runtime verified.
- [x] Post-write streamed destination verification is runtime verified.
- [x] Source deletion ordering is runtime verified.
- [x] Authenticated source-missing retry is runtime verified.
- [x] Same-size wrong destination conflict behavior is runtime verified.
- [x] Source and destination retention during conflict are runtime verified.
- [x] Injected destination-race reconciliation is runtime verified.
- [x] Source and competing-destination retention during race are runtime verified.
- [x] Exact cleanup and runtime non-regression are runtime verified.
- [ ] PM2 process restart and DI boot on the correction commit remain pending.
- [ ] Database-backed persistence verification remains pending.
- [ ] Magic-number and content-signature inspection remain pending.
- [ ] Extension allowlist and canonical MIME consistency remain pending.
- [ ] Operational malware scanning remains pending.
- [ ] Attachment-resource authorization remains pending.
- [ ] Permission-controlled signed delivery remains pending.
- [ ] Database-backed concurrency and transaction verification remain pending.
- [ ] Storage quotas remain pending.
- [ ] Audit and lifecycle atomicity remain pending.
- [ ] Secure upload/download frontend remains pending.
- [ ] Complete secure upload/download runtime verification remains pending.
- [ ] Production file upload remains disabled.

Correct status:

> The corrected conditional streaming quarantine-to-available promotion lifecycle is implemented, independently reviewed, committed, pushed, server-synchronized, server-built, covered by sixty-four focused compiled tests locally and on the server, and runtime verified against the isolated MinIO evaluation environment for normal promotion, authenticated retry, same-size wrong-destination conflict, source retention, injected destination race, competing-destination retention, cleanup, and non-regression. PM2 activation of the corrected build, persistence, content inspection, MIME consistency, malware scanning, attachment authorization, signed delivery, database concurrency, quotas, audit atomicity, frontend integration, and the complete secure upload/download pipeline remain pending. Production upload remains disabled.

### Supersession Note

This section supersedes earlier claims or pending statements only for:

- active `CopyObject` promotion as the intended secure promotion mechanism;
- real normal promotion through the corrected conditional streaming path;
- provider-ETag-guarded source mutation protection;
- conditional destination creation through `PutObject`;
- authenticated source-missing retry;
- same-size wrong-destination detection;
- real destination-race handling;
- source retention during conflict and race;
- competing-destination retention during race;
- post-write streamed destination integrity verification.

Historical evidence of the earlier normal `CopyObject` path is preserved, but that path is no longer the approved or active secure design because the real race diagnostic proved its destination precondition unsafe for this evaluation provider.

Earlier limitations remain valid for:

- PM2 activation of the corrected build;
- persistence;
- content-signature and MIME inspection;
- malware scanning;
- attachment-resource authorization;
- permission-controlled signed delivery;
- database concurrency and transaction retry;
- storage quotas;
- audit atomicity;
- frontend upload/download;
- complete secure upload/download runtime verification.

Production file upload remains disabled.

## PM2 Activation of Corrected Conditional Streaming Build — 2026-07-27

### Scope

This checkpoint records activation of the corrected conditional streaming S3 promotion build through the existing production-style PM2 process contract.

The corrected compiled adapter had already been independently reviewed, committed, server-built, focused-test verified, and directly runtime-tested against the isolated MinIO evaluation environment.

This checkpoint verifies that the same corrected build successfully boots through the existing NestJS and PM2 application path.

Production file upload remains disabled.

### Related Commits

| Item | Verified value |
|---|---|
| Repository commit at activation | `c3f73f6c62e0650ef095af6abf067bf7cbc97888` |
| Corrected implementation commit | `ba02b1d910537592ae5f0e412bdbfad34cfce916` |
| Documentation parent | `c3f73f6c62e0650ef095af6abf067bf7cbc97888` |

### Compiled Build Verification

The activated compiled adapter SHA-256 was:

    63973ad7350719fbb012c2ac21fe247a8124d27f5bc5749d2cc4bf7c77715053

Verified compiled behavior:

- [x] `PutObjectCommand` present.
- [x] `IfNoneMatch` present.
- [x] `ContentLength` present.
- [x] `IfMatch` present.
- [x] incremental SHA-256 hashing present.
- [x] explicit stream disposal present.
- [x] `CopyObjectCommand` absent.
- [x] `Buffer.concat` absent from the active adapter.
- [x] AppModule and FileStorageModule provider graph remained unchanged.

### PM2 Process Transition

| Item | Before | After |
|---|---:|---:|
| PM2 application ID | `0` | `0` |
| API PID | `1950` | `24486` |
| Restart count | `0` | `1` |
| Status | `online` | `online` |

Preserved PM2 contract:

| Item | Verified value |
|---|---|
| Working directory | `/home/sh002/lexora_lms` |
| Executable | `/usr/bin/bash` |
| Launch command | `node -r ./apps/api/register-paths.js apps/api/dist/src/main.js` |
| Stored PM2 S3 configuration count | `0` |

Verified:

- [x] Exactly one PM2 restart occurred.
- [x] A new API PID was created.
- [x] The PM2 application ID remained unchanged.
- [x] Repository-root working directory remained unchanged.
- [x] The established register-path launch command remained unchanged.
- [x] No S3 credential value was added to PM2 process metadata.
- [x] PM2 status returned to `online`.

The PM2 message:

    Use --update-env to update environment variables

was informational. This checkpoint intentionally did not update environment variables.

### NestJS Boot Verification

Current-start log isolation verified:

- [x] `Nest application successfully started` was present.
- [x] No `UnknownDependenciesException` was present.
- [x] No unresolved Nest dependency pattern was present.
- [x] No `Cannot find module` pattern was present.
- [x] No `EADDRINUSE` pattern was present.
- [x] No unhandled promise rejection pattern was present.
- [x] No fatal `ReferenceError` or `TypeError` pattern was present.
- [x] No configured sensitive runtime value appeared in current-start logs.

The corrected build therefore completed NestJS dependency-injection boot through PM2.

### API Startup and Health

The first immediate direct health request received connection refused while the restarted process was still creating its listener.

The second health attempt passed approximately two seconds later.

Verified:

- [x] Direct API health passed after startup.
- [x] Nginx-proxied API health passed after startup.
- [x] No second PM2 restart occurred.
- [x] PM2 restart count remained exactly `1`.
- [x] API remained bound exclusively to `127.0.0.1:4000`.
- [x] No direct LAN or public NestJS listener was introduced.

The first connection refusal was a startup-timing observation and not an API boot failure.

### MinIO and Infrastructure Non-Regression

| Item | Verified value |
|---|---|
| MinIO container short ID | `550f841b7043` |
| MinIO status | `running` |
| MinIO health | `healthy` |
| MinIO internal IPv4 | `10.203.250.10` |

Verified:

- [x] MinIO container identity remained unchanged.
- [x] MinIO remained running.
- [x] MinIO remained healthy.
- [x] MinIO remained on the verified internal IPv4.
- [x] No host listener appeared on ports `9000` or `9001`.
- [x] The named MinIO volume remained available.
- [x] No MinIO restart was attempted.
- [x] No PostgreSQL restart was attempted.
- [x] No Nginx restart was attempted.
- [x] No environment file was changed.
- [x] No database record was changed.
- [x] No object-storage object was created or changed.
- [x] No public file-storage route was enabled.
- [x] Repository refs remained unchanged.
- [x] Repository remained clean.

### Runtime Evidence

Detailed server-side report:

    /home/sh002/lexora-api-conditional-streaming-pm2-boot-20260727T084714Z.txt

No credential value, private object key, token, payload, raw checksum, or database secret is recorded in this checklist.

### Runtime Verdict

- [x] PM2 activation of the corrected build is runtime verified.
- [x] NestJS dependency-injection boot on the corrected build is runtime verified.
- [x] The established repository-root PM2 launch contract is preserved.
- [x] Current-start dependency and fatal-pattern scans passed.
- [x] Current-start sensitive-value scan passed.
- [x] Direct and Nginx-proxied API health passed.
- [x] Localhost-only API binding is preserved.
- [x] MinIO isolation and health are preserved.
- [x] No infrastructure or repository regression occurred.
- [ ] Database-backed persistence verification remains pending.
- [ ] Magic-number and content-signature inspection remain pending.
- [ ] Extension allowlist and canonical MIME consistency remain pending.
- [ ] Operational malware scanning remains pending.
- [ ] Attachment-resource authorization remains pending.
- [ ] Permission-controlled signed delivery remains pending.
- [ ] Database-backed concurrency and transaction verification remain pending.
- [ ] Storage quotas remain pending.
- [ ] Audit and lifecycle atomicity remain pending.
- [ ] Secure upload/download frontend remains pending.
- [ ] Complete secure upload/download runtime verification remains pending.
- [ ] Production file upload remains disabled.

Correct status:

> The corrected conditional streaming S3 promotion build is implemented, independently reviewed, committed, pushed, server-built, directly runtime verified against the isolated MinIO evaluation environment, and now activated through the verified PM2 and NestJS dependency-injection boot path. Persistence, trusted content inspection, MIME consistency, malware scanning, attachment authorization, permission-controlled delivery, database concurrency, quotas, audit atomicity, frontend integration, and the complete secure upload/download pipeline remain pending. Production upload remains disabled.

### Supersession Note

This section supersedes only the earlier pending statement:

- `PM2 process restart and DI boot on the correction commit remain pending.`

That item is now runtime verified.

All other pending secure file-storage controls and production-upload restrictions remain unchanged.

## Trusted Content Inspection and Real MinIO Runtime Verification — 2026-07-27

### Scope and Classification

This section records implementation, independent source review, local and Ubuntu-server static verification, PM2/NestJS activation, focused regression-test hardening, and real MinIO runtime verification of Lexora's trusted file-content inspection boundary.

This checkpoint verifies server-owned content-signature detection and MIME/extension consistency for the currently approved academic-document content types:

- PDF;
- PNG;
- JPEG.

This checkpoint does not classify the complete secure upload/download pipeline as finished or production-ready.

Production file upload remains disabled.

### Related Commits

| Purpose | Commit |
|---|---|
| Implement trusted content inspection | `8425f341f62ad9b6257d2fa565015eaecff67498` |
| Add content-inspector stream regression tests | `2b01403017ebb2f22004466ace5cdcfb75e10a71` |

The regression-test commit changed only:

- `apps/api/src/modules/file-storage/infrastructure/content-inspection/file-type-content-inspector.adapter.test.ts`

No production implementation, route, environment schema, database schema, deployment definition, or object-storage configuration changed in that test-only commit.

### Implemented Content-Inspection Controls

The trusted content inspector now provides:

- server-side content-signature detection using stored object bytes;
- canonical MIME identification;
- detected extension identification;
- approved MIME-to-extension pair enforcement;
- filename-extension consistency enforcement;
- specific client-claimed MIME consistency enforcement;
- fail-closed handling for unrecognized or truncated content;
- bounded inspection timeout;
- abort handling;
- Node `Readable` stream disposal on success and failure;
- retryable ESM module loading;
- no synchronous `require("file-type")`;
- no full-stream `Buffer.concat` implementation in the production inspector.

The approved MIME-extension policy verified in this checkpoint is:

| Canonical MIME | Approved extension |
|---|---|
| `application/pdf` | `pdf` |
| `image/png` | `png` |
| `image/jpeg` | `jpg`, `jpeg` |

### Static and Server Verification

Verified implementation and build evidence:

- [x] Trusted-content implementation received independent source review.
- [x] Implementation commit and push passed.
- [x] Ubuntu server fast-forward passed.
- [x] Frozen dependency installation passed without changing the lockfile.
- [x] API typecheck passed.
- [x] API build passed.
- [x] `file-type` version `21.3.4` resolved as an API dependency.
- [x] `load-esm` version `1.0.3` resolved as an API dependency.
- [x] Compiled inspector SHA-256 was verified as:

      d59957d06ed968a7bdee66127f81794cf4210b920fe8178b455d0b70689c6a0d

- [x] Required compiled timeout, abort, ESM-loading, Web-stream conversion, and disposal markers were present.
- [x] Synchronous `require("file-type")` was absent.
- [x] Production inspector `Buffer.concat` usage was absent.
- [x] Exactly 165 focused compiled file-storage tests passed on the Ubuntu server.
- [x] Focused-test failures were zero.
- [x] Focused-test skipped cases were zero.
- [x] Complete PNG Node-stream regression coverage passed.
- [x] JPEG Node-stream regression coverage passed.
- [x] Truncated-PNG Node-stream fail-closed coverage passed.
- [x] The tests-only build did not change the compiled production inspector hash.
- [x] PM2 was not restarted for the tests-only commit.

### PM2 and NestJS Runtime Activation

The implementation build was activated through the existing repository-root PM2 launch contract.

Verified runtime behavior:

- [x] PM2 PID changed from `24486` to `40377` during the intentional activation restart.
- [x] PM2 restart count changed from `1` to `2`.
- [x] PM2 launch path remained `/usr/bin/bash`.
- [x] PM2 arguments remained the established repository-root launch command.
- [x] PM2 working directory remained `/home/sh002/lexora_lms`.
- [x] NestJS dependency-injection boot passed.
- [x] Current-start fatal and unresolved-dependency scans passed.
- [x] Direct API health passed.
- [x] Nginx-proxied API health passed.
- [x] API binding remained restricted to `127.0.0.1:4000`.
- [x] No public file-storage route was enabled.

### Real MinIO Runtime Verification

A controlled test used isolated real MinIO quarantine objects and the activated production adapters.

Verified positive cases:

- [x] Complete PDF fixture passed buffer preflight.
- [x] The same PDF bytes were stored in MinIO, streamed back, detected, and policy-approved.
- [x] Complete PNG fixture passed buffer preflight.
- [x] The same PNG bytes were stored in MinIO, streamed back, detected, and policy-approved.
- [x] Complete JPEG fixture passed buffer preflight.
- [x] The same JPEG bytes were stored in MinIO, streamed back, detected, and policy-approved.
- [x] Canonical MIME values matched the approved policy.
- [x] Detected extensions matched the approved policy.
- [x] Authoritative stored sizes matched the uploaded byte sizes.
- [x] Successful MinIO response streams were disposed.

Verified negative and fail-closed cases:

- [x] Inconsistent detected MIME-extension pairing was rejected.
- [x] Filename/content mismatch was rejected.
- [x] Specific client-claimed MIME mismatch was rejected.
- [x] Unrecognized stored content failed closed with `CONTENT_UNRECOGNIZED`.
- [x] Truncated stored PNG content failed closed with `CONTENT_UNRECOGNIZED`.
- [x] Failed-inspection MinIO response streams were disposed.

### PNG Fixture Diagnostic

An earlier real-MinIO attempt used a 33-byte incomplete PNG fixture.

The diagnostic proved:

- MinIO preserved the 33-byte object byte-for-byte;
- the buffer-signature path recognized the incomplete fixture;
- the production-style stream parser rejected it as unrecognized;
- a complete valid 68-byte PNG passed both buffer and fresh MinIO stream inspection;
- there was no valid-PNG MinIO corruption or production stream-interoperability defect.

The 33-byte fixture is therefore retained only as an intentional truncated-content fail-closed regression case.

### Cleanup and Non-Regression

- [x] Five final runtime objects were deleted.
- [x] Absence of all five runtime objects was verified.
- [x] Earlier diagnostic objects were also deleted and absence-verified.
- [x] No credential value was printed or documented.
- [x] No private runtime object key was documented.
- [x] No database record was created or changed.
- [x] No source or environment file was changed during runtime testing.
- [x] PM2 PID and restart count remained unchanged during real-MinIO inspection.
- [x] Direct and Nginx API health remained available.
- [x] No MinIO host-port exposure was introduced.
- [x] Repository refs remained aligned.
- [x] Repository remained clean.
- [x] Production upload remained disabled.

### Runtime Evidence

Server-side reports:

    /home/sh002/lexora-trusted-content-server-static-20260727T104831Z.txt

    /home/sh002/lexora-trusted-content-pm2-activation-20260727T105812Z.txt

    /home/sh002/lexora-content-stream-tests-server-20260727T115245Z.txt

    /home/sh002/lexora-png-stream-integrity-diagnostic-20260727T112832Z.txt

    /home/sh002/lexora-final-real-content-inspection-20260727T115700Z.txt

No raw credential, token, private object key, stored payload, password, database secret, or session value is recorded in this checklist.

### Runtime Verdict

- [x] Trusted content-inspection implementation is complete for the current PDF/PNG/JPEG policy.
- [x] Independent source review passed.
- [x] Implementation commit and push passed.
- [x] Server synchronization passed.
- [x] API typecheck and build passed locally and on the server.
- [x] PM2/NestJS activation passed.
- [x] Exactly 165 focused compiled tests passed on the server.
- [x] Real MinIO PDF/PNG/JPEG content-signature detection passed.
- [x] Canonical MIME and approved extension-pair enforcement passed.
- [x] Filename/content consistency enforcement passed.
- [x] Specific client-MIME consistency enforcement passed.
- [x] Unrecognized and truncated content failed closed.
- [x] Stream disposal and exact runtime-object cleanup passed.
- [ ] Full PDF/image structural or semantic validity checking is not claimed.
- [ ] Operational malware scanning remains pending.
- [ ] Real scan orchestration over stored bytes remains pending.
- [ ] Database-backed file-registration and lifecycle integration verification remains pending.
- [ ] Attachment-resource authorization remains pending.
- [ ] Permission-controlled signed delivery remains pending.
- [ ] Database-backed concurrency and transaction verification remain pending.
- [ ] Storage quotas remain pending.
- [ ] Audit and lifecycle atomicity remain pending.
- [ ] Secure upload/download frontend remains pending.
- [ ] Complete secure upload/download runtime verification remains pending.
- [ ] Production file upload remains disabled.

Correct status:

> Trusted content inspection for the current PDF, PNG, and JPEG policy is implemented, independently reviewed, committed, pushed, server-built, covered by 165 focused compiled tests, activated through PM2/NestJS, and runtime verified against real MinIO stored bytes for positive signature detection, MIME/extension consistency, filename consistency, client-MIME consistency, fail-closed rejection, stream disposal, cleanup, and API non-regression. Malware scanning, scan orchestration, database-backed registration and lifecycle integration, attachment authorization, permission-controlled delivery, concurrency testing, quotas, audit atomicity, frontend integration, and the complete secure upload/download pipeline remain pending. Production upload remains disabled.

### Supersession Note

This section supersedes earlier pending statements only for:

- trusted content-inspector implementation;
- magic-number and content-signature inspection for the current PDF/PNG/JPEG policy;
- extension allowlist and canonical MIME consistency;
- PDF/PNG/JPEG Node-stream regression coverage;
- PM2/NestJS activation of the trusted content inspector;
- real MinIO stored-byte inspection for the tested content types;
- related fail-closed and cleanup behavior.

Historical failed-attempt evidence is preserved because it identified:

- an external test-harness module-resolution issue;
- the API's root `.env` loading source;
- an incomplete PNG fixture;
- the distinction between truncated-content rejection and valid-PNG stream behavior.

Earlier limitations remain valid for:

- full structural or semantic document validation;
- malware scanning;
- real scan orchestration;
- database-backed file registration and lifecycle integration;
- attachment-resource authorization;
- permission-controlled signed or proxy delivery;
- database concurrency and transaction retry;
- storage quotas;
- audit and lifecycle atomicity;
- frontend upload/download;
- complete secure upload/download runtime verification.

Production file upload remains disabled.


## Fail-Closed ClamAV INSTREAM Adapter and PM2/DI Runtime Verification — 2026-07-27

### Scope

This checkpoint records implementation, independent source review, deterministic testing, Ubuntu server synchronization, server-side compilation, focused File Storage testing, and PM2/NestJS dependency-injection boot verification of the API-side ClamAV TCP INSTREAM adapter.

This checkpoint verifies the adapter and its runtime registration only.

It does not claim that a real ClamAV daemon, signature database, or complete stored-object malware-scanning workflow is operational.

Production file upload remains disabled.

### Related Commit

- Commit: `6c999e78d1dfdeb7a14749ae74d7fb457ba61cff`
- Message: `Add fail-closed ClamAV INSTREAM scanner adapter`

Committed files:

- `apps/api/src/modules/file-storage/file-storage.module.ts`
- `apps/api/src/modules/file-storage/infrastructure/malware-scanning/clamav-malware-scanner.adapter.ts`
- `apps/api/src/modules/file-storage/infrastructure/malware-scanning/clamav-malware-scanner.adapter.test.ts`

### Implemented Adapter Behavior

The adapter:

- [x] Implements ClamAV TCP `zINSTREAM\0`.
- [x] Streams source bytes without buffering the complete file.
- [x] Does not send filesystem paths.
- [x] Uses four-byte unsigned big-endian frame lengths.
- [x] Splits source content into bounded 64 KiB frames.
- [x] Sends the required zero-length terminal frame.
- [x] Honors socket backpressure.
- [x] Handles fragmented NUL-terminated scanner responses.
- [x] Bounds the scanner response to 4 KiB.
- [x] Bounds sanitized malware signatures to 255 characters.
- [x] Uses single-settlement and deterministic resource cleanup.
- [x] Registers through `MALWARE_SCANNER_PORT` using `useExisting`.

Trusted outcomes remain restricted to:

- `CLEAN`
- `INFECTED`
- `ERROR`

The adapter fails closed for:

- disabled scanner mode;
- connection failure;
- pre-connect socket close;
- connected socket close;
- timeout;
- source stream failure;
- transport or write failure;
- malformed response;
- oversized response;
- scanner-reported error;
- protocol-order violation;
- premature `CLEAN`;
- premature `INFECTED`.

A trusted `CLEAN` or `INFECTED` result is accepted only after all source chunks have been consumed and the zero-length terminal frame has been queued successfully.

Raw scanner responses, source bytes, provider errors, credentials, endpoints, and filesystem paths are not returned.

### Independent Source Review

The adapter was independently source-reviewed before commit.

Review covered:

- complete-source and terminal-frame ordering;
- premature response rejection;
- bounded framing;
- backpressure and cancellation;
- timeout settlement;
- source-versus-transport error classification;
- pre-connect and connected-close classification;
- late-event handling;
- listener cleanup;
- DI registration;
- raw-detail suppression.

No unresolved Critical, High, Medium, or Low review finding remained before commit approval.

### Ubuntu Server Synchronization

The Ubuntu server repository was fast-forwarded from:

- `5f669f65ea29ac5351641c5ba7c66eddd001951b`

to:

- `6c999e78d1dfdeb7a14749ae74d7fb457ba61cff`

Post-synchronization checks confirmed:

- [x] server `HEAD` matched the expected commit;
- [x] local `origin/main` matched the expected commit;
- [x] the commit subject matched;
- [x] the working tree remained clean;
- [x] only the three reviewed files arrived.

The DHCP-provided DNS proxy was temporarily unable to resolve GitHub.

A temporary per-link `1.1.1.1` resolver override was used only for verified synchronization and was reverted afterward.

No persistent DNS or network configuration change was made.

### Server Typecheck and Build

The following passed on the Ubuntu server:

- [x] `pnpm --filter @lexora/api typecheck`
- [x] `pnpm --filter @lexora/api build`

Compiled artifacts were verified for:

- the ClamAV adapter;
- the adapter test;
- the File Storage module.

### Adapter Test Evidence

The compiled adapter suite passed:

- Tests: `16`
- Passed: `16`
- Failed: `0`
- Cancelled: `0`
- Skipped: `0`
- Todo: `0`

Covered behavior included:

- disabled-mode fail-closed behavior;
- exact command, framing, and terminal marker;
- bounded chunk splitting;
- backpressure;
- fragmented infected response;
- signature sanitization;
- timeout cleanup;
- source stream failure;
- connection and socket-close behavior;
- malformed and oversized response handling;
- premature clean and infected rejection;
- complete-source acceptance;
- cancellation during backpressure;
- connected write failure;
- late-event single settlement.

Evidence report:

    /tmp/lexora-clamav-adapter-server-retest-20260727-160621.txt

### Focused File Storage Test Evidence

The compiled File Storage inventory contained exactly eight test files.

The focused inventory passed:

- Tests: `181`
- Passed: `181`
- Failed: `0`
- Cancelled: `0`
- Skipped: `0`
- Todo: `0`

Evidence report:

    /tmp/lexora-file-storage-server-retest-20260727-160621.txt

### PM2 Activation and NestJS Boot

The verified build was activated through the existing PM2 application:

- Application: `lexora-api`

Before restart:

- PID: `1861`
- Status: `online`
- Restart count: `0`

After restart:

- PID: `16239`
- Status: `online`
- Restart count: `1`

The established launch contract remained unchanged:

- Working directory: `/home/sh002/lexora_lms`
- Executable: `/usr/bin/bash`
- Arguments: `["-c","node -r ./apps/api/register-paths.js apps/api/dist/src/main.js"]`

The current-start log contained the NestJS successful-start marker.

No unresolved dependency, `UnknownDependenciesException`, fatal exception-handler, address-in-use, missing-module, uncaught-exception, or unhandled-rejection pattern was detected.

This verifies that the adapter registration and `MALWARE_SCANNER_PORT` dependency-injection path boot successfully through the established PM2 runtime.

### Startup Timing and Health

The first two immediate direct-health attempts occurred before the API listener completed startup.

On attempt 3:

- [x] direct API health passed;
- [x] Nginx-proxied health passed;
- [x] PM2 remained online;
- [x] the NestJS successful-start marker was present.

The first two connection refusals were startup-timing observations, not persistent API, Nginx, DI, or File Storage failures.

### Network Boundary Verification

Verified:

- [x] API remained bound to `127.0.0.1:4000`.
- [x] API port `4000` was not exposed on `0.0.0.0`, `[::]`, or `*`.
- [x] Nginx remained active.
- [x] Nginx remained enabled.
- [x] No established TCP connection involving port `3310` was present.
- [x] No real ClamAV daemon was contacted.

PM2 evidence report:

    /home/sh002/lexora-clamav-adapter-pm2-boot-20260727T160950Z.txt

### Security Boundaries Preserved

This checkpoint did not change or weaken:

- authentication guards;
- policy guards;
- required-policy decorators;
- request context;
- principal department isolation;
- object-level authorization;
- teacher assigned-course checks;
- student own-resource checks;
- academic record locks;
- transcript controls;
- attendance controls;
- notification isolation;
- audit behavior;
- File Storage quarantine rules;
- CLEAN-only activation requirements.

This checkpoint did not:

- add an upload or download route;
- modify Prisma schema or database records;
- update runtime environment values;
- modify Nginx configuration;
- expose TCP port `3310`;
- start ClamAV;
- scan a real stored object;
- persist a real scan result;
- promote an object after a real malware scan;
- enable production upload.

### Current Limitations

The following remain pending:

- [ ] Isolated real ClamAV runtime.
- [ ] Immutable ClamAV image or source pin.
- [ ] Signature database initialization and readiness.
- [ ] Real clean-file scan.
- [ ] Protocol-safe EICAR detection.
- [ ] Real scanner-down and timeout testing.
- [ ] ClamAV restart and persistence verification.
- [ ] Department-scoped MinIO stored-byte scan orchestration.
- [ ] Persistence of real `CLEAN`, `INFECTED`, or `ERROR` results.
- [ ] CLEAN-only promotion after a real scan.
- [ ] Infected-content quarantine or rejection workflow.
- [ ] Retry or worker processing.
- [ ] Attachment-resource authorization.
- [ ] Permission-controlled delivery.
- [ ] Storage quotas.
- [ ] Database-backed concurrency verification.
- [ ] Audit and lifecycle atomicity.
- [ ] Secure upload/download frontend.
- [ ] Complete production upload/download runtime verification.
- [ ] Production file upload enablement.

Production file upload remains disabled.

### Supersession Note

This section supersedes earlier pending statements only for:

- existence of the API-side ClamAV TCP INSTREAM adapter;
- `MALWARE_SCANNER_PORT` DI registration;
- deterministic adapter transport tests;
- server synchronization;
- server typecheck and build;
- focused File Storage test verification;
- PM2 activation of the adapter-containing build;
- NestJS DI boot of the adapter registration.

Earlier pending statements remain valid for:

- a real isolated ClamAV runtime;
- ClamAV signature lifecycle;
- real clean, EICAR, scanner-down, and timeout tests;
- stored-MinIO-byte scan orchestration;
- real scan-result persistence;
- CLEAN-only promotion orchestration;
- infected-content lifecycle handling;
- worker and retry behavior;
- attachment authorization;
- permission-controlled delivery;
- quotas;
- database concurrency;
- audit atomicity;
- complete secure upload/download runtime verification.

### Runtime Verdict

- [x] Adapter implementation completed.
- [x] Independent source review completed.
- [x] Commit and push completed.
- [x] Ubuntu server synchronization completed.
- [x] Server typecheck and build passed.
- [x] Sixteen adapter tests passed.
- [x] One hundred eighty-one focused File Storage tests passed.
- [x] PM2 activation passed.
- [x] NestJS DI boot passed.
- [x] Direct and Nginx health passed.
- [x] Localhost-only API binding remained enforced.
- [x] Production upload remained disabled.
- [ ] Real ClamAV daemon runtime is not verified.
- [ ] Real malware scanning is not verified.
- [ ] Stored-byte scan orchestration is not implemented.
- [ ] The complete malware-scanning pipeline is not operational.
- [ ] The complete secure upload/download pipeline is not complete.

Correct status:

> The fail-closed API-side ClamAV TCP INSTREAM adapter is implemented, independently reviewed, committed, pushed, synchronized to the Ubuntu server, server-built, covered by 16 adapter tests and 181 focused File Storage tests, and activated through the verified PM2/NestJS DI boot path. No real ClamAV daemon, signature lifecycle, clean-file scan, EICAR detection, scanner-down test, stored-byte scan orchestration, persisted real scan result, or CLEAN-only promotion has been runtime verified. Production file upload remains disabled.

### Next Safe Steps

Proceed in this order:

1. Design and inspect an isolated ClamAV evaluation runtime.
2. Select and immutably pin a reviewed ClamAV image or source build.
3. Keep TCP port `3310` private and unavailable to LAN or public clients.
4. Initialize and verify the signature database.
5. Verify daemon readiness.
6. Test a real clean input.
7. Test protocol-safe EICAR detection.
8. Test real scanner-down and timeout fail-closed behavior.
9. Verify restart and persistence behavior.
10. Document and commit the isolated runtime evidence.
11. Only then implement department-scoped stored-MinIO-byte scan orchestration.

## Isolated ClamAV Runtime, Signature Initialization, and Scanner Create-Only Verification — 2026-07-30

### Classification and checkpoint scope

This checkpoint records the isolated ClamAV evaluation-runtime source implementation, immutable upstream image selection, corrected derived-image build, runtime discovery and correction of the numeric account identity, controlled one-shot signature initialization, scanner container create-only verification, preserved runtime isolation and evidence, and the exact stopping point before daemon startup.

This runtime is evaluation-only and partially runtime verified. It is not a production malware-scanning service and is not a complete secure upload pipeline. Production file upload remains disabled.

### Source history and boundary

The reviewed source history is:

| Purpose                                | Commit                                     |
| -------------------------------------- | ------------------------------------------ |
| Add isolated ClamAV evaluation runtime | `7541787f3fb98b37ab7b50301e01026bc59d1b22` |
| Fix ClamAV validator user parsing      | `ce049cb7b7991d65740fe3e23ca47babbccb502c` |
| Use ClamAV base image manifest         | `d8a19b3fcd77f4a9d6e99b6301ca39776e0e081e` |
| Fix ClamAV runtime account identity    | `7daeda06ca0000aa6d05e9c1b5f3596edf19522f` |

The committed runtime source directory is `ops/malware-scanning/clamav-evaluation/`. Its source contract comprises the repository-root `.gitattributes` rules and these committed files:

- `Dockerfile.clamav`
- `README.md`
- `clamd.conf`
- `compose.yml`
- `freshclam.conf`
- `freshclam-update.conf`
- `validate.sh`

The numeric identity correction changed exactly `Dockerfile.clamav`, `README.md`, `compose.yml`, and `validate.sh`.

Correction patch evidence:

- Verified Windows patch: `F:\lexora\lexora-clamav-u100g101-fix-20260729-231912.patch`
- SHA-256: `bf32fa7916d28b838bd3917afa258bbbce048ca796371d782f1244e05646e9d7`
- The patch was detached-applied and statically validated locally and on the Ubuntu server.
- The committed diff matched the verified patch byte-for-byte.
- The Windows patch file is evidence outside Git and is not represented as a tracked repository file.

### Immutable upstream and derived images

Approved upstream contract:

- ClamAV version: `1.5.3`
- Upstream variant: `1.5.3_base`
- Platform: `linux/amd64`
- Immutable upstream digest: `sha256:70bbc4014906f34865929733073feb1097601aa6aa5f06a062939c0ca52a2928`

Superseded incorrect local derived image:

- Tag: `lexora/clamav-evaluation:1.5.3-base-70bbc4014906`
- Image ID: `sha256:9576fb212fb4b8318fa47f029e66d89bdee3174bf5fcdd053d73c46b292bacb3`
- Incorrect assumed default user: `1000:1000`
- The image remains preserved for evidence but must not be used for continued evaluation.

Corrected derived image:

- Tag: `lexora/clamav-evaluation:1.5.3-base-70bbc4014906-u100g101`
- Image ID: `sha256:19080f2f3d1aa57c8cf41617773340f21d16d793d6cbd9ffa4d21e243742a7fb`
- Runtime identity: `100:101`
- Entrypoint: `/usr/sbin/clamd --foreground`
- `io.lexora.runtime.status` label: `evaluation-only`
- Size reported by image inspection: `43,844,757` bytes
- Docker image-list display size: approximately `168 MB`

The byte size and image-list display size come from different Docker reporting fields and are not treated as contradictory.

The corrected image was built with `--no-cache`, RUN-network access disabled through `--network=none`, and automatic base pulling disabled through `--pull=false`, from the exact pinned base digest. Build-time assertions confirmed:

- exactly one `clamav` passwd entry;
- UID `100`;
- primary GID `101`;
- named `clamav` group GID `101`;
- expected ClamAV and FreshClam versions;
- expected reviewed configuration; and
- an empty image-layer signature directory.

### Numeric identity failure and correction

Original failed updater container:

- Container ID: `d25b10fd3444f1e3da5f7dd70c24c1080e3b5346000d920bd3287c94ce3fe87f`
- State: `Exited`
- Exit code: `2`
- Restart count: `0`
- OOM killed: `false`

`freshclam` could not open `/var/log/clamav/freshclam.log`; the error was `Permission denied`. The committed runtime assumed `1000:1000`, while the pinned base image defines the named `clamav` account as UID `100`, primary GID `101`, and named group GID `101`.

This was a source-level numeric-identity mismatch. It occurred before any signature database download, the signature volume remained empty, the scanner had not been created or started, and TCP `3310` remained closed. It was not a ClamAV mirror or network failure.

Preserved failure evidence:

- Path: `/home/sh002/lexora-clamav-updater-failure-evidence-20260729T162250Z.txt`
- Mode: `0600`
- SHA-256: `9b390f2641832d89ee320774b7b5d2f9c717780f9f1dcf81c041d7f6f3cdfd92`

The failed container was removed only after its evidence was preserved and hash-verified. The signature volume, updater network, superseded image, and corrected image were not deleted.

### Corrected updater create-only contract

Corrected updater container:

- Container ID: `dc98ff6a54805c135fe56e7caaf2a97d4ea56710a47c5a7b6304e7efe23d3c7e`
- Image tag: `lexora/clamav-evaluation:1.5.3-base-70bbc4014906-u100g101`
- Image ID: `sha256:19080f2f3d1aa57c8cf41617773340f21d16d793d6cbd9ffa4d21e243742a7fb`
- Initial state: `Created`
- Initial running state: `false`
- Initial PID: `0`
- Initial `StartedAt`: `0001-01-01T00:00:00Z`

The exact updater command was:

```sh
chown 100:101 /var/lib/clamav /var/log/clamav
exec freshclam --stdout --config-file=/etc/clamav/freshclam-update.conf
```

The updater starts as `0:0` only to prepare mount-point ownership. It adds exactly `CHOWN`, `SETUID`, and `SETGID`, drops all other capabilities, uses a read-only root filesystem and `no-new-privileges`, has restart disabled, joins only the updater egress network, publishes no port, mounts the signature volume writable, retains bounded resource limits, and uses a log tmpfs owned by UID `100`, GID `101`.

`DatabaseOwner clamav` remains unchanged and is correct because `freshclam` drops to the named account.

### Signature initialization runtime verification

The corrected updater was started exactly once and completed successfully.

Updater result:

- Status: `exited`
- Running: `false`
- PID: `0`
- Exit code: `0`
- OOM killed: `false`
- Runtime error: empty
- Restart count: `0`
- Started: `2026-07-29T17:46:13.848030691Z`
- Finished: `2026-07-29T17:46:50.999633292Z`

Official database initialization results:

| Database | Runtime version | Signature count reported by FreshClam |
| -------- | --------------: | ------------------------------------: |
| Daily    |         `28076` |                              `355575` |
| Main     |            `63` |                             `3287027` |
| Bytecode |           `339` |                                  `80` |

Each downloaded database passed ClamAV's database test before activation.

Verified signature-volume summary:

- Regular files: `7`
- Zero-length files: `0`
- Symbolic links: `0`
- Special files: `0`
- Wrong UID/GID entries: `0`
- Group/other-writable entries: `0`
- Set-ID/sticky entries: `0`
- Total regular-file bytes: `112803354`
- All files are owned by UID `100`, GID `101`.
- File mode: `0644`

Safe signature metadata only:

| File                    |      Bytes |
| ----------------------- | ---------: |
| `bytecode-339.cvd.sign` |     `9078` |
| `bytecode.cvd`          |   `281702` |
| `daily-28076.cvd.sign`  |     `9078` |
| `daily.cvd`             | `23421751` |
| `freshclam.dat`         |       `90` |
| `main-63.cvd.sign`      |     `9078` |
| `main.cvd`              | `89072577` |

No signature database contents are recorded.

Preserved success evidence:

- Path: `/home/sh002/lexora-clamav-signature-init-evidence-20260729T174651Z.txt`
- Mode: `0600`
- SHA-256: `cd082ceded80b4b0a3c4fcb10c04177bd4c0255f2e9691e12482304007a44a3b`

### Scanner create-only verification

Scanner container:

- Container ID: `4cdd2c3d1d8018eb2c4913889ccf8420d35f423953441912a455c078d8d73213`
- State: `Created`
- Running: `false`
- PID: `0`
- `StartedAt`: `0001-01-01T00:00:00Z`
- The scanner has never been started.

Verified scanner create-only contract:

- Image: corrected `lexora/clamav-evaluation:1.5.3-base-70bbc4014906-u100g101` image
- User: `100:101`
- Direct entrypoint: `/usr/sbin/clamd --foreground`
- Read-only root filesystem
- All capabilities dropped and no capabilities added
- `no-new-privileges`
- Restart policy: `unless-stopped`
- Signature volume mounted read-only
- Bounded tmpfs mounts only for `/tmp` and `/var/log/clamav`
- Scanner log tmpfs owned by UID `100`, GID `101`
- Health command: `clamdcheck.sh`
- Health interval: `10 seconds`
- Health timeout: `5 seconds`
- Health retries: `12`
- Start period: `15 minutes`
- Resource limits remain bounded
- Host port publication configured only as `127.0.0.1:3310`

Internal scanner network:

- Name: `lexora_clamav_scanner_internal`
- Network ID: `408c60962985374aa3d06649f289697c3d83818bda02d4d4c89b2879dac04f07`
- Driver: `bridge`
- Internal: `true`
- IPv6: disabled
- The updater is not assigned to this network.

Docker pre-start behavior is recorded precisely: container network assignment exists in scanner configuration and the network object exists, while the live `Containers` endpoint map is empty because the scanner has never started. This is expected create-only Docker behavior. Live scanner attachment must be verified after the first start.

TCP `3310` had no listening socket at this stopping point.

### Inspection-script findings

Two non-source mistakes occurred in ad-hoc inspection assertions:

1. An inspection check searched for `exec freshclam --config-file=...` and initially missed the valid committed command because that command includes `--stdout`.
2. A pre-start network check incorrectly required the never-started scanner to appear in the network's live `Containers` map.

Both were ad-hoc verification assertion errors, not source or runtime-contract defects. Neither required source modification, container recreation, or network recreation. The later incomplete scanner-readiness command is intentionally not described because it was not executed.

### Security and isolation controls preserved

The following were verified through source, resolved Compose model, image inspection, and create-only/runtime checks:

- The scanner has no updater-network attachment.
- The updater is the only service with outbound-capable networking.
- The scanner network is internal and has IPv6 disabled.
- Scanner port publication is configured for loopback only; no LAN or public ClamAV exposure exists.
- No Nginx route was added.
- The scanner drops all capabilities and adds none.
- The updater has only the three required temporary capabilities.
- The scanner signature mount is read-only; the updater signature mount is writable.
- Both service root filesystems are read-only.
- Tmpfs paths and sizes are bounded.
- No secret, credential, token, signature database, or test-malware payload is embedded in the image.
- API, PM2, Nginx, PostgreSQL, Prisma, application environment, and production routes were not changed by these evaluation-runtime operations.
- Production upload remained disabled.

### Repository and runtime state at the stopping point

- Local and remote source commit: `7daeda06ca0000aa6d05e9c1b5f3596edf19522f`
- Ubuntu server source commit: `7daeda06ca0000aa6d05e9c1b5f3596edf19522f`
- Repositories were clean.
- The updater container remains successfully exited with code `0`.
- The scanner container exists in `Created` state and has never started.
- The scanner internal network exists but has no live endpoint.
- The signature database volume is initialized.
- TCP `3310` is not listening.
- Both superseded and corrected derived images remain preserved.
- No production upload was enabled.

### Runtime verdict

Verified:

- [x] Isolated ClamAV evaluation-runtime source implemented and committed.
- [x] Immutable `_base` upstream digest verified.
- [x] Evaluation-only derived image built.
- [x] Base-image numeric account identity discovered through runtime evidence.
- [x] Incorrect `1000:1000` assumption corrected to `100:101`.
- [x] Corrected source committed and synchronized.
- [x] Corrected image build and image contract verified.
- [x] Original updater failure preserved with evidence and hash.
- [x] Corrected updater create-only contract verified.
- [x] Official signature initialization completed successfully.
- [x] Main, daily, and bytecode databases are present and non-empty.
- [x] Signature ownership and safe metadata checks passed.
- [x] Scanner create-only container contract verified.
- [x] Internal scanner-network source/configuration contract verified.
- [x] Updater/scanner separation preserved.
- [x] Loopback-only scanner publication remains configured.
- [x] Production upload remained disabled.

Pending:

- [ ] Scanner daemon has not been started.
- [ ] Docker health/readiness has not been verified.
- [ ] Protocol-level `PONG` has not been verified.
- [ ] Live scanner-network endpoint attachment has not been verified.
- [ ] Loopback listener behavior after startup has not been verified.
- [ ] Non-loopback connection rejection after startup has not been verified.
- [ ] Runtime process UID/GID and zero-capability state after startup have not been verified.
- [ ] Real clean-file scanning has not been verified.
- [ ] Protocol-safe EICAR detection has not been verified.
- [ ] Real API-adapter-to-daemon scanning has not been verified.
- [ ] Scanner-down and timeout fail-closed behavior has not been runtime verified against the real daemon.
- [ ] Graceful stop and restart behavior remain pending.
- [ ] Signature persistence across scanner restart remains pending.
- [ ] Host reboot persistence remains pending.
- [ ] Stored-MinIO-byte scan orchestration is not implemented.
- [ ] Persisted real CLEAN/INFECTED/ERROR result flow is not implemented.
- [ ] CLEAN-only guarded promotion is not implemented.
- [ ] Quarantine rejection and reconciliation flow are not operational end-to-end.
- [ ] Complete secure upload/download workflow is not complete.
- [ ] Production upload is not enabled.

> The isolated ClamAV evaluation runtime is implemented, source-reviewed, committed, synchronized, and partially runtime verified. The corrected `100:101` image contract, controlled updater execution, official signature initialization, signature-volume integrity, scanner create-only contract, internal-network configuration, and loopback-only publication configuration are verified. The scanner daemon has not yet been started, and daemon readiness, protocol PONG, live network attachment, real clean/EICAR scanning, scanner-down behavior, restart/persistence, API-to-daemon integration, stored-MinIO-byte orchestration, persisted real scan outcomes, and CLEAN-only activation remain pending. Production file upload remains disabled.

### Narrow supersession note

This section supersedes earlier pending wording only for:

- isolated ClamAV evaluation-runtime source;
- immutable upstream image selection;
- derived image build;
- correct runtime account identity;
- official signature initialization; and
- scanner create-only configuration.

It does not supersede pending statements concerning:

- daemon readiness;
- real clean/EICAR scanning;
- scanner-down behavior;
- restart/persistence;
- stored-byte orchestration;
- persisted scan results;
- activation/promotion;
- attachment integration;
- signed delivery;
- complete secure upload/download verification; or
- production upload enablement.

### Next safe checkpoint

1. Start only the existing scanner container for the first time.
2. Use a bounded readiness window.
3. Verify:
   - healthy state;
   - no restart;
   - no OOM/runtime error;
   - exact process identity;
   - zero effective, permitted, and ambient capabilities;
   - direct clamd PID 1;
   - read-only signature mount;
   - live scanner-only internal-network attachment;
   - loopback-only TCP `3310` listener;
   - rejection through non-loopback host addresses;
   - protocol-level `PONG`; and
   - unchanged signature hashes.
4. Preserve readiness evidence with a hash.
5. On any failure, stop only the scanner and preserve all Docker objects for diagnosis.
6. Do not run clean-file or EICAR tests in the same checkpoint.
7. Do not implement stored-byte orchestration yet.
8. Keep production upload disabled.

## Isolated ClamAV Scanner Startup Defect Evidence and Source Correction — 2026-07-30

### Scope and runtime evidence

This later checkpoint supersedes the prior create-only stopping point only for first scanner startup, internal IPv4 protocol reachability, inherited healthcheck behavior, host-loopback publication behavior, and controlled SIGTERM. It preserves all earlier image, signature-initialization, failure, create-only, identity, isolation, and evidence records.

Runtime verification established:

- ClamAV `1.5.3` loaded `3,627,981` official signatures.
- `clamd` bound to container IPv4 `0.0.0.0:3310`.
- An explicit container request to `127.0.0.1:3310` returned exactly `PONG`.
- The inherited `/usr/local/bin/clamdcheck.sh` used `nc localhost 3310`.
- `localhost` resolved first to IPv6 `::1`, while clamd listened on IPv4, so the inherited healthcheck failed despite successful explicit IPv4 PING/PONG.
- Scanner configuration retained host publication `127.0.0.1:3310`, but runtime container inspection reported the port mapping as `None` and the host had no TCP `3310` listener.
- The scanner network combined `internal: true` with `gateway_mode_ipv4: isolated`; isolated gateway mode prevented the host bridge/NAT path needed for loopback publication.
- Controlled explicit SIGTERM stopped clamd immediately with exit code `0`.

No clean-file, EICAR, API-integration, reload, or restart-persistence test was run. Production upload remained disabled.

### Root causes and source correction

Two runtime-confirmed defects were isolated:

1. The inherited healthcheck used ambiguous `localhost` resolution and selected IPv6 `::1`, which did not match the IPv4 clamd listener.
2. Isolated IPv4 gateway mode made the internal scanner bridge non-host-addressable, so Docker could not activate the configured host-loopback publication.

The source correction adds the Lexora-owned `lexora-clamd-healthcheck.sh`. It uses bounded BusyBox-compatible `nc` options, explicit `127.0.0.1:3310`, sends `PING`, requires exactly `PONG`, suppresses provider diagnostics, and fails closed with sanitized output. The derived image copies it as root-owned mode `0555`, and Compose invokes it directly.

The network correction removes only `gateway_mode_ipv4: isolated`. The scanner network remains `internal: true` with IPv6 disabled, the scanner remains detached from the updater network, and host publication remains exactly `127.0.0.1:3310`. Removing isolated gateway mode assigns the internal bridge a host-side address and makes the scanner network host-addressable in both directions: the host can reach the scanner network, and the scanner can potentially reach host services bound to the bridge address or wildcard host addresses. This is an expanded scanner-to-host trust path. It does not by itself expose TCP `3310` to LAN or public interfaces because publication remains bound to `127.0.0.1`, but `internal: true` does not isolate the scanner from host listeners. Scanner-to-host isolation is not verified.

A proxy/forwarder was rejected because it adds another process or container, image lifecycle, network policy, and attack surface. Host networking and a non-internal scanner bridge were rejected because they weaken isolation more broadly.

### Corrected-source status and pending verification

The corrected source is statically reviewed only. It has not been built or runtime verified, and no Docker runtime object was changed by this source checkpoint.

Verified before the source correction:

- [x] Signature initialization completed successfully.
- [x] clamd startup and official-signature loading completed.
- [x] Explicit internal IPv4 PING/PONG passed.
- [x] Inherited healthcheck failure root cause was identified.
- [x] Host-loopback publication failure root cause was identified.
- [x] Controlled SIGTERM passed once with exit code `0`.
- [x] Production upload remained disabled.

Pending after the source correction:

- [ ] Corrected image has not been built.
- [ ] Lexora-owned healthcheck has not been runtime verified.
- [ ] Docker healthy state has not been verified with the corrected image.
- [ ] Host `127.0.0.1:3310` listener has not been verified.
- [ ] Absence of non-loopback/LAN/public listeners has not been verified.
- [ ] Scanner external and LAN connection rejection has not been verified.
- [ ] All host TCP listeners must be captured before scanner-network recreation.
- [ ] Listeners bound to `0.0.0.0`, `::`, non-loopback addresses, and Docker bridge addresses must be identified.
- [ ] Scanner reachability to the Docker host bridge address must be tested.
- [ ] The Lexora API, PostgreSQL, administrative interfaces, container-management endpoints, and every other sensitive host listener must be confirmed inaccessible or explicitly reviewed and accepted.
- [ ] Unexpected host-service access must fail the checkpoint and roll back only the corrected scanner/network objects.
- [ ] The host-listener inventory, reachability results, acceptance decisions, and rollback outcome must be preserved as hashed evidence.
- [ ] Scanner-only live internal-network attachment must be reverified.
- [ ] Runtime UID/GID and zero effective/permitted/ambient capabilities must be reverified.
- [ ] Signature hashes after corrected startup must be verified unchanged.
- [ ] API-to-real-daemon scanning remains pending.
- [ ] Clean-file and protocol-safe EICAR tests remain pending.
- [ ] Scanner-down, reload, restart, and persistence tests remain pending.
- [ ] Stored-MinIO-byte orchestration and persisted real scan outcomes remain pending.
- [ ] The secure upload pipeline remains incomplete.
- [ ] Production upload remains disabled.

### SUPERSEDED - DO NOT EXECUTE: former TCP "Next safe runtime checkpoint"

This section is retained only as historical runtime evidence. Its TCP recreation instructions are superseded by the later networkless Unix-socket foundation and must not be executed.

Under separate explicit approval, first capture and preserve a complete host TCP-listener inventory, identifying `0.0.0.0`, `::`, non-loopback, and Docker bridge bindings. Then rebuild the corrected image without cache or an automatic base pull, recreate only the evaluation scanner/network objects needed by the committed source, and use a bounded readiness window. Verify the Lexora healthcheck, exact process identity and zero capabilities, direct clamd PID 1, read-only signatures, live scanner-only internal-network attachment, exact host-loopback listener, non-loopback listener absence, scanner LAN/external denial, explicit `PONG`, and unchanged signature hashes. Test scanner reachability to the Docker host bridge address and specifically verify that the Lexora API, PostgreSQL, administrative interfaces, container-management endpoints, and all other sensitive host listeners are inaccessible or explicitly reviewed and accepted. Any unexpected host-service access must fail the checkpoint and roll back only the corrected scanner/network objects. Preserve and hash the listener inventory, reachability evidence, review decisions, and rollback result. Do not combine that checkpoint with clean-file or EICAR testing.
## ClamAV networkless Unix-socket source foundation checkpoint

This source-only checkpoint supersedes the internal-bridge loopback publication design. Runtime evidence showed that the scanner could become healthy while Docker retained the requested `127.0.0.1:3310` binding only in `HostConfig`; the running port mapping was null and no host TCP listener activated.

Implemented source contract:

- [x] API configuration requires an explicit `unix` or `tcp` transport and rejects mixed or missing ClamAV endpoints.
- [x] Evaluation configuration selects only `/run/lexora-clamav/clamd.sock`; it has no localhost fallback.
- [x] Scanner uses `network_mode: none`, no networks, no ports, and no expose declaration.
- [x] `clamd` has no active TCP directive and creates the exact local socket with mode `0660`.
- [x] Scanner bind mount is limited to `/run/lexora-clamav`; updater does not receive it.
- [x] Scanner UID and socket GID are mandatory externally supplied high numeric values; root, system-range, UID 100, and GID 101 are rejected.
- [x] Signature storage remains read-only in the scanner, and the existing read-only root, tmpfs, capability, resource, and updater-egress boundaries remain.
- [x] Health source uses the statically verified bounded `clamdscan --ping=3:1` Unix-socket probe and no TCP endpoint.

Follow-up root-managed/runtime checkpoint status:

- [x] Collision-checked and provisioned dedicated scanner UID `20000` and shared socket GID `20001`.
- [x] Provisioned `/run/lexora-clamav` through `/etc/tmpfiles.d/lexora-clamav.conf` as `20000:20001` mode `2750`.
- [x] Added the current PM2 service account `sh002` to `lexora-clamav-socket`; no PM2 restart was performed, so the existing live API process has not yet inherited the new supplementary group.
- [ ] After a controlled API restart, verify socket connection and prove that the API identity cannot unlink or replace the socket.
- [x] Rebuilt and inspected the corrected Unix-socket image with the collision-checked UID/GID.
- [x] Cross-checked image ID, `Config.User`, UID/GID labels, entrypoint, and collision-checked host identities.
- [x] Verified live Unix-socket type, owner, group, mode, readiness, and absence of host/container TCP `3310` listeners.
- [ ] Verify authorized API access and unauthorized-user/process denial.
- [ ] Verify graceful restart, forced stop, stale-socket recovery, and host reboot lifecycle.
- [ ] Run clean-file and EICAR behavior against the real daemon.
- [ ] Verify API-to-real-daemon integration and scanner-down/timeout fail-closed behavior.
- [ ] Integrate and verify scanning of bytes freshly read from MinIO.

This source-foundation subsection is retained as the implementation boundary; the following section records the later host provisioning and runtime-readiness evidence. Production upload remains disabled.

## ClamAV networkless Unix-socket host provisioning and readiness runtime verification

Runtime verification date: 2026-07-30

Tested source:

- Commit: `f5fef8d1d09bd93fdac09d40e72c66a4df42b91c`
- Message: `Add networkless ClamAV Unix socket foundation`
- Server repository was fast-forwarded to the tested commit.
- Server static source validation passed.
- Server resolved Docker Compose-model validation passed.
- The Lexora API was not rebuilt or restarted during this scanner checkpoint.

Host identity and runtime-directory provisioning:

- [x] UID `20000` was unused and did not collide with subordinate UID ranges.
- [x] GID `20001` was unused and did not collide with subordinate GID ranges.
- [x] Runtime user created:
  - Name: `lexora-clamav`
  - UID: `20000`
  - Primary GID: `20001`
  - Shell: `/usr/sbin/nologin`
  - Home: `/nonexistent`
- [x] Shared socket group created:
  - Name: `lexora-clamav-socket`
  - GID: `20001`
- [x] Current PM2 service account `sh002` was added to the shared socket group.
- [x] Root-managed tmpfiles rule created:
  - File: `/etc/tmpfiles.d/lexora-clamav.conf`
  - Rule: `d /run/lexora-clamav 2750 lexora-clamav lexora-clamav-socket - -`
- [x] Runtime directory verified:
  - Path: `/run/lexora-clamav`
  - Owner: `lexora-clamav:lexora-clamav-socket`
  - UID/GID: `20000:20001`
  - Mode: `2750`

Corrected image build and inspection:

- [x] Image built without starting the scanner:
  - Tag: `lexora/clamav-evaluation:1.5.3-base-70bbc4014906-unix-socket`
  - Image ID: `sha256:ead16d5b2e78e6bbf56b0ac4c8561a63d5165ff15b3ae533c91e57a01576bc2c`
- [x] Image runtime identity:
  - `Config.User`: `20000:20001`
  - Scanner UID label: `20000`
  - Socket GID label: `20001`
- [x] Entrypoint:
  - `/usr/sbin/clamd`
  - `--foreground`

Create-only verification:

- [x] Previous stopped scanner container was replaced without starting the new container.
- [x] Current scanner container ID:
  - `240dc6fa8bc98a503add2eb65225132d8efbc4df8026ee7377c7843368447a32`
- [x] Before startup, the recreated container was:
  - Status: `created`
  - Running: `false`
  - Network mode: `none`
  - Read-only root filesystem: `true`
  - Port bindings: none
- [x] Mount contract:
  - Signature volume mounted read-only at `/var/lib/clamav`
  - Single writable bind mounted from `/run/lexora-clamav` to `/run/lexora-clamav`
- [x] The Unix socket was absent before scanner startup.

Scanner readiness runtime verification:

- [x] Scanner became healthy during the bounded readiness window.
- [x] Readiness reached `healthy` on attempt 4.
- [x] Runtime state:
  - Status: `running`
  - Health: `healthy`
  - Restart count: `0`
  - OOM-killed: `false`
  - Process: `/usr/sbin/clamd --foreground`
- [x] Process identity:
  - UID: `20000`
  - GID: `20001`
- [x] Runtime hardening:
  - Root filesystem read-only
  - `CapDrop: ALL`
  - Inheritable, permitted, effective, bounding, and ambient capabilities all zero
  - `NoNewPrivs: 1`
  - Seccomp mode: `2`
  - Docker network mode: `none`
- [x] Unix-socket contract:
  - Path: `/run/lexora-clamav/clamd.sock`
  - Type: Unix socket
  - Owner: `lexora-clamav:lexora-clamav-socket`
  - UID/GID: `20000:20001`
  - Mode: `0660`
- [x] The bounded Lexora ClamAV readiness script returned:
  - `ClamAV readiness passed`
- [x] Host TCP port `3310` was closed.
- [x] Container TCP port `3310` was absent.

Live Lexora API containment:

- [x] PM2 process `lexora-api` remained online.
- [x] PM2 restart count remained `0`.
- [x] PM2 watch/reload remained disabled.
- [x] Direct API health through `127.0.0.1:4000` passed.
- [x] API health through Nginx passed.
- [x] No API build, PM2 restart, database change, Prisma operation, Nginx change, or production deployment was performed.

Still pending:

- [ ] Recompare the live signature manifest against the preserved pre-recreation baseline.
- [ ] Verify authorized socket access using the effective API runtime identity after a controlled PM2 restart.
- [ ] Verify unauthorized user/process connection denial.
- [ ] Verify that the API identity cannot unlink or replace the socket.
- [ ] Verify graceful restart, forced stop, stale-socket recovery, and host reboot lifecycle.
- [ ] Run protocol-level clean-file behavior against the real daemon.
- [ ] Run protocol-safe EICAR behavior against the real daemon.
- [ ] Verify API-to-real-daemon scanning and scanner-down/timeout fail-closed behavior.
- [ ] Integrate and verify scanning of bytes freshly read from MinIO.
- [ ] Persist and verify real scan outcomes through the secure file lifecycle.
- [ ] Complete and runtime-verify the secure upload/download pipeline.
- [ ] Enable production upload.

Runtime verdict:

- Networkless Unix-socket ClamAV host provisioning: verified.
- Corrected scanner image identity and configuration: verified.
- Scanner startup and readiness: verified.
- TCP scanner exposure: absent.
- API integration and malware behavior: not yet verified.
- Production upload remains disabled.

## ClamAV Unix Runtime, API Activation, and Real Adapter Verification — 2026-07-30

### Scope and classification

This section consolidates the latest reviewed runtime evidence for the
networkless ClamAV Unix-socket evaluation runtime, signature and socket
security, lifecycle recovery, host reboot persistence, Lexora API activation,
and real compiled malware-scanner adapter behavior.

This section supersedes earlier pending wording only for the exact ClamAV
items explicitly marked as verified below. Historical implementation,
failed-attempt, correction, and runtime evidence remains preserved in earlier
sections.

The ClamAV deployment remains an evaluation runtime. It is not yet a complete
production file-upload pipeline. Production file upload remains disabled.

### Repository and source boundary

| Item                                    | Verified value                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Documentation base commit               | `f66b70736d773d52797f880ebc846a27450a2220`                                |
| Documentation base subject              | `Document ClamAV Unix socket runtime readiness`                           |
| Unix-socket source foundation commit    | `f5fef8d1d09bd93fdac09d40e72c66a4df42b91c`                                |
| Unix-socket source message              | `Add networkless ClamAV Unix socket foundation`                           |
| Scanner image                           | `sha256:ead16d5b2e78e6bbf56b0ac4c8561a63d5165ff15b3ae533c91e57a01576bc2c` |
| Scanner container at documentation time | `240dc6fa8bc98a503add2eb65225132d8efbc4df8026ee7377c7843368447a32`        |
| API PID at documentation time           | `24274`                                                                   |
| API restart count at documentation time | `15`                                                                      |

The committed Unix-socket foundation preserves:

- [x] explicit `unix` or `tcp` scanner transport selection;
- [x] exact Unix socket allowlisting;
- [x] no implicit Unix/TCP fallback;
- [x] startup rejection of mixed, missing, or unsupported endpoints;
- [x] existing bounded ClamAV INSTREAM framing and response parsing;
- [x] timeout, cancellation, cleanup, and single-settlement behavior;
- [x] sanitized `CLEAN`, `INFECTED`, and `ERROR` adapter outcomes;
- [x] networkless evaluation scanner configuration;
- [x] no scanner TCP listener, Docker port publication, or Nginx exposure.

Previously verified source checks included focused configuration and adapter
tests, the complete focused File Storage test inventory, focused lint,
API typecheck and build, shell syntax, static validation, resolved Compose
validation, and `git diff --check`.

### Host identity, runtime directory, and daemon containment

The following host/runtime controls are runtime verified:

- [x] dedicated scanner user `lexora-clamav`;
- [x] scanner UID `20000`;
- [x] shared socket group `lexora-clamav-socket`;
- [x] shared socket GID `20001`;
- [x] PM2 service account `sh002` is a member of the socket group;
- [x] root-managed tmpfiles rule provisions `/run/lexora-clamav`;
- [x] runtime directory owner/mode is `20000:20001:2750`;
- [x] socket owner/mode is `20000:20001:0660`;
- [x] scanner runs with `network_mode: none`;
- [x] scanner root filesystem is read-only;
- [x] signature storage is mounted read-only in the scanner;
- [x] scanner runtime capabilities are zero;
- [x] `NoNewPrivs` and seccomp containment remain active;
- [x] host and container TCP port `3310` remain absent;
- [x] scanner health is successful through its bounded Unix-socket probe.

The scanner socket is:

`/run/lexora-clamav/clamd.sock`

The scanner must not be exposed through TCP, LAN, Nginx, or the public
internet.

### Signature integrity and socket access control

Runtime verification established:

- [x] the preserved signature baseline manifest remained intact;
- [x] seven regular signature files were present;
- [x] no zero-length signature file was present;
- [x] no signature symlink or special file was present;
- [x] signature ownership and modes remained within the reviewed contract;
- [x] authorized Unix-socket `PING/PONG` succeeded as the intended service
      identity;
- [x] unauthorized connection as `nobody` was denied;
- [x] the API service identity could not unlink the scanner socket;
- [x] the API service identity could not replace, rename over, or create an
      entry over the scanner socket path;
- [x] the socket remained present and healthy after the negative tests.

No signature content was printed, copied into documentation, or committed.

### Protocol-level daemon behavior

The real daemon completed the separately controlled protocol checkpoints:

- [x] clean input returned the exact clean response;
- [x] protocol-safe runtime-generated EICAR input was detected;
- [x] no literal EICAR payload was printed, persisted, or committed;
- [x] timeout behavior failed closed;
- [x] scanner-down behavior failed closed;
- [x] no scanner failure was accepted as a trusted clean result.

These protocol tests were independent of the later compiled Lexora adapter
tests.

### Scanner lifecycle and recovery

The existing scanner runtime passed:

- [x] graceful stop and restart;
- [x] clean socket removal during graceful shutdown;
- [x] socket recreation with the exact owner and mode;
- [x] signature persistence across graceful recovery;
- [x] forced `SIGKILL` recovery;
- [x] stale-socket recovery after forced termination;
- [x] preserved scanner container and image identity;
- [x] preserved updater state;
- [x] no OOM kill;
- [x] no TCP listener introduced during recovery.

### Host reboot persistence

The host reboot checkpoint verified recovery of:

- [x] Docker;
- [x] the networkless ClamAV scanner;
- [x] the root-managed tmpfiles runtime directory;
- [x] the Unix socket;
- [x] signature data;
- [x] scanner health;
- [x] the shared socket group available to the API process;
- [x] PM2 process resurrection;
- [x] direct API health;
- [x] Nginx-proxied API health;
- [x] loopback-only API binding.

The reboot checkpoint did not enable production upload or expose ClamAV over
TCP.

### Server API build and Unix configuration activation

Server-side verification passed for:

- [x] `pnpm --filter @lexora/api typecheck`;
- [x] `pnpm --filter @lexora/api build`;
- [x] compiled Unix endpoint configuration;
- [x] existing PM2 application launch contract;
- [x] NestJS dependency-injection boot;
- [x] direct API health;
- [x] Nginx-proxied API health;
- [x] API binding only to `127.0.0.1:4000`.

The active scanner configuration is now aligned in both runtime environment
files:

- `/.env` relative to the repository root;
- `/apps/api/.env` relative to the repository root.

Both contain only the reviewed Unix scanner endpoint:

- `MALWARE_SCANNER_MODE=clamav`;
- `MALWARE_SCANNER_TRANSPORT=unix`;
- `MALWARE_SCANNER_SOCKET_PATH=/run/lexora-clamav/clamd.sock`;
- `MALWARE_SCANNER_TIMEOUT_MS=10000`.

`MALWARE_SCANNER_HOST` and `MALWARE_SCANNER_PORT` are absent from both files.

No environment secret or unrelated environment value is recorded in this
checklist.

### Activation incident and correction

The first controlled activation exposed an environment-consistency defect:

1. the root environment was changed to the valid Unix endpoint;
2. a legacy secondary API environment still supplied TCP host and port values;
3. NestJS configuration validation therefore received a mixed Unix/TCP
   configuration;
4. the fail-closed schema correctly rejected startup;
5. the attempted legacy rollback was also incompatible with the new schema
   because ClamAV mode now requires an explicit transport.

Read-only probes confirmed:

- the root environment parsed as valid Unix configuration;
- the compiled `validateEnv()` accepted the root environment by itself;
- PM2 daemon and systemd service environments did not contain stale scanner
  variables;
- immediately before NestJS validation, the process environment still
  contained the legacy TCP values matching the secondary API environment.

The focused correction synchronized the scanner-only block in both runtime
environment files to the same Unix configuration. Non-scanner environment
content remained unchanged.

After synchronization:

- [x] PM2 `lexora-api` returned online;
- [x] direct and Nginx health passed;
- [x] API process inherited supplementary GID `20001`;
- [x] the API listener remained `127.0.0.1:4000`;
- [x] TCP port `3310` remained closed;
- [x] the scanner remained healthy and networkless;
- [x] the PM2 process list was saved.

Operational lesson:

> All environment files that may contribute to NestJS startup must preserve
> one identical scanner transport contract. A legacy TCP endpoint must never
> coexist with the Unix endpoint.

### Real compiled Lexora adapter clean scan

The actual compiled Lexora
`ClamAvMalwareScannerAdapter` was instantiated through the real compiled
storage configuration and connected to the live daemon through the reviewed
Unix socket.

Runtime result:

- [x] implementation was the compiled Lexora adapter;
- [x] endpoint kind was `unix`;
- [x] socket path was the allowlisted runtime path;
- [x] scanner identifier was `clamav`;
- [x] clean input returned `CLEAN`;
- [x] no malware signature was attached to the clean result;
- [x] no error diagnostics were attached to the clean result;
- [x] PM2 PID and restart count remained unchanged;
- [x] API and scanner remained healthy;
- [x] no TCP listener appeared.

### Real compiled Lexora adapter EICAR detection

A separate runtime checkpoint generated the standard EICAR test input only in
memory from numeric character codes.

The checkpoint:

- [x] verified the runtime-generated payload hash before scanning;
- [x] did not print the literal test payload;
- [x] did not write the payload to disk;
- [x] cleared the in-memory payload buffer after scanning;
- [x] used the actual compiled Lexora adapter;
- [x] used the real Unix-socket daemon;
- [x] returned `INFECTED`;
- [x] returned a non-empty bounded sanitized signature;
- [x] classified the signature as EICAR;
- [x] did not map infection as a scanner error;
- [x] left API PID, restart count, health, scanner state, and containment
      unchanged.

### Runtime non-regression

At the consolidated documentation checkpoint:

- PM2 status: `online`;
- API PID: `24274`;
- API restart count: `15`;
- direct API health: passed;
- Nginx API health: passed;
- API listener: `127.0.0.1:4000`;
- API supplementary socket GID: present;
- scanner state: running and healthy;
- scanner restart count: `0`;
- scanner network mode: `none`;
- scanner root filesystem: read-only;
- Unix socket contract: `20000:20001:0660`;
- host TCP `3310`: closed;
- PM2 dump: contains the `lexora-api` record;
- repository: clean before documentation.

The runtime tests did not add an upload controller, download controller,
public scanner route, database mutation, Prisma migration, attachment
integration, or frontend upload surface.

Production file upload remains disabled.

### Supersession note

Earlier pending statements are superseded only for:

- real isolated ClamAV daemon startup and readiness;
- signature initialization and integrity;
- Unix-socket access control;
- clean protocol behavior;
- protocol-safe EICAR detection;
- scanner-down and timeout fail-closed behavior;
- graceful lifecycle recovery;
- forced-stop and stale-socket recovery;
- host reboot and tmpfiles/socket/signature persistence;
- server API build on the Unix-capable source;
- controlled Unix environment activation;
- PM2/NestJS API boot using the Unix configuration;
- real compiled Lexora adapter clean scan;
- real compiled Lexora adapter EICAR detection.

Earlier pending statements remain valid for:

- department-scoped scanning of bytes freshly read from MinIO quarantine;
- persistence of real `CLEAN`, `INFECTED`, and `ERROR` outcomes;
- latest-persisted-CLEAN enforcement in the integrated workflow;
- CLEAN-only guarded promotion in the integrated workflow;
- infected/error quarantine and rejection lifecycle;
- retry, worker, and reconciliation behavior;
- database-backed repository and concurrency verification;
- serializable transaction retry handling;
- audit and lifecycle mutation atomicity;
- attachment-resource authorization;
- permission-controlled signed or proxy delivery;
- storage quotas;
- secure upload/download frontend;
- complete production upload/download runtime verification;
- production file upload enablement.

Earlier MinIO, conditional promotion, content-integrity, and trusted content
inspection evidence remains preserved in its existing sections and is not
replaced by this ClamAV section.

### Current accurate status

> The networkless ClamAV Unix-socket foundation is implemented, reviewed,
> committed, synchronized, built, and runtime verified for daemon readiness,
> signature integrity, Unix-socket access control, clean and EICAR protocol
> behavior, scanner-down and timeout failure handling, graceful and forced
> recovery, host reboot persistence, Unix API activation, and real compiled
> Lexora adapter clean/EICAR behavior. The API and scanner are healthy, the API
> remains loopback-only, and ClamAV has no TCP exposure. Stored-MinIO-byte scan
> orchestration, persisted real scan outcomes, integrated CLEAN-only
> promotion, infected/error lifecycle handling, attachment authorization,
> permission-controlled delivery, quotas, frontend integration, and complete
> secure upload/download runtime verification remain pending. Production file
> upload remains disabled.

### Next safe File Storage checkpoint

Implement one focused department-scoped stored-byte scan orchestration phase:

1. resolve a department-scoped `PENDING_SCAN` file record;
2. open a fresh quarantine-object stream from MinIO;
3. perform trusted content inspection;
4. scan the trusted stored bytes through the malware-scanner port;
5. persist a sanitized `CLEAN`, `INFECTED`, or `ERROR` outcome;
6. allow guarded promotion only after the latest persisted result is `CLEAN`;
7. retain infected/error objects in quarantine;
8. preserve audit behavior and reconciliation information;
9. verify allowed and blocked department/object cases;
10. keep all production upload and attachment routes disabled.

Do not add a public upload route in the same implementation checkpoint.

## Stored-MinIO-Byte Scan Orchestration Runtime Verification — 2026-08-03

### Classification and scope

This checkpoint records implementation activation and real integrated runtime verification of the department-scoped stored-object malware-scan orchestration introduced by:

- Commit: `69e7093712812906faf6c5cebb93945b23f74929`
- Message: `Add stored-byte malware scan orchestration`

The tested orchestration:

1. resolves an authenticated department-scoped `PENDING_SCAN` file record;
2. validates the exact quarantine storage boundary;
3. reads authoritative object metadata from MinIO;
4. opens fresh object streams for trusted content inspection and malware scanning;
5. verifies streamed byte count and SHA-256;
6. persists a sanitized `CLEAN`, `INFECTED`, or operational `ERROR` result;
7. permits promotion only after the latest persisted result is `CLEAN`;
8. performs object promotion before a guarded serializable database transition;
9. retains infected and error outcomes in quarantine;
10. writes department-scoped audit evidence without exposing private storage locations.

This checkpoint does not enable a public upload route or production file upload.

### Static implementation verification

Verified before runtime activation:

- [x] API typecheck passed.
- [x] API build passed.
- [x] Nine compiled File Storage test files passed.
- [x] Two hundred twenty-two focused File Storage tests passed.
- [x] No test failed or was skipped.
- [x] Formatting, lint-oriented checks and `git diff --check` passed.
- [x] Local, server and `origin/main` aligned at the implementation commit.
- [x] Production upload remained disabled.

### PM2 activation and runtime containment

The reviewed build was loaded through one controlled PM2 restart.

Verified:

- [x] PM2 process `lexora-api` remained online.
- [x] Activated API PID was `29742`.
- [x] PM2 restart count became `1`.
- [x] Direct API health passed.
- [x] Nginx-proxied API health passed.
- [x] API remained bound only to `127.0.0.1:4000`.
- [x] The API process inherited supplementary ClamAV socket GID `20001`.
- [x] The API identity successfully received `PONG` through the Unix socket.
- [x] The live scanner remained healthy.
- [x] The live scanner remained networkless with Docker network mode `none`.
- [x] The scanner had no routable IP or gateway.
- [x] The scanner had no published port.
- [x] Host TCP port `3310` remained absent.
- [x] Scanner restart count remained `0`.
- [x] Scanner root filesystem remained read-only.
- [x] No database or MinIO mutation occurred during activation.
- [x] Nginx configuration was not changed.
- [x] Production upload remained disabled.

The Docker `none` bookkeeping network record was present, but it had no container IP, gateway, global IPv6 address or published port. This is the expected non-routable Docker representation for network mode `none`.

### Real clean stored-byte orchestration

A controlled clean PDF was created in memory and uploaded to the real MinIO quarantine boundary.

Runtime evidence:

- Request ID: `runtime-file-clean-db32edf0-6c6c-498c-97d5-1dc44db2aad1`
- Temporary file-object ID: `cmsdew45o00012ihfgeu9totb`
- Report: `/home/sh002/lexora-stored-byte-clean-runtime-20260803T155627Z.txt`

Verified:

- [x] The canonical active Law-department admin identity was used.
- [x] The request context was principal-scoped to `dept_law_test`.
- [x] A real quarantine object was streamed into MinIO.
- [x] Authoritative object size was verified.
- [x] Registration persisted a department-scoped `PENDING_SCAN` file.
- [x] Trusted content inspection identified the object as PDF.
- [x] The real live ClamAV Unix-socket scanner returned `CLEAN`.
- [x] Fresh streams were used for inspection and scanning.
- [x] Streamed byte count matched persisted size.
- [x] Streamed SHA-256 matched persisted checksum.
- [x] The CLEAN result was persisted with scanner identity and scan timestamp.
- [x] The object was promoted from quarantine to the deterministic available boundary.
- [x] The quarantine source was absent after successful promotion.
- [x] The available object retained the exact byte count and SHA-256.
- [x] PostgreSQL status changed to `AVAILABLE`.
- [x] PostgreSQL object key changed atomically to the available key.
- [x] Three successful audit events were written: registration, scan and availability.
- [x] Safe service results did not expose bucket names or private object keys.
- [x] Audit context did not expose private storage keys.
- [x] Temporary MinIO objects were removed after verification.
- [x] Temporary file and scan rows were removed after verification.
- [x] Three audit evidence rows were retained.
- [x] PM2 PID and restart count remained unchanged.
- [x] Scanner and MinIO container states remained unchanged.
- [x] Direct and Nginx health remained passed.
- [x] Production upload remained disabled.

Decisive result:

- `REAL_CLEAN_STORED_BYTE_ORCHESTRATION=PASSED`

### Initial official-signature infected-fixture observation

An initial attempt embedded the standard antivirus test-vector bytes inside an accepted PDF fixture.

The stored object was inspected as PDF, but the official ClamAV database returned `CLEAN`. The orchestration therefore correctly executed the CLEAN path and produced an availability audit.

Diagnostic evidence:

- Request ID: `runtime-file-infected-792f3fa5-7d8b-49ed-b83a-3c4344e0f659`
- Recorded scan status: `CLEAN`
- Availability audit: present
- Temporary file rows remaining after cleanup: `0`
- Temporary scan rows remaining after cleanup: `0`

This was a test-fixture limitation, not an orchestration defect.

A second in-memory PDF embedded-file fixture was also accepted by the content inspector but returned `CLEAN` from the official signature database.

These attempts must not be described as official-signature infected-path verification.

The literal antivirus test payload was not printed, documented or written to the host filesystem.

### Isolated harmless custom-signature evaluation

To verify the infected lifecycle without weakening the live official scanner:

- a temporary random harmless marker was generated;
- a temporary ClamAV custom signature matched only that marker;
- the temporary signature content and marker bytes were not printed;
- the marker payload was never written as a host file;
- a separate temporary ClamAV daemon used the same reviewed scanner image;
- the temporary daemon used a separate Unix socket and signature directory;
- Docker network mode was `none`;
- the root filesystem was read-only;
- all Linux capabilities were dropped;
- no TCP port was exposed;
- the live official scanner and its signature volume were not changed;
- the production socket allowlist was not changed.

The actual compiled Lexora content inspector accepted the controlled PDF fixture.

The actual compiled Lexora ClamAV adapter returned `INFECTED` with a bounded custom signature.

This evidence is a custom-signature evaluation. It is not an official ClamAV signature-detection claim.

### Real infected stored-byte orchestration

The custom-signature fixture was then exercised through the real orchestration using:

- real PostgreSQL;
- real MinIO stored bytes;
- the actual compiled Lexora content inspector;
- the actual compiled ClamAV adapter;
- an isolated temporary networkless ClamAV daemon;
- an authenticated Law-department request context.

Runtime evidence:

- Request ID: `runtime-file-infected-custom-828b69a5-52f4-4815-915d-6856d6a13725`
- Temporary file-object ID: `cmsdgoiko00012imayri0ztwp`
- Report: `/home/sh002/lexora-infected-orchestration-custom-20260803T164631Z-60209.txt`

Verified:

- [x] A real controlled object was uploaded to the MinIO quarantine boundary.
- [x] Trusted inspection identified the object as PDF.
- [x] Fresh MinIO streams were read by the orchestration.
- [x] The actual compiled ClamAV adapter returned `INFECTED`.
- [x] The bounded custom signature was persisted.
- [x] The persisted result included a real scan timestamp.
- [x] Scanner-error diagnostics were absent.
- [x] The file remained `PENDING_SCAN`.
- [x] The database object key remained in the quarantine boundary.
- [x] The quarantine object remained present during verification.
- [x] The quarantine object retained the expected size and SHA-256.
- [x] No available destination object was created.
- [x] The infected object was not promoted.
- [x] A direct availability attempt was blocked by the latest-persisted-CLEAN guard.
- [x] The blocked attempt did not change lifecycle status or storage key.
- [x] No availability audit was written.
- [x] Registration and infected-scan audit events were written successfully.
- [x] Audit actor, department and target identity matched the controlled runtime context.
- [x] Service results and audit context did not expose private bucket or object keys.
- [x] Temporary MinIO objects were removed after verification.
- [x] Temporary file and scan rows were removed after verification.
- [x] Two audit evidence rows were retained.
- [x] The in-memory marker and payload buffers were cleared.
- [x] The temporary scanner, signature and socket directory were removed.
- [x] The live official scanner was unchanged.
- [x] The live official signature volume was unchanged.
- [x] PM2 process state was unchanged.
- [x] MinIO container state was unchanged.
- [x] Direct and Nginx API health remained passed.
- [x] Source and environment remained unchanged.
- [x] Production upload remained disabled.

Decisive result:

- `CUSTOM_SIGNATURE_INFECTED_ORCHESTRATION=PASSED`

### Supersession note

This section supersedes earlier pending wording only for:

- implementation of department-scoped stored-MinIO-byte scan orchestration;
- activation of the orchestration-containing build;
- real stored-byte trusted inspection;
- real persisted `CLEAN` scan results;
- real CLEAN-only promotion;
- guarded PostgreSQL status and storage-key transition;
- real integrated clean-path MinIO, PostgreSQL and ClamAV verification;
- real persisted `INFECTED` behavior under isolated custom-signature evaluation;
- infected-object quarantine retention;
- infected-object no-promotion behavior;
- latest-persisted-CLEAN enforcement;
- real scan timestamps;
- safe result and audit metadata boundaries;
- cleanup and API/container non-regression for the tested paths.

Earlier pending wording remains valid for:

- a real stored-byte infected result produced by the official ClamAV signature database;
- stored-byte operational `ERROR` persistence using a real scanner failure;
- scanner-down and timeout behavior through the full stored-byte orchestration;
- automatic infected-to-`QUARANTINED` or rejected lifecycle transition;
- retry or worker processing;
- cross-system object-storage/database reconciliation automation;
- attachment-resource authorization;
- permission-controlled signed or proxy delivery;
- database-backed concurrency and serializable retry verification;
- storage quotas;
- audit and lifecycle mutation atomicity;
- secure upload/download controllers and frontend;
- complete production upload/download runtime verification;
- production upload enablement.

### Current accurate status

Implemented and runtime verified:

- [x] Department-scoped stored-byte orchestration.
- [x] Real MinIO quarantine reads.
- [x] Trusted PDF content inspection in the tested paths.
- [x] Real integrated CLEAN persistence.
- [x] CLEAN-only object promotion.
- [x] Guarded `AVAILABLE` status and object-key transition.
- [x] Real integrated custom-signature `INFECTED` persistence.
- [x] Infected object remains in quarantine.
- [x] Infected object is not promoted.
- [x] Latest persisted CLEAN is required before availability.
- [x] Audit actor and department scoping in the tested paths.
- [x] Safe result and audit-storage-location boundaries.
- [x] Runtime cleanup and API/container non-regression.

Partial or evaluation-only:

- [~] The integrated infected-path evidence uses an isolated harmless custom signature, not the live official signature database.
- [~] Infected files remain `PENDING_SCAN` in quarantine; automatic infected lifecycle classification is not implemented.
- [~] Cross-system recovery information exists, but an automated reconciliation worker is not implemented.

Pending:

- [ ] Real stored-byte operational `ERROR` runtime verification.
- [ ] Full orchestration scanner-down and timeout verification.
- [ ] Automatic infected lifecycle transition or reviewed rejection workflow.
- [ ] Retry and worker processing.
- [ ] Attachment-resource authorization.
- [ ] Permission-controlled delivery.
- [ ] Storage quotas.
- [ ] Database-backed concurrency and serializable-retry runtime verification.
- [ ] Audit/lifecycle atomicity hardening.
- [ ] Secure upload/download routes and frontend.
- [ ] Complete production upload/download runtime verification.
- [ ] Production upload enablement.

Correct current statement:

> Department-scoped stored-MinIO-byte scan orchestration is implemented, reviewed, committed, server-built, covered by 222 focused File Storage tests, activated through PM2, and runtime verified for a real clean object using the live official ClamAV scanner and for a real persisted infected outcome using an isolated networkless harmless custom signature. CLEAN-only promotion, guarded status/key transition, quarantine retention, no-promotion and latest-persisted-CLEAN enforcement are runtime verified for the tested paths. Official-signature stored-byte infection, full stored-byte scanner-error behavior, automatic infected lifecycle classification, reconciliation workers, attachment authorization, permission-controlled delivery, quotas, frontend integration and the complete production upload/download pipeline remain pending. Production file upload remains disabled.

## Stored-Byte Scanner-Unavailable ERROR Runtime Verification — 2026-08-03

### Classification and scope

This checkpoint records real integrated runtime verification of the stored-byte scanner-unavailable fail-closed path.

The test used:

- real PostgreSQL;
- real MinIO quarantine storage;
- the actual compiled Lexora content inspector;
- the actual compiled ClamAV adapter;
- an authenticated Law-department request context;
- a deliberately absent and unique Unix socket path.

The live official scanner was not stopped, restarted, reconfigured or replaced.

The production scanner socket allowlist and environment were not changed.

### Runtime evidence

- Request ID: `runtime-file-error-unavailable-c704eb0b-c097-496c-b8e8-e2a469d06218`
- Temporary file-object ID: `cmsdiqe7j00012i7odhlyys7q`
- Report: `/home/sh002/lexora-stored-byte-scanner-unavailable-20260803T174358Z-76651.txt`

### Verified behavior

- [x] The repository remained on `main` at commit `90d926813019595ecfe9b89a116fb73627b2897d`.
- [x] The working tree was clean before the test.
- [x] PM2 process `lexora-api` remained online.
- [x] The API PID remained `29742`.
- [x] The PM2 restart count remained `1`.
- [x] Direct API health passed before and after the test.
- [x] Nginx-proxied API health passed before and after the test.
- [x] The live official ClamAV scanner remained running and healthy.
- [x] The live scanner restart count remained `0`.
- [x] The live scanner remained networkless.
- [x] The live scanner root filesystem remained read-only.
- [x] The live scanner did not report an OOM event.
- [x] Evaluation MinIO remained running and healthy.
- [x] MinIO host ports `9000` and `9001` remained absent.
- [x] The selected unavailable scanner socket path did not exist.
- [x] A real controlled PDF was uploaded to the MinIO quarantine boundary.
- [x] Authoritative quarantine object size was verified.
- [x] Registration persisted a department-scoped `PENDING_SCAN` file.
- [x] Trusted content inspection identified the stored object as PDF.
- [x] The actual compiled ClamAV adapter attempted the unavailable Unix-socket connection.
- [x] The scanner result was sanitized and returned as `ERROR`.
- [x] The safe diagnostic classification was `connection_failed`.
- [x] The diagnostic metadata contained only the bounded classification.
- [x] No signature name was recorded for the operational error.
- [x] The `ERROR` result was persisted in PostgreSQL.
- [x] A real scan timestamp was persisted.
- [x] The file remained `PENDING_SCAN`.
- [x] The database object key remained within the quarantine boundary.
- [x] The quarantine object remained present during verification.
- [x] The quarantine object retained the expected byte count and SHA-256.
- [x] No available destination object was created.
- [x] The error object was not promoted.
- [x] A direct availability attempt was blocked by the latest-persisted-CLEAN guard.
- [x] The blocked attempt did not change lifecycle status or object key.
- [x] No availability audit was written.
- [x] Registration and scan-recorded audit events were written successfully.
- [x] The scan audit recorded status `ERROR`.
- [x] Audit actor, department and target identity matched the controlled request context.
- [x] Service results did not expose bucket names or private object keys.
- [x] Service results did not expose the unavailable socket path.
- [x] Service results did not expose `ENOENT` or provider error details.
- [x] Persisted diagnostics did not expose socket paths or provider errors.
- [x] Audit context did not expose private storage locations, socket paths or provider details.
- [x] Temporary MinIO objects were removed after verification.
- [x] Temporary file and scan rows were removed after verification.
- [x] Two audit evidence rows were retained.
- [x] The in-memory test payload was cleared.
- [x] PM2 state remained unchanged.
- [x] Live official scanner state remained unchanged.
- [x] MinIO container state remained unchanged.
- [x] Source and environment remained unchanged.
- [x] Production file upload remained disabled.

Decisive results:

- `SCANNER_UNAVAILABLE_ORCHESTRATION=PASSED`
- `PERSISTED_SCAN_STATUS=ERROR`
- `SAFE_ERROR_CLASSIFICATION=connection_failed`
- `RAW_PROVIDER_ERROR_EXPOSED=NO`

### Supersession note

This checkpoint supersedes earlier pending wording only for:

- real stored-byte operational `ERROR` persistence caused by an unavailable scanner connection;
- sanitized `connection_failed` diagnostic persistence;
- real stored-byte scanner-unavailable quarantine retention;
- scanner-error no-promotion behavior;
- latest-persisted-CLEAN enforcement after scanner unavailability;
- scanner-error audit evidence and safe metadata boundaries;
- cleanup and live-runtime non-regression for the unavailable-connection scenario.

Earlier pending wording remains valid for:

- real stored-byte scanner timeout behavior;
- malformed or oversized scanner-response behavior through the full orchestration;
- scanner stream interruption through the full orchestration;
- retry and worker processing;
- automatic infected or operational-error lifecycle transitions;
- reconciliation automation;
- attachment-resource authorization;
- permission-controlled file delivery;
- storage quotas;
- database-backed concurrency and serializable-retry verification;
- secure upload and download routes;
- frontend integration;
- production upload enablement.

### Current accurate status addition

Implemented and runtime verified:

- [x] Stored-byte scanner-unavailable connection failures persist as `ERROR`.
- [x] Scanner-unavailable diagnostics are sanitized to `connection_failed`.
- [x] Raw socket and provider errors are not exposed.
- [x] Scanner-error objects remain in quarantine.
- [x] Scanner-error objects are not promoted.
- [x] Latest persisted CLEAN remains mandatory for availability.
- [x] Scanner-error audit evidence is department-scoped and storage-location-safe.

Pending:

- [ ] Stored-byte scanner timeout runtime verification.
- [ ] Full-orchestration malformed-response and stream-failure verification.
- [ ] Retry and worker processing.
- [ ] Automatic operational-error lifecycle transition.
- [ ] Complete production upload/download pipeline verification.

Correct current statement:

> Department-scoped stored-MinIO-byte scan orchestration is runtime verified for CLEAN, isolated custom-signature INFECTED, and scanner-unavailable ERROR outcomes. Scanner-unavailable failures persist a sanitized `connection_failed` classification with a real scan timestamp while retaining the object in quarantine and preventing availability. Raw socket paths and provider error details are not exposed through service results, persisted diagnostics or audit context. Stored-byte timeout behavior, retry processing, automatic infected or operational-error lifecycle transitions, authorization-controlled delivery and the complete production upload/download pipeline remain pending. Production file upload remains disabled.

## Stored-Byte Scanner Timeout Runtime Verification — 2026-08-05

### Classification and scope

This checkpoint records real integrated runtime verification of the stored-byte malware-scanner timeout path.

The runtime test occurred at:

- UTC timestamp: `2026-08-04T20:02:13Z`
- Dhaka local date: `2026-08-05`

The test used:

- real PostgreSQL;
- real MinIO quarantine storage;
- the actual compiled Lexora content inspector;
- the actual compiled ClamAV adapter;
- an authenticated Law-department request context;
- a private controlled Unix-socket peer that accepted and consumed the scanner request but intentionally returned no ClamAV response;
- a bounded scanner timeout of `750` milliseconds.

The live official ClamAV scanner was not stopped, delayed, restarted, reconfigured or replaced.

This evidence verifies the actual compiled adapter and full stored-byte orchestration against a controlled non-responsive transport peer. It does not claim that the live official ClamAV daemon timed out.

The production scanner socket allowlist and runtime environment were not changed.

### Runtime evidence

- Request ID: `runtime-file-error-timeout-6b31a3c7-89f7-4b11-a066-6b94908f848f`
- Temporary file-object ID: `cmsf342mz00012i5g32rbuved`
- Configured scanner timeout: `750 ms`
- Observed orchestration scan duration: `813 ms`
- Report: `/home/sh002/lexora-stored-byte-scanner-timeout-20260804T200213Z-15637.txt`

### Verified behavior

- [x] The repository remained on `main` at commit `f6fd083292707609953dff7b29207bb263952965`.
- [x] The working tree was clean before the test.
- [x] PM2 process `lexora-api` remained online.
- [x] PM2 PID remained `1769` throughout the checkpoint.
- [x] PM2 restart count remained `0` throughout the checkpoint.
- [x] Direct API health passed before and after the test.
- [x] Nginx-proxied API health passed before and after the test.
- [x] The live official ClamAV scanner remained running and healthy.
- [x] The live scanner restart count remained `0`.
- [x] The live scanner remained networkless.
- [x] The live scanner root filesystem remained read-only.
- [x] The live scanner did not report an OOM event.
- [x] Evaluation MinIO remained running and healthy.
- [x] MinIO host ports `9000` and `9001` remained absent.
- [x] A private temporary Unix-socket peer was created.
- [x] The controlled peer accepted the actual compiled scanner-adapter connection.
- [x] The controlled peer received the scanner request bytes.
- [x] The controlled peer intentionally returned no ClamAV response.
- [x] The configured adapter timeout was `750` milliseconds.
- [x] The scan settled after approximately `813` milliseconds.
- [x] The timeout did not settle materially before the configured boundary.
- [x] The timeout remained within the bounded verification window.
- [x] The actual compiled scanner adapter closed the timed-out connection.
- [x] A real controlled PDF was uploaded to the MinIO quarantine boundary.
- [x] Authoritative quarantine object size was verified.
- [x] Registration persisted a department-scoped `PENDING_SCAN` file.
- [x] Trusted content inspection identified the stored object as PDF.
- [x] The scanner result was returned and persisted as `ERROR`.
- [x] The safe diagnostic classification was exactly `timeout`.
- [x] The safe diagnostic metadata contained only the bounded classification.
- [x] No malware signature was recorded for the timeout.
- [x] A real scan timestamp was persisted.
- [x] The file remained `PENDING_SCAN`.
- [x] The database object key remained within the quarantine boundary.
- [x] The quarantine object remained present during verification.
- [x] The quarantine object retained the expected byte count and SHA-256.
- [x] No available destination object was created.
- [x] The timeout object was not promoted.
- [x] A direct availability attempt was blocked by the latest-persisted-CLEAN guard.
- [x] The blocked attempt did not change lifecycle status or object key.
- [x] No availability audit was written.
- [x] Registration and scan-recorded audit events were written successfully.
- [x] The scan audit recorded status `ERROR`.
- [x] Audit actor, department and target identity matched the controlled request context.
- [x] Service results did not expose bucket names or private object keys.
- [x] Service results did not expose the temporary socket path.
- [x] Service results did not expose raw transport or provider errors.
- [x] Persisted diagnostics did not expose the socket path or provider details.
- [x] Audit context did not expose private storage or transport details.
- [x] Temporary MinIO objects were removed after verification.
- [x] Temporary file and scan rows were removed after verification.
- [x] Two audit evidence rows were retained.
- [x] The in-memory test payload was cleared.
- [x] The controlled timeout peer and temporary socket directory were removed.
- [x] PM2 state remained unchanged during the checkpoint.
- [x] Live official scanner state remained unchanged.
- [x] Live official scanner signature storage remained unchanged.
- [x] MinIO container state remained unchanged.
- [x] Source and environment remained unchanged.
- [x] Production file upload remained disabled.

Decisive results:

- `SCANNER_TIMEOUT_ORCHESTRATION=PASSED`
- `PERSISTED_SCAN_STATUS=ERROR`
- `SAFE_ERROR_CLASSIFICATION=timeout`
- `SCANNER_ADAPTER_CLOSED_TIMED_OUT_CONNECTION=YES`
- `RAW_PROVIDER_ERROR_EXPOSED=NO`

### Evidence boundary

This checkpoint supports the following claim:

> The actual compiled Lexora ClamAV adapter and real stored-MinIO-byte orchestration correctly fail closed when a connected Unix-socket peer accepts the scanner request but does not return a response before the configured timeout.

This checkpoint does not support the following claim:

> The live official ClamAV daemon was observed hanging or timing out.

The live official scanner remained healthy and unchanged throughout the test.

### Supersession note

This checkpoint supersedes earlier pending wording only for:

- real stored-byte scanner transport-timeout behavior;
- persisted `ERROR` status for a scanner timeout;
- sanitized `timeout` diagnostic persistence;
- timed-out connection disposal by the compiled adapter;
- real stored-byte timeout quarantine retention;
- timeout-path no-promotion behavior;
- latest-persisted-CLEAN enforcement after timeout;
- timeout-path audit evidence and safe metadata boundaries;
- cleanup and live-runtime non-regression for the controlled timeout scenario.

Earlier pending wording remains valid for:

- malformed scanner responses through the full stored-byte orchestration;
- oversized scanner responses through the full stored-byte orchestration;
- scanner stream interruption through the full stored-byte orchestration;
- object-storage read interruption and integrity failure;
- retry and worker processing;
- automatic infected or operational-error lifecycle transitions;
- reconciliation automation;
- attachment-resource authorization;
- permission-controlled file delivery;
- storage quotas;
- database-backed concurrency and serializable-retry verification;
- secure upload and download routes;
- frontend integration;
- production upload enablement.

### Current accurate status addition

Implemented and runtime verified:

- [x] Stored-byte CLEAN behavior.
- [x] Stored-byte isolated custom-signature `INFECTED` behavior.
- [x] Stored-byte scanner-unavailable `connection_failed` behavior.
- [x] Stored-byte non-responsive-peer `timeout` behavior.
- [x] Operational scanner failures persist as `ERROR`.
- [x] Operational error diagnostics remain sanitized and bounded.
- [x] Operational-error objects remain in quarantine.
- [x] Operational-error objects are not promoted.
- [x] Latest persisted CLEAN remains mandatory for availability.
- [x] Error-path audit evidence remains department-scoped and storage-location-safe.

Pending:

- [ ] Full-orchestration malformed scanner-response verification.
- [ ] Full-orchestration oversized scanner-response verification.
- [ ] Full-orchestration scanner stream-failure verification.
- [ ] Retry and worker processing.
- [ ] Automatic infected or operational-error lifecycle transition.
- [ ] Complete production upload/download pipeline verification.

Correct current statement:

> Department-scoped stored-MinIO-byte scan orchestration is runtime verified for CLEAN, isolated custom-signature INFECTED, scanner-unavailable `connection_failed`, and controlled non-responsive-peer `timeout` outcomes. Scanner timeout persists a sanitized `ERROR` result with classification `timeout`, retains the object in quarantine, prevents availability, closes the timed-out connection and does not expose raw transport details. This is controlled transport-timeout evidence and is not a claim that the live official ClamAV daemon timed out. Malformed or oversized scanner-response behavior, stream interruption, retry processing, automatic infected or operational-error lifecycle transitions, authorization-controlled delivery and the complete production upload/download pipeline remain pending. Production file upload remains disabled.

## Stored-Byte Malformed Scanner-Response Runtime Verification — 2026-08-05

### Classification and scope

This checkpoint records real integrated runtime verification of the stored-byte malformed scanner-response fail-closed path.

The test used:

- real PostgreSQL;
- real MinIO quarantine storage;
- the actual compiled Lexora content inspector;
- the actual compiled ClamAV adapter;
- an authenticated Law-department request context;
- a private controlled Unix-socket peer;
- exact ClamAV `INSTREAM` request parsing by the controlled peer;
- a deliberately invalid NUL-terminated scanner response sent only after the complete stored object and zero-length terminal frame were received.

The live official ClamAV scanner was not stopped, restarted, reconfigured, replaced or used to produce the malformed response.

This evidence verifies the actual compiled adapter and full stored-byte orchestration against a controlled malformed protocol peer. It does not claim that the live official ClamAV daemon produced malformed output.

The production scanner socket allowlist and runtime environment were not changed.

### Runtime evidence

- Request ID: `runtime-file-error-malformed-0c868176-541f-45de-a6a6-fe8fda3a4584`
- Temporary file-object ID: `cmsfm0d7400012ivrshqg83kd`
- Observed scan duration: `88 ms`
- Report: `/home/sh002/lexora-stored-byte-malformed-response-20260805T045113Z-14007.txt`

### Verified protocol behavior

- [x] A private temporary Unix-socket peer was created.
- [x] The controlled peer accepted the actual compiled scanner-adapter connection.
- [x] The exact `zINSTREAM` command including its NUL terminator was received.
- [x] All scanner request frames were parsed successfully.
- [x] No incoming frame exceeded the reviewed `64 KiB` frame boundary.
- [x] The complete stored object was received by the controlled peer.
- [x] The received payload byte count matched the stored object size.
- [x] The zero-length terminal frame was received.
- [x] No bytes followed the terminal frame.
- [x] The malformed response was sent only after the complete request was received.
- [x] The controlled peer observed no scanner-request protocol failure.
- [x] The result settled before the configured scanner timeout.
- [x] The result therefore came from malformed-response parsing rather than timeout handling.
- [x] The actual compiled adapter closed the malformed-response connection.

### Verified stored-byte orchestration behavior

- [x] The repository remained on `main` at commit `8a1e8a41849d049d143776549e39dd12aba42e3b`.
- [x] The working tree was clean before the test.
- [x] PM2 process `lexora-api` remained online.
- [x] PM2 PID remained `1669` throughout the checkpoint.
- [x] PM2 restart count remained `0` throughout the checkpoint.
- [x] Direct API health passed before and after the test.
- [x] Nginx-proxied API health passed before and after the test.
- [x] The live official ClamAV scanner remained running and healthy.
- [x] The live scanner restart count remained `0`.
- [x] The live scanner remained networkless.
- [x] The live scanner root filesystem remained read-only.
- [x] The live scanner did not report an OOM event.
- [x] Evaluation MinIO remained running and healthy.
- [x] MinIO host ports `9000` and `9001` remained absent.
- [x] A real controlled PDF was uploaded to the MinIO quarantine boundary.
- [x] Authoritative quarantine object size was verified.
- [x] Registration persisted a department-scoped `PENDING_SCAN` file.
- [x] Trusted content inspection identified the stored object as PDF.
- [x] The actual compiled scanner adapter returned `ERROR`.
- [x] The safe diagnostic classification was exactly `protocol_error`.
- [x] The diagnostic metadata contained only the bounded classification.
- [x] No signature name was recorded.
- [x] The raw malformed response was not returned.
- [x] The `ERROR` result was persisted in PostgreSQL.
- [x] A real scan timestamp was persisted.
- [x] The file remained `PENDING_SCAN`.
- [x] The database object key remained within the quarantine boundary.
- [x] The quarantine object remained present during verification.
- [x] The quarantine object retained the expected byte count and SHA-256.
- [x] No available destination object was created.
- [x] The malformed-response object was not promoted.
- [x] A direct availability attempt was blocked by the latest-persisted-CLEAN guard.
- [x] The blocked attempt did not change lifecycle status or object key.
- [x] No availability audit was written.
- [x] Registration and scan-recorded audit events were written successfully.
- [x] The scan audit recorded status `ERROR`.
- [x] Audit actor, department and target identity matched the controlled request context.
- [x] Service results did not expose bucket names or private object keys.
- [x] Service results did not expose the temporary socket path.
- [x] Service results did not expose the raw malformed response.
- [x] Persisted diagnostics did not expose the socket path or raw provider output.
- [x] Audit context did not expose private storage, socket or raw provider details.
- [x] Temporary MinIO objects were removed after verification.
- [x] Temporary file and scan rows were removed after verification.
- [x] Two audit evidence rows were retained.
- [x] The in-memory test payload was cleared.
- [x] The controlled malformed-response peer and temporary socket directory were removed.
- [x] PM2 state remained unchanged during the checkpoint.
- [x] Live official scanner state remained unchanged.
- [x] Live official scanner signature storage remained unchanged.
- [x] MinIO container state remained unchanged.
- [x] Source and environment remained unchanged.
- [x] Production file upload remained disabled.

Decisive results:

- `MALFORMED_RESPONSE_ORCHESTRATION=PASSED`
- `PERSISTED_SCAN_STATUS=ERROR`
- `SAFE_ERROR_CLASSIFICATION=protocol_error`
- `MALFORMED_RESPONSE_SENT_AFTER_COMPLETE_REQUEST=YES`
- `RAW_MALFORMED_RESPONSE_EXPOSED=NO`

### Evidence boundary

This checkpoint supports the following claim:

> The actual compiled Lexora ClamAV adapter and real stored-MinIO-byte orchestration correctly fail closed when a connected Unix-socket peer receives the complete valid `INSTREAM` request and then returns an unrecognized NUL-terminated scanner response.

This checkpoint does not support the following claim:

> The live official ClamAV daemon was observed returning malformed output.

The live official scanner remained healthy and unchanged throughout the test.

### Supersession note

This checkpoint supersedes earlier pending wording only for:

- malformed scanner responses through the full stored-byte orchestration;
- persisted `ERROR` status for a malformed scanner response;
- sanitized `protocol_error` diagnostic persistence;
- malformed-response connection disposal by the compiled adapter;
- real stored-byte malformed-response quarantine retention;
- malformed-response no-promotion behavior;
- latest-persisted-CLEAN enforcement after malformed output;
- malformed-response audit evidence and safe metadata boundaries;
- cleanup and live-runtime non-regression for the controlled malformed-response scenario.

Earlier pending wording remains valid for:

- oversized scanner responses through the full stored-byte orchestration;
- premature valid-looking scanner responses through the full stored-byte orchestration;
- scanner source-stream interruption through the full stored-byte orchestration;
- scanner socket interruption during request streaming or backpressure;
- object-storage read interruption and integrity failure;
- retry and worker processing;
- automatic infected or operational-error lifecycle transitions;
- reconciliation automation;
- attachment-resource authorization;
- permission-controlled file delivery;
- storage quotas;
- database-backed concurrency and serializable-retry verification;
- secure upload and download routes;
- frontend integration;
- production upload enablement.

### Current accurate status addition

Implemented and runtime verified:

- [x] Stored-byte CLEAN behavior.
- [x] Stored-byte isolated custom-signature `INFECTED` behavior.
- [x] Stored-byte scanner-unavailable `connection_failed` behavior.
- [x] Stored-byte controlled non-responsive-peer `timeout` behavior.
- [x] Stored-byte complete-request malformed-response `protocol_error` behavior.
- [x] Operational scanner failures persist as `ERROR`.
- [x] Operational error diagnostics remain sanitized and bounded.
- [x] Operational-error objects remain in quarantine.
- [x] Operational-error objects are not promoted.
- [x] Latest persisted CLEAN remains mandatory for availability.
- [x] Error-path audit evidence remains department-scoped and storage-location-safe.

Pending:

- [ ] Full-orchestration oversized scanner-response verification.
- [ ] Full-orchestration premature valid-looking response verification.
- [ ] Full-orchestration scanner source-stream failure verification.
- [ ] Full-orchestration scanner socket interruption verification.
- [ ] Retry and worker processing.
- [ ] Automatic infected or operational-error lifecycle transition.
- [ ] Complete production upload/download pipeline verification.

Correct current statement:

> Department-scoped stored-MinIO-byte scan orchestration is runtime verified for CLEAN, isolated custom-signature INFECTED, scanner-unavailable `connection_failed`, controlled non-responsive-peer `timeout`, and controlled complete-request malformed-response `protocol_error` outcomes. Malformed scanner output persists a sanitized `ERROR` result, retains the object in quarantine, prevents availability, closes the connection and does not expose raw provider output. This is controlled protocol-peer evidence and is not a claim that the live official ClamAV daemon returned malformed output. Oversized or premature responses, scanner stream interruption, retry processing, automatic infected or operational-error lifecycle transitions, authorization-controlled delivery and the complete production upload/download pipeline remain pending. Production file upload remains disabled.

## Stored-Byte Oversized Scanner-Response Runtime Verification — 2026-08-05

### Classification and scope

This checkpoint records real integrated runtime verification of the stored-byte oversized scanner-response fail-closed path.

The test used:

- real PostgreSQL;
- real MinIO quarantine storage;
- the actual compiled Lexora content inspector;
- the actual compiled ClamAV adapter;
- an authenticated Law-department request context;
- a private controlled Unix-socket peer;
- exact ClamAV `INSTREAM` request parsing by the controlled peer;
- a scanner-response limit of `4096` bytes;
- a controlled response of exactly `4097` bytes;
- the first `4096` response bytes followed by one boundary-crossing byte.

The oversized response was sent only after the complete stored object and zero-length terminal frame were received.

The live official ClamAV scanner was not stopped, restarted, reconfigured, replaced or used to produce the oversized response.

This evidence verifies the actual compiled adapter and full stored-byte orchestration against a controlled oversized protocol response. It does not claim that the live official ClamAV daemon produced oversized output.

The production scanner socket allowlist and runtime environment were not changed.

### Runtime evidence

- Request ID: `runtime-file-error-oversized-3294e8f9-6d21-45e0-ac3e-188146e5ce9a`
- Temporary file-object ID: `cmsfmbw3o00012ivqkzvfc5m1`
- Scanner-response limit: `4096 bytes`
- Controlled response size: `4097 bytes`
- Observed scan duration: `104 ms`
- Report: `/home/sh002/lexora-stored-byte-oversized-response-20260805T050013Z-19194.txt`

### Verified protocol behavior

- [x] A private temporary Unix-socket peer was created.
- [x] The controlled peer accepted the actual compiled scanner-adapter connection.
- [x] The exact `zINSTREAM` command including its NUL terminator was received.
- [x] All incoming scanner request frames were parsed successfully.
- [x] The complete stored object was received.
- [x] The received payload byte count matched the stored object size.
- [x] The zero-length terminal frame was received.
- [x] No unexpected bytes followed the terminal frame.
- [x] The controlled peer first sent exactly `4096` response bytes.
- [x] The controlled peer then sent one additional boundary-crossing byte.
- [x] The total controlled scanner response was exactly `4097` bytes.
- [x] The oversized response was sent only after the complete valid request was received.
- [x] The controlled peer observed no invalid scanner request.
- [x] The result settled before the configured scanner timeout.
- [x] The result therefore came from response-size enforcement rather than timeout handling.
- [x] The actual compiled scanner adapter closed the oversized-response connection.

### Verified stored-byte orchestration behavior

- [x] The repository remained on `main` at commit `e71738fb64f3448ab3085e82df1d75d260ae2d34`.
- [x] The working tree was clean before the test.
- [x] PM2 process `lexora-api` remained online.
- [x] PM2 PID remained `1669` throughout the checkpoint.
- [x] PM2 restart count remained `0` throughout the checkpoint.
- [x] Direct API health passed before and after the test.
- [x] Nginx-proxied API health passed before and after the test.
- [x] The live official ClamAV scanner remained running and healthy.
- [x] The live scanner restart count remained `0`.
- [x] The live scanner remained networkless.
- [x] The live scanner root filesystem remained read-only.
- [x] The live scanner did not report an OOM event.
- [x] Evaluation MinIO remained running and healthy.
- [x] MinIO host ports `9000` and `9001` remained absent.
- [x] A real controlled PDF was uploaded to the MinIO quarantine boundary.
- [x] Authoritative quarantine object size was verified.
- [x] Registration persisted a department-scoped `PENDING_SCAN` file.
- [x] Trusted content inspection identified the stored object as PDF.
- [x] The actual compiled scanner adapter returned `ERROR`.
- [x] The safe diagnostic classification was exactly `protocol_error`.
- [x] Diagnostic metadata contained only the bounded classification.
- [x] No malware signature was recorded.
- [x] The raw oversized scanner response was not returned.
- [x] The `ERROR` result was persisted in PostgreSQL.
- [x] A real scan timestamp was persisted.
- [x] The file remained `PENDING_SCAN`.
- [x] The database object key remained within the quarantine boundary.
- [x] The quarantine object remained present during verification.
- [x] The quarantine object retained the expected byte count and SHA-256.
- [x] No available destination object was created.
- [x] The oversized-response object was not promoted.
- [x] A direct availability attempt was blocked by the latest-persisted-CLEAN guard.
- [x] The blocked attempt did not change lifecycle status or object key.
- [x] No availability audit was written.
- [x] Registration and scan-recorded audit events were written successfully.
- [x] The scan audit recorded status `ERROR`.
- [x] Audit actor, department and target identity matched the controlled request context.
- [x] Service results did not expose bucket names or private object keys.
- [x] Service results did not expose the temporary socket path.
- [x] Service results did not expose raw oversized response content.
- [x] Persisted diagnostics did not expose the socket path or raw provider output.
- [x] Audit context did not expose private storage, socket or response details.
- [x] Temporary MinIO objects were removed after verification.
- [x] Temporary file and scan rows were removed after verification.
- [x] Two audit evidence rows were retained.
- [x] The in-memory test payload was cleared.
- [x] The controlled oversized-response peer and temporary socket directory were removed.
- [x] PM2 state remained unchanged during the checkpoint.
- [x] Live official scanner state remained unchanged.
- [x] Live official scanner signature storage remained unchanged.
- [x] MinIO container state remained unchanged.
- [x] Source and environment remained unchanged.
- [x] Production file upload remained disabled.

Decisive results:

- `OVERSIZED_RESPONSE_ORCHESTRATION=PASSED`
- `SCANNER_RESPONSE_LIMIT_BYTES=4096`
- `CONTROLLED_RESPONSE_BYTES_SENT=4097`
- `PERSISTED_SCAN_STATUS=ERROR`
- `SAFE_ERROR_CLASSIFICATION=protocol_error`
- `RAW_OVERSIZED_RESPONSE_EXPOSED=NO`

### Evidence boundary

This checkpoint supports the following claim:

> The actual compiled Lexora ClamAV adapter and real stored-MinIO-byte orchestration correctly fail closed when a connected Unix-socket peer returns more than the reviewed `4096`-byte scanner-response limit after receiving the complete valid `INSTREAM` request.

This checkpoint does not support the following claim:

> The live official ClamAV daemon was observed returning an oversized response.

The live official scanner remained healthy and unchanged throughout the test.

### Supersession note

This checkpoint supersedes earlier pending wording only for:

- oversized scanner responses through the full stored-byte orchestration;
- enforcement of the `4096`-byte scanner-response limit;
- rejection after the `4097th` response byte;
- persisted `ERROR` status for an oversized scanner response;
- sanitized `protocol_error` diagnostic persistence;
- oversized-response connection disposal by the compiled adapter;
- real stored-byte oversized-response quarantine retention;
- oversized-response no-promotion behavior;
- latest-persisted-CLEAN enforcement after oversized output;
- oversized-response audit evidence and safe metadata boundaries;
- cleanup and live-runtime non-regression for the controlled oversized-response scenario.

Earlier pending wording remains valid for:

- premature valid-looking scanner responses through the full stored-byte orchestration;
- scanner source-stream interruption through the full stored-byte orchestration;
- scanner socket interruption during request streaming or backpressure;
- object-storage read interruption and integrity failure;
- retry and worker processing;
- automatic infected or operational-error lifecycle transitions;
- reconciliation automation;
- attachment-resource authorization;
- permission-controlled file delivery;
- storage quotas;
- database-backed concurrency and serializable-retry verification;
- secure upload and download routes;
- frontend integration;
- production upload enablement.

### Current accurate status addition

Implemented and runtime verified:

- [x] Stored-byte CLEAN behavior.
- [x] Stored-byte isolated custom-signature `INFECTED` behavior.
- [x] Stored-byte scanner-unavailable `connection_failed` behavior.
- [x] Stored-byte controlled non-responsive-peer `timeout` behavior.
- [x] Stored-byte complete-request malformed-response `protocol_error` behavior.
- [x] Stored-byte complete-request oversized-response `protocol_error` behavior.
- [x] The scanner-response boundary is enforced at `4096` bytes.
- [x] Operational scanner failures persist as `ERROR`.
- [x] Operational error diagnostics remain sanitized and bounded.
- [x] Operational-error objects remain in quarantine.
- [x] Operational-error objects are not promoted.
- [x] Latest persisted CLEAN remains mandatory for availability.
- [x] Error-path audit evidence remains department-scoped and storage-location-safe.

Pending:

- [ ] Full-orchestration premature valid-looking response verification.
- [ ] Full-orchestration scanner source-stream failure verification.
- [ ] Full-orchestration scanner socket interruption verification.
- [ ] Object-storage read interruption and integrity-failure verification.
- [ ] Retry and worker processing.
- [ ] Automatic infected or operational-error lifecycle transition.
- [ ] Complete production upload/download pipeline verification.

Correct current statement:

> Department-scoped stored-MinIO-byte scan orchestration is runtime verified for CLEAN, isolated custom-signature INFECTED, scanner-unavailable `connection_failed`, controlled non-responsive-peer `timeout`, complete-request malformed-response `protocol_error`, and complete-request oversized-response `protocol_error` outcomes. Responses exceeding the reviewed `4096`-byte boundary persist a sanitized `ERROR` result, retain the object in quarantine, prevent availability, close the connection and do not expose raw provider output. This is controlled protocol-peer evidence and is not a claim that the live official ClamAV daemon returned oversized output. Premature responses, scanner source-stream interruption, scanner socket interruption, retry processing, automatic lifecycle transitions, authorization-controlled delivery and the complete production upload/download pipeline remain pending. Production file upload remains disabled.

## Automatic Infected-File Quarantine Lifecycle Verification — 2026-08-05

### Classification and scope

This checkpoint records implementation, independent source review, corrective hardening, deterministic testing, Ubuntu-server synchronization, server-side compilation and real integrated runtime verification of automatic infected-file quarantine.

The verified lifecycle is:

> A trusted stored-byte malware scan result of `INFECTED` transitions the department-scoped file from `PENDING_SCAN` to `QUARANTINED` while retaining the original quarantine storage identity and preventing availability.

This checkpoint does not introduce or enable:

- a public upload route;
- a public or permission-controlled download route;
- a background scan worker;
- automatic retry processing;
- frontend file upload or download;
- production upload enablement.

Production file upload remains disabled.

### Related implementation

| Item | Verified value |
|---|---|
| Implementation commit | `c6174917e673fc38b5f81df649c0812aed550cf5` |
| Commit message | `Quarantine infected stored files automatically` |
| Implementation parent | `8bfd095dd7ee32ac79a5569920d9d1497ff3d51f` |

Implementation changed only:

- `apps/api/src/modules/file-storage/application/services/file-storage.service.ts`;
- `apps/api/src/modules/file-storage/application/services/file-storage.service.test.ts`;
- `apps/api/src/modules/file-storage/domain/file-storage.audit-events.ts`.

No Prisma migration, controller, route, environment, deployment or production-upload setting changed.

### Implemented lifecycle behavior

Verified implementation behavior:

- [x] A trusted stored-byte `INFECTED` result is persisted.
- [x] The file transitions from `PENDING_SCAN` to `QUARANTINED`.
- [x] The department ID must remain unchanged.
- [x] The private storage bucket must remain unchanged.
- [x] The quarantine object key must remain unchanged.
- [x] No quarantine-to-available object move occurs.
- [x] `promotionCompleted` remains `false`.
- [x] Returned safe metadata reports `QUARANTINED`.
- [x] The quarantine lifecycle audit uses the fixed sanitized reason:
  `Trusted malware scan reported an infected file`.
- [x] Scanner signature details are not copied into the quarantine lifecycle audit.
- [x] Operational `ERROR` outcomes remain `PENDING_SCAN` and retry-eligible.
- [x] Existing latest-CLEAN guarded promotion behavior remains unchanged.

### Fail-closed reconciliation hardening

Independent review identified and corrected two defensive gaps before commit:

1. reconciliation-audit failure could otherwise replace the fixed sanitized lifecycle exception;
2. a returned `QUARANTINED` record required explicit verification that department and private storage identity remained unchanged.

The corrected implementation now verifies:

- `status === QUARANTINED`;
- unchanged `departmentId`;
- unchanged `bucket`;
- unchanged `objectKey`.

Repository exceptions, null or invalid transition results and storage-identity mismatches all follow the same fail-closed path.

The caller receives only:

> `Infected file lifecycle requires reconciliation`

Reconciliation-audit persistence failures are contained and cannot expose internal audit, Prisma, database, provider, scanner, socket, bucket or object-key details.

No object promotion or movement occurs on these failure paths.

### Deterministic verification

The completed focused File Storage test inventory reported:

| Verification | Result |
|---|---|
| Focused compiled tests | 228 passed |
| Failed | 0 |
| Skipped | 0 |
| API typecheck | Passed |
| API build | Passed |
| `git diff --check` | Passed |

The deterministic tests cover:

- successful `INFECTED → QUARANTINED`;
- preserved quarantine storage identity;
- no infected-object promotion;
- sanitized quarantine audit reason;
- operational `ERROR` retention as `PENDING_SCAN`;
- unchanged CLEAN promotion behavior;
- transition repository exceptions;
- null or invalid transition results;
- department mismatch;
- bucket mismatch;
- object-key mismatch;
- reconciliation-audit failure containment;
- safe reconciliation exception behavior;
- department isolation and existing availability guards.

These tests used fakes and unit harnesses. Real PostgreSQL, MinIO and scanner integration are recorded separately below.

### Real integrated runtime evidence

The runtime checkpoint used:

- the real PostgreSQL runtime database;
- real isolated MinIO quarantine storage;
- the actual compiled Lexora content inspector;
- the actual compiled ClamAV adapter;
- an authenticated Department of Law request context;
- a private controlled Unix-socket protocol peer;
- a complete valid ClamAV `INSTREAM` request;
- a controlled infected response sent only after receipt of the complete stored object and zero-length terminal frame.

Runtime evidence:

| Item | Verified value |
|---|---|
| Runtime request ID | `runtime-file-infected-quarantine-6953221b-5659-4b37-901b-7f69367a43cf` |
| Temporary file-object ID | `cmsfsmc9f00012iflck5arlnx` |
| Observed scan duration | `46 ms` |
| Runtime report | `/home/sh002/lexora-infected-quarantine-runtime-20260805T075616Z-22481.txt` |

Verified runtime behavior:

- [x] The controlled peer accepted the actual compiled adapter connection.
- [x] The exact `zINSTREAM` command including its NUL terminator was received.
- [x] The complete stored object was received.
- [x] The received byte count matched the authoritative stored-object size.
- [x] The zero-length terminal frame was received.
- [x] The controlled infected response was sent only after the complete request.
- [x] The actual compiled content inspector passed.
- [x] The actual compiled ClamAV adapter returned `INFECTED`.
- [x] PostgreSQL persisted exactly one `INFECTED` scan result.
- [x] The file lifecycle changed from `PENDING_SCAN` to `QUARANTINED`.
- [x] Department, bucket and quarantine object key remained unchanged.
- [x] The quarantine object remained present with matching size and SHA-256.
- [x] No available destination object was created.
- [x] `markAvailable()` was blocked for the quarantined infected file.
- [x] No availability audit was written.
- [x] Three expected department-scoped audit rows were retained:
  - pending-scan registration;
  - scan recorded;
  - file quarantined.
- [x] The quarantine audit contained the fixed sanitized reason.
- [x] The quarantine lifecycle audit did not contain the scanner signature.
- [x] Safe service output exposed no bucket, object key, socket path or private prefix.
- [x] Temporary MinIO objects were cleaned.
- [x] Temporary file and scan rows were cleaned.
- [x] Runtime audit evidence was retained.
- [x] The controlled socket peer and temporary directory were removed.
- [x] The in-memory test payload was cleared.

### Evidence boundary

This is integrated evidence for the actual compiled Lexora adapter and lifecycle orchestration against a controlled infected protocol peer.

It is not a claim that the live official ClamAV daemon produced the infected response in this checkpoint.

The live official scanner was not stopped, restarted, replaced or reconfigured. Its container identity, healthy state, restart count, network isolation, read-only root filesystem and non-OOM state remained unchanged.

MinIO container identity and health remained unchanged.

The PM2 `lexora-api` process identity, restart count and online status remained unchanged.

Direct API health and Nginx-proxied API health passed after the checkpoint.

### Security boundaries preserved

This implementation and runtime checkpoint did not weaken or change:

- [x] `AuthGuard`;
- [x] `PolicyGuard`;
- [x] `@RequirePolicy()`;
- [x] request context;
- [x] authenticated principal department isolation;
- [x] object-level authorization;
- [x] safe not-found behavior;
- [x] latest persisted CLEAN requirement;
- [x] quarantine-before-trust behavior;
- [x] no activation on scanner error;
- [x] no activation of infected files;
- [x] minimal safe result boundaries;
- [x] department-scoped audit behavior;
- [x] private object-storage location protection.

No raw token, password, password hash, cookie, database credential, production secret, object-storage credential, raw scanner response or private runtime object key was added to this documentation.

### Known limitation

Malware scan persistence, lifecycle mutation and audit writes remain sequential rather than fully atomic.

A database lifecycle transition may succeed before a later success-audit write fails. The implementation contains and sanitizes reconciliation-audit failures, but this does not replace future transaction and reconciliation hardening.

Database-backed concurrency, serializable retry and lifecycle/audit atomicity remain pending.

### Remaining File Storage work

The following remain pending:

- [ ] background pending-scan worker or job ledger;
- [ ] bounded retry and backoff for retryable operational scanner errors;
- [ ] duplicate-worker and concurrent-claim protection;
- [ ] worker crash recovery;
- [ ] dead-letter or controlled manual-review state;
- [ ] infected/error lifecycle administration and retry semantics;
- [ ] database-backed concurrency and serializable-transaction verification;
- [ ] lifecycle and audit atomicity hardening;
- [ ] object-storage/database reconciliation;
- [ ] secure permission-controlled upload API;
- [ ] module-specific attachment-resource authorization;
- [ ] permission-controlled signed URL or backend-proxy download;
- [ ] quotas and abuse controls;
- [ ] broader file-type and archive policy;
- [ ] retention, deletion and orphan cleanup;
- [ ] secure upload/download frontend;
- [ ] production operational monitoring and disaster-recovery validation;
- [ ] complete production upload/download end-to-end security verification;
- [ ] production file upload enablement.

### Supersession note

This section narrowly supersedes earlier pending or limitation wording only for:

- automatic infected-file lifecycle transition;
- persisted `INFECTED → QUARANTINED` behavior;
- retention of the existing quarantine storage identity;
- prevention of infected-file availability;
- sanitized quarantine lifecycle audit behavior;
- fail-closed infected-lifecycle reconciliation handling;
- real PostgreSQL and MinIO verification of the automatic infected lifecycle.

Earlier controlled custom-signature infected evidence remains historically valid, but that earlier checkpoint left the file lifecycle at `PENDING_SCAN`.

The current verified behavior is now:

> A trusted stored-byte `INFECTED` result is persisted and automatically transitions the department-scoped file from `PENDING_SCAN` to `QUARANTINED`, preserves the original quarantine storage identity, prevents promotion and availability, writes a sanitized lifecycle audit and returns only safe metadata.

Earlier pending statements remain valid for:

- operational-error retry processing;
- background workers;
- database concurrency and transaction retry;
- lifecycle/audit atomicity;
- upload and download authorization;
- attachment-resource integration;
- quotas;
- frontend integration;
- complete production upload/download verification.

Production file upload remains disabled.

### Current accurate File Storage status

> Department-scoped stored-byte malware-scan orchestration is implemented and runtime verified for CLEAN promotion, controlled infected detection, scanner-unavailable `connection_failed`, controlled nonresponsive-peer `timeout`, malformed-response `protocol_error`, oversized-response `protocol_error`, and automatic infected-file quarantine. A trusted `INFECTED` result now transitions `PENDING_SCAN → QUARANTINED`, retains the original quarantine storage identity, prevents availability and records a sanitized audit trail. Background retry orchestration, operational-error lifecycle processing, concurrency and transaction hardening, reconciliation, permission-controlled upload/download, attachment authorization, quotas, frontend integration and complete production end-to-end verification remain pending. Production file upload remains disabled.

### Next safe implementation checkpoint

Proceed with a focused retryable malware-scan worker foundation:

1. define a department-scoped pending-scan job or claim ledger;
2. distinguish retryable operational errors from terminal infected outcomes;
3. implement bounded retries and backoff;
4. prevent duplicate or concurrent worker claims;
5. preserve idempotency across worker crashes and restarts;
6. retain CLEAN-only guarded promotion;
7. retain automatic `INFECTED → QUARANTINED`;
8. define controlled dead-letter or manual-review handling;
9. preserve safe diagnostics and audit records;
10. verify database-backed concurrency before enabling any upload route.


## Retryable Malware-Scan Worker Foundation and PostgreSQL Concurrency Verification — 2026-08-05

### Scope and classification

The internal department-scoped retryable malware-scan worker foundation is implemented and database-runtime verified.

This checkpoint adds no public upload route, continuous scheduler, deployed worker daemon or production-upload enablement.

Production file upload remains disabled.

### Implemented foundation

The PostgreSQL-backed malware-scan job ledger provides:

- permanent one-row-per-file idempotency;
- department-scoped file/job consistency;
- statuses `PENDING`, `PROCESSING`, `RETRY_SCHEDULED`, `COMPLETED` and `DEAD_LETTER`;
- bounded attempt count and retry backoff;
- atomic PostgreSQL claim using `FOR UPDATE SKIP LOCKED`;
- claim-token ownership fencing;
- lease expiry and guarded renewal;
- expired-lease reclaim;
- stale-token mutation rejection;
- wrong-department claim and finalization rejection;
- controlled dead-letter behavior;
- sanitized diagnostic categories and audit context.

The composite database relation is:

- `(file_object_id, department_id)`;
- referencing `file_objects(id, department_id)`;
- constraint `file_malware_scan_jobs_file_object_id_department_id_fkey`;
- `ON DELETE CASCADE`;
- `ON UPDATE CASCADE`.

This database relation prevents a job from referencing a file object belonging to another department.

### Lease and heartbeat behavior

Verified policy:

- lease duration: five minutes;
- heartbeat interval: thirty seconds;
- renewal is guarded by job ID, department, `PROCESSING` status and claim token;
- renewal updates only lease expiry and update timestamp;
- renewal does not change status, token or attempt count;
- heartbeat renewal calls do not overlap;
- timer cleanup occurs in `finally`;
- renewal failure causes explicit ownership-loss handling;
- stale workers cannot complete, retry or dead-letter a reclaimed job.

This is not classified as a perfect distributed lock. Event-loop starvation or database unavailability can still cause ownership loss.

### Processing and lifecycle convergence

The worker reuses the existing stored-byte malware-scan orchestration and preserves:

- authoritative quarantine-object metadata;
- complete streamed-byte count;
- SHA-256 verification;
- content inspection before trust;
- latest persisted CLEAN requirement;
- CLEAN-only promotion;
- automatic trusted `INFECTED → QUARANTINED`;
- department-scoped audit;
- private storage identity protection.

After a lifecycle conflict:

- an active claimant can converge an already `AVAILABLE` file as CLEAN;
- an active claimant can converge an already `QUARANTINED` file as INFECTED;
- missing, pending, cross-department or inconsistent states fail closed;
- stale claimants return sanitized ownership-loss results without finalizing the job;
- exhausted jobs enter controlled dead letter without another scan.

### Enqueue and audit behavior

The enqueue operation distinguishes actual creation from idempotent reuse.

`SCAN_JOB_ENQUEUED` is emitted only when a new job row is created. Repeated or concurrent reuse does not create a misleading duplicate enqueue audit.

Job mutations, file lifecycle mutations and audit writes remain sequential rather than fully atomic.

### Isolated PostgreSQL migration verification

The migration was verified against a disposable loopback-only PostgreSQL 16 Alpine container initialized from the baseline Prisma schema.

Verified catalog evidence:

- enum count: 1;
- exact ordered enum labels: `PENDING,PROCESSING,RETRY_SCHEDULED,COMPLETED,DEAD_LETTER`;
- table count: 1;
- columns: 15;
- expected defaults: 5;
- indexes: 7;
- expected named indexes: 7;
- foreign keys: 2;
- composite file/department foreign key with cascade: passed;
- department foreign key with restrict: passed;
- check constraints: 3;
- expected named check constraints: 3;
- `TIMESTAMP(3)` columns: 7;
- first migration application: passed;
- second migration application: failed safely;
- strict Prisma database-to-datamodel drift policy: passed.

### Real PostgreSQL test evidence

Five real PostgreSQL tests executed:

- concurrent enqueue created exactly one ledger row;
- concurrent claim granted exactly one lease;
- active, exact-boundary and expired lease predicates behaved correctly;
- renewal, stale-token and cross-department finalization guards failed closed;
- maximum-attempt reclaim preserved attempt semantics without an off-by-one increment.

Results:

- tests: 5;
- passed: 5;
- failed: 0;
- skipped: 0.

### Complete File Storage test evidence

The complete compiled File Storage inventory passed:

- tests: 255;
- passed: 255;
- failed: 0;
- skipped: 0;
- cancelled: 0;
- todo: 0.

Additional verification passed:

- Prisma validation;
- Prisma Client generation with version 6.19.3;
- API typecheck;
- API build;
- changed-file ESLint;
- changed-file Prettier;
- `git diff --check`.

### Post-test database invariants

Post-test invariant queries confirmed:

- no duplicate job row per file;
- no cross-department job/file relation;
- no `PROCESSING` row without claim ownership and lease;
- no terminal row retaining claim ownership;
- no attempt count over maximum;
- dead-letter rows are not claimable;
- no unsafe diagnostic row contains credentials, object keys, buckets or claim tokens.

### Runtime non-disruption

Verification used a detached temporary worktree and disposable PostgreSQL container.

Confirmed:

- disposable container and database were removed;
- temporary worktree was removed;
- live server repository remained unchanged and clean;
- host PostgreSQL was not used or migrated;
- PM2 was not restarted;
- Nginx was not restarted;
- MinIO was not changed;
- ClamAV was not changed;
- no environment file was changed;
- no public route was added;
- production upload remained disabled.

### Supersession note

This section supersedes earlier pending wording only for:

- durable department-scoped malware-scan job ledger;
- idempotent enqueue;
- bounded retry and backoff foundation;
- duplicate/concurrent claim protection;
- atomic PostgreSQL claim;
- lease renewal and expired-lease reclaim;
- stale-token fencing;
- cross-department claim/finalization rejection;
- controlled dead-letter behavior;
- database-backed concurrency and guarded-predicate verification.

The following remain pending:

- continuous scheduler or worker daemon;
- operational startup, shutdown, health and monitoring;
- cancellation of an already-running external scan;
- serializable transaction retry where required;
- job, lifecycle and audit atomicity;
- lifecycle and storage reconciliation;
- secure permission-controlled upload API;
- attachment-resource authorization;
- permission-controlled delivery;
- quotas and abuse controls;
- retention and orphan cleanup;
- frontend integration;
- production monitoring and disaster recovery;
- complete production end-to-end verification;
- production upload enablement.

### Current accurate File Storage status

> The department-scoped retryable malware-scan worker foundation is implemented and database-runtime verified. It provides a durable PostgreSQL job ledger, idempotent enqueue, bounded retries and backoff, atomic concurrent claims, token-fenced lease ownership, expired-lease recovery, controlled dead letter and safe CLEAN/INFECTED lifecycle convergence. Five real PostgreSQL concurrency and isolation tests and the complete 255-test File Storage inventory passed with no failures or skips. This remains an internal process-one foundation only; no scheduler, continuous worker daemon, public upload route or production enablement was added. Job/lifecycle/audit atomicity, serializable retry, broader reconciliation, secure upload/download authorization and final production verification remain pending. Production upload remains disabled.

### Next safe File Storage checkpoint

Proceed with a focused operational worker execution layer:

1. controlled scheduler or process loop;
2. graceful startup and shutdown;
3. one-job-at-a-time or explicitly bounded concurrency;
4. authenticated service-principal department scope;
5. health and readiness behavior;
6. backpressure;
7. sanitized monitoring and metrics;
8. crash and restart verification;
9. no public route exposure;
10. preservation of all current claim, lease and claim-token protections.

Do not combine the operational worker layer with public upload or download implementation.

## Live Malware-Scan Job Ledger Migration and API Boot Verification — 2026-08-05

### Classification and scope

This checkpoint records deployment of the additive malware-scan job-ledger migration to the ordinary Lexora PostgreSQL database, verification of the resulting live catalog and invariants, server compilation, controlled PM2 restart and API health verification.

This checkpoint does not enable:

- a continuous malware-scan worker daemon;
- a public upload route;
- a public or permission-controlled download route;
- frontend file upload or download;
- production file upload.

Production file upload remains disabled.

### Source and deployment boundary

| Item | Verified value |
|---|---|
| Source commit | `fe520b3643d9b5db112d5900bf943c9725d77217` |
| Commit message | `Add retryable malware scan worker foundation` |
| Branch | `main` |
| Live database | `lexora_lms` |
| PostgreSQL target | Localhost port `5432` |
| PostgreSQL server | `18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)` |
| Prisma Client | `6.19.3` |
| Target migration | `20260805_add_file_malware_scan_job_ledger` |

The repository was clean and local `HEAD` matched `origin/main` before and after deployment.

Database credentials and the complete database URL were not printed or documented.

### Pre-migration backup

A private pre-migration PostgreSQL custom-format backup was created and validated before migration deployment.

| Item | Verified value |
|---|---|
| Backup filename | `lexora_lms-before-20260805_add_file_malware_scan_job_ledger-20260805T125253Z.dump` |
| Size | `339346` bytes |
| SHA-256 | `f77ca997c70096f07d5d67f3a90f51a783423bf221a6742dc4e54d44733c98f5` |
| Archive validation | Passed with `pg_restore --list` |
| Backup file permission | `0600` |
| Hash file permission | `0600` |

The backup is private but not encrypted. No automatic restore was performed or required.

### Pre-deployment runtime state

Before migration:

- PM2 process `lexora-api` was online;
- PM2 PID was `1666`;
- PM2 restart count was `0`;
- direct API health returned HTTP `200`;
- Nginx-proxied API health returned HTTP `200`;
- the migration record was absent;
- the job-ledger table was absent;
- the job-status enum was absent;
- Prisma reported the target migration as pending.

### Server validation and compilation

The following passed before migration deployment:

- Prisma schema validation;
- Prisma Client generation with version `6.19.3`;
- API TypeScript typecheck;
- API NestJS build.

The Prisma `7.9.1` availability notice was informational only. No Prisma major-version upgrade was performed.

### Migration deployment

The following production-style command path succeeded:

- Prisma found two repository migrations;
- migration `20260805_add_file_malware_scan_job_ledger` was applied;
- Prisma reported that all migrations were successfully applied;
- subsequent Prisma migration status reported the database schema as up to date;
- the target migration has one completed, non-rolled-back migration record.

The migration was applied once. No manual SQL correction was required on the live database.

### Live catalog verification

The live PostgreSQL catalog matched the reviewed migration and Prisma datamodel:

- enum count: `1`;
- enum labels:
  `PENDING,PROCESSING,RETRY_SCHEDULED,COMPLETED,DEAD_LETTER`;
- table count: `1`;
- columns: `15`;
- expected column defaults: `5`;
- total indexes: `7`;
- expected named indexes: `7`;
- foreign keys: `2`;
- composite file/department foreign key: present;
- department foreign key: present;
- check constraints: `3`;
- expected named check constraints: `3`;
- `TIMESTAMP(3)` columns: `7`;
- completed migration record: `1`.

The composite foreign key remained:

`file_malware_scan_jobs_file_object_id_department_id_fkey`

and preserved department/file consistency with cascade behavior on the composite file relation.

### Live database invariants

Post-migration invariant queries returned zero for every unsafe state:

- duplicate job rows for one file: `0`;
- cross-department job/file relations: `0`;
- processing rows without claim ownership: `0`;
- terminal rows retaining claim ownership: `0`;
- attempt counts over maximum: `0`;
- claimable dead-letter rows: `0`;
- unsafe diagnostic rows containing credential, storage-identity or claim-token terminology: `0`.

### Controlled PM2 restart and API boot

The API was restarted once using PM2 with environment refresh.

| Item | Before | After |
|---|---:|---:|
| PID | `1666` | `119492` |
| PM2 restart count | `0` | `1` |
| PM2 status | `online` | `online` |

Runtime verification:

- direct API health returned HTTP `200`;
- Nginx-proxied API health returned HTTP `200`;
- health succeeded on retry attempt `3`;
- API listener remained `127.0.0.1:4000`;
- no wildcard `0.0.0.0:4000` listener was present;
- no IPv6 wildcard listener was present;
- Nginx remained active;
- PostgreSQL remained active.

The short startup delay before successful health was consistent with previously documented PM2/Nginx restart timing behavior and did not represent a persistent runtime failure.

### Runtime verdict

- [x] Private pre-migration backup created and validated.
- [x] Prisma validation passed.
- [x] Prisma Client generation passed.
- [x] API typecheck passed.
- [x] API build passed.
- [x] Additive migration applied once.
- [x] Prisma migration status is up to date.
- [x] Live catalog matches the reviewed schema.
- [x] Live database invariants passed.
- [x] Controlled PM2 restart passed.
- [x] Direct API health passed.
- [x] Nginx-proxied API health passed.
- [x] Loopback-only API binding remained enforced.
- [x] Repository remained clean.
- [ ] Continuous worker daemon is not enabled.
- [ ] Operational scheduler and worker monitoring remain pending.
- [ ] Public upload and permission-controlled delivery remain pending.
- [ ] Production file upload remains disabled.

Correct current statement:

> The department-scoped malware-scan job ledger and retryable process-one worker foundation are implemented, committed, deployed to the Ubuntu server and backed by a successfully applied live PostgreSQL migration. The live catalog and database invariants match the reviewed schema, the server API typecheck/build passed, and the controlled PM2 restart restored healthy direct and Nginx-proxied service with loopback-only API exposure. The operational scheduler or continuous worker daemon, full job/lifecycle/audit atomicity, broader reconciliation, secure upload/download authorization and production enablement remain pending. Production file upload remains disabled.

### Supersession note

This section supersedes the earlier statement that deployment to the ordinary Lexora database and post-migration API boot verification were pending.

It does not supersede pending work for:

- continuous worker scheduling;
- worker health, readiness, monitoring and shutdown;
- cancellation of already-running external scans;
- serializable retry where required;
- job, lifecycle and audit atomicity;
- storage and lifecycle reconciliation;
- secure upload API;
- attachment-resource authorization;
- permission-controlled delivery;
- quotas, retention and orphan cleanup;
- frontend integration;
- complete production end-to-end verification;
- production file-upload enablement.

## Operational Malware-Scan Worker Idle Runtime Verification — 2026-08-05

### Classification and scope

This checkpoint records implementation deployment and controlled runtime verification of the internal malware-scan worker execution layer.

The worker remains disabled by default and remains persistently disabled in the ordinary PM2 API process.

This checkpoint does not enable:

- public file upload;
- public or permission-controlled download;
- production file processing;
- persistent malware-scan worker execution;
- frontend file integration.

Production file upload remains disabled.

### Source and implementation

| Item | Verified value |
|---|---|
| Implementation commit | `dc5c09a8b85662fe1b5e21dcbbe749528fcf55a1` |
| Commit message | `Add operational malware scan worker` |
| Branch | `main` |
| Worker default | Disabled |
| Poll interval default | `5000 ms` |
| Idle delay default | `15000 ms` |
| Graceful shutdown timeout default | `330000 ms` |
| PM2 kill timeout | `360000 ms` |

The operational layer provides:

- bounded polling;
- sequential department processing;
- one active processor call at a time;
- database-derived department scope;
- stable keyset pagination capped at 100 departments;
- shared claim/discovery eligibility rules;
- no overlapping cycles;
- sanitized health state;
- contained provider and processor failures;
- idempotent startup;
- graceful NestJS module destruction;
- worker drain before Prisma disconnection;
- fail-closed shutdown timeout behavior.

No public route, Prisma migration or production upload setting was added by this checkpoint.

### Static verification

The implementation checkpoint reported:

- focused File Storage tests: `267`;
- passed: `262`;
- failed: `0`;
- skipped: `5`;
- API typecheck: passed;
- API build: passed;
- `git diff --check`: passed.

The five skipped tests were the existing opt-in PostgreSQL concurrency tests.

### Server deployment and disabled-worker boot

The Ubuntu server repository was fast-forwarded to the implementation commit.

Server verification passed:

- API typecheck;
- API build;
- clean repository state;
- `HEAD` aligned with `origin/main`;
- PM2 controlled restart;
- direct API health returned HTTP `200`;
- Nginx-proxied API health returned HTTP `200`;
- API remained bound to `127.0.0.1:4000`;
- worker remained disabled;
- production upload remained disabled.

The persistent PM2 shutdown budget was changed from unset/default behavior to `360000 ms`, exceeding the worker's `330000 ms` graceful shutdown budget.

The PM2 launch shape remained:

- executable: `/usr/bin/bash`;
- working directory: `/home/sh002/lexora_lms`;
- command:
  `node -r ./apps/api/register-paths.js apps/api/dist/src/main.js`;
- fork mode;
- automatic restart enabled;
- file watching disabled.

The updated PM2 process list was saved successfully for resurrection.

### Read-only runtime readiness

Runtime readiness inspection verified:

- Nginx active;
- PostgreSQL active;
- PM2 API online;
- database configuration present;
- scanner mode `clamav`;
- scanner transport `unix`;
- scanner socket `/run/lexora-clamav/clamd.sock`;
- scanner timeout `10000 ms`;
- ClamAV socket owner UID `20000`;
- ClamAV socket group GID `20001`;
- ClamAV socket mode `0660`;
- ClamAV evaluation container healthy.

At inspection time:

- actionable malware-scan jobs: `0`;
- actionable active departments: `0`.

The readiness inspection did not modify database rows, environment configuration or PM2 state.

### Isolated real PostgreSQL idle-worker probe

A temporary, non-persistent NestJS application context was started with the worker enabled only for the probe process.

Probe configuration:

- worker enabled: `true`;
- poll interval: `1000 ms`;
- idle delay: `1000 ms`;
- shutdown timeout: `5000 ms`.

Runtime evidence:

- worker lifecycle reached `RUNNING`;
- worker cycle returned to `IDLE`;
- at least one successful idle cycle completed;
- no controlled failure category was recorded;
- PostgreSQL job-row count was unchanged;
- ordinary PM2 API PID was unchanged;
- direct API health remained HTTP `200`;
- Nginx-proxied API health remained HTTP `200`;
- application close completed;
- worker lifecycle reached `STOPPED`;
- worker cycle remained `IDLE`;
- graceful shutdown state reached `COMPLETE`;
- the temporary probe file was removed;
- persistent environment remained unchanged;
- persistent worker remained disabled.

### Runtime verdict

- [x] Operational worker implementation committed and deployed.
- [x] API typecheck passed.
- [x] API build passed.
- [x] Disabled-worker PM2 boot passed.
- [x] Direct API health passed.
- [x] Nginx-proxied API health passed.
- [x] Loopback-only API binding preserved.
- [x] Persistent PM2 shutdown budget configured and saved.
- [x] ClamAV Unix-socket readiness passed.
- [x] Real PostgreSQL idle worker cycle passed.
- [x] Graceful isolated application shutdown passed.
- [x] Job-row count remained unchanged during the idle probe.
- [x] Persistent worker remained disabled.
- [ ] Persistent worker enablement remains pending.
- [ ] Real actionable job claiming and processing remain pending.
- [ ] Real clean-file promotion through the worker remains pending.
- [ ] Real infected-file quarantine through the worker remains pending.
- [ ] PM2/process-signal shutdown during an active scanner or storage operation remains pending.
- [ ] Production upload remains disabled.

Correct current statement:

> The internal malware-scan worker execution layer is implemented, committed and deployed. Its default-disabled API boot, PM2 shutdown budget, ClamAV readiness, real PostgreSQL idle polling cycle and graceful isolated NestJS shutdown have been runtime verified. Persistent worker enablement, real actionable job processing, active-operation signal shutdown, production file delivery and production upload enablement remain pending.

### Remaining limitations

The following remain outside this checkpoint:

- persistent worker enablement;
- real clean and infected file-processing fixtures;
- active ClamAV and object-storage processing under PM2 shutdown signals;
- worker health integration into operational health endpoints;
- metrics and alerting;
- complete job, lifecycle and audit atomicity;
- broader reconciliation;
- secure upload API;
- attachment-resource authorization;
- permission-controlled delivery;
- retention, quotas and orphan cleanup;
- frontend integration;
- production file-upload enablement.

## Versioned Curriculum and Assessment Template Schema Foundation — 2026-08-06

### Classification

This checkpoint records the first additive, versioned curriculum and course-assessment-template database foundation.

Current verified classification:

- implementation committed and pushed;
- Prisma schema statically validated;
- API typecheck and build passed;
- migration runtime verified against an isolated disposable PostgreSQL 16 database;
- ordinary Lexora runtime database migration not applied;
- live application routes and services not runtime verified for this foundation;
- no ordinary runtime database data changed;
- no canonical curriculum records or assessment-template records backfilled.

### Related implementation commit

| Purpose | Commit |
|---|---|
| Versioned curriculum and assessment-template schema foundation | `a8dac018c5077d197c14316f5ccf546f71b74fff` |

Commit message:

`Add versioned curriculum schema foundation`

Implementation files:

- `.gitignore`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/202608060001_add_curriculum_assessment_foundation/migration.sql`

Baseline before implementation:

`084a09efe8efa60e394c7ae2bb445aacb6529172`

### Implemented schema foundation

The implementation adds:

- `AcademicVersionStatus`;
- `CurriculumVersion`;
- `CurriculumCourse`;
- `CourseAssessmentTemplate`;
- `AssessmentTemplateComponent`.

The foundation supports:

- department-scoped and academic-programme-scoped curriculum versions;
- stable curriculum version codes;
- effective academic-session identity and optional date ranges;
- programme duration, semester, credit, course-count and programme-mark totals;
- Core, GED and Capstone aggregate credits and course counts;
- curriculum-specific academic year, semester and display ordering;
- immutable course-code, course-title, credit and total-mark snapshots;
- configurable course-category codes;
- versioned course assessment templates;
- generic assessment components;
- restrictive academic-history foreign keys.

No Law-specific curriculum rows, assessment components, seed records or backfill data were inserted.

### Migration structure

The additive migration creates:

| Object | Count |
|---|---:|
| New enum | 1 |
| New tables | 4 |
| Foreign keys | 10 |
| `ON DELETE RESTRICT` foreign keys | 10 |
| `ON DELETE CASCADE` foreign keys | 0 |
| Check constraints | 14 |
| Unique indexes | 6 |
| Ordinary indexes | 10 |
| Total non-primary indexes | 16 |

The migration contains no:

- existing-table or existing-column drop;
- existing-row update;
- curriculum seed;
- course-title correction;
- course-offering update;
- destructive cascade deletion.

All 16 new non-primary indexes use explicit PostgreSQL-safe mapped names.

Maximum mapped identifier length:

`45` UTF-8 bytes.

### Department isolation boundary

Every new table has a required `department_id` and a relation to `departments`.

Existing:

- AuthGuard;
- PolicyGuard;
- `@RequirePolicy()`;
- request context;
- department isolation;
- object-level authorization;
- result locks;
- GPA/CGPA controls;
- transcript snapshots;
- audit behavior

were not modified.

Composite tenant-aware foreign keys were not added because the current related models do not expose the necessary composite candidate keys without a broader populated-schema change.

Before curriculum write APIs or canonical backfill are introduced, future repository and service logic must enforce same-department consistency across:

- curriculum version;
- academic programme;
- course;
- assessment template;
- assessment component.

### Review corrections completed

#### Prisma and migration consistency

The initial source contained an unintended optional `CurriculumCourse` to `AcademicTerm` relation without a matching migration column.

It was removed.

Final state:

- `CurriculumCourse` has no `academicTerm`;
- `CurriculumCourse` has no `academicTermId`;
- `AcademicTerm` has no new `curriculumCourses` reverse relation;
- `curriculum_courses` has no `academic_term_id`.

#### PostgreSQL identifier safety

The first disposable PostgreSQL run showed automatic truncation of several generated index names.

The correction added explicit mapped names for all 16 indexes.

The corrected verification confirmed:

- no identifier truncation;
- all expected index names exist exactly;
- Prisma schema and migration names match;
- no database-to-datamodel drift remains.

### Static validation

Final local validation passed:

- Prisma format;
- Prisma validate;
- Prisma Client generation;
- API typecheck;
- API build;
- `git diff --check`.

No Prisma major-version migration, Node module-system migration or ESM migration was performed.

### Disposable PostgreSQL runtime verification

Verification used:

- image: `postgres:16-alpine`;
- host publication: loopback `127.0.0.1` only;
- disposable database initialized from the exact baseline Prisma schema;
- corrected migration applied directly to the isolated database;
- runtime/ordinary Lexora database not accessed;
- disposable container removed automatically.

Evidence bundle:

`/home/sh002/lexora-curriculum-migration-verification-v2-20260806-154635`

Runtime evidence report:

`/home/sh002/lexora-curriculum-migration-verification-v2-20260806-154635/runtime-verification-20260806-094706.txt`

Verified results:

- [x] Migration application passed.
- [x] Four tables were created.
- [x] Ten foreign keys were created.
- [x] All ten foreign keys use delete-restrict and update-cascade behavior.
- [x] Fourteen check constraints were created.
- [x] Sixteen exact mapped indexes were created.
- [x] PostgreSQL identifier truncation did not occur.
- [x] `curriculum_courses.academic_term_id` is absent.
- [x] Prisma drift check reported no difference.
- [x] A second migration application failed safely at the existing enum.
- [x] No ordinary runtime database was accessed.
- [x] No database credentials were documented.
- [x] The disposable container was removed.

This verifies migration behavior in an isolated PostgreSQL environment. It is not evidence that the migration has been applied to the ordinary Lexora runtime database.

### Existing ordinary-runtime course boundary

The separate read-only course audit remains the current ordinary-runtime evidence:

`/home/sh002/lexora-course-runtime-db-audit-20260806-081803.txt`

That audit confirmed:

- 60 Department of Law course rows;
- 58 active official courses;
- 2 archived legacy/runtime-test courses;
- 140 active official credits;
- no duplicate course code;
- no course without programme binding.

Preserved archived courses:

- `LAW-101`;
- `LAW-999`.

No existing course, offering, teacher assignment, enrollment, attendance, result or transcript record was changed by this schema-foundation checkpoint.

### Explicitly pending

This checkpoint does not implement:

- ordinary-runtime migration deployment;
- live catalog verification;
- canonical LL.B. curriculum-version record;
- canonical 58-course curriculum backfill;
- standard or Capstone assessment-template records;
- correction of current course-title or placement mismatches;
- `CourseOffering` to `CurriculumCourse` binding;
- immutable student curriculum-version assignment;
- enrollment curriculum binding;
- `SyllabusVersion`;
- curriculum repository, service, controller, DTO or policy endpoints;
- Admin curriculum management UI;
- Teacher Course Workspace;
- result or transcript recalculation changes.

The current `CourseOffering` uniqueness constraint requires a later focused review before simultaneous old and new curriculum offerings are supported for irregular or failed students.

### Current accurate status

> The versioned curriculum and assessment-template Prisma/PostgreSQL foundation is implemented, committed and pushed, statically validated, and runtime verified against an isolated disposable PostgreSQL 16 database. The additive migration creates one lifecycle enum, four department-scoped tables, fourteen row-local checks, ten restrictive foreign keys and sixteen explicitly mapped PostgreSQL-safe indexes. The ordinary Lexora runtime database has not received the migration, no canonical curriculum data has been backfilled, and no curriculum API, Admin UI, Teacher Workspace, student curriculum assignment or syllabus-version workflow is implemented.

### Next safe steps

1. Synchronize implementation commit `a8dac018c5077d197c14316f5ccf546f71b74fff` to the Ubuntu server.
2. Create and validate a private pre-migration PostgreSQL backup.
3. Apply only the additive curriculum-foundation migration to the ordinary runtime database.
4. Verify migration history and live PostgreSQL catalog structure.
5. Verify PM2/API/Nginx health and confirm non-disruption.
6. Document live migration evidence in a separate superseding checkpoint.
7. Prepare the canonical LL.B. curriculum and assessment-template dataset as a reviewed repository artifact.
8. Run a read-only collision and dependency audit before canonical backfill.
9. Preserve existing Course IDs and archived legacy evidence.
10. Enforce department consistency in repository/service logic before exposing curriculum write APIs.

## Live Versioned Curriculum and Assessment Template Schema Foundation Migration — 2026-08-06

### Supersession and classification

This checkpoint supersedes only the earlier statement that the curriculum-foundation migration had not been applied to the ordinary Lexora runtime database.

The earlier implementation review, static validation and disposable PostgreSQL verification remain valid historical evidence.

Current verified classification:

- schema implementation committed and pushed;
- migration applied to the ordinary `lexora_lms` PostgreSQL database;
- completed Prisma migration record verified;
- live PostgreSQL catalog verified;
- Prisma database-to-datamodel drift check passed;
- API typecheck and build passed on the server;
- controlled PM2 restart completed;
- direct API and Nginx health checks passed;
- no canonical curriculum or assessment-template business rows inserted;
- selected existing academic business-table counts remained unchanged;
- no curriculum API, UI, student assignment or syllabus workflow implemented by this migration.

### Source and deployment boundary

| Item | Verified value |
|---|---|
| Branch | `main` |
| Server source commit | `29eb1ddc1b22b2f4dfe23fdf78ce0a77798d0c59` |
| Implementation commit | `a8dac018c5077d197c14316f5ccf546f71b74fff` |
| Target migration | `202608060001_add_curriculum_assessment_foundation` |
| Runtime database | `lexora_lms` |
| Repository changed during deployment | No |
| Automatic database restore | No |

The repository was clean and `HEAD` remained unchanged throughout deployment verification.

Database credentials and the full database URL were not printed or documented.

### Validated pre-migration backup

A private PostgreSQL custom-format backup was created and validated before migration deployment.

| Item | Verified value |
|---|---|
| Backup path | `/home/sh002/lexora-private-backups/lexora_lms-before-202608060001_add_curriculum_assessment_foundation-20260806T103154Z.dump` |
| SHA-256 | `36e38f2479a11628766d94e4a01a5aa6144cf9472e31724e53c29d19e7036ffd` |
| Archive validation | Passed |
| Backup file permission | `0600` |
| Backup directory permission | `0700` |
| Backup encryption | No |
| Backup retained | Yes |
| Automatic restore performed | No |

Runtime evidence report:

`/home/sh002/lexora-runtime-evidence/live-202608060001_add_curriculum_assessment_foundation-20260806T103615Z.txt`

The backup and runtime report remain private server artifacts and are not committed to Git.

### Server static validation

Before live migration deployment, the server passed:

- Prisma schema validation;
- Prisma Client generation;
- API TypeScript typecheck;
- API NestJS build.

No Prisma major-version upgrade, Node module-system migration or ESM migration was performed.

### Live migration deployment

Prisma migration deployment completed successfully for:

`202608060001_add_curriculum_assessment_foundation`

Verified migration-history result:

- completed migration record: `1`;
- rolled-back migration record: `0`;
- incomplete migration record: `0`;
- Prisma migration status: up to date.

### Live PostgreSQL catalog verification

The ordinary runtime PostgreSQL catalog contains:

| Object | Verified value |
|---|---:|
| `AcademicVersionStatus` enum | 1 |
| New tables | 4 |
| Foreign keys | 10 |
| Delete-restrict foreign keys | 10 |
| Check constraints | 14 |
| Exact mapped non-primary indexes | 16 |
| Identifier truncation | None |
| `curriculum_courses.academic_term_id` | Absent |
| Prisma database-to-datamodel drift | None |

Verified enum labels:

- `DRAFT`;
- `APPROVED`;
- `ACTIVE`;
- `RETIRED`;
- `ARCHIVED`.

Verified tables:

- `curriculum_versions`;
- `course_assessment_templates`;
- `assessment_template_components`;
- `curriculum_courses`.

All ten new foreign keys use restrictive deletion behavior. No cascade deletion was introduced by this migration.

### Data preservation verification

The four new curriculum-foundation tables remained empty immediately after migration:

- `curriculum_versions`: no business rows;
- `course_assessment_templates`: no business rows;
- `assessment_template_components`: no business rows;
- `curriculum_courses`: no business rows.

Selected existing business-table row counts were captured before and after migration for:

- `courses`;
- `course_offerings`;
- `enrollments`;
- `result_records`;
- `transcript_records`.

The selected counts were unchanged.

This migration did not:

- update or delete existing courses;
- modify existing course offerings;
- alter enrollments;
- change result records;
- change transcript records;
- add canonical LL.B. curriculum data;
- add assessment-template component data.

### Runtime non-disruption verification

After controlled restart:

- PM2 process `lexora-api` returned online;
- PM2 restart count increased as expected;
- direct API health returned HTTP `200`;
- Nginx-proxied API health returned HTTP `200`;
- PostgreSQL remained active;
- Nginx remained active;
- repository remained clean;
- server `HEAD` remained `29eb1ddc1b22b2f4dfe23fdf78ce0a77798d0c59`.

### Security and department-isolation boundary

The migration introduced department-scoped schema foundations only.

It did not alter or weaken:

- AuthGuard;
- PolicyGuard;
- `@RequirePolicy()`;
- request context;
- department isolation;
- object-level authorization;
- teacher assigned-course checks;
- student own-resource checks;
- result publication locks;
- GPA/CGPA controls;
- transcript immutable snapshots;
- audit behavior.

Database-level composite tenant equality is not yet present across all new related records.

Before canonical backfill or curriculum write APIs, repository and service logic must enforce same-department consistency across:

- curriculum version;
- academic programme;
- course;
- assessment template;
- assessment component.

### Current accurate status

> The versioned curriculum and assessment-template Prisma/PostgreSQL schema foundation is implemented, committed, deployed to the ordinary Lexora runtime database and runtime verified. The live catalog contains one lifecycle enum, four department-scoped tables, fourteen row-local checks, ten restrictive foreign keys and sixteen explicitly mapped PostgreSQL-safe indexes, with no Prisma drift or identifier truncation. The new tables remain empty, selected existing academic business-table counts were unchanged, and API/Nginx health remained available after a controlled PM2 restart.

This does not mean curriculum functionality is complete.

### Explicitly pending

The following remain pending:

- canonical LL.B. `CurriculumVersion` record;
- canonical 58-course `CurriculumCourse` backfill;
- standard assessment-template records;
- Capstone-specific assessment-template records;
- correction of identified course-title and placement mismatches;
- `CourseOffering` to `CurriculumCourse` binding;
- immutable student curriculum-version assignment;
- enrollment curriculum binding;
- `SyllabusVersion`;
- curriculum repository and service layer;
- department-scoped DTO/controller/policy endpoints;
- Admin curriculum-management UI;
- Teacher Course Workspace;
- result or transcript recalculation integration.

The existing `CourseOffering` uniqueness rule still requires focused review before old and new curricula are offered simultaneously for irregular, failed or retaking students.

### Next safe steps

Proceed in this order:

1. Commit and push this live migration evidence checkpoint.
2. Prepare the canonical LL.B. curriculum and assessment-template dataset as a reviewed, reproducible repository artifact.
3. Run a read-only collision, dependency and title/placement audit before backfill.
4. Preserve all existing Course IDs and archived legacy evidence.
5. Add department-consistency enforcement in repository/service logic before exposing curriculum write APIs.
6. Test canonical backfill first against a disposable PostgreSQL copy.
7. Create and validate a new private backup before ordinary-runtime backfill.
8. Apply canonical backfill through an auditable, idempotent and transaction-safe workflow.

## Canonical LL.B. Curriculum and Assessment-Template Dataset — 2026-08-06

### Classification

This checkpoint records the reviewed, deterministic canonical LL.B. curriculum and assessment-template dataset artifact.

Current verified classification:

- authoritative Academic Ordinance committed;
- authoritative Outcome-Based Education Curriculum committed;
- canonical typed dataset implemented;
- 58-course snapshot independently statically verified;
- assessment-template definitions independently statically verified;
- focused automated tests passed;
- API typecheck and build passed;
- dataset committed and pushed;
- database backfill not implemented;
- canonical rows not inserted into the ordinary runtime database;
- dataset runtime verification pending.

### Related commits

| Purpose | Commit |
|---|---|
| Authoritative OBE curriculum source | `d55a923a9c1cdc47963b1fe0d0f30c0adfd7514a` |
| Authoritative Academic Ordinance source | `c1790249518d9d20ac67ec17ac35c0ed51fcd281` |
| Canonical curriculum and assessment dataset | `2cfec6fb107514b7bfc3a6b84343fc95feca4a9f` |

Dataset commit message:

`Add canonical LLB curriculum dataset`

### Authoritative academic sources

| Source | Repository path | SHA-256 |
|---|---|---|
| Academic Ordinance | `docs/academic-sources/llb/Academic_Ordinance_LLB.pdf` | `283ac34518c9a23364ddc1a9ccb12e882a4026605418c9cc254ebab295d158f0` |
| OBE Curriculum | `docs/academic-sources/llb/Outcome-Based_Education_Curriculum_LLB.pdf` | `61872ba54cd39a3b8452fa20f3457f6749a834a41d6a786fb93e88f07063779c` |

The Academic Ordinance governs programme-wide academic rules.

The approved OBE curriculum governs the exact course catalogue, course placement, credits, marks, categories and Capstone identity.

### Dataset files

- `apps/api/prisma/data/llb-2025-2026-curriculum.definition.ts`
- `apps/api/prisma/data/llb-2025-2026-curriculum.definition.test.ts`

The definition is:

- readonly and strongly typed;
- independent of PostgreSQL connectivity;
- free of live database-generated IDs;
- reusable by a future controlled backfill workflow;
- intended initially for `DRAFT` curriculum status.

### Canonical programme totals

| Item | Verified value |
|---|---:|
| Academic years | 4 |
| Semesters | 8 |
| Courses | 58 |
| Credits offered | 140 |
| Minimum graduating credits | 134 |
| Programme marks | 5,800 |
| Teaching weeks per semester | 14 |
| Notional hours per credit | 40 |

### Category totals

| Category | Courses | Credits |
|---|---:|---:|
| Core | 42 | 98 |
| GED | 13 | 35 |
| Capstone | 3 | 7 |
| **Total** | **58** | **140** |

### Semester aggregates

| Year | Semester | Core Credits | GED Credits | Capstone Credits | Total Credits | Core Courses | GED Courses | Capstone Courses | Total Courses | Marks |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 10 | 5 | 0 | 15 | 4 | 2 | 0 | 6 | 600 |
| 1 | 2 | 7 | 9 | 0 | 16 | 3 | 3 | 0 | 6 | 600 |
| 2 | 1 | 11 | 6 | 0 | 17 | 5 | 2 | 0 | 7 | 700 |
| 2 | 2 | 13 | 5 | 0 | 18 | 6 | 2 | 0 | 8 | 800 |
| 3 | 1 | 14 | 3 | 0 | 17 | 6 | 1 | 0 | 7 | 700 |
| 3 | 2 | 16 | 3 | 0 | 19 | 7 | 1 | 0 | 8 | 800 |
| 4 | 1 | 15 | 2 | 2 | 19 | 6 | 1 | 1 | 8 | 800 |
| 4 | 2 | 12 | 2 | 5 | 19 | 5 | 1 | 2 | 8 | 800 |

All eight rows were independently pinned and checked against values derived from the 58 course records.

### Assessment templates

#### Standard theoretical course

`LLB-STANDARD-100-V1`

- Formative Activities: 30
- Attendance: 5
- Comprehensive Examination: 5
- Summative Examination: 60
- Total: 100

#### Capstone defence and practical

`LLB-CAPSTONE-DEFENCE-PRACTICAL-100-V1`

- Defence: 40
- Practical: 60
- Total: 100

#### Capstone defence and dissertation

`LLB-CAPSTONE-DEFENCE-DISSERTATION-100-V1`

- Defence: 40
- Dissertation: 60
- Total: 100

### Canonical Capstones

| Code | Title | Credits | Placement | Template |
|---|---|---:|---|---|
| `0421-4108` | Clinical Legal Education (Criminal Trial and Report on Court Visit) (Capstone) | 2 | Year 4, Semester 1 | Defence and Practical |
| `0421-4207` | Research Paper (Capstone) | 3 | Year 4, Semester 2 | Defence and Dissertation |
| `0421-4208` | Clinical Legal Education (Civil Trial and Report on Court Visit) (Capstone) | 2 | Year 4, Semester 2 | Defence and Practical |

The superseded code `0421-4209` is not part of the canonical dataset.

Archived/runtime-test codes `LAW-101` and `LAW-999` are not part of the canonical dataset and were not modified.

### Independent 58-course fingerprint

The reviewed ordered course snapshot is pinned by SHA-256:

`b25fb4585a364c35d9ace53ae20e9c8677fa6c4759fbed6d02bc9f4983598b33`

The fingerprint covers:

- course code;
- title snapshot;
- credit;
- total marks;
- category;
- academic year;
- semester;
- semester sequence;
- display order;
- assessment-template assignment.

A change to any covered academic field or array ordering causes the focused validation to fail.

### Static verification

Verified results:

- [x] Authoritative source paths and hashes independently pinned.
- [x] Actual source-file hashes verified.
- [x] Exactly 58 course records.
- [x] Exactly 140 offered credits.
- [x] Exactly 5,800 programme marks.
- [x] Core, GED and Capstone totals verified independently.
- [x] All eight semester aggregates verified independently.
- [x] Exactly three assessment templates.
- [x] Exact component codes, marks and display order verified.
- [x] All template totals equal 100.
- [x] Only the three approved Capstones use Capstone templates.
- [x] `0421-4209`, `LAW-101` and `LAW-999` are absent.
- [x] No live database-ID dependency exists.
- [x] Focused tests passed: 9 passed, 0 failed.
- [x] Independent compiled-artifact verification passed.
- [x] API typecheck passed.
- [x] API build passed.
- [x] `git diff --check` passed.

### Security and data boundary

This checkpoint did not:

- access PostgreSQL;
- execute a Prisma migration;
- run a seed;
- insert curriculum rows;
- modify existing Course rows;
- alter CourseOffering records;
- alter enrollments;
- alter attendance;
- alter results;
- alter transcripts;
- change authorization or department-isolation behavior;
- deploy to the Ubuntu runtime;
- restart PM2.

No credentials, tokens, password hashes or production secrets were added.

### Current accurate status

> The canonical LL.B. curriculum and assessment-template dataset is implemented as a deterministic, typed repository artifact, independently statically validated, committed and pushed. It contains the reviewed 58-course, 140-credit and 5,800-mark programme snapshot, eight semester aggregates and three exact 100-mark assessment templates. No canonical curriculum records have yet been inserted into the ordinary Lexora runtime database, and database backfill/runtime verification remain pending.

### Next safe steps

Proceed in this order:

1. Commit and push this documentation checkpoint.
2. Synchronize the dataset and documentation commits to the Ubuntu server.
3. Run a read-only live collision and dependency audit against existing Course records.
4. Preserve all existing Course IDs and archived legacy/runtime-test evidence.
5. Design an idempotent, transaction-safe and department-scoped canonical backfill workflow.
6. Test the backfill against a disposable PostgreSQL copy first.
7. Verify allowed rerun behavior, rollback behavior and mismatch fail-closed behavior.
8. Create and validate a fresh private backup before ordinary-runtime backfill.
9. Apply the reviewed backfill to the ordinary runtime database only after disposable verification.
10. Document live backfill evidence separately.
## Canonical LL.B. Curriculum Backfill — Disposable and Ordinary Runtime Verification — 2026-08-07

### Classification and supersession scope

This checkpoint records the completed canonical LL.B. curriculum backfill workflow and its disposable and ordinary-runtime verification.

It supersedes only earlier statements that the following were pending:

- canonical 58-course curriculum backfill;
- creation of the canonical curriculum-version record;
- creation of the three canonical assessment templates;
- creation of the eight canonical assessment components;
- correction of the eleven reviewed course-title transitions;
- ordinary-runtime application of that canonical foundation.

Earlier schema-foundation, canonical-source, migration, audit and dependency evidence remains valid and is not deleted or replaced.

This checkpoint does not claim that the complete curriculum-management feature, CourseOffering integration, student curriculum assignment, syllabus management, Admin UI or Teacher Course Workspace is complete.

### Source implementation

| Item | Verified value |
|---|---|
| Branch | `main` |
| Implementation commit | `c0a187d5584bed819e9c5c4e5c36d62f30e4642b` |
| Commit message | `Add canonical LLB curriculum backfill workflow` |
| Canonical fingerprint | `b25fb4585a364c35d9ace53ae20e9c8677fa6c4759fbed6d02bc9f4983598b33` |
| Backfill implementation | `apps/api/prisma/backfills/llb-2025-2026-curriculum.backfill.ts` |
| CLI | `apps/api/prisma/backfills/llb-2025-2026-curriculum.backfill.cli.ts` |
| Focused tests | `apps/api/prisma/backfills/llb-2025-2026-curriculum.backfill.test.ts` |

Static verification passed before runtime application:

- canonical dataset tests: `9/9`;
- focused backfill tests: `49/49`;
- API typecheck;
- API build;
- `git diff --check`;
- clean repository boundary;
- local and remote commit alignment.

### Preserved security and academic-history boundaries

The workflow preserves:

- Department of Law scope, code `0421`;
- LL.B. programme scope;
- exact database-name confirmation before APPLY;
- canonical source fingerprint confirmation;
- active scoped `department_admin` actor validation;
- bounded non-placeholder audit reason;
- PostgreSQL advisory-lock protection;
- serializable APPLY transaction;
- compare-and-swap title correction;
- post-write exact-state verification;
- audit records for every title correction and the overall backfill;
- all 58 existing canonical Course IDs;
- archived `LAW-101` and `LAW-999`;
- existing offering, enrollment, attendance, result, transcript and other historical references;
- safe conflict failure without partial writes;
- exact idempotent rerun behavior.

No Course row was deleted and no canonical Course ID was replaced.

### Disposable PostgreSQL runtime verification

Private evidence report:

`/home/sh002/lexora-runtime-evidence/llb-backfill-disposable-runtime-20260807T012405Z.txt`

Verification environment:

- PostgreSQL image: `postgres:18.4-alpine3.23`;
- restore client: host `pg_restore 18.4`;
- disposable exposure: loopback only;
- disposable data source: read-only `pg_dump` snapshot of the ordinary runtime database;
- ordinary runtime database mutation during disposable verification: none;
- temporary snapshot removed automatically;
- disposable container removed automatically.

Verified disposable behavior:

- [x] Fresh PLAN classified the target as `FRESH_APPLY`.
- [x] PLAN found 58 canonical courses.
- [x] PLAN preserved 58 existing Course IDs.
- [x] PLAN proposed exactly 11 title corrections.
- [x] PLAN proposed exactly 70 foundation inserts.
- [x] Wrong database-name confirmation failed closed before target-state work.
- [x] Shared PLAN advisory locks were mutually compatible.
- [x] APPLY refused to run while a shared PLAN lock was held.
- [x] PLAN refused to run while an exclusive APPLY lock was held.
- [x] Forced failure during foundation creation rolled back all title changes.
- [x] Forced failure rolled back all foundation inserts.
- [x] Forced failure rolled back all transactional audits.
- [x] Fresh APPLY completed successfully.
- [x] All 58 existing canonical Course IDs remained unchanged.
- [x] Eleven canonical title corrections were applied.
- [x] Seventy foundation rows were created.
- [x] Eleven title-correction audit rows were created.
- [x] One overall backfill audit row was created.
- [x] `LAW-101` and `LAW-999` remained unchanged.
- [x] Post-APPLY PLAN classified the state as `EXACT_NOOP`.
- [x] Repeated APPLY classified the state as `EXACT_NOOP`.
- [x] Rerun created no duplicate foundation or audit rows.
- [x] Ordinary PM2/API/Nginx runtime remained unaffected.

### Validated private pre-backfill backup

Backup:

`/home/sh002/lexora-private-backups/lexora_lms-before-canonical-llb-backfill-20260807T012811Z.dump`

Verified backup properties:

- custom-format PostgreSQL archive;
- archive listing validation passed;
- SHA-256:
  `c35c6f8140b5ac8348debe25af8cef7f9b8cdba113f73d383fd2c72f562afd5e`;
- file permission: `600`;
- backup-directory permission: `700`;
- no credential was printed or documented;
- automatic restore was not required.

### Ordinary-runtime application and verification

Private evidence report:

`/home/sh002/lexora-runtime-evidence/live-canonical-llb-backfill-20260807T012811Z.txt`

Target database:

`lexora_lms`

Verified live baseline before APPLY:

- 58 canonical courses;
- 47 titles already canonical;
- 11 reviewed legacy titles requiring correction;
- zero canonical curriculum-foundation rows;
- exactly one active scoped Department of Law `department_admin`;
- archived `LAW-101` and `LAW-999` present and protected.

Verified ordinary-runtime result:

- [x] Live PLAN classified the target as `FRESH_APPLY`.
- [x] Live APPLY completed successfully.
- [x] All 58 existing canonical Course IDs were preserved.
- [x] Eleven canonical course titles were corrected.
- [x] One canonical CurriculumVersion row was created.
- [x] Three CourseAssessmentTemplate rows were created.
- [x] Eight AssessmentTemplateComponent rows were created.
- [x] Fifty-eight CurriculumCourse binding rows were created.
- [x] Total foundation rows created: 70.
- [x] Eleven title-correction audit rows were created.
- [x] One overall backfill audit row was created.
- [x] `LAW-101` and `LAW-999` remained unchanged.
- [x] Post-application PLAN returned `EXACT_NOOP`.
- [x] Repeated APPLY returned `EXACT_NOOP`.
- [x] No duplicate foundation row was created.
- [x] No duplicate title audit was created.
- [x] No duplicate overall audit was created.
- [x] PM2 PID remained unchanged.
- [x] PM2 restart count remained unchanged.
- [x] Direct API health returned HTTP `200`.
- [x] Nginx-proxied API health returned HTTP `200`.
- [x] Repository remained clean.
- [x] Evidence permission and secret scan passed.

### Accurate current status

> The canonical LL.B. 2025–2026 curriculum backfill workflow is implemented and committed. It has been runtime verified against a loopback-only disposable PostgreSQL 18.4 copy, including database-name mismatch rejection, advisory-lock behavior, forced transaction rollback, fresh APPLY and exact idempotent rerun. A validated private backup was created before ordinary-runtime application. The ordinary `lexora_lms` database now contains the canonical curriculum version, three assessment templates, eight assessment components and 58 curriculum-course bindings; the eleven reviewed title corrections were applied while all 58 existing Course IDs and archived historical rows were preserved. Post-application PLAN and APPLY both return exact no-op, and PM2/API/Nginx runtime health remained stable.

### Explicitly pending

This checkpoint does not implement or verify:

- `CourseOffering` to `CurriculumCourse` binding;
- immutable student curriculum-version assignment;
- enrollment-to-curriculum binding;
- historical/irregular-student curriculum coexistence rules;
- focused review of the current CourseOffering uniqueness constraint;
- curriculum repository, service, controller, DTO and policy endpoints;
- object-level authorization tests for future curriculum endpoints;
- Admin curriculum-management UI;
- Teacher Course Workspace;
- `SyllabusVersion`;
- syllabus approval and publication workflow;
- curriculum-aware result or transcript recalculation changes;
- broader multi-department curriculum rollout.

These remaining items must continue module by module with department isolation, policy checks, object-level authorization, audit evidence and focused runtime verification.

## CourseOffering to CurriculumCourse Binding Runtime Verification — 2026-08-07

### Supersession and classification

This checkpoint supersedes only earlier statements that `CourseOffering` to `CurriculumCourse` binding and its binding-specific API/runtime verification were pending.

Earlier curriculum schema-foundation, canonical dataset, canonical backfill and historical runtime evidence remain valid.

Current verified classification:

- `CourseOffering` to `CurriculumCourse` binding foundation implemented;
- implementation committed and pushed;
- focused automated tests passed;
- binding-specific lint passed;
- Prisma format, validation and Client generation passed;
- API typecheck and build passed;
- additive migration verified against disposable PostgreSQL;
- additive migration deployed to the ordinary `lexora_lms` database;
- live PostgreSQL catalog verified;
- binding endpoint authorization and department isolation runtime verified;
- immutable same-target and different-target behavior runtime verified;
- success audit runtime verified;
- Teacher assigned-course compact curriculum read runtime verified;
- canonical runtime binding created for one reviewed offering;
- unrelated curriculum/student/syllabus/result work remains pending.

### Implementation commit

Implementation commit:

`da99a18503ee30d3d0805cb07734f86b770694c4`

Commit message:

`Add immutable course offering curriculum binding`

Migration:

`202608070001_add_course_offering_curriculum_binding`

### Schema and migration behavior

The migration adds nullable `course_offerings.curriculum_course_id`.

Verified schema behavior:

- [x] Existing `CourseOffering` rows remained valid without a binding.
- [x] The new field is nullable.
- [x] Index `course_offering_dept_curriculum_course_idx` exists.
- [x] The foreign key references `curriculum_courses.id`.
- [x] Delete behavior is restrictive.
- [x] No automatic existing-offering backfill occurs.
- [x] Existing business/foundation row counts were unchanged by migration.
- [x] Prisma reported no schema drift after deployment.

Before the live binding API verification, the ordinary database contained:

- 9 CourseOffering rows;
- 0 bound CourseOffering rows.

### Static and focused automated verification

Final implementation verification reported:

- focused curriculum-binding tests: 36 passed, 0 failed;
- focused lint for the binding correction files: passed;
- Prisma format: passed;
- Prisma validate: passed;
- Prisma Client generation: passed;
- API typecheck: passed;
- API build: passed;
- `git diff --check`: passed.

Repository-wide API lint still has unrelated pre-existing lint debt. That broader lint debt was not changed or represented as resolved by this feature.

### Binding-specific security model

The binding endpoint is:

`PUT /api/v1/course-offerings/:id/curriculum-binding`

It uses a dedicated binding-management policy rather than relying on the broader Teacher offering-management capability.

Binding behavior enforces:

- authenticated-principal department scope;
- DB-backed active Department Admin verification;
- active/nonarchived/nondeleted user and department requirements;
- valid same-department, unrevoked and unexpired Department Admin role assignment;
- same-department CourseOffering and Course identity;
- same-department CurriculumCourse identity;
- exact CourseOffering Course to CurriculumCourse Course equality;
- CurriculumVersion relation and programme consistency;
- CurriculumVersion department consistency;
- assessment-template relation and department consistency;
- non-null assessment-template programme consistency;
- department-scoped generic assessment templates when template programme is null;
- explicit bindable lifecycle allowlist:
  - `DRAFT`;
  - `APPROVED`;
  - `ACTIVE`;
- immutable first binding;
- exact same-target retry idempotence;
- different-target overwrite rejection;
- success audit written transactionally with the binding.

Existing exact bindings remain idempotent after later curriculum/template retirement or archival, but malformed tenant, relation or programme identity remains fail-closed.

### Read-side isolation

CourseOffering list/detail responses expose only a compact nullable curriculum summary.

Repository read sanitization validates tenant/relation/programme identity before returning curriculum metadata.

Verified behavior includes:

- malformed cross-department curriculum metadata is not exposed;
- malformed list rows are dropped;
- malformed direct-detail rows return safe not-found behavior;
- Teacher assigned-course filtering remains authoritative;
- assessment-template component internals are not exposed through the compact CourseOffering summary.

### Disposable PostgreSQL verification

The migration was first verified against an isolated disposable PostgreSQL environment using:

- image: `postgres:16-alpine`;
- host publication: loopback `127.0.0.1` only;
- exact pre-feature Prisma schema as baseline;
- no persistent volume;
- no ordinary Lexora database access.

Verified results:

- [x] Baseline schema initialization passed.
- [x] Migration application passed.
- [x] Nullable binding column verified.
- [x] Mapped index verified.
- [x] Restrictive foreign key verified.
- [x] Prisma drift check reported no difference.
- [x] A second direct migration application failed safely.
- [x] Post-failure drift check still reported no difference.
- [x] Existing API runtime remained healthy.
- [x] Direct API health returned HTTP `200`.
- [x] Nginx-proxied API health returned HTTP `200`.
- [x] Live server repository was not changed by disposable verification.
- [x] Ordinary `lexora_lms` database was not accessed.
- [x] Disposable container/worktree/temp artifacts were cleaned automatically.

### Ordinary runtime migration deployment

Before ordinary migration application:

- server repository was clean;
- server source was fast-forwarded to implementation commit `da99a18`;
- API typecheck and build passed on server;
- database identity was explicitly confirmed as `lexora_lms`;
- the target column was absent;
- the target Prisma migration record was absent.

A validated private custom-format PostgreSQL backup was created before migration:

`/home/sh002/lexora-private-backups/lexora_lms-before-202608070001_add_course_offering_curriculum_binding-20260807T031553Z.dump`

Backup SHA-256:

`cd0b0b4399b4d64949ab4172f8a055d7554d2010f693ba38c643159112a8152a`

Backup controls:

- [x] backup archive was validated with `pg_restore --list`;
- [x] backup file permission was `0600`;
- [x] backup directory permission was `0700`;
- [x] no database credential was printed or documented.

Ordinary migration result:

- [x] Prisma migration deployed successfully.
- [x] Prisma migration status reported database schema up to date.
- [x] Exactly one completed non-rolled-back migration record exists.
- [x] No incomplete migration record exists.
- [x] Live nullable column verified.
- [x] Live mapped index verified.
- [x] Live restrictive foreign key verified.
- [x] Selected business/foundation table counts were unchanged.
- [x] Existing CourseOffering rows were not automatically bound.
- [x] Prisma drift check reported no difference.

Runtime restart result:

- PM2 PID before controlled deployment restart: `1860`;
- PM2 PID after restart: `39696`;
- direct API health returned HTTP `200`;
- Nginx-proxied API health returned HTTP `200`;
- application port remained bound to loopback only;
- repository remained clean and origin-aligned.

### Canonical runtime binding target

A read-only target audit rejected the archived legacy `LAW-101` runtime offering as a canonical binding target because it has no canonical CurriculumCourse relation.

Preserved legacy course:

- Course code: `LAW-101`;
- title: `Constitutional Law I`;
- status: `ARCHIVED`;
- historical offering count: 1;
- historical teacher-assignment count: 2;
- historical enrollment count: 3.

Its offering remained unbound.

The reviewed canonical positive target was:

- CourseOffering:
  `offering_0421_1101_2025_2026_s1_a`
- Department:
  `dept_law_test`
- Course:
  `0421-1101 — Jurisprudence-I`
- CurriculumCourse:
  `cmsi9mwp6001b2iiulsk1kkeq`
- CurriculumVersion:
  `cmsi9mwow000n2iiumxospbg6`
- CurriculumVersion code:
  `LLB-HONS-2025-2026-V1`
- AssessmentTemplate:
  `cmsi9mwoy000p2iiub0z5yc8v`
- AssessmentTemplate code:
  `LLB-STANDARD-100-V1`

Exactly one matching CurriculumCourse was found.

The CurriculumVersion and assessment template were both in `DRAFT`, which is intentionally allowed for configuration binding. Binding does not itself represent curriculum approval or publication.

### Live authorization and isolation verification

Canonical runtime accounts were authenticated using department code `0421`.

Raw passwords, access tokens and refresh tokens were not printed or documented.

Verified negative cases:

- [x] Unauthenticated binding returned HTTP `401`.
- [x] Teacher binding attempt returned HTTP `403`.
- [x] Student binding attempt returned HTTP `403`.
- [x] Whitespace-only `curriculumCourseId` returned HTTP `400`.
- [x] Law Department Admin direct binding attempt against BUS offering returned safe HTTP `404`.
- [x] Forged `x-department-id: dept_bus_test` did not switch a Law Department Admin into the BUS department.
- [x] Forged-header BUS direct object attempt returned safe HTTP `404`.
- [x] All negative attempts left the Law canonical target unbound before the positive test.
- [x] All negative attempts left the BUS target unbound.
- [x] No success binding audit existed after negative attempts.

### Positive immutable binding verification

Department Admin successfully bound the canonical offering.

Result:

- [x] Initial canonical binding returned HTTP `200`.
- [x] Returned CourseOffering identity matched the target.
- [x] Returned CurriculumCourse identity matched the target.
- [x] Compact CurriculumVersion summary was present.
- [x] Compact assessment-template summary was present.
- [x] PostgreSQL stored the exact reviewed CurriculumCourse ID.

Idempotence:

- [x] Exact same-target retry returned HTTP `200`.
- [x] Same-target retry did not create a duplicate audit.
- [x] Forged `x-department-id` on the already-lawful same-target request did not override the authenticated principal's real department scope.
- [x] Same lawful binding remained HTTP `200`.

Immutability:

- [x] A different CurriculumCourse overwrite attempt returned HTTP `409`.
- [x] Existing binding remained unchanged after the conflict.

### Binding audit verification

Exactly one successful binding audit exists for the canonical offering.

Verified audit identity:

- actor:
  `cmpmmnmk700072imth5f907a6`
- department:
  `dept_law_test`
- action:
  `course-management.offering.curriculum-bound`
- target type:
  `course_offering`
- target:
  `offering_0421_1101_2025_2026_s1_a`
- outcome:
  `SUCCESS`
- CurriculumCourse:
  `cmsi9mwp6001b2iiulsk1kkeq`
- CurriculumVersion:
  `cmsi9mwow000n2iiumxospbg6`
- AssessmentTemplate:
  `cmsi9mwoy000p2iiub0z5yc8v`

Observed audit time:

`2026-08-07 03:40:15.379`

The audit context matched the actual persisted binding identity.

### Teacher assigned-course read verification

Before temporary assignment reactivation:

- canonical Teacher had no active assignment to the canonical offering;
- Teacher offering list did not expose the offering;
- direct Teacher read returned safe HTTP `404`.

A dedicated historical runtime-test assignment row was temporarily reactivated for the canonical Teacher.

Reactivation result:

- HTTP `201`;
- assignment became `ACTIVE`.

While actively assigned:

- [x] Teacher offering list returned HTTP `200`.
- [x] Canonical curriculum-bound offering appeared in the assigned Teacher list.
- [x] Compact curriculum summary contained the expected CurriculumCourse.
- [x] Teacher direct offering read returned HTTP `200`.
- [x] Direct response contained the expected compact curriculum summary.
- [x] Assessment-template components were not exposed through the compact summary.

The dedicated runtime-test assignment was then unassigned.

Unassignment result:

- HTTP `201`;
- assignment returned to `INACTIVE`.

After unassignment:

- [x] Teacher offering list returned HTTP `200`.
- [x] Canonical offering disappeared from the Teacher list.
- [x] Teacher direct offering read returned safe HTTP `404`.
- [x] No active canonical Teacher assignment remained.

### Final runtime invariants

Final ordinary-runtime state after verification:

- [x] Canonical CourseOffering has the exact reviewed CurriculumCourse binding.
- [x] Total bound CourseOfferings: 1.
- [x] Exactly one successful curriculum-binding audit exists.
- [x] Temporary active canonical Teacher assignments remaining: 0.
- [x] BUS runtime offering remains unbound.
- [x] Archived legacy `LAW-101` offering remains unbound.
- [x] PM2 PID remained `39696` throughout the endpoint verification.
- [x] Direct API health remained HTTP `200`.
- [x] Nginx-proxied API health remained HTTP `200`.
- [x] Repository HEAD remained implementation commit `da99a18`.
- [x] Working tree remained clean.
- [x] Local/server `main` and `origin/main` remained aligned.
- [x] No raw password or authentication token was printed in the runtime evidence.

### Accurate current status

> The immutable `CourseOffering` to `CurriculumCourse` binding foundation is implemented, committed, deployed and runtime verified. The ordinary `lexora_lms` database has the nullable restrictive binding column and currently contains one reviewed canonical binding for `0421-1101 — Jurisprudence-I`. The binding endpoint is restricted to an active Department Admin, remains scoped to the authenticated principal's real department, rejects cross-department direct object access, rejects Teacher/Student writes, is idempotent for the exact existing target, rejects a different-target overwrite, and writes exactly one success audit transactionally. Assigned Teachers can read the compact curriculum identity only while an active assignment exists. Archived `LAW-101` evidence and the BUS runtime offering remain unbound and unchanged.

### Explicitly still pending

This checkpoint does not implement or verify:

- immutable student curriculum-version assignment;
- enrollment-to-curriculum binding;
- historical, irregular, failed or retaking student curriculum coexistence rules;
- focused review of the current CourseOffering uniqueness constraint for multi-curriculum coexistence;
- broad curriculum-version CRUD/approval APIs;
- broad curriculum-course management APIs;
- assessment-template management UI/API beyond the binding dependency foundation already present;
- Admin curriculum-management UI;
- Teacher Course Workspace;
- `SyllabusVersion`;
- syllabus approval and publication workflow;
- curriculum-aware result recalculation;
- curriculum-aware transcript generation/recalculation;
- broader multi-department curriculum rollout.

Binding one canonical CourseOffering does not mean all current or future CourseOfferings are automatically curriculum-bound.

The remaining curriculum work must continue module by module with department isolation, object-level authorization, audit evidence, immutable academic-history rules and focused runtime verification.

## Student Curriculum Assignment Schema Foundation Runtime Verification — 2026-08-09

### Supersession and classification

This checkpoint supersedes only earlier statements that the schema foundation for immutable student curriculum-version assignment was still pending.

It does **not** supersede or complete the remaining student-curriculum application workflow.

Current verified classification:

- `StudentCurriculumAssignment` schema foundation implemented;
- implementation independently reviewed;
- implementation committed and pushed;
- focused schema tests passed;
- Prisma schema validation and Client generation passed;
- API typecheck and build passed;
- additive migration verified against loopback-only disposable PostgreSQL 16;
- additive migration deployed to the ordinary `lexora_lms` database;
- live PostgreSQL migration history and catalog verified;
- existing Enrollment and CourseOffering schema behavior preserved;
- existing selected academic/business row counts preserved;
- no student curriculum assignment row was automatically created;
- PM2/API/Nginx runtime health verified after controlled restart;
- API listener remained loopback-only;
- student curriculum-assignment API remains pending;
- enrollment-to-curriculum binding remains pending.

### Implementation commit

Implementation commit:

`532c7df6b98b2f7e4ec6e2c07bc662463bda77d3`

Commit message:

`Add student curriculum assignment foundation`

Migration:

`202608090001_add_student_curriculum_assignment`

### Schema foundation

The new `StudentCurriculumAssignment` model records a student's programme-level curriculum identity.

Verified fields:

- `id`
- `departmentId`
- `studentUserId`
- `academicProgramId`
- `curriculumVersionId`
- `assignedByUserId`
- `assignedAt`
- `createdAt`

The model intentionally has no `updatedAt` field.

Verified relations:

- Department
- Student User
- AcademicProgram
- CurriculumVersion
- assigning User

All five academic-history foreign keys use restrictive delete behavior.

Verified uniqueness:

`departmentId + studentUserId + academicProgramId`

This prevents multiple curriculum-assignment rows for the same student/programme within a department.

Important limitation:

The current foundation is immutable by domain design and schema shape, but the database does not use a trigger that physically prohibits every SQL `UPDATE`. No generic curriculum-assignment update API or repository workflow exists. Any future exceptional curriculum migration/reassignment must be designed as a separate, explicitly authorised and audited workflow.

### Focused static verification

Focused schema test file:

`apps/api/prisma/student-curriculum-assignment.schema.test.ts`

Actual focused test result:

- tests: `5`
- passed: `5`
- failed: `0`
- skipped: `0`

Verified test coverage includes:

- required mapped scalar fields;
- absence of `updatedAt`;
- exact student/programme uniqueness;
- five restrictive academic-history dependencies;
- exact mapped identifier names;
- no Enrollment migration alteration;
- no CourseOffering migration or uniqueness alteration;
- preservation of existing CourseOffering curriculum-binding schema;
- documented future assignment authorization/lifecycle requirements.

Server-side verification also passed:

- Prisma validate;
- Prisma generate;
- API typecheck;
- API build.

### Disposable PostgreSQL 16 migration verification

The migration was tested before ordinary deployment using:

- image: `postgres:16-alpine`;
- loopback-only random host port;
- no persistent Docker volume;
- temporary generated database credentials;
- detached temporary Git worktree at the implementation commit;
- exact pre-implementation Prisma schema as baseline;
- no ordinary `lexora_lms` database access.

Verified disposable-database results:

- [x] Target Prisma schema validated.
- [x] Exact baseline schema initialized successfully.
- [x] `student_curriculum_assignments` did not exist before migration.
- [x] Migration applied successfully.
- [x] Exactly one new public table was added.
- [x] Assignment table contains 8 columns.
- [x] All 8 columns are NOT NULL.
- [x] Exactly 2 database defaults exist.
- [x] `updated_at` is absent.
- [x] `assigned_at` and `created_at` use `TIMESTAMP(3)`.
- [x] Four indexes including the primary-key index exist.
- [x] Exact student/programme unique index verified.
- [x] Five foreign keys exist.
- [x] All five foreign keys use `ON DELETE RESTRICT`.
- [x] All five foreign keys use `ON UPDATE CASCADE`.
- [x] Exact foreign-key targets verified.
- [x] PostgreSQL identifier truncation did not occur.
- [x] Enrollment catalog fingerprint was unchanged.
- [x] CourseOffering catalog fingerprint was unchanged.
- [x] A second direct application of the migration failed safely.
- [x] The assignment table remained singular after the failed second application.
- [x] Foreign-key count remained exactly five.
- [x] Prisma database-to-datamodel drift check reported no difference.
- [x] Existing PM2 process remained unchanged during disposable verification.
- [x] Direct API health remained HTTP `200`.
- [x] Nginx-proxied API health remained HTTP `200`.
- [x] Ordinary `lexora_lms` database was not accessed.
- [x] Temporary container/worktree artifacts were cleaned automatically.

### Verification-script notes

Two verification-environment issues were encountered before the successful clean disposable run:

1. Docker administration under `sh002` correctly required `sudo`; `sh002` was not added to the `docker` group. The existing Docker socket security boundary was preserved.
2. An initial catalog-fingerprint helper needed an explicit `pg_constraint.contype::text` cast because PostgreSQL reported an ambiguous `text || "char"` concatenation operator.

Neither issue required a Lexora schema/code change, and neither affected the ordinary runtime database.

### Ordinary runtime migration deployment

Before ordinary migration application:

- server repository was clean;
- server source was fast-forwarded to implementation commit `532c7df6b98b2f7e4ec6e2c07bc662463bda77d3`;
- Prisma validate/generate passed on server;
- API typecheck/build passed on server;
- focused schema tests passed `5/5`;
- ordinary database identity was explicitly confirmed as `lexora_lms`;
- target assignment table was absent;
- target migration record was absent;
- Prisma reported the target migration as pending.

The non-zero exit from `prisma migrate status` while the migration was pending was treated as an expected pre-deployment condition. The first deployment script stopped before `migrate deploy`; the retained backup and clean pending state were revalidated before deployment continued.

### Validated private backup

A private PostgreSQL custom-format backup was created before ordinary migration application.

Backup path:

`/home/sh002/lexora-private-backups/lexora_lms-before-202608090001_add_student_curriculum_assignment-20260809T144110Z.dump`

SHA-256:

`2d396d5b6fd381dc2895c0785d06fc7ccce490bc3a29abdca815592e98f03741`

Verified backup properties:

- archive passed `pg_restore --list`;
- backup file mode: `0600`;
- backup directory mode: `0700`;
- no database credentials were printed or documented.

### Ordinary pre-migration business counts

Selected ordinary-runtime counts captured immediately before migration:

| Table | Count |
|---|---:|
| `academic_programs` | 2 |
| `assessment_template_components` | 8 |
| `course_assessment_templates` | 3 |
| `course_offerings` | 9 |
| `courses` | 61 |
| `curriculum_courses` | 58 |
| `curriculum_versions` | 1 |
| `enrollments` | 10 |
| `result_records` | 1 |
| `transcript_records` | 1 |
| `users` | 11 |

### Ordinary migration result

Prisma successfully applied:

`202608090001_add_student_curriculum_assignment`

Post-deployment Prisma migration status:

`Database schema is up to date!`

Migration-history verification:

- completed records: `1`;
- rolled-back records: `0`;
- incomplete records: `0`.

### Live ordinary PostgreSQL catalog verification

Verified live catalog:

- [x] `student_curriculum_assignments` exists exactly once.
- [x] Table contains 8 columns.
- [x] `updated_at` is absent.
- [x] Four indexes including the primary key exist.
- [x] Five foreign keys exist.
- [x] All five foreign keys use restrictive delete behavior.
- [x] Exact student/programme uniqueness is:
  `department_id + student_user_id + academic_program_id`.
- [x] Automatic student curriculum-assignment rows created: `0`.
- [x] Selected pre-existing academic/business counts remained unchanged.
- [x] Prisma database-to-datamodel drift check reported no difference.

### Runtime non-disruption verification

Controlled API restart result:

- PM2 PID before: `1844`;
- PM2 PID after: `29449`;
- API health restored on retry attempt `2`;
- direct API health: HTTP `200`;
- Nginx-proxied API health: HTTP `200`;
- NestJS API port `4000` remained bound to loopback only;
- repository remained clean;
- local `main` and `origin/main` remained aligned.

### Accurate current status

> The immutable student curriculum-assignment **schema foundation** is implemented, independently reviewed, committed, disposable-PostgreSQL verified, deployed to the ordinary `lexora_lms` database and runtime verified. The ordinary database now contains the empty `student_curriculum_assignments` table with the reviewed unique and restrictive foreign-key constraints. No student has been automatically assigned to a curriculum version. No assignment API, generic update workflow, enrollment curriculum binding or curriculum reassignment workflow has been implemented.

### Explicitly pending

This checkpoint does not implement or verify:

- Department-Admin-controlled initial student curriculum assignment API;
- assignment-specific policy/controller/DTO/service/repository behavior;
- object-level assignment authorization;
- principal-department enforcement for assignment writes;
- active Student-role verification before assignment;
- CurriculumVersion lifecycle enforcement for assignment;
- enforcement that only `APPROVED` or `ACTIVE` curriculum versions may be assigned;
- rejection of `DRAFT`, `RETIRED` and `ARCHIVED` versions for operational student assignment;
- assignment audit event and audit-context verification;
- idempotent same-target initial assignment behavior;
- conflict behavior for a different curriculum target;
- enrollment-to-student-curriculum-assignment binding;
- Enrollment to exact `CurriculumCourse` binding;
- old/new curriculum CourseOffering coexistence;
- focused replacement/review of the current CourseOffering uniqueness constraint;
- irregular/failed/retake/improvement curriculum rules;
- earlier-syllabus candidate handling;
- curriculum-aware student available/eligible offering discovery;
- curriculum-aware result or transcript recalculation;
- broader curriculum-management UI/API work.

### Next safe step

The next implementation checkpoint should be the narrow, Department-Admin-controlled **initial StudentCurriculumAssignment API**.

Before implementation, preserve these rules:

1. authenticated principal department scope is authoritative;
2. `x-department-id` must never override the principal's real department;
3. only a suitably authorised Department Admin may create an initial assignment;
4. the target user must belong to the same department;
5. the target user must hold an active department-scoped Student role;
6. the AcademicProgram must belong to the same department;
7. the CurriculumVersion must belong to the same department and exact AcademicProgram;
8. only `APPROVED` or `ACTIVE` CurriculumVersion records may be assigned operationally;
9. `DRAFT`, `RETIRED` and `ARCHIVED` versions must fail closed;
10. first assignment is create-once;
11. same-target retry should be idempotent;
12. a different-target retry must conflict rather than silently rewrite history;
13. successful initial assignment must emit a department-scoped audit record;
14. cross-department and direct-object access must use safe not-found behavior where appropriate;
15. no generic curriculum-assignment update endpoint should be created;
16. Enrollment integration remains a separate later checkpoint.

## Initial Student Curriculum Assignment API Ordinary Runtime Verification — 2026-08-09

### Supersession and classification

This checkpoint supersedes only earlier statements that the Department-Admin-controlled initial `StudentCurriculumAssignment` API and its runtime verification were pending.

The earlier StudentCurriculumAssignment schema-foundation, migration, disposable PostgreSQL, ordinary deployment and historical evidence remain valid.

Current verified classification:

- initial StudentCurriculumAssignment API implemented;
- implementation independently security-reviewed;
- review correction completed before commit;
- implementation committed and pushed;
- focused automated tests passed `58/58`;
- API typecheck passed;
- API build passed;
- server source deployed to the reviewed implementation commit;
- Prisma migration status remained up to date;
- Department-Admin authorization runtime verified;
- Teacher and Student write denial runtime verified;
- authenticated-principal department authority runtime verified;
- forged `x-department-id` scope override blocked;
- cross-department direct-object isolation runtime verified;
- active Student-role requirement runtime verified;
- AcademicProgram department isolation runtime verified;
- exact CurriculumVersion programme/department dependency verification runtime tested;
- `APPROVED` initial assignment runtime verified;
- `DRAFT`, `RETIRED` and `ARCHIVED` rejection runtime verified;
- exact same-target idempotence runtime verified;
- different-target immutable conflict runtime verified;
- persisted ordinary PostgreSQL assignment verified;
- exact single transactional success audit verified;
- compact/sanitized response verified;
- Prisma database-to-datamodel drift check passed;
- PM2/API/Nginx runtime health verified;
- API listener remained loopback-only;
- ordinary live concurrent-request race was not executed.

### Implementation commit

Implementation commit:

`88a34455639a239bee0e8d47500ee3c1a0e478ea`

Commit message:

`Add immutable student curriculum assignment API`

Implementation parent/documentation baseline:

`bf2f9e43044edefc174e949cf27b822fae5d8704`

The implementation changed exactly fourteen reviewed API source/test files.

No Prisma schema, migration, Enrollment, CourseOffering, frontend, environment or documentation file was changed by the implementation commit.

### HTTP endpoint

Runtime-verified endpoint:

`PUT /api/v1/students/:studentUserId/curriculum-assignments/:academicProgramId`

Request body:

`{ "curriculumVersionId": "..." }`

Dedicated policy:

`course-management.student-curriculum-assignment.manage`

Success audit action:

`course-management.student-curriculum-assignment.created`

Controller protection includes:

- `AuthGuard`;
- `PolicyGuard`;
- `@RequirePolicy()`.

The authenticated principal's department remains the authoritative department scope.

The request body does not control:

- department identity;
- assigning actor;
- assignment ID;
- assignment timestamps;
- role;
- lifecycle status.

### Independent review

The implementation received an independent security/code review before commit.

Initial review findings:

- Critical: none;
- High: one tenant dependency-chain hardening issue;
- Medium: none;
- Low: one overly permissive assignment-specific `P2002` matcher;
- Suggestion: explicit successful repository response typing could be improved later.

The High finding was corrected before commit.

The final sanitizer verifies:

- assignment department;
- Student relation ID;
- Student relation department;
- assigning User relation ID;
- assigning User relation department;
- AcademicProgram identity and department;
- CurriculumVersion identity;
- CurriculumVersion department;
- CurriculumVersion exact AcademicProgram relationship.

This sanitizer protects:

- existing exact-target reads;
- newly created assignment responses;
- assignment-specific `P2002` concurrency re-reads.

Historical exact-target idempotence does not require the original assigning administrator or assigned student to remain currently active.

The Low finding was also corrected.

The assignment-specific `P2002` matcher now accepts only:

- the exact mapped unique-constraint name;
- the exact three mapped database columns;
- or the exact three Prisma field names.

Partial names, unrelated targets and larger target supersets fail closed.

Final independent review:

- Critical: none;
- High: none;
- Medium: none;
- Low: none;
- non-blocking typing suggestion remains.

### Focused static verification

Before commit, focused StudentCurriculumAssignment and relevant CourseOffering curriculum-binding tests reported:

- passed: `58`;
- failed: `0`.

Also passed:

- API typecheck;
- API build;
- focused lint;
- `git diff --check`.

Concurrency behavior covered by focused tests includes:

- same-target assignment unique race re-read;
- different-target assignment unique race conflict;
- malformed dependency-chain race re-read rejection;
- unrelated Prisma error propagation;
- exact assignment-specific `P2002` target matching;
- audit failure transaction rollback.

These focused tests do not constitute an ordinary live concurrent PostgreSQL race test.

### Server deployment

The Ubuntu runtime server was initially at:

`bf2f9e43044edefc174e949cf27b822fae5d8704`

The server was fast-forwarded to:

`88a34455639a239bee0e8d47500ee3c1a0e478ea`

Deployment verification confirmed:

- exactly fourteen implementation files in the commit;
- no schema change;
- no migration change;
- no frontend change;
- no environment change;
- no documentation change;
- API typecheck passed on the server;
- API build passed on the server;
- Prisma reported the database schema up to date.

Controlled PM2 restart:

- PID before: `29449`;
- PID after: `41413`;
- health restored on attempt `2`;
- direct API health: HTTP `200`;
- Nginx-proxied API health: HTTP `200`;
- API port `4000` remained loopback-only.

### Ordinary runtime pre-test inventory

Before HTTP mutation testing:

- ordinary database identity: `lexora_lms`;
- StudentCurriculumAssignment row count: `0`;
- StudentCurriculumAssignment success-audit count: `0`.

Canonical Law AcademicProgram:

- ID: `cmozwlcul000d2i0lgujx0pw5`;
- code: `LLB`;
- status: `ACTIVE`.

Canonical Law CurriculumVersion:

- ID: `cmsi9mwow000n2iiumxospbg6`;
- code: `LLB-HONS-2025-2026-V1`;
- status: `DRAFT`;
- archived: no.

Assignable canonical Law CurriculumVersion count for `APPROVED|ACTIVE` was:

`0`

The canonical curriculum was deliberately not promoted or mutated merely to enable this API runtime test.

Canonical runtime accounts were confirmed active:

- Department Admin;
- Teacher;
- Student.

The canonical Student had an active, non-revoked, non-expired department-scoped Student role.

### Isolated ordinary-runtime fixtures

Because the canonical Law CurriculumVersion remained `DRAFT`, the positive runtime test used explicitly named runtime-only fixtures rather than changing canonical curriculum lifecycle.

Runtime AcademicProgram:

- ID: `program_law_sca_runtime`;
- code: `SCA-RT`;
- department: `dept_law_test`;
- status during verification: `ACTIVE`.

Runtime lifecycle CurriculumVersions:

- `cv_law_sca_runtime_approved` — `APPROVED`;
- `cv_law_sca_runtime_active` — `ACTIVE`;
- `cv_law_sca_runtime_draft` — `DRAFT`;
- `cv_law_sca_runtime_retired` — `RETIRED`;
- `cv_law_sca_runtime_archived` — `ARCHIVED`.

The fixtures copied the required academic numeric snapshot fields from the canonical curriculum but use separate IDs, codes, programme identity and lifecycle state.

These records are test evidence only.

They are not canonical LL.B. curriculum records and must not be treated as operational academic configuration.

Before production readiness, runtime/test fixture visibility and segregation should receive a separate reviewed hygiene step. Historical assignment/audit evidence should not be deleted casually.

### Runtime authentication

Canonical Law runtime accounts were used.

Login results:

- Department Admin: HTTP `201`;
- Teacher: HTTP `201`;
- Student: HTTP `201`.

Passwords were entered through hidden terminal prompts.

Raw passwords were not printed.

Raw access/refresh tokens were not printed or documented.

Authentication material was held only in temporary runtime files/variables and removed automatically.

### Authorization and validation negative tests

Verified HTTP results:

- unauthenticated write: `401`;
- Teacher write: `403`;
- Student write: `403`;
- whitespace-only `curriculumVersionId`: `400`;
- same-department non-Student target: `404`;
- cross-department direct User ID: `404`;
- cross-department AcademicProgram ID: `404`;
- forged BUS `x-department-id` with BUS programme target: `404`;
- wrong-programme CurriculumVersion: `404`;
- `DRAFT` CurriculumVersion: `400`;
- `RETIRED` CurriculumVersion: `400`;
- `ARCHIVED` CurriculumVersion: `400`.

After all negative tests:

- StudentCurriculumAssignment rows for the runtime programme: `0`;
- StudentCurriculumAssignment success audits: `0`.

This verifies that denied/invalid cases did not accidentally create assignment records or success audits.

### Positive initial assignment

A Department Admin assigned the canonical Law runtime Student to:

`cv_law_sca_runtime_approved`

Result:

HTTP `200`

The response verified:

- correct Student identity;
- correct AcademicProgram identity;
- correct CurriculumVersion identity;
- CurriculumVersion status `APPROVED`;
- correct assigning Department Admin identity;
- compact response shape.

The response did not expose:

- password hash;
- access token;
- refresh token;
- internal Student relation;
- internal assigning-User relation;
- raw department relation data.

### Idempotence and principal-department authority

An exact same-target retry returned:

HTTP `200`

The retry preserved the original:

- assignment ID;
- assigning User ID;
- `assignedAt`;
- `createdAt`;
- CurriculumVersion ID.

No second success audit was created.

A same-target retry was also sent with a forged BUS department header.

Result:

HTTP `200`

The returned assignment fingerprint remained identical.

The forged `x-department-id` did not change the authenticated principal's real Law department scope.

### Immutable different-target conflict

A subsequent attempt to replace the stored `APPROVED` CurriculumVersion with the runtime `ACTIVE` CurriculumVersion returned:

HTTP `409`

The stored assignment remained unchanged.

No additional success audit was created.

No generic curriculum reassignment/update API exists.

### Persisted ordinary PostgreSQL assignment

Persisted assignment ID:

`cmslyv8k5000n2iydy4rtqziy`

Verified stored identity:

- department: `dept_law_test`;
- Student: canonical Law runtime Student;
- AcademicProgram: `program_law_sca_runtime`;
- CurriculumVersion: `cv_law_sca_runtime_approved`;
- assigning actor: canonical Law Department Admin.

Verified row count for the Student/runtime-programme identity:

`1`

`assigned_at` is present.

`created_at` is present.

The HTTP `409` different-target attempt did not change the stored CurriculumVersion.

### Success audit verification

Exactly one success audit exists for:

`course-management.student-curriculum-assignment.created`

Verified audit properties:

- department: `dept_law_test`;
- actor: canonical Law Department Admin;
- target type: `student_curriculum_assignment`;
- target ID: `cmslyv8k5000n2iydy4rtqziy`;
- outcome: `SUCCESS`.

The audit context SQL type is:

`jsonb`

The context is a JSON object.

Verified context identity:

- `studentCurriculumAssignmentId` = runtime assignment ID;
- `studentUserId` = canonical Law runtime Student;
- `academicProgramId` = runtime AcademicProgram;
- `curriculumVersionId` = runtime `APPROVED` CurriculumVersion.

Same-target retries did not create duplicate success audits.

The different-target conflict did not create a success audit.

### Canonical curriculum non-mutation

After all endpoint tests and PostgreSQL verification, the canonical Law CurriculumVersion remained:

- ID: `cmsi9mwow000n2iiumxospbg6`;
- code: `LLB-HONS-2025-2026-V1`;
- status: `DRAFT`;
- unarchived.

No StudentCurriculumAssignment was created against the canonical LL.B. AcademicProgram during this runtime test.

### Prisma/runtime non-disruption

Post-test Prisma database-to-datamodel comparison reported:

`No difference detected.`

Final runtime checks:

- API listener remained loopback-only;
- direct API health: HTTP `200`;
- Nginx-proxied API health: HTTP `200`;
- repository remained clean;
- local `main` and `origin/main` remained aligned.

### Verification-harness interruptions

Two verification-harness issues occurred and were resolved without product-code changes.

1. The first read-only inventory continuation used non-interactive `sudo` before refreshing the sudo authentication cache. It stopped safely before database inventory and was resumed after `sudo -v`.

2. The first post-HTTP audit-context query used chained JSON extraction and string concatenation with ambiguous PostgreSQL operator precedence. PostgreSQL rejected the verification query. The query was corrected using `concat_ws()`, and the persisted audit context then verified successfully.

Neither issue was a Lexora implementation defect.

Neither required a schema, migration or source-code correction.

### Immutability boundary

StudentCurriculumAssignment remains create-once through the reviewed application API.

No generic update, reassignment, delete or bulk-write API was added.

The database schema does not currently use a trigger that physically blocks every possible direct SQL `UPDATE`.

Therefore "immutable" at this checkpoint means enforced application/domain workflow plus reviewed unique/restrictive schema boundaries, not universal trigger-enforced database immutability.

Any future exceptional curriculum migration/reassignment must be a separate explicitly authorised and audited workflow.

### Remaining limitation: ordinary concurrency

An ordinary live concurrent PostgreSQL/HTTP race was not executed in this checkpoint.

Assignment-specific race handling is currently supported by focused automated evidence covering:

- exact unique-constraint recognition;
- same-target `P2002` re-read idempotence;
- different-target `P2002` re-read conflict;
- malformed tenant-chain re-read rejection;
- unrelated Prisma-error propagation.

Do not claim live ordinary concurrency verification until a real concurrent runtime test is performed.

### Accurate current status

> The initial Department-Admin-controlled StudentCurriculumAssignment API is implemented, independently security-reviewed, committed and pushed, deployed to the ordinary Lexora runtime, and ordinary HTTP/PostgreSQL runtime verified. Department isolation, active Student-role enforcement, exact AcademicProgram/CurriculumVersion scoping, APPROVED/ACTIVE lifecycle allowlisting, DRAFT/RETIRED/ARCHIVED rejection, create-once behavior, exact-target idempotence, different-target conflict, transactional success audit identity and compact response behavior have runtime evidence. The canonical LL.B. CurriculumVersion remains DRAFT and was not modified for testing. Live ordinary concurrency remains unverified and is supported only by focused automated race tests at this checkpoint.

### Explicitly pending

This checkpoint does not implement or verify:

- Enrollment to StudentCurriculumAssignment binding;
- Enrollment to exact CurriculumCourse binding;
- Enrollment department/programme/version/course consistency enforcement;
- old/new curriculum CourseOffering coexistence;
- focused replacement/review of the existing CourseOffering uniqueness constraint;
- irregular/failed/retake/improvement curriculum workflow;
- earlier-syllabus candidate handling;
- curriculum-aware eligible/available offering discovery;
- curriculum reassignment/migration workflow;
- database-trigger-level StudentCurriculumAssignment immutability;
- ordinary live concurrent assignment race;
- broader curriculum-management API/UI;
- Student curriculum-assignment UI;
- curriculum-aware result/transcript recalculation;
- production/test-data fixture segregation and hygiene.

### Next safe step

After this documentation checkpoint is committed and pushed, the next development work should begin with a focused source/runtime audit for **Enrollment curriculum binding**.

Do not immediately modify Enrollment.

First inspect:

- current Enrollment schema and service behavior;
- existing CourseOffering curriculum binding;
- StudentCurriculumAssignment identity;
- current duplicated Enrollment `academicTermId`;
- existing CourseOffering uniqueness;
- historical Enrollment delete behavior;
- irregular/failed/retake/improvement coexistence requirements.

The next implementation should remain additive and legacy-safe.

Enrollment integration must not weaken:

- department isolation;
- Student own-resource access;
- Teacher assigned-course boundaries;
- historical enrollment evidence;
- CourseOffering binding immutability;
- StudentCurriculumAssignment create-once semantics.

## Enrollment Curriculum Binding Schema Foundation Ordinary Runtime Verification — 2026-08-09

### Supersession and classification

This checkpoint supersedes earlier statements only to the extent that an Enrollment curriculum-binding **database/schema foundation** was still wholly pending.

It does **not** supersede statements that curriculum-aware Enrollment creation, dependency-chain enforcement, historical backfill, irregular/retake handling, multi-curriculum CourseOffering coexistence and broader curriculum-aware Enrollment behavior remain pending.

Current verified classification:

- Enrollment curriculum-binding schema foundation implemented;
- implementation independently diff-reviewed;
- focused schema/migration static verification passed;
- exact-current-data disposable PostgreSQL verification passed;
- implementation committed and pushed;
- Ubuntu server source fast-forwarded to the reviewed implementation commit;
- Prisma schema validation and Client generation passed on server;
- API typecheck passed on server;
- API build passed on server;
- focused Enrollment curriculum-binding schema test passed `5/5`;
- ordinary PostgreSQL migration deployed successfully;
- migration history verified complete with no rollback/incomplete record;
- live database-to-datamodel drift check passed;
- PM2 controlled restart passed;
- direct and Nginx API health returned HTTP `200`;
- API listener remained loopback-only;
- existing Enrollment and selected academic-evidence counts were preserved;
- no automatic Enrollment curriculum binding or historical backfill occurred.

### Implementation commit

Implementation commit:

`41614022de3376fffeade326d34438c2c3c1190c`

Commit message:

`Add enrollment curriculum binding foundation`

Implementation parent:

`bcdf9beaeb2c3d577d7aa9d9841fc853f8d5890f`

The reviewed implementation changed exactly:

- `.gitignore`;
- `apps/api/prisma/schema.prisma`;
- `apps/api/prisma/enrollment-curriculum-binding-foundation.schema.test.ts`;
- `apps/api/prisma/migrations/202608090002_add_enrollment_curriculum_binding_foundation/migration.sql`.

No Enrollment controller, DTO, service, repository, frontend, environment or documentation behavior was changed by the implementation commit.

### Schema foundation

Enrollment now has nullable mapped scalar fields:

- `studentCurriculumAssignmentId` → `student_curriculum_assignment_id`;
- `curriculumCourseId` → `curriculum_course_id`.

Enrollment does not store a direct `curriculumVersionId`.

Nullable relations were added to:

- `StudentCurriculumAssignment`;
- `CurriculumCourse`.

Both new foreign keys use:

- `ON DELETE RESTRICT`;
- `ON UPDATE CASCADE`.

Reverse Enrollment relations exist on:

- `StudentCurriculumAssignment`;
- `CurriculumCourse`.

Mapped department-scoped indexes:

- `enrollment_dept_student_curriculum_idx`;
- `enrollment_dept_curriculum_course_idx`.

Existing Enrollment uniqueness on:

`courseOfferingId + studentUserId`

was preserved.

### Pair-completeness invariant

Migration CHECK constraint:

`enrollment_curriculum_pair_ck`

Database invariant:

`student_curriculum_assignment_id` and `curriculum_course_id` must be either:

- both `NULL`; or
- both non-`NULL`.

A row with only one member of the curriculum pair populated is rejected.

This CHECK is deliberately only a row-local structural completeness invariant.

It does not and cannot by itself prove:

- Enrollment department equals StudentCurriculumAssignment department;
- Enrollment student equals StudentCurriculumAssignment student;
- StudentCurriculumAssignment programme matches the relevant CurriculumVersion programme;
- CurriculumCourse version equals StudentCurriculumAssignment version;
- CurriculumCourse course equals CourseOffering course;
- CourseOffering's bound CurriculumCourse is the exact Enrollment CurriculumCourse.

Those dependency-chain checks remain a later server-side transactional repository/service responsibility.

### Migration

Migration:

`202608090002_add_enrollment_curriculum_binding_foundation`

Migration behavior:

- added two nullable Enrollment columns;
- added pair-completeness CHECK;
- added two department-scoped indexes;
- added two restrictive curriculum foreign keys;
- performed no historical data UPDATE;
- performed no Enrollment backfill;
- performed no DELETE;
- performed no CourseOffering uniqueness change;
- performed no existing Enrollment → CourseOffering FK change;
- performed no downstream academic-evidence FK change.

### Independent diff review

Actual schema and migration diff was independently inspected before commit.

Review findings:

- Critical: `0`;
- High: `0`;
- Medium: `0`;
- Low: `0`.

The implementation boundary was confirmed additive and legacy-safe.

`.gitignore` changed only to whitelist the new migration directory and migration SQL.

### Focused static verification

Server-side focused schema test result:

- tests: `5`;
- passed: `5`;
- failed: `0`;
- skipped: `0`.

Verified test coverage includes:

- nullable mapped curriculum identity fields;
- restrictive Prisma relations;
- reverse relations;
- absence of a direct Enrollment `curriculumVersionId`;
- exact mapped department-scoped indexes;
- preservation of Enrollment offering/student uniqueness;
- preservation of current Enrollment → CourseOffering `onDelete: Cascade`;
- preservation of current CourseOffering uniqueness;
- nullable migration columns;
- exactly two new restrictive curriculum FKs;
- pair-completeness CHECK;
- absence of backfill/destructive SQL;
- absence of CourseOffering mutation in this migration.

Also passed:

- Prisma format before commit;
- Prisma validate;
- Prisma Client generation;
- API typecheck;
- API build;
- `git diff --check`.

### Exact-current-data disposable PostgreSQL verification

Before ordinary deployment, the reviewed migration was tested against an exact-current-data disposable PostgreSQL copy.

Verification environment:

- PostgreSQL source/client/target major version: `18`;
- disposable target: PostgreSQL `18.4`;
- host exposure: loopback-only;
- persistent disposable volume: none;
- raw database credentials were not printed.

The disposable copy was restored from an ordinary-runtime snapshot.

Verified behavior:

- migration applied successfully;
- existing Enrollment rows remained `10`;
- both new columns were nullable;
- automatic/backfilled curriculum bindings remained `0`;
- both-present curriculum pair was accepted;
- partial curriculum pair was rejected;
- failed partial write persisted no data;
- both restrictive parent FKs were catalog-verified;
- deletion of a referenced StudentCurriculumAssignment was rejected;
- deletion of a referenced CurriculumCourse was rejected;
- both new indexes existed with exact mapped names;
- existing Enrollment → CourseOffering CASCADE remained unchanged;
- current CourseOffering uniqueness remained unchanged;
- existing Enrollment offering/student uniqueness remained unchanged;
- Prisma reported no database-to-datamodel difference;
- second raw application failed safely;
- ordinary database remained untouched by disposable verification.

Two earlier disposable-harness attempts did not constitute migration failures:

1. PostgreSQL 16 `pg_restore` could not read a PostgreSQL 18 custom dump archive;
2. one dump attempt asked the `postgres` OS user to open a `sh002`-owned `0600` output file.

Both issues were verification-harness/environment issues and were corrected before the successful PostgreSQL 18.4 disposable verification.

### Ordinary deployment

Server source before deployment:

`bcdf9beaeb2c3d577d7aa9d9841fc853f8d5890f`

Server source after fast-forward:

`41614022de3376fffeade326d34438c2c3c1190c`

The server working tree remained clean and local `main` remained aligned with `origin/main`.

Before ordinary migration:

- target Enrollment columns: absent;
- pair CHECK: absent;
- target indexes: absent;
- target migration record: absent;
- Prisma correctly reported the migration as pending.

Ordinary database:

`lexora_lms`

The migration was applied using Prisma migrate deploy.

After migration:

- Prisma reported `6` migrations;
- database schema reported up to date;
- completed target migration records: `1`;
- rolled-back target migration records: `0`;
- incomplete target migration records: `0`.

### Validated private pre-migration backup

Retained backup:

`/home/sh002/lexora-private-backups/lexora_lms-before-202608090002_add_enrollment_curriculum_binding_foundation-20260809T172108Z.dump`

SHA-256:

`d8e671b9199766368e26d388d31d999cdfb54301d582ea1fa34c9143cfbeb3d2`

Verification:

- archive listing passed;
- file permission: `0600`;
- backup directory permission: `0700`;
- raw database credentials were not printed.

### Ordinary database preservation evidence

Selected row counts before and after migration were identical:

- `assignment_submissions`: `1`;
- `attendance_records`: `1`;
- `course_offerings`: `9`;
- `curriculum_courses`: `58`;
- `enrollments`: `10`;
- `quiz_attempts`: `1`;
- `result_records`: `1`;
- `student_curriculum_assignments`: `1`;
- `transcript_records`: `1`.

Automatic/backfilled Enrollment curriculum bindings after migration:

`0`

This is intentional.

Existing historical/runtime Enrollment rows remain legacy-safe and unbound until a later controlled workflow establishes authoritative curriculum identity.

### Preserved existing academic boundaries

This checkpoint intentionally did not change:

- current Enrollment → CourseOffering `ON DELETE CASCADE`;
- current CourseOffering uniqueness on department + academic term + base Course + section;
- current Enrollment uniqueness on CourseOffering + Student;
- StudentCurriculumAssignment create-once semantics;
- CourseOffering curriculum-binding immutability;
- Student own-resource Enrollment access model;
- Teacher assigned-course boundaries;
- department isolation;
- AuthGuard/PolicyGuard/policy requirements;
- result/transcript immutability rules.

The existing Enrollment → CourseOffering CASCADE remains a separately identified academic-history hardening gap.

The current CourseOffering uniqueness also remains a separate blocker for future old/new curriculum coexistence.

### PM2 and runtime health

Controlled PM2 restart:

- PID before: `41413`;
- PID after: `77542`.

One immediate health probe during restart received a temporary connection-refused response while the process was restarting.

The retry loop subsequently verified:

- direct API health: HTTP `200`;
- Nginx-proxied API health: HTTP `200`;
- API listener on port `4000`: loopback-only.

The temporary restart-window connection refusal is not classified as an application/runtime failure.

### StudentCurriculumAssignment runtime-evidence clarification

The earlier StudentCurriculumAssignment API checkpoint has positive ordinary-runtime evidence for a fresh `APPROVED` initial assignment.

A fresh `ACTIVE` initial assignment was not separately executed as a positive ordinary-runtime creation case.

`ACTIVE` was exercised live as the different-target immutable-conflict target, while initial `ACTIVE` acceptance remains supported by focused automated tests.

This clarification does not reopen or invalidate the previously verified StudentCurriculumAssignment implementation.

### Current boundary

This checkpoint establishes durable nullable Enrollment columns capable of storing:

- the authoritative StudentCurriculumAssignment identity;
- the exact CurriculumCourse identity.

It does **not** implement curriculum-aware Enrollment creation or mutation.

No existing Enrollment was backfilled.

No API accepts these curriculum IDs from the client as enrollment authority.

The later service/repository implementation must derive and persist them server-side from authoritative scoped relationships.

### Explicitly pending

The following remain pending:

- curriculum-aware Enrollment create/service/repository enforcement;
- Enrollment department/programme/version/course dependency-chain enforcement;
- authoritative server-side derivation of StudentCurriculumAssignment and CurriculumCourse during Enrollment creation;
- controlled historical Enrollment backfill;
- valid canonical StudentCurriculumAssignment before canonical backfill;
- binding remaining canonical CourseOfferings where appropriate;
- old/new curriculum CourseOffering coexistence;
- focused redesign/replacement of current CourseOffering uniqueness;
- Enrollment → CourseOffering historical delete hardening;
- irregular/failed/retake/improvement curriculum workflow;
- earlier-syllabus candidate handling;
- curriculum-aware eligible/available offering discovery;
- exceptional curriculum reassignment/migration workflow;
- database-trigger-level StudentCurriculumAssignment immutability;
- ordinary live concurrent StudentCurriculumAssignment first-write race;
- broader curriculum-management API/UI;
- Student curriculum-assignment UI;
- curriculum-aware result/transcript integration;
- production/test-data fixture segregation and hygiene.

### Next safe step

Do not backfill existing Enrollment rows yet.

Do not promote the canonical LL.B. CurriculumVersion merely to enable testing.

Do not expose `studentCurriculumAssignmentId` or `curriculumCourseId` as client-controlled Enrollment authority.

The next implementation checkpoint should remain focused on curriculum-aware Enrollment create/service/repository enforcement.

Before coding that behavior, define and test the exact authoritative dependency chain:

1. authenticated principal department remains authoritative;
2. CourseOffering belongs to the principal department;
3. Enrollment academic term matches the CourseOffering academic term;
4. target Student belongs to the principal department and has an active scoped Student role where required;
5. authoritative StudentCurriculumAssignment belongs to the same department and Student;
6. CurriculumCourse belongs to the same department;
7. CurriculumCourse CurriculumVersion equals StudentCurriculumAssignment CurriculumVersion;
8. CurriculumCourse base Course equals CourseOffering base Course;
9. CourseOffering is bound to that exact CurriculumCourse for curriculum-aware enrollment;
10. persisted Enrollment stores both curriculum IDs atomically;
11. retries/duplicates cannot create contradictory curriculum identity;
12. cross-department/direct-object failures remain safe-not-found where appropriate.

Legacy unbound Enrollment rows must remain readable and historically valid.

CourseOffering uniqueness redesign and Enrollment → CourseOffering CASCADE hardening should remain separate focused checkpoints unless a later source/runtime review demonstrates a compelling atomic dependency.

## Curriculum-Aware Enrollment Creation Ordinary Runtime Verification — 2026-08-10

### Supersession and classification

This checkpoint supersedes earlier statements only to the extent that curriculum-aware Enrollment creation, server-side curriculum identity derivation, Enrollment dependency-chain enforcement and ordinary live Enrollment first-write concurrency were still pending.

It does **not** supersede pending work for:

- controlled historical Enrollment curriculum backfill;
- canonical StudentCurriculumAssignment establishment;
- remaining canonical CourseOffering bindings;
- old/new curriculum CourseOffering coexistence;
- CourseOffering uniqueness redesign;
- Enrollment → CourseOffering historical delete hardening;
- irregular/failed/retake/improvement handling;
- earlier-syllabus candidate handling;
- curriculum-aware eligible/available offering discovery;
- exceptional StudentCurriculumAssignment reassignment/migration;
- database-trigger-level StudentCurriculumAssignment immutability;
- ordinary live concurrent StudentCurriculumAssignment first-write verification;
- broader curriculum-management API/UI;
- Student curriculum-assignment UI;
- curriculum-aware result/transcript integration;
- production/runtime-test fixture segregation and hygiene.

Current verified classification:

- curriculum-aware Enrollment creation implemented;
- implementation independently security/diff reviewed;
- implementation committed and pushed;
- Ubuntu runtime deployed to the reviewed implementation commit;
- API typecheck passed;
- API build passed;
- ordinary PostgreSQL 18.4 runtime verification passed;
- Department Admin positive Enrollment creation passed;
- server-authoritative StudentCurriculumAssignment derivation passed;
- server-authoritative CurriculumCourse derivation passed;
- exact curriculum pair persistence passed;
- unauthenticated create rejection passed;
- Teacher create rejection passed;
- Student create rejection passed;
- unbound CourseOffering rejection passed;
- StudentCurriculumAssignment/CurriculumVersion mismatch rejection passed;
- missing StudentCurriculumAssignment rejection passed;
- academic-term mismatch rejection passed;
- cross-department direct CourseOffering protection passed;
- nonexistent/cross-department CourseOffering response equivalence passed;
- hostile client curriculum-ID submission was rejected safely;
- duplicate Enrollment rejection passed;
- authenticated-principal department remained authoritative despite forged `x-department-id`;
- Student own-resource Enrollment read remained available;
- Student broad Enrollment direct read remained denied;
- real concurrent ordinary first-write produced exactly one Enrollment;
- concurrent loser mapped cleanly to duplicate HTTP `409`;
- failed dependency requests persisted no Enrollment rows;
- failed dependency requests produced no success Enrollment audit;
- successful Enrollment audit metadata contained the authoritative curriculum identifiers;
- historical null/null Enrollment rows remained intact;
- canonical LL.B. CurriculumVersion remained DRAFT;
- direct and Nginx API health remained HTTP `200`;
- runtime repository remained clean and aligned with `origin/main`.

### Implementation commit

Implementation commit:

`4f6861495dd9cc37bbabb0568a2a14784db2c815`

Commit message:

`Add curriculum-aware enrollment creation`

Implementation parent:

`764e311954e8c7bed64635c8d8b088018b6b51d3`

The reviewed implementation changed exactly:

- `apps/api/src/modules/academic/application/ports/academic.repository.port.ts`;
- `apps/api/src/modules/academic/application/services/academic.service.ts`;
- `apps/api/src/modules/academic/application/services/academic.service.test.ts`;
- `apps/api/src/modules/academic/infrastructure/repositories/prisma-academic.repository.ts`;
- `apps/api/src/modules/academic/infrastructure/repositories/prisma-academic.repository.test.ts`.

No Enrollment DTO, controller, Prisma schema, migration, frontend, environment or deployment configuration was changed by this implementation.

### Authoritative Enrollment creation chain

For new curriculum-aware Enrollment creation, the reviewed runtime behavior now enforces the authoritative server-side dependency chain:

1. authenticated principal department remains authoritative;
2. CourseOffering must resolve inside that department;
3. Enrollment `academicTermId` must match the CourseOffering academic term;
4. target Student must be an ACTIVE, non-archived, non-deleted User in the same active Department;
5. target Student must hold an active, non-revoked, non-expired same-department `student` role;
6. CourseOffering must be bound to an exact CurriculumCourse;
7. CourseOffering's actual Course relation must remain in the authoritative department;
8. CurriculumCourse must remain in the authoritative department;
9. CurriculumCourse actual Course identity must match the CourseOffering Course;
10. CurriculumVersion is resolved from the exact CurriculumCourse;
11. CurriculumVersion must remain in the authoritative department;
12. AcademicProgram is derived from the validated CurriculumVersion relation;
13. StudentCurriculumAssignment is resolved server-side from department + Student + validated AcademicProgram;
14. StudentCurriculumAssignment CurriculumVersion must equal the exact CurriculumCourse CurriculumVersion;
15. Enrollment stores both `studentCurriculumAssignmentId` and `curriculumCourseId` in the same Serializable repository transaction;
16. client-supplied curriculum identity cannot become Enrollment authority.

The Enrollment API still does not expose client-controlled curriculum identity fields as accepted authoritative input.

### Independent implementation review

The first implementation diff review identified two blocking High findings:

1. active department-scoped Student-role validation had been weakened;
2. Course/CurriculumVersion/AcademicProgram relational dependency validation was not deep enough for malformed tenant-linked state.

Both findings were corrected before commit.

Final independent review findings:

- Critical: `0`;
- High: `0`;
- Medium: `0`;
- Low: `0`;
- Suggestion: `1`.

The remaining suggestion was to exercise real PostgreSQL concurrent first-write behavior.

That concurrency case was subsequently executed successfully in this ordinary runtime checkpoint.

### Static verification

Before commit and again before deployment:

- focused Academic service tests passed;
- focused Prisma Academic repository tests passed;
- API typecheck passed;
- API build passed;
- `git diff --check` passed.

Final corrected repository-focused test result:

- tests: `44`;
- passed: `44`;
- failed: `0`.

Service test result:

- tests: `16`;
- passed: `16`;
- failed: `0`.

### Deployment evidence

Server source before fast-forward:

`764e311954e8c7bed64635c8d8b088018b6b51d3`

Server source after fast-forward:

`4f6861495dd9cc37bbabb0568a2a14784db2c815`

Controlled PM2 restart:

- PID before: `1880`;
- PID after: `8129`.

Post-restart verification:

- direct API health: HTTP `200`;
- Nginx API health: HTTP `200`;
- API listener remained loopback-only on port `4000`;
- repository remained clean;
- local/origin alignment remained `0 0`.

Ordinary database:

- database: `lexora_lms`;
- PostgreSQL: `18.4`.

### Canonical curriculum non-mutation

Canonical LL.B. CurriculumVersion:

`cmsi9mwow000n2iiumxospbg6`

Code:

`LLB-HONS-2025-2026-V1`

Status remained:

`DRAFT`

The canonical CurriculumVersion was not promoted or otherwise modified to enable Enrollment testing.

The runtime Enrollment checkpoint deliberately used isolated runtime-only curriculum data instead.

### Runtime StudentCurriculumAssignment dependency

Existing runtime StudentCurriculumAssignment reused:

`cmslyv8k5000n2iydy4rtqziy`

Department:

`dept_law_test`

Student:

`cmpmmnn00000f2imt3sqhgto9`

AcademicProgram:

`program_law_sca_runtime`

CurriculumVersion:

`cv_law_sca_runtime_approved`

This StudentCurriculumAssignment is a runtime-only verification fixture.

It is not the canonical LL.B. StudentCurriculumAssignment.

### Runtime-only Enrollment fixture boundary

The ordinary database initially had no CurriculumCourse under the existing SCA runtime programme.

Therefore canonical curriculum data was not repurposed.

Dedicated runtime-only fixtures were created for this verification.

Runtime AssessmentTemplate:

`assessment_template_law_enrollment_runtime_v1`

Runtime Courses:

- `course_law_enrollment_runtime_001`;
- `course_law_enrollment_nosca_runtime_002`.

Additional no-SCA runtime AcademicProgram:

`program_law_enrollment_nosca_runtime`

Additional no-SCA runtime CurriculumVersion:

`cv_law_enrollment_nosca_approved`

Runtime CurriculumCourses:

- `curriculum_course_law_enrollment_runtime_approved`;
- `curriculum_course_law_enrollment_runtime_active`;
- `curriculum_course_law_enrollment_nosca_approved`.

Runtime CourseOfferings:

- `offering_law_enrollment_runtime_positive`;
- `offering_law_enrollment_runtime_race`;
- `offering_law_enrollment_runtime_unbound`;
- `offering_law_enrollment_runtime_version_mismatch`;
- `offering_law_enrollment_runtime_nosca`.

These are explicitly runtime-test fixtures and must not be treated as canonical academic data.

They remain subject to the separately tracked production/runtime-test fixture segregation and hygiene work.

### Verification-harness interruption

The first runtime verification command successfully committed the isolated runtime fixture transaction and then stopped before any Enrollment API test.

Cause:

- the login-body helper attempted to pipe credentials into `python3 -` while simultaneously supplying the Python program through a heredoc;
- the heredoc occupied Python standard input;
- the piped login data was therefore unavailable;
- the helper exited with an `IndexError`.

This was a test-harness defect, not a Lexora application defect.

Before resuming, the continuation verified:

- all intended runtime fixtures existed;
- no runtime Enrollment had yet been created;
- total Enrollment count remained `10`;
- historical null/null Enrollment count remained `10`;
- canonical LL.B. remained DRAFT;
- repository remained clean and aligned.

The helper was corrected to use `python3 -c` so piped input remained available.

No product-code correction was required.

### Runtime authentication and authorization

Fresh runtime login succeeded for:

- Law Department Admin: HTTP `201`;
- Law Teacher: HTTP `201`;
- Law Student: HTTP `201`.

Raw passwords and access tokens were not printed or documented.

Enrollment create authorization:

- unauthenticated request: HTTP `401`;
- Teacher request: HTTP `403`;
- Student request: HTTP `403`;
- Department Admin: allowed subject to scoped dependency validation.

### Dependency-negative runtime verification

The following requests were rejected with HTTP `400`:

- unbound CourseOffering;
- StudentCurriculumAssignment/CurriculumVersion mismatch;
- missing StudentCurriculumAssignment;
- academic-term mismatch;
- cross-department CourseOffering direct-object attempt;
- nonexistent CourseOffering direct-object attempt.

The cross-department CourseOffering request and nonexistent CourseOffering request returned the same response message.

No object-existence oracle was observed for that tested path.

Failed dependency requests produced:

- Enrollment rows: `0`;
- success Enrollment audits: `0`.

### Hostile client curriculum identity

A Department Admin request attempted to supply hostile extra curriculum identity fields:

- fake StudentCurriculumAssignment ID;
- fake CurriculumCourse ID.

The external API rejected the request safely with HTTP `400`.

A normal request without those untrusted fields then succeeded.

No hostile curriculum identity was persisted.

### Positive Enrollment runtime result

Positive Enrollment ID:

`cmsnbenop000n2i9tjzk2cm0x`

Verified persisted identity:

- department: `dept_law_test`;
- Student: `cmpmmnn00000f2imt3sqhgto9`;
- CourseOffering: `offering_law_enrollment_runtime_positive`;
- StudentCurriculumAssignment: `cmslyv8k5000n2iydy4rtqziy`;
- CurriculumCourse: `curriculum_course_law_enrollment_runtime_approved`;
- status: `APPROVED`;
- source type: `ADMIN`;
- approving actor: canonical Law runtime Department Admin;
- `enrolled_at`: populated.

The authoritative curriculum pair was persisted by the server.

### Duplicate and department-header runtime verification

A duplicate create request for the same Student and CourseOffering returned:

HTTP `409`

A duplicate request with a forged foreign `x-department-id` also returned:

HTTP `409`

Database cardinality remained exactly one Enrollment for that Student/CourseOffering.

The forged header did not override the authenticated principal's department.

### Student own-resource regression verification

For the newly created positive Enrollment:

- Student `GET /api/v1/enrollments/me/:id`: HTTP `200`;
- Student broad `GET /api/v1/enrollments/:id`: HTTP `403`.

The existing Student own-resource access model remained preserved.

No broad Enrollment read permission was added to Student.

### Real ordinary concurrent first-write verification

Two simultaneous Department Admin Enrollment create requests targeted:

`offering_law_enrollment_runtime_race`

Observed HTTP outcomes:

- one request: `201`;
- one request: `409`.

Exactly one Enrollment row was persisted.

Concurrent winner Enrollment ID:

`cmsnbeo00000t2i9t4dtwwvnw`

Persisted authoritative curriculum identity:

- StudentCurriculumAssignment: `cmslyv8k5000n2iydy4rtqziy`;
- CurriculumCourse: `curriculum_course_law_enrollment_runtime_approved`.

Concurrency verdict:

`LOSER_MAPPED_TO_DUPLICATE_409`

Therefore ordinary PostgreSQL/API concurrent first-write behavior is runtime verified for curriculum-aware Enrollment creation.

No Serializable loser surfaced as an HTTP `500` in this tested race.

This result does not imply that every possible PostgreSQL serialization/deadlock scenario has been exhaustively tested.

### Audit runtime verification

Exactly two success Enrollment audits were verified for the two successful runtime-created Enrollments.

Both success audits contained:

- correct Department Admin actor identity;
- correct Student identity;
- authoritative StudentCurriculumAssignment ID;
- authoritative CurriculumCourse ID.

Failed dependency requests did not create success Enrollment audits.

Audit creation remains outside the repository transaction according to the existing service convention.

This checkpoint verifies observed successful audit creation and absence of success audits for the tested rejected paths.

It does not redefine the audit transaction boundary.

### Historical Enrollment compatibility

Enrollment count before curriculum-aware runtime creation:

`10`

All `10` pre-existing Enrollment rows had:

- `student_curriculum_assignment_id = NULL`;
- `curriculum_course_id = NULL`.

After successful runtime testing:

- new bound runtime Enrollments: `2`;
- total Enrollment rows: `12`;
- historical null/null Enrollment rows: `10`;
- invalid partial curriculum pairs: `0`.

A deterministic fingerprint of the historical null/null Enrollment set remained unchanged.

Therefore the two new curriculum-aware Enrollments did not mutate or backfill the pre-existing historical Enrollment rows.

### Accurate current status

> Curriculum-aware Enrollment creation is implemented, independently security-reviewed, committed and pushed, deployed to the ordinary Lexora runtime, and ordinary HTTP/PostgreSQL runtime verified. New Enrollment creation derives curriculum identity server-side through the scoped CourseOffering → CurriculumCourse → CurriculumVersion → AcademicProgram → StudentCurriculumAssignment chain and persists the exact StudentCurriculumAssignment/CurriculumCourse pair atomically within the Serializable repository transaction. Department isolation, active scoped Student-role enforcement, hostile curriculum-ID rejection, unbound/mismatch/missing-SCA/term rejection, duplicate handling, forged department-header resistance, Student own-resource preservation, audit identity, historical null/null Enrollment compatibility and a real concurrent first-write `201 + 409` outcome all have ordinary runtime evidence. The canonical LL.B. CurriculumVersion remains DRAFT and was not modified for testing.

### Remaining limitations and pending work

This checkpoint does **not** complete:

- controlled historical Enrollment backfill;
- canonical LL.B. StudentCurriculumAssignment creation;
- remaining canonical CourseOffering curriculum bindings;
- old/new curriculum CourseOffering coexistence;
- redesign/replacement of current CourseOffering uniqueness;
- Enrollment → CourseOffering historical delete hardening;
- irregular/failed/retake/improvement curriculum workflow;
- earlier-syllabus candidate handling;
- curriculum-aware eligible/available offering discovery;
- exceptional StudentCurriculumAssignment reassignment/migration;
- database-trigger-level StudentCurriculumAssignment immutability;
- ordinary live concurrent StudentCurriculumAssignment first-write verification;
- broader curriculum-management API/UI;
- Student curriculum-assignment UI;
- curriculum-aware result/transcript integration;
- runtime/test-data fixture segregation and hygiene;
- broader security/production hardening tracked elsewhere.

The current CourseOffering uniqueness remains:

`department + academicTerm + base Course + section`

The current Enrollment → CourseOffering foreign key remains:

`ON DELETE CASCADE`

Both remain separate structural follow-up tasks.

Do not perform historical Enrollment backfill until authoritative canonical StudentCurriculumAssignment and curriculum-version eligibility are established.

Do not promote the canonical LL.B. CurriculumVersion merely to make backfill possible.

### Next safe step

After this runtime evidence is documented and committed, reassess the remaining curriculum work from the latest source files.

Do not automatically choose historical backfill next.

The next focused task should be selected based on current academic priority while preserving separate boundaries for:

- CourseOffering multi-curriculum coexistence;
- Enrollment historical delete protection;
- canonical curriculum assignment/backfill;
- irregular/retake/improvement workflows;
- available-offering discovery;
- result/transcript curriculum integration.

## Enrollment to CourseOffering Historical Delete Hardening Runtime Verification — 2026-08-10

### Supersession and classification

This checkpoint supersedes earlier statements only to the extent that the
`Enrollment → CourseOffering` historical delete-hardening task remained pending.

The previous database relationship allowed:

`CourseOffering → Enrollment`

with:

`ON DELETE CASCADE`

That behavior created an academic-history deletion risk because an Enrollment can itself have downstream academic evidence such as attendance, assignment submissions, quiz attempts and result records.

This checkpoint changes only the parent CourseOffering → Enrollment boundary.

Current verified classification:

- implementation completed;
- independent source/diff review passed;
- implementation committed and pushed;
- focused schema/migration tests passed;
- Prisma format/validate/generate passed;
- API typecheck passed;
- API build passed;
- exact-current-data PostgreSQL 18.4 disposable verification passed;
- ordinary PostgreSQL 18.4 deployment passed;
- migration history verified;
- live PostgreSQL foreign-key behavior verified;
- referenced CourseOffering deletion is now blocked by the Enrollment FK;
- unreferenced CourseOffering delete control passed transactionally;
- selected academic/business data counts remained unchanged;
- Enrollment dataset fingerprint remained unchanged;
- Prisma database-to-datamodel drift check reported no difference;
- repeated Prisma migration deployment is a safe no-op;
- PM2 restart was not required;
- direct and Nginx API health remained HTTP `200`;
- repository remained clean and aligned after deployment.

### Implementation commit

Implementation commit:

`11311ab462d80b5f36341d1824f21fda5c1ac6a1`

Commit message:

`Harden enrollment course offering deletion`

Implementation baseline:

`7b5735980bc2e1cdd50f7deb41b91db864cb21c9`

Migration:

`202608100001_harden_enrollment_course_offering_delete`

### Exact implementation boundary

The reviewed implementation changed exactly five files:

- `.gitignore`;
- `apps/api/prisma/schema.prisma`;
- `apps/api/prisma/enrollment-curriculum-binding-foundation.schema.test.ts`;
- `apps/api/prisma/enrollment-course-offering-delete-hardening.schema.test.ts`;
- `apps/api/prisma/migrations/202608100001_harden_enrollment_course_offering_delete/migration.sql`.

No controller, service, repository, DTO, policy, authorization, frontend, environment, PM2, Nginx or application-runtime source was changed.

### Prisma relation hardening

Previous current-schema relation:

`Enrollment.courseOffering → CourseOffering`

Delete behavior:

`Cascade`

New current-schema relation:

`Enrollment.courseOffering → CourseOffering`

Delete behavior:

`Restrict`

`courseOfferingId` remains required.

Existing Enrollment uniqueness remains:

`courseOfferingId + studentUserId`

Existing CourseOffering uniqueness remains:

`department + academicTerm + course + section`

No curriculum identity column or curriculum relation was changed.

### Migration behavior

The migration performs only two DDL operations:

1. drops `enrollments_course_offering_id_fkey`;
2. recreates the same foreign key from
   `enrollments.course_offering_id`
   to
   `course_offerings.id`.

New referential behavior:

- `ON DELETE RESTRICT`;
- `ON UPDATE CASCADE`.

The migration does not:

- update data;
- delete data;
- add or drop Enrollment columns;
- create or drop tables;
- create or drop indexes;
- alter Enrollment uniqueness;
- alter CourseOffering uniqueness;
- alter StudentCurriculumAssignment relations;
- alter CurriculumCourse relations.

### Historical migration preservation

Historical migration:

`202608090002_add_enrollment_curriculum_binding_foundation/migration.sql`

remained unchanged.

Verified SHA-256 during implementation review:

`A991D2679E732F2868EBF61FB4CFF8E7FB6CF402BDE10B21ED8DCEB475C26B32`

The new hardening migration was added separately rather than rewriting historical migration evidence.

### Independent review

Final independent review:

- Critical: `0`;
- High: `0`;
- Medium: `0`;
- Low: `0`;
- Suggestion: `1`.

The suggestion was to verify the migration against an exact-current ordinary database snapshot on PostgreSQL 18.4 before applying it to the ordinary database.

That verification was subsequently completed successfully.

### Focused static verification

New focused schema/migration test:

`apps/api/prisma/enrollment-course-offering-delete-hardening.schema.test.ts`

Result:

- tests: `3`;
- passed: `3`;
- failed: `0`.

Existing Enrollment curriculum-binding foundation test:

`apps/api/prisma/enrollment-curriculum-binding-foundation.schema.test.ts`

Result:

- tests: `5`;
- passed: `5`;
- failed: `0`.

Verified static checks also included:

- Prisma format: passed;
- Prisma validate: passed;
- Prisma generate: passed;
- API typecheck: passed;
- API build: passed;
- `git diff --check`: passed.

### Disposable exact-current PostgreSQL 18.4 verification

Before ordinary deployment, a private exact-current snapshot of the ordinary
`lexora_lms` database was restored into a loopback-only disposable PostgreSQL 18.4 container.

Verified baseline:

- restored business/evidence counts matched the ordinary database;
- Enrollment fingerprint matched the ordinary database;
- original Enrollment → CourseOffering FK used `ON DELETE CASCADE / ON UPDATE CASCADE`.

The pre-hardening destructive behavior was reproduced transactionally:

- deleting the isolated referenced CourseOffering removed its Enrollment inside the test transaction;
- the transaction was rolled back;
- no test data persisted.

The reviewed migration was then applied to the disposable database.

Verified result:

- migration completed exactly once;
- rolled-back migration records: `0`;
- incomplete migration records: `0`;
- FK name remained `enrollments_course_offering_id_fkey`;
- delete behavior became `RESTRICT`;
- update behavior remained `CASCADE`;
- no old Enrollment → CourseOffering DELETE CASCADE FK remained.

After hardening:

- referenced CourseOffering deletion was blocked;
- referenced CourseOffering remained;
- referenced Enrollment remained;
- a fully unreferenced CourseOffering could still be deleted inside a rollback-only control transaction;
- selected business/evidence counts were unchanged;
- Enrollment fingerprint was unchanged;
- Prisma drift check reported no difference;
- a second migration deployment was a safe no-op;
- ordinary database was not changed by disposable verification.

### Disposable verification harness interruption

The first disposable verification attempt stopped during the pre-hardening delete probe.

Cause:

- a `psql` variable reference was placed inside a PostgreSQL dollar-quoted `DO` block;
- `psql` variable substitution does not occur inside that dollar-quoted server-side block;
- PostgreSQL therefore received a literal `:` token and returned a syntax error.

This was a verification-harness defect, not a Lexora schema or migration defect.

The corrected verification used SQL result queries outside a dollar-quoted `DO` block and Bash assertions.

No product-code correction was required.

### Ordinary deployment preconditions

Immediately before ordinary deployment:

- server source was still at the pre-implementation documentation baseline;
- repository was clean;
- direct API health returned HTTP `200`;
- Nginx API health returned HTTP `200`;
- PM2 process `lexora-api` remained online;
- ordinary database was explicitly confirmed as `lexora_lms`;
- PostgreSQL version was `18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)`;
- current Enrollment → CourseOffering FK was still `CASCADE/CASCADE`;
- target migration was absent from `_prisma_migrations`;
- referenced runtime Enrollment fixture was present.

A private pre-migration custom-format PostgreSQL dump was created with mode `0600` and validated with `pg_restore --list`.

### Server source deployment

Server source was fast-forwarded from:

`7b5735980bc2e1cdd50f7deb41b91db864cb21c9`

to:

`11311ab462d80b5f36341d1824f21fda5c1ac6a1`

The server-side reviewed five-file implementation boundary matched the independently reviewed commit.

Server static verification passed after fast-forward:

- Prisma format;
- Prisma validate;
- Prisma generate;
- API typecheck;
- API build.

No PM2 restart was required because this checkpoint changed Prisma schema/migration/test metadata only and did not change running application JavaScript behavior.

### Ordinary deployment harness interruption

The first ordinary deployment command stopped before migration application while verifying that exactly one migration was pending.

Prisma itself correctly reported only:

`202608100001_harden_enrollment_course_offering_delete`

as pending.

The auxiliary shell parser used an incorrect migration-name digit count and therefore produced a false failure.

At that point:

- server source had already been safely fast-forwarded to the implementation commit;
- target migration had not been applied;
- ordinary FK remained `CASCADE/CASCADE`;
- ordinary business data remained unchanged;
- private rollback snapshot remained available.

This was a deployment-verification harness defect, not a Lexora migration or application defect.

The corrected resume verification compared repository migration directories directly with `_prisma_migrations` rather than relying on the faulty text-count regex.

### Ordinary migration deployment

Corrected pre-deployment verification established:

- repository clean/aligned at implementation commit `11311ab462d80b5f36341d1824f21fda5c1ac6a1`;
- rollback snapshot valid with `0600` permissions;
- PM2 PID: `8129`;
- direct API health: HTTP `200`;
- Nginx API health: HTTP `200`;
- ordinary PostgreSQL: `18.4`;
- pre-migration FK: `ON DELETE CASCADE / ON UPDATE CASCADE`;
- target migration absent;
- exactly one repository migration pending;
- the only pending migration was `202608100001_harden_enrollment_course_offering_delete`;
- Prisma migration status independently reported the same migration as pending.

`prisma migrate deploy` successfully applied:

`202608100001_harden_enrollment_course_offering_delete`

### Ordinary migration history verification

After deployment:

- completed target migration records: `1`;
- incomplete target migration records: `0`;
- rolled-back target migration records: `0`.

A second `prisma migrate deploy` reported:

`No pending migrations to apply.`

No duplicate migration record was created.

### Ordinary PostgreSQL foreign-key verification

Live foreign key:

`enrollments_course_offering_id_fkey`

Verified live behavior:

- delete action: `RESTRICT`;
- update action: `CASCADE`.

The previous Enrollment → CourseOffering DELETE CASCADE relationship is no longer present.

### Referenced CourseOffering runtime protection

Runtime verification used the existing isolated runtime CourseOffering:

`offering_law_enrollment_runtime_positive`

That CourseOffering had exactly one Enrollment reference for this test boundary.

After migration, direct deletion of the referenced CourseOffering was rejected by PostgreSQL.

The blocking constraint was:

`enrollments_course_offering_id_fkey`

Verified after the failed delete:

- CourseOffering remained present;
- Enrollment remained present.

Therefore the core historical-protection invariant is runtime verified:

> A CourseOffering referenced by an Enrollment cannot be physically deleted through the Enrollment relationship.

### Unreferenced CourseOffering control

A CourseOffering with no direct references in the tested dependent tables was selected.

Inside a transaction:

- the unreferenced CourseOffering was successfully deleted;
- absence was confirmed;
- the transaction was rolled back.

After rollback, the CourseOffering remained present.

Therefore the hardening does not globally make CourseOffering rows undeletable.

It blocks deletion specifically where referential history exists.

### Academic/business data non-mutation

Before and after the ordinary migration/runtime probes:

- selected academic/business table counts were unchanged;
- the deterministic Enrollment fingerprint was unchanged.

The successful hardening migration changed FK metadata only.

The failed referenced-parent delete did not mutate academic data.

The unreferenced delete control was rollback-only.

### Prisma drift verification

After ordinary deployment:

`prisma migrate diff`

reported:

`No difference detected.`

Database-to-datamodel drift:

`none`

### Runtime service non-disruption

PM2 restart:

`not required`

PM2 PID before/after:

`8129`

Direct API health after deployment:

HTTP `200`

Nginx API health after deployment:

HTTP `200`

Repository after deployment:

- HEAD: `11311ab462d80b5f36341d1824f21fda5c1ac6a1`;
- aligned with `origin/main`;
- working tree clean.

The validated private rollback snapshot was removed only after the full deployment/runtime verification passed.

### Accurate current status

> Enrollment → CourseOffering historical delete hardening is implemented, independently reviewed, committed and pushed, exact-current-data PostgreSQL 18.4 disposable verified, deployed to the ordinary Lexora PostgreSQL 18.4 runtime, and runtime verified. The live `enrollments_course_offering_id_fkey` now uses `ON DELETE RESTRICT / ON UPDATE CASCADE`. A CourseOffering referenced by an Enrollment cannot be physically deleted through that relationship. Live referenced-parent deletion was blocked while both CourseOffering and Enrollment remained intact; an unreferenced CourseOffering delete control succeeded transactionally. Migration history, academic/business non-mutation, Enrollment fingerprint stability, Prisma drift, repeated migration deployment, PM2 continuity and direct/Nginx health all passed.

### Scope boundary and remaining work

This checkpoint intentionally does **not** change the existing downstream relations from Enrollment to:

- AttendanceRecord;
- AssignmentSubmission;
- QuizAttempt;
- ResultRecord.

Those relations remain outside this focused checkpoint.

Direct physical Enrollment deletion policy and its downstream academic-history implications remain a separate hardening/design concern and must not be considered solved solely by this CourseOffering-parent protection.

This checkpoint also does not complete:

- CourseOffering multi-curriculum coexistence/uniqueness redesign;
- controlled historical Enrollment curriculum backfill;
- canonical LL.B. StudentCurriculumAssignment establishment;
- remaining canonical CourseOffering bindings;
- irregular/failed/retake/improvement workflows;
- earlier-syllabus candidate handling;
- curriculum-aware available/eligible offering discovery;
- StudentCurriculumAssignment exceptional reassignment;
- StudentCurriculumAssignment database-trigger immutability;
- live StudentCurriculumAssignment concurrent first-write verification;
- curriculum-aware results/transcript integration;
- runtime/test-fixture segregation and hygiene;
- broader security and production hardening.

### Supersession note

Earlier checklist entries that describe:

`Enrollment → CourseOffering ON DELETE CASCADE`

as the current ordinary database state are superseded by this checkpoint.

Earlier warnings that CourseOffering physical deletion could transitively remove Enrollment history through that foreign-key edge are also superseded.

The new ordinary runtime state is:

`Enrollment → CourseOffering ON DELETE RESTRICT / ON UPDATE CASCADE`

The remaining downstream Enrollment-deletion concerns listed above remain valid.

### Next safe step

After this runtime evidence is committed to the checklist, reassess the remaining curriculum and academic-history tasks from the latest source-of-truth documents.

Do not automatically perform historical Enrollment backfill.

Do not mix CourseOffering multi-curriculum uniqueness redesign with direct Enrollment-deletion hardening.

Select the next focused module/checkpoint based on current academic priority and verified dependencies.

## CourseOffering Multi-Curriculum Uniqueness Redesign and Runtime Verification — 2026-08-10

### Status

This checkpoint is complete and runtime verified.

Implementation commit:

`5d4d46983a61e80a8c8b8ec1589b95535b540827`

Implementation subject:

`Redesign course offering curriculum uniqueness`

Migration:

`202608100002_redesign_course_offering_uniqueness`

This later evidence supersedes earlier checklist language that identified the existing CourseOffering uniqueness rule as a blocker for old/new curriculum coexistence.

### Problem closed

The previous database uniqueness identity was:

`department + academicTerm + base Course + section`

That global identity prevented two CourseOfferings for the same base Course, AcademicTerm and section from coexisting when they belonged to different CurriculumCourse / CurriculumVersion identities.

The redesign deliberately preserves the existing two-step workflow:

1. create a CourseOffering unbound to curriculum;
2. use the separate immutable Admin curriculum-binding workflow to bind it to the authoritative CurriculumCourse.

No CourseOffering create/update DTO was widened to accept client-controlled curriculum identity.

### New database-enforced identities

Prisma's previous global CourseOffering `@@unique` was removed.

Because the current Prisma 6.x schema cannot express the required partial uniqueness directly, PostgreSQL raw partial unique indexes are authoritative.

Unbound / legacy / staging identity:

`course_offering_unbound_identity_uq`

Columns:

`department_id + academic_term_id + course_id + section_code`

Predicate:

`curriculum_course_id IS NULL`

Bound curriculum identity:

`course_offering_bound_curriculum_identity_uq`

Columns:

`department_id + academic_term_id + curriculum_course_id + section_code`

Predicate:

`curriculum_course_id IS NOT NULL`

The previous global unique index:

`course_offerings_department_id_academic_term_id_course_id_s_key`

was removed by the migration.

`archived_at` is intentionally not part of either predicate.

Therefore archived CourseOfferings continue to reserve their identity. Archive/reuse semantics were not changed by this checkpoint.

### Migration safety

The migration:

- performs fail-closed duplicate prechecks for both proposed identity sets;
- creates both replacement partial unique indexes before dropping the old global unique index;
- performs no CourseOffering data UPDATE;
- performs no backfill;
- performs no DELETE;
- performs no curriculum rebinding;
- does not alter historical migrations.

Before ordinary deployment, live data contained:

- CourseOfferings: `14`;
- Enrollments: `12`;
- unbound proposed-identity collisions: `0`;
- bound proposed-identity collisions: `0`.

### Binding-conflict hardening

The existing immutable CourseOffering curriculum-binding workflow was preserved.

Binding now checks whether another CourseOffering already occupies the exact scoped bound identity:

`department + academicTerm + target CurriculumCourse + section`

Archived conflicting offerings are included because archived rows remain inside the database uniqueness rule.

The PostgreSQL partial unique index remains the final race authority.

The repository handles only target-specific Prisma `P2002` bound-identity violations as candidate binding conflicts.

After transaction rollback, the repository performs a scoped confirmation before returning the existing sanitized:

`BINDING_CONFLICT`

Unrelated Prisma errors and unconfirmed `P2002` errors continue to propagate.

Conflict paths do not write a success audit.

The service returns sanitized HTTP `409 Conflict` without exposing another CourseOffering ID.

### Independent implementation review

The actual implementation diff was independently reviewed before commit.

Review result:

- Critical: `0`;
- High: `0`;
- Medium: `0`;
- Low: `0`;
- Suggestions: `2` non-blocking runtime-verification notes.

The reviewed implementation boundary contained exactly `10` files.

Historical migrations remained unchanged.

### Focused static verification

Focused automated suites reported:

- new CourseOffering uniqueness schema/migration suite: `4` passed;
- compatibility schema suites: `13` passed;
- PrismaAcademicRepository suite: `47` passed;
- AcademicService suite: `16` passed;
- total focused tests/assertions reported by runners: `80` passed.

Also passed:

- Prisma format;
- Prisma validate;
- Prisma Client generation;
- API typecheck;
- API build;
- `git diff --check`.

### Exact-current-data disposable PostgreSQL 18.4 verification

Before ordinary deployment, the reviewed implementation was exercised against an exact-current ordinary-database snapshot restored into disposable PostgreSQL `18.4`.

Disposable PostgreSQL exposure was loopback-only.

The ordinary database remained untouched during disposable verification.

Verified:

- exact-current CourseOffering count matched ordinary runtime;
- exact-current Enrollment count matched ordinary runtime;
- CourseOffering row fingerprint matched ordinary runtime;
- target migration was initially pending;
- migration applied successfully;
- migration history completed exactly once;
- both required partial unique indexes existed with exact predicates;
- `archived_at` was absent from both predicates;
- previous global unique index was removed;
- duplicate unbound identity was rejected;
- duplicate bound curriculum identity was rejected;
- archived CourseOffering continued to reserve its bound identity;
- same department/base Course/AcademicTerm/section successfully coexisted across two different CurriculumVersions after binding to different CurriculumCourses;
- transactional coexistence probes persisted no data;
- CourseOffering rows remained unchanged after probes;
- second Prisma migrate deploy was a no-op.

### Real Prisma 6.19.3 `P2002` evidence

A real Prisma/PostgreSQL partial-index collision produced:

`P2002`

with runtime target metadata:

`["department_id","academic_term_id","curriculum_course_id","section_code"]`

The implemented repository matcher accepted this exact runtime shape.

The probe row was removed and the CourseOffering fingerprint remained unchanged.

This closes the earlier uncertainty about Prisma 6.19.3 `P2002` metadata for the raw PostgreSQL partial unique index.

### Disposable verification harness notes

Several earlier attempts failed for verification-harness reasons rather than Lexora product/migration defects:

1. `sh002` correctly had no direct Docker daemon access; Docker administration remained sudo-only and the harness was corrected to use `sudo docker`.
2. PostgreSQL 18 uses `PGDATA=/var/lib/postgresql/18/docker`; an initial harness used an obsolete PostgreSQL data-path assumption.
3. container-local `pg_isready` could observe the temporary initialization server before final host TCP readiness; final harness readiness was therefore based on a successful host-side TCP `SELECT 1`.
4. an initial Prisma probe stored outside the package tree could not resolve `@prisma/client`; the focused rerun explicitly resolved the installed Prisma Client entry before execution.

All harness issues were corrected before the successful disposable verification.

### Ordinary deployment

Ordinary database:

`lexora_lms`

PostgreSQL:

`18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)`

Server source before deployment:

`193eca23d6eb00632b43edcb576e1a5986d194dd`

Server source after reviewed fast-forward:

`5d4d46983a61e80a8c8b8ec1589b95535b540827`

Server-side validation after fast-forward passed:

- Prisma validate;
- Prisma Client generation;
- API typecheck;
- API build;
- repository clean-state check.

Controlled PM2 restart:

- PID before: `8129`;
- PID after: `78750`.

Health recovered successfully after restart.

### Validated private pre-migration backup

Retained backup:

`/home/sh002/lexora-private-backups/lexora_lms-before-202608100002_redesign_course_offering_uniqueness-20260810T170907Z.dump`

SHA-256:

`4601ae2a209d6a6e72396b79c6f5af1b09f1d458ddbb49aa419f05ba73b7533f`

Verification:

- archive listing passed;
- backup file mode: `0600`;
- backup directory mode: `0700`;
- raw database credentials were not printed.

### Ordinary migration verification

Immediately before migration:

- CourseOfferings: `14`;
- Enrollments: `12`;
- target migration record: absent;
- old global unique index: present;
- target partial unique indexes: absent;
- unbound identity collisions: `0`;
- bound identity collisions: `0`.

Prisma correctly reported exactly the target migration as pending.

`prisma migrate deploy` successfully applied:

`202608100002_redesign_course_offering_uniqueness`

Migration history after deployment:

- completed target records: `1`;
- rolled-back target records: `0`;
- incomplete target records: `0`.

Live PostgreSQL catalog verified:

- `course_offering_unbound_identity_uq`: present and unique;
- predicate: `curriculum_course_id IS NULL`;
- `course_offering_bound_curriculum_identity_uq`: present and unique;
- predicate: `curriculum_course_id IS NOT NULL`;
- neither predicate contains `archived_at`;
- previous global CourseOffering unique index: absent.

### Ordinary live behavioral verification

Transactional live probes verified:

- duplicate unbound identity is rejected;
- duplicate bound curriculum identity is rejected;
- same base Course/AcademicTerm/section can coexist across different CurriculumVersions when bound to different CurriculumCourses;
- probe rows were rolled back and persisted no data.

Business-data preservation after migration and probes:

- CourseOffering count: unchanged;
- Enrollment count: unchanged;
- CourseOffering row fingerprint: unchanged.

Prisma verification:

- migration status: up to date;
- Prisma-visible database-to-datamodel difference: none;
- partial-index definitions independently verified from PostgreSQL catalog;
- second `prisma migrate deploy`: no pending migrations;
- duplicate target migration record: none.

### Final runtime state

Application code active at:

`5d4d46983a61e80a8c8b8ec1589b95535b540827`

Final runtime verification:

- PM2 remained stable after the controlled restart;
- direct API health: HTTP `200`;
- Nginx-proxied API health: HTTP `200`;
- NestJS listener on port `4000`: loopback-only;
- local `main` and `origin/main`: `0 0`;
- working tree: clean before this documentation update.

### Preserved security and academic-history boundaries

This checkpoint did not weaken:

- AuthGuard;
- PolicyGuard;
- `@RequirePolicy()`;
- authenticated-principal department authority;
- department-scoped repository queries;
- object-level authorization;
- CourseOffering curriculum-binding immutability;
- Admin-only curriculum binding;
- Teacher assigned-course isolation;
- Student own-resource rules;
- Enrollment curriculum dependency enforcement;
- Enrollment → CourseOffering `ON DELETE RESTRICT`;
- result publication/amendment protections;
- transcript immutability;
- audit requirements.

No client-controlled `curriculumCourseId` was added to CourseOffering create or update DTOs.

### Closed structural blocker

The previously documented CourseOffering multi-curriculum coexistence / uniqueness blocker is now closed.

The durable identity model is:

- one unbound CourseOffering per department + AcademicTerm + base Course + section;
- one bound CourseOffering per department + AcademicTerm + CurriculumCourse + section.

This permits old/new curriculum coexistence while preserving unbound staging safety and immutable separate binding.

### Still pending

This checkpoint does not complete the broader curriculum programme.

Still pending include:

- controlled historical Enrollment curriculum backfill;
- remaining canonical CourseOffering bindings where appropriate;
- irregular/failed/retake/improvement curriculum workflow;
- earlier-syllabus candidate handling;
- curriculum-aware eligible/available offering discovery;
- exceptional curriculum reassignment/migration;
- database-trigger-level StudentCurriculumAssignment immutability;
- ordinary live concurrent StudentCurriculumAssignment first-write race verification;
- broader curriculum-management API/UI;
- Student curriculum-assignment UI;
- curriculum-aware result/transcript integration;
- production/test fixture segregation and hygiene;
- SyllabusVersion and approval/publication workflow;
- broader OBE/formative/summative/examiner/committee/CQI/Course File implementation.

## Historical Enrollment Curriculum Backfill Eligibility Read-Only Audit — 2026-08-13

### Scope

A focused ordinary-runtime PostgreSQL read-only audit was performed to determine whether the preserved historical Enrollment rows currently have sufficient authoritative curriculum identity for a controlled curriculum backfill.

This checkpoint performed no:

- Enrollment update;
- CourseOffering binding;
- StudentCurriculumAssignment creation;
- CurriculumVersion status change;
- curriculum promotion;
- delete;
- migration;
- application-source modification.

Both database audit passes used explicit read-only transactions and ended with `ROLLBACK`.

### Runtime environment

Verified ordinary runtime:

- database: `lexora_lms`;
- PostgreSQL: `18.4`;
- repository baseline: `2b9992a4c8e10f86b69e09ae931a707020f50e46`;
- local HEAD, local `origin/main`, and remote `main` were aligned before the audit;
- working tree was clean.

### Enrollment inventory

Observed ordinary-runtime Enrollment state:

- total Enrollments: `12`;
- curriculum-bound Enrollments: `2`;
- historical `NULL/NULL` curriculum Enrollments: `10`;
- invalid partial curriculum-binding pairs: `0`.

### First-pass historical classification

The 10 historical `NULL/NULL` Enrollment rows classified as:

- `BLOCKED_COURSE_OFFERING_UNBOUND`: `9`;
- `BLOCKED_NO_STUDENT_CURRICULUM_ASSIGNMENT`: `1`;
- authoritatively backfillable at current state: `0`.

The single historical Enrollment whose CourseOffering was already curriculum-bound was:

- course: `0421-1101 — Jurisprudence-I`;
- CourseOffering: `offering_0421_1101_2025_2026_s1_a`;
- CurriculumCourse: `cmsi9mwp6001b2iiulsk1kkeq`;
- CurriculumVersion: `LLB-HONS-2025-2026-V1`;
- CurriculumVersion status: `DRAFT`.

It remained blocked because no exact canonical LL.B. StudentCurriculumAssignment exists for the Student.

### Canonical six-offering audit

The six reviewed canonical first-semester offerings were:

- `0231-1105 — General English (GED)`;
- `0311-1106 — Fundamentals of Economics (GED)`;
- `0421-1101 — Jurisprudence-I`;
- `0421-1102 — Muslim Law-I`;
- `0421-1103 — Hindu Law`;
- `0421-1104 — Legal History of Bangladesh and Roman Law`.

Each had exactly one reviewed CurriculumCourse candidate in:

- AcademicProgram: `LLB — Bachelor of Laws`;
- CurriculumVersion: `LLB-HONS-2025-2026-V1`;
- CurriculumVersion ID: `cmsi9mwow000n2iiumxospbg6`;
- status: `DRAFT`.

Binding state:

- `0421-1101`: bound to its exact candidate;
- remaining five canonical offerings: unbound.

No CourseOffering was rebound during this audit.

### Canonical StudentCurriculumAssignment finding

The canonical Law runtime Student currently has exactly one StudentCurriculumAssignment, but it is not a canonical LL.B. assignment.

The existing assignment belongs to isolated runtime-only data:

- AcademicProgram: `SCA-RT`;
- CurriculumVersion: `SCA-RT-APPROVED-V1`;
- CurriculumVersion status: `APPROVED`.

Therefore this runtime-only StudentCurriculumAssignment must not be used as authority for canonical LL.B. historical Enrollment backfill.

### Positive controls

The two existing curriculum-bound Enrollment rows were inspected as positive controls.

Both use the isolated runtime-only curriculum setup and verified:

- StudentCurriculumAssignment CurriculumVersion = CurriculumCourse CurriculumVersion;
- CourseOffering bound CurriculumCourse = Enrollment CurriculumCourse;
- `VERSION_MATCH`;
- `OFFERING_MATCH`.

These records demonstrate the current curriculum-aware Enrollment identity chain but do not provide canonical LL.B. backfill authority.

### Backfill verdict

Current safe historical backfill subset:

`0 rows`

No historical Enrollment may be backfilled at the present state.

Reasons:

1. nine historical Enrollment rows use unbound CourseOfferings;
2. the one already-bound canonical Enrollment has no exact canonical LL.B. StudentCurriculumAssignment;
3. canonical `LLB-HONS-2025-2026-V1` remains `DRAFT`;
4. the existing StudentCurriculumAssignment belongs only to isolated runtime-test curriculum data.

Do not:

- infer curriculum identity merely from a matching base Course;
- use the runtime-only `SCA-RT` assignment for canonical LL.B. records;
- manufacture a canonical StudentCurriculumAssignment for testing;
- promote the canonical CurriculumVersion merely to make backfill possible;
- rewrite legacy `LAW-101` or BUS runtime evidence with the newer canonical curriculum.

### Accurate current status

> Historical Enrollment curriculum-backfill eligibility has now been ordinary-runtime audited read-only. All 10 preserved historical `NULL/NULL` Enrollment rows remain historically valid and unchanged. Zero rows currently satisfy the authoritative dependency requirements for safe backfill. The canonical six reviewed offerings each resolve to the canonical LL.B. CurriculumVersion, but that version remains `DRAFT`; five offerings remain unbound, and the one bound canonical offering has no exact canonical StudentCurriculumAssignment. The Student's only current assignment is an isolated runtime-test assignment and is not canonical LL.B. authority.

### Next safe checkpoint

Do not begin historical Enrollment backfill implementation.

Before any canonical curriculum assignment or backfill, inspect and design the controlled CurriculumVersion lifecycle / approval boundary.

Any future CurriculumVersion approval/activation workflow must preserve:

- authenticated-principal department authority;
- appropriate Department/Academic authority;
- explicit allowed state transitions;
- immutable/versioned historical curriculum data;
- deny-by-default transition behavior;
- audit logging;
- no generic unsafe status overwrite;
- no direct SQL status mutation as normal workflow;
- no silent promotion merely to unblock testing.

Curriculum lifecycle implementation and historical Enrollment backfill must remain separate focused checkpoints.

---

## CurriculumVersion Lifecycle Implementation and Ordinary-Runtime Verification — 2026-08-13

### Status

This CurriculumVersion lifecycle checkpoint is implemented, independently reviewed, committed, deployed, and ordinary-runtime verified.

Implementation commit:

`1e5715a851c7be26cdb41bdbb8124da92709a827`

Commit subject:

`Add curriculum version lifecycle controls`

Runtime environment:

- ordinary Ubuntu Lexora runtime;
- PostgreSQL `18.4`;
- database `lexora_lms`;
- PM2 process `lexora-api`;
- NestJS API bound only to `127.0.0.1:4000`;
- Nginx reverse proxy remained healthy.

### HTTP lifecycle surface

Runtime-verified routes:

- `PUT /api/v1/curriculum-versions/:id/approve`
- `PUT /api/v1/curriculum-versions/:id/activate`
- `PUT /api/v1/curriculum-versions/:id/retire`
- `PUT /api/v1/curriculum-versions/:id/archive`

Authoritative lifecycle:

`DRAFT → APPROVED → ACTIVE → RETIRED → ARCHIVED`

Skipped and backward transitions fail closed.

### Security and governance boundary

Controller protection preserves:

- `AuthGuard`;
- `PolicyGuard`;
- `@RequirePolicy()`;
- authenticated principal department as authoritative;
- object-level department isolation;
- safe not-found behavior for cross-department direct-object access.

Dedicated lifecycle policy:

`course-management.curriculum-version.lifecycle.manage`

The lifecycle service additionally requires an exact governance permission:

- resource: `course-management.curriculum-version.lifecycle`;
- action: `manage`;
- scope: `DEPARTMENT`.

The caller must also be an active same-department Department Admin with:

- unrevoked UserRole;
- unexpired UserRole;
- non-archived Department Admin Role;
- the exact lifecycle permission attached to that same qualifying role.

Generic `course-management.*`, global `*`, `SELF`, and `PUBLIC_VERIFICATION` permissions do not satisfy the lifecycle governance gate.

### Lifecycle timestamp invariants

Verified authoritative state combinations:

- `DRAFT`: `approved_at IS NULL`, `archived_at IS NULL`;
- `APPROVED`: `approved_at IS NOT NULL`, `archived_at IS NULL`;
- `ACTIVE`: `approved_at IS NOT NULL`, `archived_at IS NULL`;
- `RETIRED`: `approved_at IS NOT NULL`, `archived_at IS NULL`;
- `ARCHIVED`: `approved_at IS NOT NULL`, `archived_at IS NOT NULL`.

Malformed lifecycle state fails closed.

Later transitions preserve the original `approved_at`.

`ARCHIVE` sets `archived_at` once.

Successful transition and success-audit creation execute transactionally.

### Static deployment verification

Server source was fast-forwarded to implementation commit:

`1e5715a851c7be26cdb41bdbb8124da92709a827`

Verified:

- [x] exact reviewed 13-file implementation boundary;
- [x] API typecheck passed;
- [x] API build passed;
- [x] PM2 restart passed;
- [x] direct API health HTTP `200`;
- [x] Nginx API health HTTP `200`;
- [x] API listener remained `127.0.0.1:4000`;
- [x] unauthenticated lifecycle route returned HTTP `401`;
- [x] server `main` and `origin/main` aligned;
- [x] repository clean.

A temporary connection refusal occurred during the immediate PM2 restart window. Health recovered on the next retry. This was a restart-timing observation, not a persistent application or Nginx failure.

### Canonical LL.B. non-mutation

Canonical CurriculumVersion:

- ID: `cmsi9mwow000n2iiumxospbg6`;
- code: `LLB-HONS-2025-2026-V1`;
- department: `dept_law_test`.

Throughout lifecycle verification it remained:

- `DRAFT`;
- `approved_at IS NULL`;
- `archived_at IS NULL`.

The canonical curriculum was not promoted for testing.

### Pre-grant fail-closed verification

Before the exact lifecycle permission existed:

- canonical Law Department Admin login: HTTP `201`;
- lifecycle request: HTTP `403`;
- canonical curriculum mutation: none;
- lifecycle success audits: `0`.

This proves the generic Department Admin wildcard does not bypass the exact lifecycle governance boundary.

### Controlled runtime governance grant

For runtime verification only, a temporary exact permission was created:

`perm_cv_lifecycle_manage_department`

Temporary role-permission link:

`rp_law_cv_lifecycle_manage_department`

It was attached only to:

`role_law_department_admin`

The temporary permission and role-permission link were removed after verification.

No permanent lifecycle governance permission remained after the runtime checkpoint.

Therefore lifecycle mutation is intentionally fail-closed until formally approved authority provisioning occurs.

### Sequential lifecycle runtime verification

Dedicated preserved runtime fixture:

`cv_law_lifecycle_runtime_20260813131343`

Code:

`LIFECYCLE-RT-20260813131343-V1`

Verified:

- [x] exact resource/action with `SELF` scope → HTTP `403`;
- [x] Teacher lifecycle mutation → HTTP `403`;
- [x] Student lifecycle mutation → HTTP `403`;
- [x] APPROVE without `approvalReference` → HTTP `400`;
- [x] `DRAFT → APPROVED` → HTTP `200`;
- [x] same-target APPROVE retry → HTTP `200`;
- [x] APPROVE retry created no duplicate success audit;
- [x] forged `x-department-id` did not override principal department;
- [x] `APPROVED → ACTIVE` → HTTP `200`;
- [x] same-target ACTIVATE retry → HTTP `200`;
- [x] ACTIVATE retry created no duplicate success audit;
- [x] `ACTIVE → RETIRED` → HTTP `200`;
- [x] same-target RETIRE retry → HTTP `200`;
- [x] RETIRE retry created no duplicate success audit;
- [x] `RETIRED → ARCHIVED` → HTTP `200`;
- [x] same-target ARCHIVE retry → HTTP `200`;
- [x] ARCHIVE retry created no duplicate success audit;
- [x] backward `ARCHIVED → ACTIVE` → HTTP `409`.

Final sequential fixture state:

- status `ARCHIVED`;
- `approved_at IS NOT NULL`;
- `archived_at IS NOT NULL`.

Exactly four lifecycle success audits exist for the four real forward transitions.

Verified audit properties include:

- canonical Law Department Admin actor;
- department `dept_law_test`;
- target type `curriculum_version`;
- correct CurriculumVersion target;
- `SUCCESS` outcome;
- previous/new lifecycle status context;
- transition reason;
- APPROVE audit approval reference.

Denied, invalid, backward and idempotent requests created no additional lifecycle success audits.

After the temporary permission was removed, a fresh Admin lifecycle request again returned HTTP `403`.

### Cross-department direct-object verification

Disposable BUS fixture:

`cv_bus_lifecycle_runtime_20260813132417`

Law Department Admin attempted lifecycle mutation by direct BUS CurriculumVersion ID.

Result:

HTTP `404`

Verified:

- BUS fixture mutation: none;
- BUS lifecycle success audits: `0`.

Safe cross-department not-found behavior is preserved.

The disposable BUS fixture was removed after verification.

### Malformed-state runtime verification

Disposable malformed fixture:

`cv_law_lifecycle_malformed_20260813132417`

Deliberately malformed state:

- status `APPROVED`;
- `approved_at IS NULL`;
- `archived_at IS NULL`.

ACTIVATE result:

HTTP `409`

Verified:

- malformed row mutation: none;
- lifecycle success audits: `0`.

The implementation does not silently normalize or overwrite malformed academic approval provenance.

The malformed fixture was removed after verification.

### Real PostgreSQL concurrent same-action verification

Disposable concurrency fixture:

`cv_law_lifecycle_concurrency_20260813132417`

Two real HTTP APPROVE requests were issued concurrently against the same ordinary PostgreSQL `DRAFT` CurriculumVersion.

Results:

- request A: HTTP `200`;
- request B: HTTP `200`.

Final persisted state before cleanup:

- status `APPROVED`;
- `approved_at IS NOT NULL`;
- `archived_at IS NULL`.

Success-audit count:

`1`

Therefore the concurrent requests reconciled to one real transition and one same-target idempotent result without duplicate success audits.

The disposable concurrency fixture was removed after verification.

### Final runtime cleanup and health

Verified after specialized runtime testing:

- [x] specialized disposable fixtures removed;
- [x] temporary exact lifecycle permission removed;
- [x] temporary role-permission link removed;
- [x] sequential archived lifecycle evidence fixture preserved;
- [x] canonical LL.B. remained pristine `DRAFT`;
- [x] direct API health HTTP `200`;
- [x] Nginx API health HTTP `200`;
- [x] repository clean;
- [x] server `main` and `origin/main` aligned.

No raw password, access token, refresh token, password hash, database credential or production secret is recorded in this evidence.

### Runtime verdict

Within the defined CurriculumVersion lifecycle scope:

- [x] implementation complete;
- [x] independent security/code review complete;
- [x] focused tests passed;
- [x] Academic module tests passed;
- [x] API typecheck passed;
- [x] API build passed;
- [x] implementation committed and pushed;
- [x] Ubuntu deployment verified;
- [x] route/AuthGuard verified;
- [x] exact governance fail-closed behavior verified;
- [x] wrong-scope behavior verified;
- [x] Teacher/Student denial verified;
- [x] required approval-reference validation verified;
- [x] full forward lifecycle verified;
- [x] same-target idempotency verified;
- [x] forged department-header resistance verified;
- [x] backward transition protection verified;
- [x] exact audit cardinality/context verified;
- [x] cross-department direct-object safe-not-found verified;
- [x] malformed-state fail-closed verified;
- [x] real PostgreSQL concurrent same-action behavior verified;
- [x] canonical curriculum non-mutation verified;
- [x] temporary governance configuration cleaned up.

CurriculumVersion lifecycle ordinary-runtime verification is complete for this checkpoint.

### Remaining limitations / authorization hardening

This checkpoint does not mean institutional curriculum governance is complete.

Still pending:

1. Formal institutional approval evidence is not yet modeled as a dedicated immutable `ApprovalRecord` or equivalent authority record. `approvalReference` remains validated, audit-recorded metadata.

2. Permanent lifecycle authority provisioning is intentionally absent. Real deployment must provision the exact lifecycle permission only after formal academic authority is defined.

3. `PrincipalLoaderService` currently flattens role-derived permissions into `principal.permissions` without retaining source department/UserRole/Role provenance on each `PermissionGrant`.

4. Global PrincipalLoader role-validity and expiry semantics require a separate authorization-foundation review.

5. Future authorization hardening should:
   - preserve permission department/role provenance;
   - consistently exclude revoked/expired authority;
   - avoid combining authority from unrelated roles or departments;
   - preserve AuthGuard, PolicyGuard and `@RequirePolicy()`;
   - preserve principal department authority;
   - preserve safe cross-department not-found behavior.

6. The lifecycle endpoint is currently contained because it independently performs a DB-backed exact-role/exact-permission check against the same qualifying Department Admin authority.

7. Do not weaken that lifecycle-specific containment while performing broader authorization hardening.

Recommended authorization-hardening priority:

`P1`

8. The lifecycle API does not determine when the canonical LL.B. curriculum should be institutionally approved or activated. That remains a formal academic-governance decision.

Do not promote `LLB-HONS-2025-2026-V1` merely because lifecycle APIs are implemented and runtime verified.

### Supersession note

This section supersedes earlier pending wording only for CurriculumVersion lifecycle:

- implementation;
- deployment;
- exact authorization boundary;
- state transition behavior;
- idempotency;
- malformed-state protection;
- cross-department direct-object isolation;
- concurrency behavior;
- lifecycle success-audit behavior.

It does not supersede broader pending curriculum or production work.

## Authorization Provenance and Terminal Transcript Lineage Runtime Verification — 2026-08-13

### Scope

This checkpoint closes the current runtime-verification cycle for:

- PrincipalLoader role-assignment provenance and role-validity hardening;
- authorization-policy provenance reconstruction;
- canonical Admin / Teacher / Student authorization regression;
- authenticated department-scope enforcement;
- transcript public-verification regression after authorization hardening;
- terminal transcript-lineage correction discovered during the regression.

This does **not** mean the complete Lexora LMS or all production hardening is complete.

### Authorization implementation

Authorization provenance implementation commit:

- `c773df4866df2355f8a3d141014ebcfec8aa403b`
- `Harden authorization principal provenance`

The implementation introduced and enforced authoritative role-assignment provenance including:

- UserRole identity;
- Role identity;
- department identity;
- role code;
- PermissionGrant source provenance.

Principal reconstruction now filters or rejects authority where applicable for:

- revoked UserRole;
- expired UserRole;
- wrong UserRole department;
- wrong Role department;
- archived Role;
- invalid user/department authority state.

The authenticated principal's real department remains authoritative.

`x-department-id` does not override a valid authenticated principal's department.

### Static and automated validation

Before runtime deployment, the authorization implementation passed:

- focused authorization tests;
- broader authorization-related tests;
- complete compiled API test suite with no failures;
- API typecheck;
- API build;
- `git diff --check`.

Independent review reported no Critical, High, or Medium blocking finding within the reviewed authorization scope.

### PostgreSQL authority-state runtime verification

Real PostgreSQL tests verified:

- valid same-department role assignment grants expected authority;
- revoked assignment fails closed;
- expired assignment fails closed;
- future-valid assignment remains valid;
- UserRole department mismatch fails closed;
- Role department mismatch fails closed;
- changing the authoritative database assignment changes authorization even when an older access token is still being used;
- forged `x-department-id` does not change the authenticated principal's Law department scope.

Canonical role regression also verified:

- canonical Law Admin could access the expected administrative resource;
- canonical Teacher could access the expected assigned-teacher resource;
- Teacher remained blocked from an administrative resource;
- canonical Student could access own enrollment resource;
- Student remained blocked from the administrative programs resource;
- forged department header did not move the canonical Admin into the BUS department.

### Runtime verification limitation retained

For proportional safety, the following destructive or broad authority mutations were not separately repeated against canonical runtime objects after this implementation:

- inactive/archived authenticated user mutation;
- inactive/archived/deleted authoritative department mutation;
- archived Role mutation.

These paths remain covered by implementation/static/unit evidence but are not claimed here as separately re-proven through live canonical-object mutation.

Dynamic PermissionGrant exact-provenance behavior was also not separately re-run as an additional dedicated runtime cycle after this hardening.

### Transcript regression finding discovered during authorization verification

The final public-transcript regression initially exposed a pre-existing transcript lifecycle defect.

Historical transcript record:

- TranscriptRecord ID: `cmpbfkcou000p2i4hiwnpkcrz`
- original version ID: `cmpbfkcox000r2i4h01tco1pu`

The historical record had already been legitimately revoked.

A new transcript-generation request incorrectly reused that terminal REVOKED record and created:

- version ID: `cmsrrdnrz001j2iyh8uysl2hr`
- version number: `2`
- version status: `GENERATED`

while the parent TranscriptRecord remained:

- `REVOKED`;
- `latestVersionNumber = 2`;
- historical `revokedAt` preserved.

This produced an inconsistent lineage:

- parent: REVOKED;
- version 1: REVOKED;
- version 2: GENERATED.

The defect was in transcript snapshot lineage selection, not in the authorization-provenance implementation.

### Transcript lineage root cause

`createTranscriptSnapshot()` selected the oldest non-archived transcript record for the same department/student without excluding terminal lifecycle states.

A REVOKED record normally retains `archivedAt = null`, so it could be selected and incremented.

### Transcript lineage correction

Implementation commit:

- `ce67cade1e1556fb71be755e67be4020458040fe`
- `Preserve terminal transcript lineages`

Changed production behavior:

- only non-archived `DRAFT`, `GENERATED`, or `ISSUED` records can be reused as an active transcript lineage;
- `REVOKED` is terminal and cannot be reused;
- `ARCHIVED` is terminal and cannot be reused;
- a record with `archivedAt` set cannot be reused;
- update of a selected reusable lineage is guarded again by department, allowed lifecycle state, and `archivedAt = null`;
- when no reusable lineage exists, a fresh TranscriptRecord is created;
- the fresh record receives a distinct transcript number;
- the fresh lineage starts at version `1 / GENERATED`;
- historical terminal transcript history remains immutable.

No Prisma schema or migration was required for this correction.

### Focused transcript correction validation

The correction added five focused repository scenarios:

1. no previous transcript creates a new record and version 1;
2. legitimate DRAFT / GENERATED / ISSUED active lineage remains reusable;
3. REVOKED history is not reused and remains unchanged;
4. ARCHIVED / archived history is not reused;
5. opposite-department terminal history cannot influence lineage selection.

Validation passed:

- focused tests: `5/5`;
- API typecheck;
- API build;
- `git diff --check`.

The implementation was deployed to the Ubuntu runtime server.

Post-deployment verification passed:

- server API typecheck;
- server API build;
- focused compiled transcript tests `5/5`;
- PM2 restart;
- direct API health HTTP `200`;
- Nginx API health HTTP `200`;
- unauthenticated protected resource remained HTTP `401`;
- NestJS remained bound to `127.0.0.1:4000`;
- repository remained clean and aligned.

### Pre-fix anomaly inspection and remediation

Read-only inspection confirmed the pre-fix generated version had:

- one transcript term-summary snapshot;
- one course-line snapshot;
- zero verification tokens;
- zero transcript revocation records;
- zero seal records;
- an existing successful transcript-creation audit entry.

Because the version contained immutable snapshot evidence and an audit trail, it was **not deleted**.

Controlled remediation preserved the historical record and changed only the invalid pre-fix generated version:

- parent TranscriptRecord remained `REVOKED`;
- parent `latestVersionNumber` remained `2`;
- historical version 1 remained `REVOKED`;
- pre-fix version 2 changed `GENERATED → REVOKED`;
- version-2 term/course snapshot rows were preserved;
- no rows were deleted;
- historical verification-token and revocation evidence remained unchanged.

Operational remediation audit:

- actor type: `SERVICE`;
- outcome: `SUCCESS`;
- action:
  `transcript-verification.runtime-remediation.generated-version-revoked`;
- remediation audit ID:
  `runtime_remediation_20260813174138748_f3ac5a193a1d`.

The remediation intentionally did not create a normal user-driven transcript-revocation record because this was correction of a pre-fix operational defect rather than a new academic revocation decision.

### Final real PostgreSQL terminal-lineage regression

After deployment and remediation, the transcript-generation flow was re-run against the same historical student source.

Important source context:

- source user ID: `user_law_runtime_student_own`;
- source user status during this test: `SUSPENDED`;
- source department: Law;
- source user was neither deleted nor archived;
- the transcript service contract permits this historical/nondeleted same-department source;
- this must not be confused with the canonical active Student test account.

Source data available:

- eligible published/amended ResultRecord count: `1`;
- GPA record count: `1`;
- CGPA record count: `1`.

#### Fresh-generation result

`POST /api/v1/transcripts` returned HTTP `201`.

Verified:

- historical REVOKED TranscriptRecord was **not reused**;
- a new TranscriptRecord was created;
- the new transcript number was different from the historical transcript number;
- new record state was `GENERATED`;
- new `latestVersionNumber` was `1`;
- a new version `1 / GENERATED` was created;
- one term-summary snapshot was captured;
- one course-line snapshot was captured;
- expected latest CGPA source was captured;
- historical revoked lineage remained unchanged.

Fresh runtime evidence TranscriptRecord:

- ID: `cmsrt7a4200072i1tbp2s6pk3`

### Fresh transcript issue

`POST /api/v1/transcripts/:id/issue` returned HTTP `201`.

Verified:

- TranscriptRecord: `ISSUED`;
- TranscriptVersion: `ISSUED`;
- record issued timestamp set;
- version issued timestamp set;
- issuing actor recorded.

### Verification-token security

`POST /api/v1/transcripts/:id/verification-token` returned HTTP `201`.

Runtime verification confirmed:

- token initially `ACTIVE`;
- verification count initially `0`;
- `lastVerifiedAt` initially null;
- raw public verification token was not printed or documented;
- SHA-256 of the runtime token matched the value stored in `public_code`;
- raw token was not stored as the database verification value.

Verification-token evidence ID:

- `cmsrt7ai8000i2i1tsf22oi73`

The raw verification token is intentionally not recorded.

### Valid public verification

Public verification returned HTTP `200`.

Verified:

- `valid = true`;
- public response remained minimal;
- no student identifier/name, course marks, GPA, CGPA, internal snapshot, token hash/public code, or password-hash field was exposed by the checked response;
- after successful verification:
  - verification count became `1`;
  - `lastVerifiedAt` was set.

### Token expiry

A short-lived verification token was allowed to expire.

Public verification after expiry returned HTTP `200` with the minimal invalid contract:

- `valid = false`;
- `status = INVALID`.

Database state after expiry:

- token status: `EXPIRED`;
- verification count remained `1`;
- expiry access did not increment the successful-verification count.

### Controlled final transcript revocation

The fresh runtime evidence transcript was revoked through the protected API.

`POST /api/v1/transcripts/:id/revoke` returned HTTP `201`.

Verified:

- fresh TranscriptRecord ended `REVOKED`;
- fresh TranscriptVersion ended `REVOKED`;
- an `APPLIED` revocation record exists;
- `appliesToAllTokens = true`;
- already-expired verification token remained `EXPIRED`.

The fresh transcript was intentionally retained as revoked audit evidence rather than deleted.

### Academic and historical non-mutation verification

Before/after fingerprints confirmed:

- historical revoked transcript lineage unchanged;
- source ResultRecord unchanged;
- source GPA record unchanged;
- source CGPA record unchanged.

The expected transcript count increased by exactly one because the fresh runtime evidence TranscriptRecord was retained.

### Audit evidence

Runtime audit evidence verified successful events for:

- transcript creation;
- transcript issue;
- verification-token creation;
- valid public verification access;
- expired public verification access;
- transcript revocation.

Create / issue / revoke audit records were explicitly checked.

### Final runtime health

At the end of the regression:

- direct API health: HTTP `200`;
- Nginx API health: HTTP `200`;
- implementation commit remained deployed;
- local server repository remained clean and aligned;
- raw password/access token/transcript verification token was not printed into the retained evidence.

### Final checkpoint verdict

Within the tested scope:

- [x] PrincipalLoader authority reconstruction honors current authoritative database role state.
- [x] Revoked UserRole authority fails closed.
- [x] Expired UserRole authority fails closed.
- [x] Future-valid UserRole authority remains valid.
- [x] UserRole department mismatch fails closed.
- [x] Role department mismatch fails closed.
- [x] Authenticated department scope cannot be overridden by forged `x-department-id`.
- [x] Canonical Admin allowed-path regression passed.
- [x] Canonical Teacher allowed-path regression passed.
- [x] Canonical Teacher administrative denial passed.
- [x] Canonical Student own-resource regression passed.
- [x] Canonical Student administrative denial passed.
- [x] Terminal REVOKED transcript lineage is not reused.
- [x] Fresh transcript after terminal lineage starts with a new TranscriptRecord and version 1.
- [x] Transcript issue passed.
- [x] Verification token remained hash-backed.
- [x] Public verification response remained minimal.
- [x] Successful verification accounting passed.
- [x] Expiry invalidation passed without incrementing the verification count.
- [x] Controlled transcript revocation passed.
- [x] Historical transcript evidence remained immutable.
- [x] Source Result/GPA/CGPA records remained unchanged.
- [x] Sensitive raw credentials/tokens were not retained in documentation.

**Authorization provenance hardening is runtime verified within this checkpoint scope.**

**Terminal transcript-lineage correction is runtime verified.**

### Known limitation retained

Transcript generation still has a concurrency-hardening gap:

- the current schema does not enforce a database-level invariant guaranteeing exactly one active transcript lineage per department/student;
- concurrent generation when no reusable active lineage exists could create multiple active records;
- concurrent generation against one existing lineage can contend on version allocation / uniqueness.

A safe fix requires a deliberate locking/constraint/schema design and was intentionally not mixed into the terminal-lineage correction.

Track this as separate transcript production-hardening work.

### Overall project status note

This checkpoint does **not** mean Lexora LMS is fully production complete.

Broader production and product work remains, including areas such as:

- production/cloud deployment finalization;
- HTTPS/domain configuration;
- monitoring, centralized logging, and alerting;
- backup/restore/disaster-recovery verification;
- database isolation defense-in-depth / RLS evaluation;
- identity hardening such as production email flows and required 2FA where applicable;
- background notification delivery;
- broader curriculum-management UI/API work;
- irregular/retake/improvement academic workflows;
- formative/summative examiner and committee workflows;
- remaining frontend/product completion and production hardening.

## SyllabusVersion Schema Foundation and Disposable PostgreSQL Verification — 2026-08-14

### Scope

Implemented the minimal additive `SyllabusVersion` schema foundation required before Teacher Course Workspace and OBE Course Outline development.

This task intentionally did **not** implement:

- SyllabusVersion CRUD/service/controller APIs;
- syllabus approval/lifecycle services;
- Teacher syllabus read APIs;
- CourseOffering → SyllabusVersion binding;
- Teacher Course Workspace;
- Course Outline;
- Lesson Plan;
- CLO/PLO workflow;
- historical syllabus backfill;
- ordinary runtime PostgreSQL migration.

### Implementation

Files introduced/changed for the foundation:

- `.gitignore`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/202608140001_add_syllabus_version_foundation/migration.sql`
- `apps/api/prisma/syllabus-version-foundation.schema.test.ts`

Migration:

- `202608140001_add_syllabus_version_foundation`

`SyllabusVersion` includes:

- immutable CUID primary key;
- `departmentId`;
- owning `curriculumCourseId`;
- version code;
- positive `versionNumber`;
- `AcademicVersionStatus` lifecycle;
- `effectiveFrom` / `effectiveTo`;
- `approvedAt`;
- `archivedAt`;
- created/updated timestamps.

Lifecycle values use the existing academic version lifecycle:

- `DRAFT`
- `APPROVED`
- `ACTIVE`
- `RETIRED`
- `ARCHIVED`

Historical syllabus versions coexist as separate rows.

Scoped uniqueness is enforced for:

- `(departmentId, curriculumCourseId, code)`
- `(departmentId, curriculumCourseId, versionNumber)`

### Department Isolation / Database Integrity

A composite candidate key was added on:

- `CurriculumCourse(id, departmentId)`

`SyllabusVersion` uses a composite foreign key:

- `(curriculum_course_id, department_id)`
- → `curriculum_courses(id, department_id)`

This provides database-level enforcement that a syllabus version cannot reference a `CurriculumCourse` from another department.

Deletion behavior remains restrictive:

- Department → SyllabusVersion: `ON DELETE RESTRICT`
- CurriculumCourse → SyllabusVersion: `ON DELETE RESTRICT`

Existing:

- AuthGuard
- PolicyGuard
- request context
- teacher assigned-course authorization
- student own-resource authorization
- CourseOffering → CurriculumCourse binding

were not changed.

No Teacher syllabus write authority was introduced.

No existing CourseOffering, Enrollment, Result, Transcript, Attendance, or historical academic record was automatically rebound or backfilled.

### Static / Focused Validation

Focused test result:

- Total focused tests: `59`
- Passed: `59`
- Failed: `0`

Coverage included:

- same-department ownership invariant;
- cross-department ownership rejection design;
- version code/number uniqueness;
- historical version coexistence;
- invalid lifecycle metadata;
- invalid date ordering;
- positive version-number enforcement;
- non-destructive migration behavior;
- preservation of existing CourseOffering → CurriculumCourse binding.

Additional validation:

- Prisma schema validation: passed
- Prisma client generation: passed
- API typecheck: passed
- API build: passed
- `git diff --check`: passed

### Disposable PostgreSQL 16 Verification

Verification was performed on the Ubuntu runtime server using an isolated disposable `postgres:16-alpine` Docker container.

Safety boundaries:

- committed repository HEAD used as the exact baseline;
- transferred review bundle SHA-256 was verified before use;
- server live repository remained clean;
- ordinary Lexora PostgreSQL database was not accessed;
- PM2/Nginx/API were not modified or restarted;
- no commit or push occurred as part of the verification;
- disposable PostgreSQL was bound to `127.0.0.1` only;
- Docker administration remained `sudo`-only.

Verified outcomes:

- committed baseline schema successfully initialized;
- `202608140001_add_syllabus_version_foundation` applied successfully;
- `syllabus_versions` table exists with expected schema;
- exact mapped indexes exist;
- both foreign keys exist;
- both foreign keys use `ON DELETE RESTRICT / ON UPDATE CASCADE`;
- composite `(curriculum_course_id, department_id)` ownership foreign key verified from PostgreSQL catalog;
- positive-version CHECK constraint verified;
- effective-date ordering CHECK constraint verified;
- lifecycle metadata CHECK constraint verified;
- invalid `versionNumber = 0` rejected at runtime;
- invalid effective-date range rejected at runtime;
- `ACTIVE` without `approved_at` rejected at runtime;
- invalid/missing department and curriculum-course references rejected at runtime;
- current Prisma schema validation passed after migration verification;
- live server repository remained unchanged.

Disposable PostgreSQL verdict:

- Migration application: **PASS**
- PostgreSQL catalog verification: **PASS**
- Runtime constraint rejection tests: **PASS**
- Department ownership FK: **PASS**
- Restrictive FK behavior: **PASS**
- Lifecycle/date/version constraints: **PASS**
- Ordinary Lexora database accessed: **NO**

### Current Classification

`SyllabusVersion` status:

- Schema foundation implemented: **Yes**
- Focused/static tests: **Passed**
- Disposable PostgreSQL 16 migration verification: **Passed**
- Ordinary Lexora runtime database migrated: **No**
- CRUD/lifecycle API runtime verified: **No / not implemented**
- Teacher Course Workspace integration: **Pending**
- CourseOffering → SyllabusVersion binding: **Pending**
- Historical syllabus backfill: **Not performed**

Do not describe the full syllabus workflow as complete.

Approved/active syllabus historical immutability must be enforced by future lifecycle/service logic using create-new-version semantics rather than silent overwrite.

### Runtime Network Note

During this verification cycle the Ubuntu VM was reachable at `192.168.197.129`.

Older checklist entries referencing `192.168.197.130` are historical runtime observations and should not be assumed to represent the VM's current DHCP-assigned address.

## SyllabusVersion Foundation Ordinary PostgreSQL Runtime Verification — 2026-08-14

### Supersession and classification

This checkpoint supersedes only the earlier `SyllabusVersion` foundation statement that the ordinary Lexora runtime database had not yet been migrated.

The earlier disposable PostgreSQL verification remains valid historical evidence.

Current verified classification:

- `SyllabusVersion` schema foundation implemented;
- implementation independently reviewed;
- implementation committed and pushed;
- focused validation passed;
- disposable PostgreSQL 16 migration verification passed;
- migration deployed successfully to the ordinary `lexora_lms` PostgreSQL database;
- live migration history verified complete;
- live PostgreSQL catalog and mapped identifiers verified;
- composite department ownership foreign key verified;
- restrictive delete behavior verified;
- lifecycle, effective-date and positive-version constraints verified;
- no `SyllabusVersion` row was automatically created;
- selected existing academic/business row counts were preserved;
- Prisma database-to-datamodel drift check passed;
- a second `prisma migrate deploy` was verified as a safe no-op;
- PM2 restart was not required for this schema-only change;
- the existing Lexora API process remained continuously running;
- direct API and Nginx health remained HTTP `200`;
- API port `4000` remained bound to loopback only;
- validated private pre-migration backup remains retained.

This does **not** mean the complete syllabus workflow is implemented.

Still pending:

- SyllabusVersion CRUD/service/controller APIs;
- syllabus approval and lifecycle services;
- create-new-version enforcement for approved/active syllabus history;
- lifecycle audit events;
- CourseOffering → SyllabusVersion binding;
- Teacher syllabus read APIs;
- Teacher Course Workspace;
- Course Outline;
- Lesson Plan;
- CLO/PLO workflow;
- historical syllabus backfill.

### Implementation identity

Implementation commit:

`fb35593717511a07253841f101be4dbc658cc576`

Commit message:

`Add syllabus version schema foundation`

Migration:

`202608140001_add_syllabus_version_foundation`

### Server-side validation before ordinary deployment

After the implementation commit was fast-forwarded to the Ubuntu runtime server:

- Prisma schema validation passed;
- Prisma Client generation passed;
- API typecheck passed;
- API build passed;
- native Node.js execution of `prisma/syllabus-version-foundation.schema.test.ts` passed `6/6`.

The Node.js test run emitted a module-type detection warning because the test uses module syntax in a CommonJS-compatible package.

No `"type": "module"` change, NodeNext migration, ESM migration or TypeScript module-system migration was performed.

### Ordinary database pre-migration state

Verified ordinary database:

- database: `lexora_lms`;
- PostgreSQL: `18.4`.

Before migration:

- `syllabus_versions`: absent;
- target migration history row: absent;
- `curriculum_course_id_department_uq`: absent;
- target migration was the only pending Prisma migration.

Selected pre-migration counts:

- CourseOfferings: `14`;
- CurriculumCourses: `61`;
- CurriculumVersions: `8`;
- Enrollments: `12`;
- ResultRecords: `1`;
- TranscriptRecords: `2`;
- Users: `11`.

A private pre-migration PostgreSQL custom-format backup was created, permission-restricted and successfully validated with `pg_restore --list`.

No database credential or secret was recorded in project documentation.

### Ordinary PostgreSQL migration result

`prisma migrate deploy` successfully applied:

`202608140001_add_syllabus_version_foundation`

Post-deployment Prisma status:

- migrations found: `9`;
- database schema up to date: **Yes**.

Migration-history verification:

- completed target migration rows: `1`;
- rolled-back target migration rows: `0`;
- incomplete target migration rows: `0`.

### Live PostgreSQL catalog verification

Verified on the ordinary `lexora_lms` database:

- `syllabus_versions` table exists;
- expected 12-column schema exists;
- exact mapped target indexes exist;
- exactly two syllabus foreign keys exist;
- both syllabus foreign keys use `ON DELETE RESTRICT`;
- both syllabus foreign keys use `ON UPDATE CASCADE`;
- composite `(curriculum_course_id, department_id)` foreign key references `curriculum_courses(id, department_id)`;
- positive version-number CHECK exists;
- effective-date ordering CHECK exists;
- lifecycle metadata CHECK exists;
- automatic SyllabusVersion row creation count: `0`.

### Existing-data preservation

Selected post-migration counts remained:

- CourseOfferings: `14`;
- CurriculumCourses: `61`;
- CurriculumVersions: `8`;
- Enrollments: `12`;
- ResultRecords: `1`;
- TranscriptRecords: `2`;
- Users: `11`.

These selected counts exactly matched the immediate pre-migration values.

No existing academic/business record was automatically rebound, backfilled or modified by this migration.

### Drift and idempotency verification

Prisma database-to-datamodel migration diff:

- difference detected: **No**.

A second:

`prisma migrate deploy`

reported:

`No pending migrations to apply.`

Exactly one target migration-history record remained.

### Runtime non-disruption verification

PM2 process:

- process: `lexora-api`;
- PID before migration: `50609`;
- PID after migration: `50609`;
- PM2 restart: **not required**.

Health verification after migration:

- direct API health: HTTP `200`;
- Nginx API health: HTTP `200`.

Network binding:

- API listener on port `4000`: loopback-only;
- unsafe wildcard/public port `4000` listener: not detected.

Repository after deployment:

- branch: `main`;
- HEAD: `fb35593717511a07253841f101be4dbc658cc576`;
- `origin/main`: aligned;
- working tree: clean.

### Runtime verdict

`SyllabusVersion` database/schema foundation is now:

- implemented;
- reviewed;
- focused-test verified;
- disposable PostgreSQL verified;
- committed and pushed;
- deployed to ordinary PostgreSQL;
- live-catalog verified;
- non-disruption verified.

It is **not yet a complete syllabus-management feature**.

The next implementation must continue with the smallest safe application-layer step and must preserve department isolation, object-level authorization, historical syllabus identity, restrictive academic-history relationships and audit-ready lifecycle behavior.
