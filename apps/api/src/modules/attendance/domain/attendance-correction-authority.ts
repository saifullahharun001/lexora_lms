import type { PrincipalContext } from "@lexora/types";
import { isPermissionGrantFromLoadedRole, isRoleAssignmentInActiveDepartment } from "@/common/authorization/principal-authority";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

export const CORRECTION_MODES = {
  department_chairman: "DEPARTMENT_CHAIRMAN",
  department_admin: "DEPARTMENT_ADMIN",
  teacher: "ASSIGNED_TEACHER",
} as const;

/** Admission and provenance selection only. The transaction revalidates the exact persisted grant. */
export function correctionAuthorities(principal: PrincipalContext) {
  if (!principal.isAuthenticated || principal.actorType !== "user" || !principal.actorId ||
      !principal.activeDepartmentId || principal.roleAssignments.some((r) =>
        r.departmentId === principal.activeDepartmentId && r.role === "student")) return [];
  return Object.entries(CORRECTION_MODES).flatMap(([role, authorityKind]) =>
    principal.roleAssignments.filter((r) => r.role === role &&
      isRoleAssignmentInActiveDepartment(principal.activeDepartmentId, r)).flatMap((assignment) =>
      principal.permissions.filter((p) => p.id && p.rolePermissionId &&
        p.code === PERMISSIONS.ATTENDANCE.RECORD_CORRECT_DEPARTMENT &&
        p.resource === "attendance.record" && p.action === "correct" && p.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, p) && p.source.roleId === assignment.roleId &&
        p.source.userRoleId === assignment.userRoleId).map((p) => ({
          authorityKind, roleCode: assignment.role, userRoleId: assignment.userRoleId,
          roleId: assignment.roleId, permissionId: p.id!, rolePermissionId: p.rolePermissionId!,
        }))),
  );
}
