import assert from "node:assert/strict";
import test from "node:test";

import { RequestMethod, UnauthorizedException } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { REQUIRE_POLICY_KEY } from "@/modules/authorization/domain/authorization.constants";
import { AuthGuard } from "@/modules/authorization/guards/auth.guard";
import { PolicyGuard } from "@/modules/authorization/guards/policy.guard";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";

import { ACADEMIC_POLICY_NAMES } from "../../domain/academic.policy-names";
import { CourseOfferingsController } from "./course-offerings.controller";

test("curriculum binding endpoint requires AuthGuard, PolicyGuard, and dedicated policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CourseOfferingsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindCurriculum,
    ),
    ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
  );
});

test("syllabus binding is a guarded PUT route with its exact dedicated policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CourseOfferingsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      CourseOfferingsController.prototype.bindSyllabus,
    ),
    ":id/syllabus-binding",
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      CourseOfferingsController.prototype.bindSyllabus,
    ),
    RequestMethod.PUT,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindSyllabus,
    ),
    ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindCurriculum,
    ),
    ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
  );
});

test("syllabus binding route forwards only the dedicated DTO target", async () => {
  const calls: unknown[] = [];
  const controller = new CourseOfferingsController({
    bindCourseOfferingSyllabus: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "offering-a", syllabusVersionId: "syllabus-a" };
    },
  } as never);

  assert.deepEqual(
    await controller.bindSyllabus(
      { id: "offering-a" },
      { syllabusVersionId: "syllabus-a" },
    ),
    { id: "offering-a", syllabusVersionId: "syllabus-a" },
  );
  assert.deepEqual(calls, [["offering-a", "syllabus-a"]]);
});

test("StudentBatch binding is a guarded PUT route with its exact dedicated policy", () => {
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, CourseOfferingsController),
    [AuthGuard, PolicyGuard],
  );
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      CourseOfferingsController.prototype.bindStudentBatch,
    ),
    ":id/student-batch-binding",
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      CourseOfferingsController.prototype.bindStudentBatch,
    ),
    RequestMethod.PUT,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.bindStudentBatch,
    ),
    ACADEMIC_POLICY_NAMES.STUDENT_BATCH_BINDING_MANAGE,
  );
});

test("StudentBatch binding route forwards only the dedicated DTO target", async () => {
  const calls: unknown[] = [];
  const controller = new CourseOfferingsController({
    bindCourseOfferingStudentBatch: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "offering-a", studentBatchId: "batch-a" };
    },
  } as never);

  assert.deepEqual(
    await controller.bindStudentBatch(
      { id: "offering-a" },
      { studentBatchId: "batch-a" },
    ),
    { id: "offering-a", studentBatchId: "batch-a" },
  );
  assert.deepEqual(calls, [["offering-a", "batch-a"]]);
});

test("bound syllabus read is a guarded GET using offering read policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CourseOfferingsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      CourseOfferingsController.prototype.getSyllabus,
    ),
    ":id/syllabus",
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      CourseOfferingsController.prototype.getSyllabus,
    ),
    RequestMethod.GET,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.getSyllabus,
    ),
    ACADEMIC_POLICY_NAMES.OFFERING_READ,
  );
});

test("bound syllabus read accepts only params and forwards only offering id", async () => {
  const calls: unknown[] = [];
  const controller = new CourseOfferingsController({
    getCourseOfferingSyllabus: async (...args: unknown[]) => {
      calls.push(args);
      return { id: "syllabus-a" };
    },
  } as never);

  assert.equal(CourseOfferingsController.prototype.getSyllabus.length, 1);
  assert.deepEqual(
    await controller.getSyllabus({
      id: "offering-a",
      syllabusVersionId: "attacker-syllabus",
    } as never),
    { id: "syllabus-a" },
  );
  assert.deepEqual(calls, [["offering-a"]]);
});

test("learning-outcomes read is a guarded GET using offering read policy", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    CourseOfferingsController,
  ) as unknown[];
  assert.deepEqual(guards, [AuthGuard, PolicyGuard]);
  assert.equal(
    Reflect.getMetadata(
      PATH_METADATA,
      CourseOfferingsController.prototype.getLearningOutcomes,
    ),
    ":id/learning-outcomes",
  );
  assert.equal(
    Reflect.getMetadata(
      METHOD_METADATA,
      CourseOfferingsController.prototype.getLearningOutcomes,
    ),
    RequestMethod.GET,
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRE_POLICY_KEY,
      CourseOfferingsController.prototype.getLearningOutcomes,
    ),
    ACADEMIC_POLICY_NAMES.OFFERING_READ,
  );
});

