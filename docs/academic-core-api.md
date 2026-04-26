# Academic Core API

## Overview

The Academic Core API MVP exposes department-scoped CRUD endpoints for:

- academic programs
- courses
- course offerings
- enrollments

All endpoints require:

- authenticated access through `AuthGuard`
- policy enforcement through `PolicyGuard`
- department isolation through the active principal department

Soft-deleted or archived records are excluded from reads by default.

## Endpoints

### Programs

- `POST /api/v1/programs`
- `GET /api/v1/programs`
- `GET /api/v1/programs/:id`
- `PATCH /api/v1/programs/:id`

### Courses

- `POST /api/v1/courses`
- `GET /api/v1/courses`
- `GET /api/v1/courses/:id`
- `PATCH /api/v1/courses/:id`

### Course Offerings

- `POST /api/v1/course-offerings`
- `GET /api/v1/course-offerings`
- `GET /api/v1/course-offerings/:id`
- `PATCH /api/v1/course-offerings/:id`

### Enrollments

- `POST /api/v1/enrollments`
- `GET /api/v1/enrollments`
- `GET /api/v1/enrollments/:id`
- `PATCH /api/v1/enrollments/:id`

## Policy Usage

The current MVP reuses the existing module policy namespaces:

- programs read: `course-management.program.read`
- programs create/update: `course-management.program.manage`
- courses read: `course-management.course.read`
- courses create/update: `course-management.course.manage`
- course offerings read: `course-management.offering.read`
- course offerings create/update: `course-management.offering.manage`
- enrollments read: `enrollment.record.read`
- enrollments create: `enrollment.record.create`
- enrollments update: `enrollment.record.update`

## Behavior Notes

- `departmentId` always comes from the authenticated principal context, never from client input
- referenced program, course, term, offering, and student records must belong to the same department
- updates are persisted with department-scoped filters, so cross-department record ids cannot be updated
- enrollment creation validates that the requested term matches the selected course offering term
- create and update actions write audit log records
- duplicate department-scoped codes and enrollment uniqueness violations return conflict errors

## Example Requests

### Create Program

```http
POST /api/v1/programs
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "code": "BSC-CSE",
  "name": "BSc in Computer Science and Engineering",
  "description": "Undergraduate computing program",
  "status": "ACTIVE"
}
```

Example response:

```json
{
  "id": "cm123...",
  "departmentId": "dep123...",
  "code": "BSC-CSE",
  "name": "BSc in Computer Science and Engineering",
  "description": "Undergraduate computing program",
  "status": "ACTIVE",
  "archivedAt": null,
  "createdAt": "2026-04-26T16:00:00.000Z",
  "updatedAt": "2026-04-26T16:00:00.000Z"
}
```

### Create Course

```http
POST /api/v1/courses
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "academicProgramId": "cm_program_id",
  "code": "CSE101",
  "title": "Introduction to Programming",
  "creditHours": "3.00",
  "lectureHours": "3.00",
  "labHours": "0.00",
  "status": "ACTIVE"
}
```

### Create Enrollment

```http
POST /api/v1/enrollments
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "academicTermId": "cm_term_id",
  "courseOfferingId": "cm_offering_id",
  "studentUserId": "cm_student_id",
  "sourceType": "ADMIN",
  "status": "PENDING",
  "eligibilityStatus": "PENDING_REVIEW"
}
```

## Example Controller Protection

```ts
@Get(":id")
@UseGuards(AuthGuard, PolicyGuard)
@RequirePolicy(ACADEMIC_POLICY_NAMES.ENROLLMENT_READ)
getById(@Param() params: ResourceIdParamDto) {
  return this.academicService.getEnrollment(params.id);
}
```
