import assert from "node:assert/strict";
import test from "node:test";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { workflowHarness } from "./examination-workflow.test-harness";

function recorder() {
  const h = workflowHarness(); h.as("admin");
  h.state.userRole!.push({ id: "admin-role", departmentId: "law", userId: "admin", revokedAt: null, expiresAt: null,
    role: { departmentId: "law", code: "department_admin", archivedAt: null } });
  h.state.externalComprehensiveAccess = [];
  return h;
}
function input() {
  return { email: "external@example.test", displayName: "External Member", expiresAt: "2099-01-01T00:00:00Z", sourceReference: "Official appointment reference",
    temporaryPassword: ["A", "b", "1", "!", "x".repeat(12)].join("") };
}

function dedicatedGrant(h: ReturnType<typeof recorder>, userId: string, code: string) {
  const role = h.state.role!.find((r) => r.departmentId === "law" && r.code === code);
  assert.ok(role);
  const grant = h.state.userRole!.find((r) => r.userId === userId && r.departmentId === "law" && r.roleId === role.id);
  assert.ok(grant);
  return grant;
}

function poeRecorder() {
  const h = recorder(); h.state.poeChairmanAssignment = [];
  for (const id of ["poe", "successor"]) h.state.user!.push({ id, departmentId: "law", status: "ACTIVE", archivedAt: null, deletedAt: null });
  return h;
}

function unrelatedGrants(h: ReturnType<typeof recorder>, userId: string, code: string) {
  const dedicated = dedicatedGrant(h, userId, code);
  for (const other of ["department_admin", "teacher", "student", "custom_classifier",
    code === "poe_chairman" ? "comprehensive_external" : "poe_chairman"]) {
    h.state.role!.push({ id: `unrelated-${other}`, departmentId: "law", code: other, archivedAt: null });
    h.state.userRole!.push({ id: `unrelated-${other}`, roleId: `unrelated-${other}`, departmentId: "law", userId,
      revokedAt: null, expiresAt: null });
  }
  // A custom CLASSIFY grant must survive POE revocation even with identical permission semantics.
  const classify = h.state.permission!.find((p) => p.code === "examination-candidate.classification.manage_department") ??
    { id: "custom-classify", code: "examination-candidate.classification.manage_department", resource: "examination-candidate.classification", action: "manage", scope: "DEPARTMENT" };
  if (!h.state.permission!.includes(classify)) h.state.permission!.push(classify);
  h.state.rolePermission!.push({ id: "custom-classify-grant", roleId: "unrelated-custom_classifier", permissionId: classify.id });
  h.state.role!.push({ id: "foreign-dedicated", departmentId: "foreign", code, archivedAt: null });
  h.state.userRole!.push(
    { id: "other-user", roleId: dedicated.roleId, departmentId: "law", userId: "other-user", revokedAt: null, expiresAt: null },
    { id: "foreign-department", roleId: "foreign-dedicated", departmentId: "foreign", userId, revokedAt: null, expiresAt: null },
    { id: "foreign-role", roleId: "foreign-dedicated", departmentId: "law", userId, revokedAt: null, expiresAt: null },
  );
  return structuredClone(h.state.userRole!.filter((r) => r.id !== dedicated.id));
}
test("external provisioning creates only narrow role access and returns/audits no credential", async () => {
  const h = recorder(); const binding = await h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input());
  assert.equal(binding.assignmentId, "appointment-EXTERNAL_MEMBER");
  assert.equal(binding.assignmentAssignedAt.getTime(), h.assignments[3]!.assignedAt.getTime());
  assert.deepEqual(h.state.role!.map((r) => r.code), ["comprehensive_external"]);
  assert.deepEqual(h.state.permission!.map((p) => p.code).sort(), ["comprehensive-examination.mark.enter_department", "comprehensive-examination.workspace.read_department"]);
  const grant = dedicatedGrant(h, binding.userId, "comprehensive_external");
  assert.equal(grant.revokedAt, null);
  assert.equal(grant.expiresAt.getTime(), binding.expiresAt.getTime());
  assert.equal(grant.assignedByUserId, "admin");
  const exposed = JSON.stringify({ binding, audits: h.state.auditLog });
  assert.ok(!exposed.includes(input().temporaryPassword)); assert.ok(!exposed.includes("NONCREDENTIAL_TEST_HASH"));
  assert.doesNotMatch(exposed, /passwordHash|temporaryPassword/);
});
test("external provisioning rejects foreign/internal/expired appointments and duplicate binding", async () => {
  const h = recorder();
  await assert.rejects(h.authority.provisionExternal("foreign", "appointment-EXTERNAL_MEMBER", input()));
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-MEMBER_1", input()));
  h.assignments[3]!.expiresAt = new Date("2026-01-02");
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input()));
  h.assignments[3]!.expiresAt = null;
  await h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input());
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input()));
});
test("external role pollution or occupied account email is rejected atomically", async () => {
  const h = recorder(); h.state.user!.push({ id: "existing", normalizedEmail: input().email });
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input()));
  h.state.user = []; h.state.role!.push({ id: "external-role", departmentId: "law", code: "comprehensive_external" });
  h.state.permission!.push({ id: "polluted", resource: "summative-examination.examiner-marks", action: "enter", scope: "DEPARTMENT" });
  h.state.rolePermission!.push({ id: "rp", roleId: "external-role", permissionId: "polluted" });
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input()), /unexpected permissions/);
  assert.equal(h.state.user!.length, 0); assert.equal(h.state.externalComprehensiveAccess!.length, 0);
});
test("external required audit failure rolls back account, role grant and binding", async () => {
  const h = recorder(); h.flags.auditFailure = true;
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input()), /audit/);
  assert.equal(h.state.user!.length, 0); assert.equal(h.state.role!.length, 0); assert.equal(h.state.externalComprehensiveAccess!.length, 0);
  assert.deepEqual(h.state.userRole!.map((r) => r.id), ["admin-role"]);
});
test("administrative POE recording requires sourced explicit appointment and cannot replace silently", async () => {
  const h = recorder(); h.state.poeChairmanAssignment = [];
  h.state.user!.push({ id: "successor", departmentId: "law", status: "ACTIVE", archivedAt: null, deletedAt: null });
  const appointment = await h.authority.appointPoe({ userId: "successor", sourceReference: "Official POE appointment", expiresAt: "2099-01-01" });
  assert.equal(appointment.recordedByUserId, "admin"); assert.equal(appointment.userId, "successor");
  assert.equal(h.state.auditLog![0]!.action, "examination-authority.poe-chairman.recorded");
  assert.equal(h.state.permission![0]!.code, "examination-candidate.classification.manage_department");
  const grant = dedicatedGrant(h, appointment.userId, "poe_chairman");
  assert.equal(grant.expiresAt.getTime(), appointment.expiresAt.getTime());
  assert.equal(grant.revokedAt, null); assert.equal(grant.assignedByUserId, "admin");
  await assert.rejects(h.authority.appointPoe({ userId: "successor", sourceReference: "Other reference", expiresAt: "2099-01-01" }));
  await h.authority.revokePoe(appointment.id);
  const revokedGrant = dedicatedGrant(h, appointment.userId, "poe_chairman");
  assert.ok(h.state.poeChairmanAssignment![0]!.revokedAt);
  assert.ok(revokedGrant.revokedAt);
  assert.equal(revokedGrant.revokedAt.getTime(), h.state.poeChairmanAssignment![0]!.revokedAt.getTime());
});

