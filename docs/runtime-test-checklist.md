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

- [ ] Create assignment
- [ ] List assignments
- [ ] Submit assignment
- [ ] Student can only see own submissions
- [ ] Teacher can review assigned course submissions
- [ ] Create quiz
- [ ] Start quiz attempt
- [ ] Submit quiz attempt
- [ ] Validate quiz access rules

## 7. Result Processing

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

## 8. Transcript Verification

- [ ] Create transcript record
- [ ] Issue transcript version
- [ ] Generate verification token
- [ ] Public verification works
- [ ] Public verification returns safe/minimal data
- [ ] Token expiry respected
- [ ] Revoke transcript/token
- [ ] Revoked transcript fails or shows revoked status

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
- [ ] Assessment workflow tested
- [ ] Result Processing workflow tested
- [ ] Transcript Verification workflow tested
- [ ] Ready to start Class Session Module

## 14. Next Test Steps

1. Commit and push the updated runtime checklist.
2. Continue student-specific access isolation tests.
3. Continue student course visibility rules test.
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

