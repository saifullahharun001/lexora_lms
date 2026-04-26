import { Injectable } from "@nestjs/common";

import type {
  PermissionGrant,
  PlatformRole,
  PrincipalContext
} from "@lexora/types";

const STATIC_ROLE_POLICIES: Record<PlatformRole, string[]> = {
  department_admin: [
    "identity-access.*",
    "department-config.*",
    "course-management.*",
    "enrollment.*",
    "attendance.*",
    "assignment.*",
    "quiz.*",
    "result-processing.*",
    "transcript-verification.*",
    "notification.*",
    "audit-compliance.*",
    "file-storage.*",
    "reporting-dashboard.*",
    "system-configuration.*"
  ],
  teacher: [
    "course-management.course.read",
    "course-management.offering.read",
    "course-management.offering.manage",
    "course-management.teacher-assignment.manage",
    "attendance.record.read",
    "attendance.record.capture",
    "attendance.import-batch.read",
    "assignment.record.read",
    "assignment.record.create",
    "assignment.record.update",
    "assignment.submission.read",
    "assignment.submission.grade",
    "assignment.submission.regrade",
    "quiz.record.read",
    "quiz.record.create",
    "quiz.record.update",
    "quiz.attempt.read",
    "quiz.attempt.grade",
    "result-processing.result.draft.prepare",
    "result-processing.result.compute",
    "notification.notification.self-read",
    "notification.notification.event-trigger"
  ],
  student: [
    "user.read.self",
    "enrollment.record.self-request",
    "assignment.submission.create",
    "assignment.submission.update",
    "quiz.attempt.start",
    "quiz.attempt.submit",
    "result-processing.result.read",
    "transcript-verification.transcript.self-read",
    "notification.notification.self-read",
    "notification.preference.update",
    "notification.push-subscription.self-manage"
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
    const cacheKey = [
      principal.actorId,
      principal.activeDepartmentId ?? "none",
      principal.roleAssignments.map((assignment) => assignment.role).sort().join(","),
      principal.permissions
        .map((grant) => `${grant.resource}.${grant.action}.${grant.scope}`)
        .sort()
        .join(",")
    ].join("|");

    const cached = this.principalPolicyCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.policies;
    }

    const policies = new Set<string>();

    for (const roleAssignment of principal.roleAssignments) {
      for (const policy of STATIC_ROLE_POLICIES[roleAssignment.role] ?? []) {
        policies.add(policy);
      }
    }

    for (const permission of principal.permissions) {
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
