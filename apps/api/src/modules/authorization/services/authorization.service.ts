import type {
  PermissionGrant,
  PlatformRole,
  PrincipalContext
} from "@lexora/types";
import { Injectable } from "@nestjs/common";

import {
  isPermissionGrantFromLoadedRole,
  isRoleAssignmentInActiveDepartment
} from "@/common/authorization/principal-authority";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

const EXPLICIT_DEPARTMENT_ADMIN_PERMISSION_POLICIES = {
  [PERMISSIONS.COURSE_MANAGEMENT.SYLLABUS_BINDING_MANAGE]: {
    resource: "course-management.syllabus-binding",
    action: "manage",
    scope: "department"
  },
  [PERMISSIONS.COURSE_MANAGEMENT.STUDENT_BATCH_BINDING_MANAGE]: {
    resource: "course-management.student-batch-binding",
    action: "manage",
    scope: "department"
  },
  [PERMISSIONS.COURSE_MANAGEMENT.BATCH_COORDINATOR_ASSIGNMENT_MANAGE]: {
    resource: "course-management.batch-coordinator-assignment",
    action: "manage",
    scope: "department"
  }
} as const;

const STATIC_ROLE_POLICIES: Record<PlatformRole, string[]> = {
  department_admin: [
    "identity-access.*",
    "department-config.*",
    "course-management.*",
    "enrollment.*",
    "class-session.*",
    "attendance.*",
    "eligibility.*",
    "assignment.*",
    "submission.*",
    "quiz.*",
    "attempt.*",
    "result-processing.*",
    "transcript-verification.*",
    "notification.*",
    "notice.*",
    "audit-compliance.*",
    "file-storage.*",
    "reporting-dashboard.*",
    "system-configuration.*"
  ],
  teacher: [
    "course-management.course.read",
    "course-management.offering.read",
    "course-management.offering.manage",
    "course-management.course-outline.read",
    "course-management.course-outline.write",
    "course-management.course-outline.submit",
    "course-management.teacher-assignment.manage",
    "class-session.record.read",
    "class-session.record.create",
    "class-session.record.update",
    "class-session.record.cancel",
    "class-session.record.lock",
    "attendance.record.read",
    "attendance.record.capture",
    "attendance.import-batch.read",
    "eligibility.result.read",
    "assignment.record.read",
    "assignment.record.create",
    "assignment.record.update",
    "assignment.manage",
    "assignment.read",
    "assignment.submission.read",
    "assignment.submission.grade",
    "assignment.submission.regrade",
    "submission.read",
    "quiz.record.read",
    "quiz.record.create",
    "quiz.record.update",
    "quiz.manage",
    "quiz.read",
    "quiz.attempt.read",
    "quiz.attempt.grade",
    "attempt.read",
    "result-processing.result.draft.prepare",
    "result-processing.result.compute",
    "result-processing.result.read",
    "result-processing.grade-scale.read",
    "result-processing.gpa.read",
    "notification.notification.self-read",
    "notification.notification.event-trigger",
    "notification.preference.update",
    "notice.notice.read",
    "notice.notice.manage"
  ],
  student: [
    "user.read.self",
    "enrollment.record.self-request",
    "assignment.read",
    "assignment.submission.create",
    "assignment.submission.update",
    "submission.create",
    "submission.read",
    "quiz.read",
    "quiz.attempt.start",
    "quiz.attempt.submit",
    "attempt.create",
    "attempt.submit",
    "attempt.read",
    "attendance.record.read",
    "eligibility.result.read",
    "eligibility.result.self-read",
    "result-processing.result.read",
    "result-processing.gpa.read",
    "transcript-verification.transcript.read",
    "transcript-verification.version.read",
    "notification.notification.self-read",
    "notification.preference.update",
    "notification.push-subscription.self-manage",
    "notice.notice.self-read"
  ],
  auditor: [
    "audit-compliance.audit.read",
    "audit-compliance.audit.export",
    "audit-compliance.override.read",
    "notification.delivery.read"
  ],
  support: [
    "user.read.self",
    "notification.notification.read",
    "notification.delivery.read",
    "notification.notification-template.manage"
  ]
};

@Injectable()
export class AuthorizationService {
  private readonly principalPolicyCache = new Map<
    string,
    { expiresAt: number; policies: Set<string> }
  >();

  private readonly cacheTtlMs = 60_000;