test("POE revocation affects only the bound user's dedicated department role", async () => {
  const h = poeRecorder();
  const appointment = await h.authority.appointPoe({ userId: "poe", sourceReference: "Official POE appointment", expiresAt: "2099-01-01" });
  const grant = dedicatedGrant(h, "poe", "poe_chairman");
  const unrelated = unrelatedGrants(h, "poe", "poe_chairman");
  const permissions = structuredClone(h.state.rolePermission);
  const users = structuredClone(h.state.user);
  const revoked = await h.authority.revokePoe(appointment.id);
  assert.equal(grant.revokedAt.getTime(), revoked.revokedAt!.getTime());
  assert.equal(grant.expiresAt.getTime(), appointment.expiresAt.getTime());
  assert.deepEqual(h.state.userRole!.filter((r) => r.id !== grant.id), unrelated);
  assert.deepEqual(h.state.rolePermission, permissions); assert.deepEqual(h.state.user, users);
  const beforeRepeat = structuredClone(h.state);
  await h.authority.revokePoe(appointment.id);
  assert.deepEqual(h.state, beforeRepeat);
});

test("POE successor and reappointment reuse only the exact grant and old revocations remain harmless", async () => {
  const h = poeRecorder();
  const first = await h.authority.appointPoe({ userId: "poe", sourceReference: "First appointment", expiresAt: "2098-01-01" });
  const grantId = dedicatedGrant(h, "poe", "poe_chairman").id;
  await h.authority.revokePoe(first.id);
  const successor = await h.authority.appointPoe({ userId: "successor", sourceReference: "Successor appointment", expiresAt: "2099-01-01" });
  assert.equal(dedicatedGrant(h, "successor", "poe_chairman").expiresAt.getTime(), successor.expiresAt.getTime());
  assert.ok(dedicatedGrant(h, "poe", "poe_chairman").revokedAt);
  await h.authority.revokePoe(successor.id);
  const renewed = await h.authority.appointPoe({ userId: "poe", sourceReference: "New appointment", expiresAt: "2097-01-01" });
  const grant = dedicatedGrant(h, "poe", "poe_chairman");
  assert.equal(grant.id, grantId); assert.equal(grant.revokedAt, null);
  assert.equal(grant.expiresAt.getTime(), renewed.expiresAt.getTime());
  assert.equal(grant.assignedByUserId, "admin");
  assert.equal(h.state.userRole!.filter((r) => r.userId === "poe" && r.roleId === grant.roleId && r.departmentId === "law").length, 1);
  const beforeReplay = structuredClone(h.state);
  await h.authority.revokePoe(first.id);
  assert.deepEqual(h.state, beforeReplay);
});

