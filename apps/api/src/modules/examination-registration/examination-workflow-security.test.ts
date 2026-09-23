import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AuthorizationService } from "../authorization/services/authorization.service";
import { AuthGuard } from "../authorization/guards/auth.guard";
import { PolicyGuard } from "../authorization/guards/policy.guard";
import { REQUIRE_POLICY_KEY } from "../authorization/domain/authorization.constants";
import { ComprehensiveExaminationController } from "../assessment/presentation/http/comprehensive-examination.controller";
import { ComprehensiveMarkDto, ComprehensiveConfigurationDto, ComprehensiveDistributionDto } from "../assessment/presentation/dto/comprehensive.dto";
import { ExaminationRegistrationController, ExaminationAuthorityController } from "./examination-registration.controller";
import { CandidateRegistrationDto, ExternalComprehensiveAccessDto } from "./examination-registration.dto";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { workflowHarness } from "./examination-workflow.test-harness";
import { evidenceTransaction } from "@/common/academic-evidence/transaction";
import { Prisma } from "@prisma/client";

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
for (const controller of [ComprehensiveExaminationController, ExaminationRegistrationController, ExaminationAuthorityController]) {
  test(`${controller.name} protects every route with AuthGuard, PolicyGuard and exact policy`, () => {
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller), [AuthGuard, PolicyGuard]);
    for (const key of Object.getOwnPropertyNames(controller.prototype).filter((k) => k !== "constructor")) {
      assert.ok(Object.values(P).includes(Reflect.getMetadata(REQUIRE_POLICY_KEY, (controller.prototype as any)[key])));
    }
  });
}
for (const field of ["actorId", "departmentId", "seat", "average", "finalMark", "fullMark", "committeeAssignmentId"]) {
  test(`mark DTO rejects forged ${field}`, async () => {
    await assert.rejects(pipe.transform({ mark: "3", [field]: "forged" }, { type: "body", metatype: ComprehensiveMarkDto }));
  });
}
test("strict DTOs preserve category, mode and allocation semantics", async () => {
  await assert.rejects(pipe.transform({ studentUserId: "student", curriculumAssignmentId: "curriculum", category: "SPECIAL" }, { type: "body", metatype: CandidateRegistrationDto }));
  await assert.rejects(pipe.transform({ mode: "THREE_MEMBERS", examDate: "2026-09-21" }, { type: "body", metatype: ComprehensiveConfigurationDto }));
  await assert.rejects(pipe.transform({ allocations: [{ courseId: "course", committeeAssignmentId: "assignment", seat: "CHAIRMAN" }] }, { type: "body", metatype: ComprehensiveDistributionDto }));
  await assert.rejects(pipe.transform({ mark: null }, { type: "body", metatype: ComprehensiveMarkDto }));
  const zero = await pipe.transform({ mark: "0" }, { type: "body", metatype: ComprehensiveMarkDto }); assert.equal(zero.mark, "0");
});
for (const policy of Object.values(P)) {
  test(`wildcard grant cannot substitute for ${policy}`, () => {
    const h = workflowHarness(); h.as("admin", []); const principal = h.principal();
    principal.permissions.push({ resource: "*", action: "*", scope: "department", source: { departmentId: "law", userRoleId: "ur", roleId: "role" } });
    assert.equal(new AuthorizationService().isAllowed(principal, policy), false);
    assert.throws(() => h.access.principal(policy));
  });
}
test("unauthenticated service call and missing permission provenance fail closed", () => {
  const h = workflowHarness(); h.principal().isAuthenticated = false;
  assert.throws(() => h.access.principal(P.MARK));
  h.principal().isAuthenticated = true; h.principal().permissions[0]!.source.departmentId = "foreign";
  assert.throws(() => h.access.principal(P.MARK));
});
test("External role provides no Summative, Teacher or administrative authority", () => {
  const h = workflowHarness(); h.as("EXTERNAL_MEMBER"); const auth = new AuthorizationService();
  for (const policy of ["summative-examination.examiner-marks.enter", "summative-examination.member-review.review",
    "summative-examination.chairman-approval.approve", "formative.activities.manage", "identity-access.user.manage", P.CONFIGURE, P.FINALISE, P.CLASSIFY, P.APPOINT]) {
    assert.equal(auth.isAllowed(h.principal(), policy), false);
  }
  assert.equal(auth.isAllowed(h.principal(), P.MARK), true);
});
test("expired/revoked role is rechecked inside protected mutation", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); h.flags.roleRevoked = true;
  await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "2" }, true));
});
test("serializable retries are bounded and audit errors are never swallowed", async () => {
  let attempts = 0;
  const conflict = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "test" });
  const prisma = { $transaction: async () => { attempts++; throw conflict; } };
  await assert.rejects(evidenceTransaction(prisma as any, async () => null)); assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(evidenceTransaction({ $transaction: async () => { attempts++; throw new Error("audit"); } } as any, async () => null), /audit/);
  assert.equal(attempts, 1);
});
test("external provisioning DTO never permits caller-selected role or user/department authority", async () => {
  await assert.rejects(pipe.transform({ email: "member@example.test", displayName: "Member", expiresAt: "2099-01-01", sourceReference: "Appointment",
    roleCode: "teacher" }, { type: "body", metatype: ExternalComprehensiveAccessDto }));
});