  clearPrincipalCache(userId: string): void {
    for (const cacheKey of this.principalPolicyCache.keys()) {
      if (cacheKey.startsWith(`${userId}|`)) {
        this.principalPolicyCache.delete(cacheKey);
      }
    }
  }

  clearAllPolicyCache(): void {
    this.principalPolicyCache.clear();
  }

  resolvePolicies(principal: PrincipalContext): Set<string> {
    const roleIdentity = principal.roleAssignments
      .map((assignment) =>
        [
          assignment.departmentId,
          assignment.userRoleId,
          assignment.roleId,
          assignment.role
        ].join(":")
      )
      .sort();
    const permissionIdentity = principal.permissions
      .map((grant) =>
        [
          grant.source?.departmentId ?? "missing",
          grant.source?.userRoleId ?? "missing",
          grant.source?.roleId ?? "missing",
          grant.resource,
          grant.action,
          grant.scope
        ].join(":")
      )
      .sort();
    const cacheKey = [
      principal.actorId,
      principal.activeDepartmentId ?? "none",
      JSON.stringify(roleIdentity),
      JSON.stringify(permissionIdentity)
    ].join("|");

    const cached = this.principalPolicyCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.policies;
    }

    const policies = new Set<string>();

    for (const roleAssignment of principal.roleAssignments) {
      if (
        !isRoleAssignmentInActiveDepartment(
          principal.activeDepartmentId,
          roleAssignment
        )
      ) {
        continue;
      }
      for (const policy of STATIC_ROLE_POLICIES[roleAssignment.role] ?? []) {
        policies.add(policy);
      }
    }

    for (const permission of principal.permissions) {
      if (!isPermissionGrantFromLoadedRole(principal, permission)) {
        continue;
      }
      for (const derivedPolicy of this.derivePoliciesFromPermission(permission)) {
        policies.add(derivedPolicy);
      }
    }

    this.principalPolicyCache.set(cacheKey, {
      policies,
      expiresAt: Date.now() + this.cacheTtlMs
    });

    return policies;
  }

  isAllowed(principal: PrincipalContext, requiredPolicy: string): boolean {
    const explicitPermission =
      EXPLICIT_DEPARTMENT_ADMIN_PERMISSION_POLICIES[
        requiredPolicy as keyof typeof EXPLICIT_DEPARTMENT_ADMIN_PERMISSION_POLICIES
      ];

    if (explicitPermission) {
      return principal.permissions.some(
        (permission) =>
          permission.resource === explicitPermission.resource &&
          permission.action === explicitPermission.action &&
          permission.scope === explicitPermission.scope &&
          isPermissionGrantFromLoadedRole(principal, permission) &&
          principal.roleAssignments.some(
            (assignment) =>
              assignment.role === "department_admin" &&
              isRoleAssignmentInActiveDepartment(
                principal.activeDepartmentId,
                assignment
              ) &&
              assignment.userRoleId === permission.source?.userRoleId &&
              assignment.roleId === permission.source?.roleId
          )
      );
    }

    const resolvedPolicies = this.resolvePolicies(principal);

    if (resolvedPolicies.has("*") || resolvedPolicies.has(requiredPolicy)) {
      return true;
    }

    return Array.from(resolvedPolicies).some((candidate) => {
      if (candidate.endsWith(".*")) {
        const prefix = candidate.slice(0, -2);
        return requiredPolicy === prefix || requiredPolicy.startsWith(`${prefix}.`);
      }

      return requiredPolicy.startsWith(`${candidate}.`);
    });
  }

  private derivePoliciesFromPermission(permission: PermissionGrant): string[] {
    const resourceSegments = permission.resource.split(".");
    const shortResource = resourceSegments[resourceSegments.length - 1] ?? permission.resource;
    const normalizedAction = permission.action.replaceAll("_", ".");

    const derived = new Set<string>([
      `${permission.resource}.${normalizedAction}`,
      `${shortResource}.${normalizedAction}`
    ]);

    const actionParts = normalizedAction.split(".");

    if (actionParts.length > 1) {
      derived.add(`${shortResource}.${actionParts[0]}`);
      derived.add(`${permission.resource}.${actionParts[0]}`);
    }

    if (permission.scope === "self") {
      derived.add(`${shortResource}.read.self`);
    }

    if (permission.scope === "department") {
      derived.add(`${shortResource}.read.department`);
    }

    return Array.from(derived);
  }
}
