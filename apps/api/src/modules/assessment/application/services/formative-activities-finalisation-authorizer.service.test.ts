import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrincipalContext } from "@lexora/types";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { FormativeActivitiesFinalisationAuthorizerService } from "./formative-activities-finalisation-authorizer.service";

export function generationPrincipal(): PrincipalContext {
  const grant = { id: "permission", code: "formative.activities.finalise_department", rolePermissionId: "rp",
    resource: "formative.activities", action: "finalise", scope: "department" as const,
    source: { userRoleId: "ur", roleId: "role", departmentId: "law", rolePermissionId: "rp", permissionId: "permission" } };
  return { actorId: "chairman", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
    roleAssignments: [{ userRoleId: "ur", roleId: "role", role: "teacher", departmentId: "law" }],
    permissions: [grant] };
}
function harness(principal = generationPrincipal(), result: any = { id: "exam", committees: [{ id: "committee",
  assignments: [{ id: "appointment", seat: "CHAIRMAN", assignedAt: new Date("2026-09-01") }] }] }) {
  const queries: any[] = [];
  return { queries, service: new FormativeActivitiesFinalisationAuthorizerService({ examinationCourse: { findFirst: async (q: any) => {
    assert.equal(q.where.departmentId, principal.activeDepartmentId);
    return result ? { id: "ec", examinationId: "exam", courseOfferingId: "offering" } : null;
  } }, examination: {
    findFirst: async (q: unknown) => { queries.push(q); return result; },
  } } as never, { get: () => ({ principal, departmentId: "forged" }) } as never) };
}
test("exact Chairman authority is server resolved in principal department without other seats", async () => {
  const h = harness(); const authority = await h.service.authorize("exam");
  assert.equal(authority.departmentId, "law"); assert.equal(authority.committeeAssignmentId, "appointment");
  assert.equal(authority.userRoleId, "ur"); assert.equal(authority.seat, "CHAIRMAN");
  assert.equal(h.queries[0].where.departmentId, "law");
  const where = h.queries[0].select.committees.select.assignments.where;
  assert.deepEqual(where.seat, { in: ["CHAIRMAN"] });
  assert.equal(where.status, "ACTIVE"); assert.equal(where.unassignedAt, null); assert.equal(where.archivedAt, null);
  assert.ok(where.assignedAt.lte instanceof Date); assert.ok(where.OR[1].expiresAt.gt instanceof Date);
  assert.equal(where.assignedUser.userRoles.some.role.rolePermissions.some.permission.is.code, "formative.activities.finalise_department");
  assert.equal(where.assignedUser.userRoles.some.role.rolePermissions.some.id, "rp");
  assert.equal(where.assignedUser.userRoles.some.role.rolePermissions.some.permissionId, "permission");
});

