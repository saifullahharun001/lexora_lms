import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionGrant, PlatformRole, PrincipalContext } from "@lexora/types";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { PLATFORM_ROLES, PRIVILEGED_PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";
import { correctionAuthorities } from "./attendance-correction-authority";

export function correctionPrincipal(role: PlatformRole = "teacher"): PrincipalContext {
  return { actorId: "actor", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
    roleAssignments: [{ departmentId: "law", role, userRoleId: "ur", roleId: "role" }],
    permissions: [{ id: "permission", code: "attendance.record.correct_department", rolePermissionId: "rp",
      resource: "attendance.record", action: "correct", scope: "department",
      source: { departmentId: "law", userRoleId: "ur", roleId: "role" } }] };
}
const authorization = new AuthorizationService();
test("Department Chairman has its own privileged role and only ordinary Attendance read policy", () => {
  assert.equal(PLATFORM_ROLES.DEPARTMENT_CHAIRMAN, "department_chairman");
  assert.ok(PRIVILEGED_PLATFORM_ROLES.includes(PLATFORM_ROLES.DEPARTMENT_CHAIRMAN));
  const p = correctionPrincipal("department_chairman"); p.permissions = [];
  assert.equal(authorization.isAllowed(p, "attendance.record.read"), true);
  for (const policy of ["attendance.record.correct", "attendance.record.capture", "attendance.record.override",
    "attendance.import-batch.create", "class-session.record.create", "attendance.formative.coordinate",
    "course-management.course-outline.approve", "summative-examination.chairman-approval.approve",
    "summative-examination.examiner-marks.enter", "comprehensive-examination.workspace.read", "result-processing.result.publish"]) {
    assert.equal(authorization.isAllowed(p, policy), false, policy);
  }
  p.activeDepartmentId = "other";
  assert.equal(authorization.isAllowed(p, "attendance.record.read"), false);
});
for (const role of ["teacher", "department_chairman", "department_admin"] as const) {
  test(`${role} correction requires its own exact persisted grant, never wildcard admission`, () => {
    const p = correctionPrincipal(role);
    assert.equal(authorization.isAllowed(p, "attendance.record.correct"), true);
    assert.equal(correctionAuthorities(p)[0]?.roleCode, role);
    const exact = p.permissions[0]!;
    p.permissions = []; assert.equal(authorization.isAllowed(p, "attendance.record.correct"), false);
    for (const patch of [{ resource: "*", action: "*" }, { resource: "attendance", action: "*" },
      { id: undefined }, { code: undefined }, { rolePermissionId: undefined }, { code: "unrelated" },
      { resource: "unrelated" }, { action: "read" }, { scope: "self" },
      { source: { ...exact.source, departmentId: "other" } }, { source: { ...exact.source, roleId: "other" } },
      { source: { ...exact.source, userRoleId: "revoked-or-unloaded" } }] as Partial<PermissionGrant>[]) {
      p.permissions = [{ ...exact, ...patch }];
      assert.equal(authorization.isAllowed(p, "attendance.record.correct"), false, JSON.stringify(patch));
    }
    p.permissions = [exact]; p.activeDepartmentId = "other";
    assert.equal(authorization.isAllowed(p, "attendance.record.correct"), false);
  });
}
test("unrelated-role grant cannot be borrowed, and Student collision always denies", () => {
  const p = correctionPrincipal("support");
  p.roleAssignments.push({ departmentId: "law", role: "department_chairman", roleId: "chair", userRoleId: "chair-ur" });
  assert.equal(authorization.isAllowed(p, "attendance.record.correct"), false);
  for (const role of ["student", "poe_chairman", "comprehensive_external", "auditor", "support"] as const)
    assert.equal(authorization.isAllowed(correctionPrincipal(role), "attendance.record.correct"), false);
  const mixed = correctionPrincipal(); mixed.roleAssignments.push({ departmentId: "law", role: "student", roleId: "student", userRoleId: "student-ur" });
  assert.equal(authorization.isAllowed(mixed, "attendance.record.correct"), false);
});

test("mixed Teacher and Chairman roles use only a mode carrying its own exact grant", () => {
  const p = correctionPrincipal();
  p.roleAssignments.push({ departmentId: "law", role: "department_chairman", roleId: "chair", userRoleId: "chair-ur" });
  assert.deepEqual(correctionAuthorities(p).map((a) => a.authorityKind), ["ASSIGNED_TEACHER"]);
  p.permissions.push({ ...p.permissions[0]!, rolePermissionId: "chair-rp",
    source: { departmentId: "law", roleId: "chair", userRoleId: "chair-ur" } });
  assert.equal(correctionAuthorities(p)[0]?.authorityKind, "DEPARTMENT_CHAIRMAN");
  assert.equal(correctionAuthorities(p)[0]?.userRoleId, "chair-ur");
  assert.equal(correctionAuthorities(p)[0]?.rolePermissionId, "chair-rp");
});