test("learning-outcomes read accepts only params and forwards only offering id", async () => {
  const calls: unknown[] = [];
  const controller = new CourseOfferingsController({
    getCourseOfferingLearningOutcomes: async (...args: unknown[]) => {
      calls.push(args);
      return { courseOfferingId: "offering-a" };
    },
  } as never);

  assert.equal(
    CourseOfferingsController.prototype.getLearningOutcomes.length,
    1,
  );
  assert.deepEqual(
    await controller.getLearningOutcomes({
      id: "offering-a",
      departmentId: "attacker-department",
      curriculumVersionId: "attacker-version",
      curriculumCourseId: "attacker-course",
      syllabusVersionId: "attacker-syllabus",
      courseLearningOutcomeId: "attacker-clo",
      programLearningOutcomeId: "attacker-plo",
    } as never),
    { courseOfferingId: "offering-a" },
  );
  assert.deepEqual(calls, [["offering-a"]]);
});

test("unauthenticated requests are rejected by AuthGuard", async () => {
  const guard = new AuthGuard({} as never, {} as never, {} as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  };
  await assert.rejects(
    guard.canActivate(context as never),
    UnauthorizedException,
  );
});

test("Department Admin wildcard permits binding but Teacher offering.manage does not", () => {
  const authorization = new AuthorizationService();
  const principal = (role: "department_admin" | "teacher" | "student") =>
    ({
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId: `${role}-assignment-a`,
          roleId: `${role}-role-a`,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: [],
    }) as never;

  assert.equal(
    authorization.isAllowed(
      principal("department_admin"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.OFFERING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
    ),
    false,
  );
  assert.equal(
    authorization.isAllowed(
      principal("student"),
      ACADEMIC_POLICY_NAMES.CURRICULUM_BINDING_MANAGE,
    ),
    false,
  );
});

test("syllabus binding requires exact Department Admin permission provenance", () => {
  const authorization = new AuthorizationService();
  const principal = (
    role: "department_admin" | "teacher" | "student",
    withPermission: boolean,
  ) => {
    const userRoleId = `${role}-assignment-a`;
    const roleId = `${role}-role-a`;
    return {
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId,
          roleId,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: withPermission
        ? [
            {
              resource: "course-management.syllabus-binding",
              action: "manage",
              scope: "department",
              source: {
                departmentId: "department-a",
                userRoleId,
                roleId,
              },
            },
          ]
        : [],
    } as never;
  };

  assert.equal(
    authorization.isAllowed(
      principal("department_admin", true),
      ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("department_admin", false),
      ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
    ),
    false,
  );
  for (const role of ["teacher", "student"] as const) {
    assert.equal(
      authorization.isAllowed(
        principal(role, true),
        ACADEMIC_POLICY_NAMES.SYLLABUS_BINDING_MANAGE,
      ),
      false,
    );
  }
});

test("StudentBatch binding requires exact Department Admin permission provenance", () => {
  const authorization = new AuthorizationService();
  const principal = (
    role: "department_admin" | "teacher" | "student",
    withPermission: boolean,
  ) => {
    const userRoleId = `${role}-assignment-a`;
    const roleId = `${role}-role-a`;
    return {
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        { userRoleId, roleId, departmentId: "department-a", role },
      ],
      permissions: withPermission
        ? [
            {
              resource: "course-management.student-batch-binding",
              action: "manage",
              scope: "department",
              source: {
                departmentId: "department-a",
                userRoleId,
                roleId,
              },
            },
          ]
        : [],
    } as never;
  };

  assert.equal(
    authorization.isAllowed(
      principal("department_admin", true),
      ACADEMIC_POLICY_NAMES.STUDENT_BATCH_BINDING_MANAGE,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("department_admin", false),
      ACADEMIC_POLICY_NAMES.STUDENT_BATCH_BINDING_MANAGE,
    ),
    false,
  );
  for (const role of ["teacher", "student"] as const) {
    assert.equal(
      authorization.isAllowed(
        principal(role, true),
        ACADEMIC_POLICY_NAMES.STUDENT_BATCH_BINDING_MANAGE,
      ),
      false,
    );
  }
});

test("offering read permits Teacher but does not grant Student broad access", () => {
  const authorization = new AuthorizationService();
  const principal = (role: "teacher" | "student") =>
    ({
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId: `${role}-assignment-a`,
          roleId: `${role}-role-a`,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: [],
    }) as never;

  assert.equal(
    authorization.isAllowed(
      principal("teacher"),
      ACADEMIC_POLICY_NAMES.OFFERING_READ,
    ),
    true,
  );
  assert.equal(
    authorization.isAllowed(
      principal("student"),
      ACADEMIC_POLICY_NAMES.OFFERING_READ,
    ),
    false,
  );
});

