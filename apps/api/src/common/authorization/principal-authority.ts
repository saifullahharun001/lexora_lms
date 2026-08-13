import type {
  PermissionGrant,
  PrincipalContext,
  RoleAssignment
} from "@lexora/types";

type PrincipalAuthorityContext = Pick<
  PrincipalContext,
  "activeDepartmentId" | "roleAssignments"
>;

export function isRoleAssignmentInActiveDepartment(
  activeDepartmentId: string | null,
  assignment: RoleAssignment
): boolean {
  return Boolean(
    activeDepartmentId &&
      assignment.departmentId === activeDepartmentId &&
      assignment.userRoleId &&
      assignment.roleId
  );
}

export function isPermissionGrantFromLoadedRole(
  principal: PrincipalAuthorityContext,
  grant: PermissionGrant
): boolean {
  const source = grant.source;

  if (
    !principal.activeDepartmentId ||
    !source ||
    source.departmentId !== principal.activeDepartmentId ||
    !source.userRoleId ||
    !source.roleId
  ) {
    return false;
  }

  return principal.roleAssignments.some(
    (assignment) =>
      isRoleAssignmentInActiveDepartment(
        principal.activeDepartmentId,
        assignment
      ) &&
      assignment.departmentId === source.departmentId &&
      assignment.userRoleId === source.userRoleId &&
      assignment.roleId === source.roleId
  );
}