test("generation admission rejects semantic aliases and grants without persisted identities", async () => {
  for (const change of [
    { code: "formative.activities.semantic_alias" }, { code: "attendance.*" }, { code: undefined },
    { id: undefined }, { rolePermissionId: undefined },
  ]) {
    const principal = generationPrincipal();
    Object.assign(principal.permissions[0]!, change);
    const h = harness(principal);
    await assert.rejects(h.service.authorize("exam"), ForbiddenException);
    assert.equal(h.queries.length, 0);
  }
});
test("admission rejects unauthenticated, wrong department, missing permission, role-only and wildcards", async () => {
  const variants: PrincipalContext[] = [];
  let p = generationPrincipal(); p.isAuthenticated = false; variants.push(p);
  p = generationPrincipal(); p.activeDepartmentId = null; variants.push(p);
  p = generationPrincipal(); p.permissions = []; variants.push(p);
  p = generationPrincipal(); p.permissions[0]!.source.departmentId = "other"; variants.push(p);
  for (const role of ["student", "department_admin", "department_chairman", "auditor", "support"] as const) {
    p = generationPrincipal(); p.roleAssignments[0]!.role = role; variants.push(p);
  }
  for (const resource of ["attendance", "*"]) {
    p = generationPrincipal(); p.permissions[0]!.resource = resource; p.permissions[0]!.action = "*"; variants.push(p);
  }
  for (const invalid of variants) {
    await assert.rejects(harness(invalid).service.authorize("exam"), ForbiddenException);
    assert.equal(new AuthorizationService().isAllowed(invalid, "formative.activities.finalise"), false);
  }
  assert.equal(new AuthorizationService().isAllowed(generationPrincipal(), "formative.activities.finalise"), true);
});
test("cross-department/missing Examination is safely not found; absent or wrong seat appointment denied", async () => {
  await assert.rejects(harness(generationPrincipal(), null).service.authorize("other-exam"), NotFoundException);
  for (const committees of [[], [{ id: "c", assignments: [] }], [{ id: "c", assignments: [{ seat: "MEMBER_1" }] }]]) {
    await assert.rejects(harness(generationPrincipal(), { id: "exam", committees }).service.authorize("exam"), ForbiddenException);
  }
});
test("transactional revalidation locks exact live role, grant, user and appointment, rejecting replacement", async () => {
  const h = harness(); const authority = await h.service.authorize("exam");
  let query: any;
  await h.service.assertCurrentAuthority({ $queryRaw: async (q: any) => { query = q; return [{ id: "appointment" }]; } } as never, authority, new Date());
  for (const check of ['"assigned_at" =', '"expires_at" >', '"revoked_at" IS NULL', '"external_member_name" IS NULL',
    '"deleted_at" IS NULL', 'FOR UPDATE OF', 'FOR SHARE OF']) assert.ok(query.sql.includes(check), check);
  assert.ok(query.values.includes("formative.activities.finalise_department"));
  assert.ok(query.values.includes("appointment")); assert.ok(query.values.includes("ur"));
  await assert.rejects(h.service.assertCurrentAuthority({ $queryRaw: async () => [] } as never, authority, new Date()), ForbiddenException);
});

test("workspace revalidates identical exact authority predicates without acquiring row locks", async () => {
  const h = harness(); const authority = await h.service.authorize("ec");
  const queries: any[] = []; const at = new Date();
  const tx = { $queryRaw: async (query: unknown) => { queries.push(query); return [{ id: "appointment" }]; } };
  await h.service.assertCurrentAuthority(tx as never, authority, at);
  await h.service.assertCurrentAuthority(tx as never, authority, at, false);
  assert.match(queries[0].sql, /FOR UPDATE OF/);
  assert.doesNotMatch(queries[1].sql, /FOR (UPDATE|SHARE)/);
  assert.deepEqual(queries[0].values, queries[1].values);
  assert.equal(queries[0].sql.replace("FOR UPDATE OF c, a, ur FOR SHARE OF cm, ec, u, d, r, rp, p", "").trim(), queries[1].sql.trim());
  await assert.rejects(h.service.assertCurrentAuthority({ $queryRaw: async () => [] } as never, authority, at, false), ForbiddenException);
});

test("all four authority Date binds retain their instants and explicitly normalize to UTC wall-clock timestamps", async () => {
  const h = harness(); const authority = await h.service.authorize("ec");
  const at = new Date("2026-09-01T12:00:00.123Z");
  for (const lock of [true, false]) {
    let query: any;
    await h.service.assertCurrentAuthority({ $queryRaw: async (q: any) => {
      query = q; return [{ id: "appointment" }];
    } } as never, authority, at, lock);
    const dates = query.values.filter((value: unknown) => value instanceof Date);
    assert.deepEqual(dates, [authority.assignmentAssignedAt, at, at, at]);
    query.values.forEach((value: unknown, index: number) => {
      if (value instanceof Date) assert.ok(query.strings[index + 1].startsWith("::timestamptz AT TIME ZONE 'UTC')"));
    });
    for (const predicate of ['a."assigned_at" =', 'a."assigned_at" <=', 'a."expires_at" >', 'ur."expires_at" >'])
      assert.ok(query.sql.includes(`${predicate} (?::timestamptz AT TIME ZONE 'UTC')`));
  }
});
