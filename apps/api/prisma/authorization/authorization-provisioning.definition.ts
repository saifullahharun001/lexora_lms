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

export const AUTHORIZATION_PROVISIONING_DEFINITIONS = [
  SYLLABUS_VERSION_MANAGE_PROVISIONING,
  SYLLABUS_VERSION_LIFECYCLE_MANAGE_PROVISIONING,
  SYLLABUS_BINDING_MANAGE_PROVISIONING,
  STUDENT_BATCH_BINDING_MANAGE_PROVISIONING,
] as const;

export type AuthorizationProvisioningDefinition =
  (typeof AUTHORIZATION_PROVISIONING_DEFINITIONS)[number];