test("POE provisioning and revocation roll back role and appointment changes when required audit fails", async () => {
  const h = poeRecorder();
  const beforeCreate = structuredClone(h.state); h.flags.auditFailure = true;
  await assert.rejects(h.authority.appointPoe({ userId: "poe", sourceReference: "Official appointment", expiresAt: "2099-01-01" }), /audit/);
  assert.deepEqual(h.state, beforeCreate);
  h.flags.auditFailure = false;
  const appointment = await h.authority.appointPoe({ userId: "poe", sourceReference: "Official appointment", expiresAt: "2099-01-01" });
  const beforeRevoke = structuredClone(h.state); h.flags.auditFailure = true;
  await assert.rejects(h.authority.revokePoe(appointment.id), /audit/);
  assert.deepEqual(h.state, beforeRevoke);
  h.flags.auditFailure = false;
  await h.authority.revokePoe(appointment.id);
  const beforeReactivate = structuredClone(h.state); h.flags.auditFailure = true;
  await assert.rejects(h.authority.appointPoe({ userId: "poe", sourceReference: "Renewed appointment", expiresAt: "2098-01-01" }), /audit/);
  assert.deepEqual(h.state, beforeReactivate);
});

test("external role expiry equals binding expiry and cannot exceed the formal appointment", async () => {
  const h = recorder(); h.assignments[3]!.expiresAt = new Date("2098-01-01");
  const before = structuredClone(h.state);
  await assert.rejects(h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input()), /cannot exceed appointment expiry/);
  assert.deepEqual(h.state, before);
  const binding = await h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", { ...input(), expiresAt: "2097-01-01" });
  const grant = dedicatedGrant(h, binding.userId, "comprehensive_external");
  assert.equal(grant.expiresAt.getTime(), binding.expiresAt.getTime());
  assert.ok(grant.expiresAt <= h.assignments[3]!.expiresAt);
});

test("external grant upsert reactivates its exact row with the binding expiry", async () => {
  const h = recorder();
  const binding = await h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input());
  const grant = dedicatedGrant(h, binding.userId, "comprehensive_external");
  const grantId = grant.id;
  grant.revokedAt = new Date("2026-01-01"); grant.expiresAt = null; grant.assignedByUserId = "previous-recorder";
  // Public External provisioning always creates a fresh account. Exercise the shared
  // upsert's update branch directly against a still-current binding, without changing that policy.
  await h.authority["grant"](h.tx, { departmentId: "law", actorUserId: "admin" }, binding.userId,
    "comprehensive_external", [P.READ, P.MARK], binding.expiresAt);
  assert.equal(grant.id, grantId); assert.equal(grant.revokedAt, null);
  assert.equal(grant.expiresAt.getTime(), binding.expiresAt.getTime());
  assert.equal(grant.assignedByUserId, "admin");
  assert.equal(h.state.userRole!.filter((r) => r.userId === binding.userId).length, 1);
});

test("external revocation changes only the bound user's dedicated department role and preserves the account", async () => {
  const h = recorder();
  const binding = await h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input());
  const grant = dedicatedGrant(h, binding.userId, "comprehensive_external");
  const unrelated = unrelatedGrants(h, binding.userId, "comprehensive_external");
  const users = structuredClone(h.state.user); const permissions = structuredClone(h.state.rolePermission);
  const revoked = await h.authority.revokeExternal(binding.id);
  assert.equal(grant.revokedAt.getTime(), revoked.revokedAt!.getTime());
  assert.deepEqual(h.state.userRole!.filter((r) => r.id !== grant.id), unrelated);
  assert.deepEqual(h.state.user, users); assert.deepEqual(h.state.rolePermission, permissions);
  const beforeRepeat = structuredClone(h.state);
  await h.authority.revokeExternal(binding.id);
  assert.deepEqual(h.state, beforeRepeat);
  // A replay cannot reconcile a historical row by revoking a subsequent digital grant.
  grant.revokedAt = null; grant.expiresAt = new Date("2100-01-01");
  const beforeReplay = structuredClone(h.state);
  await h.authority.revokeExternal(binding.id);
  assert.deepEqual(h.state, beforeReplay);
});

test("external revocation rolls back binding and role together when required audit fails", async () => {
  const h = recorder();
  const binding = await h.authority.provisionExternal("exam", "appointment-EXTERNAL_MEMBER", input());
  const before = structuredClone(h.state); h.flags.auditFailure = true;
  await assert.rejects(h.authority.revokeExternal(binding.id), /audit/);
  assert.deepEqual(h.state, before);
});
