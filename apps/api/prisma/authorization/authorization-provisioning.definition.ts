import { PermissionScope } from "@prisma/client";

import { PERMISSIONS } from "../../src/modules/identity-access/authorization/permissions.constants";
import { PLATFORM_ROLES } from "../../src/modules/identity-access/authorization/roles.constants";

/**
 * Permission codes are stable operational identities. The semantic authority is
 * still represented and collision-checked by resource, action, and scope.
 */
export const SYLLABUS_VERSION_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.COURSE_MANAGEMENT.SYLLABUS_VERSION_MANAGE,
    resource: "course-management.syllabus-version",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage syllabus versions within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.syllabus-version-manage.provisioned",
} as const;

export const SYLLABUS_VERSION_LIFECYCLE_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.COURSE_MANAGEMENT.SYLLABUS_VERSION_LIFECYCLE_MANAGE,
    resource: "course-management.syllabus-version.lifecycle",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage syllabus version lifecycle transitions within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.syllabus-version-lifecycle-manage.provisioned",
} as const;

export const SYLLABUS_BINDING_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.COURSE_MANAGEMENT.SYLLABUS_BINDING_MANAGE,
    resource: "course-management.syllabus-binding",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage syllabus bindings within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.syllabus-binding-manage.provisioned",
} as const;

export const STUDENT_BATCH_BINDING_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.COURSE_MANAGEMENT.STUDENT_BATCH_BINDING_MANAGE,
    resource: "course-management.student-batch-binding",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage CourseOffering to StudentBatch bindings within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.student-batch-binding-manage.provisioned",
} as const;

export const BATCH_COORDINATOR_ASSIGNMENT_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.COURSE_MANAGEMENT.BATCH_COORDINATOR_ASSIGNMENT_MANAGE,
    resource: "course-management.batch-coordinator-assignment",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage Batch Coordinator assignments within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.batch-coordinator-assignment-manage.provisioned",
} as const;

export const SUMMATIVE_EXAMINATION_SETUP_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.SETUP_MANAGE_DEPARTMENT,
    resource: "summative-examination.setup",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage summative examination setup within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.summative-examination-setup-manage.provisioned",
} as const;

export const SUMMATIVE_EXAMINATION_COMMITTEE_MANAGE_PROVISIONING = {
  permission: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.COMMITTEE_MANAGE_DEPARTMENT,
    resource: "summative-examination.committee",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage summative examination committees within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction: "authorization.summative-examination-committee-manage.provisioned",
} as const;

export const SUMMATIVE_EXAMINATION_EXAMINER_ASSIGNMENT_MANAGE_PROVISIONING = {
  permission: {
    code:
      PERMISSIONS.SUMMATIVE_EXAMINATION.EXAMINER_ASSIGNMENT_MANAGE_DEPARTMENT,
    resource: "summative-examination.examiner-assignment",
    action: "manage",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Manage First and Second Examiner assignments within the active department governance scope",
  },
  targetRoleCode: PLATFORM_ROLES.DEPARTMENT_ADMIN,
  auditAction:
    "authorization.summative-examination-examiner-assignment-manage.provisioned",
} as const;

export const SUMMATIVE_EXAMINATION_EXAMINER_MARKS_ENTER_PROVISIONING = {
  permission: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.EXAMINER_MARKS_ENTER_DEPARTMENT,
    resource: "summative-examination.examiner-marks",
    action: "enter",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Enter only the authenticated First or Second Examiner's own blind marks within an explicit active assignment",
  },
  targetRoleCode: PLATFORM_ROLES.TEACHER,
  auditAction:
    "authorization.summative-examination-examiner-marks-enter.provisioned",
} as const;

export const SUMMATIVE_EXAMINATION_MEMBER_REVIEW_PROVISIONING = {
  permission: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.MEMBER_REVIEW_DEPARTMENT,
    resource: "summative-examination.member-review",
    action: "review",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Review exact calculated Summative evidence only through an active MEMBER_1 or MEMBER_2 Committee appointment",
  },
  targetRoleCode: PLATFORM_ROLES.TEACHER,
  auditAction:
    "authorization.summative-examination-member-review.provisioned",
} as const;

export const SUMMATIVE_EXAMINATION_CHAIRMAN_APPROVAL_PROVISIONING = {
  permission: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.CHAIRMAN_APPROVAL_DEPARTMENT,
    resource: "summative-examination.chairman-approval",
    action: "approve",
    scope: PermissionScope.DEPARTMENT,
    description:
      "Approve and final-lock exact calculated Summative evidence only through the active Chairman Committee appointment",
  },
  targetRoleCode: PLATFORM_ROLES.TEACHER,
  auditAction:
    "authorization.summative-examination-chairman-approval.provisioned",
} as const;

export const AUTHORIZATION_PROVISIONING_DEFINITIONS = [
  SYLLABUS_VERSION_MANAGE_PROVISIONING,
  SYLLABUS_VERSION_LIFECYCLE_MANAGE_PROVISIONING,
  SYLLABUS_BINDING_MANAGE_PROVISIONING,
  STUDENT_BATCH_BINDING_MANAGE_PROVISIONING,
  BATCH_COORDINATOR_ASSIGNMENT_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_SETUP_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_COMMITTEE_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_EXAMINER_ASSIGNMENT_MANAGE_PROVISIONING,
  SUMMATIVE_EXAMINATION_EXAMINER_MARKS_ENTER_PROVISIONING,
  SUMMATIVE_EXAMINATION_MEMBER_REVIEW_PROVISIONING,
  SUMMATIVE_EXAMINATION_CHAIRMAN_APPROVAL_PROVISIONING,
] as const;

export type AuthorizationProvisioningDefinition =
  (typeof AUTHORIZATION_PROVISIONING_DEFINITIONS)[number];