test("Course Outline endpoints are nested, guarded, and use dedicated read/write/submit policies", () => {
  const cases = [
    [
      "createCourseOutlineVersion",
      ":id/course-outline-versions",
      RequestMethod.POST,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_WRITE,
    ],
    [
      "listCourseOutlineVersions",
      ":id/course-outline-versions",
      RequestMethod.GET,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_READ,
    ],
    [
      "getCourseOutlineVersion",
      ":id/course-outline-versions/:courseOutlineVersionId",
      RequestMethod.GET,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_READ,
    ],
    [
      "updateCourseOutlineVersion",
      ":id/course-outline-versions/:courseOutlineVersionId",
      RequestMethod.PATCH,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_WRITE,
    ],
    [
      "submitCourseOutlineVersion",
      ":id/course-outline-versions/:courseOutlineVersionId/submit",
      RequestMethod.POST,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_SUBMIT,
    ],
    [
      "startCourseOutlineCoordinatorReview",
      ":id/course-outline-versions/:courseOutlineVersionId/coordinator-review",
      RequestMethod.POST,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_COORDINATOR_REVIEW,
    ],
    [
      "returnCourseOutlineForCorrection",
      ":id/course-outline-versions/:courseOutlineVersionId/return-for-correction",
      RequestMethod.POST,
      ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_RETURN_FOR_CORRECTION,
    ],
  ] as const;

  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, CourseOfferingsController),
    [AuthGuard, PolicyGuard],
  );
  for (const [method, path, requestMethod, policy] of cases) {
    const handler = CourseOfferingsController.prototype[method];
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), requestMethod);
    assert.equal(Reflect.getMetadata(REQUIRE_POLICY_KEY, handler), policy);
  }
});

test("Course Outline routes forward only nested identities and whitelisted DTO data", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = Object.fromEntries(
    [
      "createCourseOutlineVersion",
      "listCourseOutlineVersions",
      "getCourseOutlineVersion",
      "updateCourseOutlineVersion",
      "submitCourseOutlineVersion",
      "startCourseOutlineCoordinatorReview",
      "returnCourseOutlineForCorrection",
    ].map((method) => [
      method,
      async (...args: unknown[]) => {
        calls.push({ method, args });
        return method;
      },
    ]),
  );
  const controller = new CourseOfferingsController(service as never);
  const createBody = { courseSummary: "Summary" };
  const updateBody = { deliveryPlan: "Plan" };

  await controller.createCourseOutlineVersion({ id: "offering-a" }, createBody);
  await controller.listCourseOutlineVersions({ id: "offering-a" });
  await controller.getCourseOutlineVersion({
    id: "offering-a",
    courseOutlineVersionId: "outline-a",
  });
  await controller.updateCourseOutlineVersion(
    { id: "offering-a", courseOutlineVersionId: "outline-a" },
    updateBody,
  );
  assert.equal(
    CourseOfferingsController.prototype.submitCourseOutlineVersion.length,
    1,
  );
  await controller.submitCourseOutlineVersion({
    id: "offering-a",
    courseOutlineVersionId: "outline-a",
    status: "APPROVED",
    submittedAt: "attacker-controlled",
  } as never);
  assert.equal(
    CourseOfferingsController.prototype.startCourseOutlineCoordinatorReview
      .length,
    1,
  );
  await controller.startCourseOutlineCoordinatorReview({
    id: "offering-a",
    courseOutlineVersionId: "outline-a",
    studentBatchId: "attacker-batch",
    academicTermId: "attacker-term",
    batchCoordinatorAssignmentId: "attacker-assignment",
    status: "APPROVED",
  } as never);
  assert.equal(
    CourseOfferingsController.prototype.returnCourseOutlineForCorrection.length,
    2,
  );
  await controller.returnCourseOutlineForCorrection(
    {
      id: "offering-a",
      courseOutlineVersionId: "outline-a",
      status: "APPROVED",
    } as never,
    { reason: "Needs more info", status: "APPROVED" } as never,
  );

  assert.deepEqual(calls, [
    {
      method: "createCourseOutlineVersion",
      args: ["offering-a", createBody],
    },
    { method: "listCourseOutlineVersions", args: ["offering-a"] },
    {
      method: "getCourseOutlineVersion",
      args: ["offering-a", "outline-a"],
    },
    {
      method: "updateCourseOutlineVersion",
      args: ["offering-a", "outline-a", updateBody],
    },
    {
      method: "submitCourseOutlineVersion",
      args: ["offering-a", "outline-a"],
    },
    {
      method: "startCourseOutlineCoordinatorReview",
      args: ["offering-a", "outline-a"],
    },
    {
      method: "returnCourseOutlineForCorrection",
      args: ["offering-a", "outline-a", "Needs more info"],
    },
  ]);
});

test("dedicated Course Outline policies admit Teacher and Department Admin but deny Student and unsupported roles", () => {
  const authorization = new AuthorizationService();
  const principal = (
    role: "department_admin" | "teacher" | "student" | "auditor" | "support",
  ) =>
    ({
      actorId: `${role}-a`,
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId: `${role}-assignment-a`,
          roleId: `${role}-role-a`,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: [],
    }) as never;

  for (const policy of [
    ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_READ,
    ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_WRITE,
    ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_SUBMIT,
    ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_COORDINATOR_REVIEW,
    ACADEMIC_POLICY_NAMES.COURSE_OUTLINE_RETURN_FOR_CORRECTION,
  ]) {
    assert.equal(authorization.isAllowed(principal("teacher"), policy), true);
    assert.equal(
      authorization.isAllowed(principal("department_admin"), policy),
      true,
    );
    for (const role of ["student", "auditor", "support"] as const) {
      assert.equal(authorization.isAllowed(principal(role), policy), false);
    }
  }
});
