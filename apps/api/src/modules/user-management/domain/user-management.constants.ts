export const MANAGED_USER_ROLE_CODES = ["student", "teacher"] as const;

export type ManagedUserRoleCode = (typeof MANAGED_USER_ROLE_CODES)[number];

export function isManagedUserRoleCode(
  value: unknown
): value is ManagedUserRoleCode {
  return (
    typeof value === "string" &&
    MANAGED_USER_ROLE_CODES.includes(value as ManagedUserRoleCode)
  );
}
