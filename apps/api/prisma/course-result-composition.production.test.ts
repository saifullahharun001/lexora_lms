import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, PrismaClient, SummativeCommitteeMemberReviewOutcome } from "@prisma/client";
import { RequestContextService } from "../src/common/request-context/request-context.service";
import { PrincipalLoaderService } from "../src/modules/authorization/services/principal-loader.service";
import { FinalFormativeService } from "../src/modules/final-formative/final-formative.service";
import { CourseResultCompositionService } from "../src/modules/course-result-composition/course-result-composition.service";
import { SummativeCommitteeWorkflowService } from "../src/modules/summative-examination/application/services/summative-committee-workflow.service";
import { SummativeCommitteeWorkflowAuthorizerService } from "../src/modules/summative-examination/application/services/summative-committee-workflow-authorizer.service";
import { SummativeCalculatedMarkService } from "../src/modules/summative-examination/application/services/summative-calculated-mark.service";
import { productionCampaign, productionOptions } from "./fixtures/course-composition-production-harness";
import { PRODUCTION_CASES, fixtureIds } from "./fixtures/course-composition-production-baseline";
import { resolveLiveFixtureIds } from "./fixtures/course-composition-fixture-resolver";
import { reconcileCompositionScope, validateCompositionOptions } from "./reconcile-course-composition.cli";
import { evidenceTransaction } from "../src/common/academic-evidence/transaction";

const enabled = !!process.env.LEXORA_CRC_PRODUCTION_TEST_DATABASE_URL || !!process.env.LEXORA_CRC_PRODUCTION_CONFIRM;
const context = new RequestContextService();
const composition = new CourseResultCompositionService();
const approvalAction = "summative-examination.chairman-approval.final-lock-completed";
const compositionAction = "course-result.composed";
type Scope = ReturnType<typeof fixtureIds>;
function workflow(db: PrismaClient, hook: Pick<CourseResultCompositionService, "reconcileInTransaction"> = composition) {
  return new SummativeCommitteeWorkflowService(db as never, context,
    new SummativeCommitteeWorkflowAuthorizerService(db as never, context), new SummativeCalculatedMarkService(context), hook);
}
async function asUser<T>(db: PrismaClient, userId: string, work: () => Promise<T>, headerDepartment?: string, forgePrincipal = false) {
  const principal = await new PrincipalLoaderService(db as never).loadPrincipal(userId);
  if (principal && forgePrincipal) principal.activeDepartmentId = "crc_fixture_foreign";
  return context.run({ requestId: "crc_fixture_request", method: "POST", path: "/synthetic-service-campaign",
    principal, department: { kind: "department", departmentId: headerDepartment ?? principal?.activeDepartmentId ?? null,
      source: headerDepartment ? "header" : "principal" }, audit: { requestId: "crc_fixture_request", departmentId: principal?.activeDepartmentId ?? null } }, work);
}
async function occupant(db: PrismaClient, scope: Scope, seat: "CHAIRMAN" | "MEMBER_1" | "MEMBER_2") {
  const appointments = await db.examinationCommitteeAssignment.findMany({ where: { departmentId: scope.departmentId,
    examinationId: scope.examinationId, seat }, select: { id: true, assignedUserId: true } });
  assert.equal(appointments.length, 1, "Synthetic baseline needs one exact appointment per internal seat");
  assert.ok(appointments[0]!.assignedUserId); return appointments[0]!;
}
async function reviews(db: PrismaClient, scope: Scope, second = SummativeCommitteeMemberReviewOutcome.VERIFIED as SummativeCommitteeMemberReviewOutcome) {
  for (const seat of ["MEMBER_1", "MEMBER_2"] as const) {
    const member = await occupant(db, scope, seat), outcome = seat === "MEMBER_2" ? second : "VERIFIED";
    await asUser(db, member.assignedUserId!, () => workflow(db).submitMemberReview(scope.calculatedMarkId,
      { outcome, ...(outcome === "CORRECTION_REQUIRED" ? { reviewComment: "Synthetic correction required" } : {}) }));
  }
}
async function approve(db: PrismaClient, scope: Scope, hook?: Pick<CourseResultCompositionService, "reconcileInTransaction">) {
  const chair = await occupant(db, scope, "CHAIRMAN");
  return asUser(db, chair.assignedUserId!, () => workflow(db, hook).approveAndFinalLock(scope.calculatedMarkId));
}
async function counts(db: PrismaClient) {
  return [await db.summativeChairmanApproval.count(), await db.auditLog.count({ where: { action: approvalAction } }),
    await db.courseResultComposition.count(), await db.auditLog.count({ where: { action: compositionAction } })];
}
async function formative(db: PrismaClient, scope: Scope, terminal = false) {
  const owner = new FinalFormativeService(db as never, composition);
  return terminal ? owner.reconcile(scope.departmentId, scope.examinationId) : owner.reconcileFormativeOnly(scope.departmentId, scope.examinationId);
}

test("production-shaped PostgreSQL 18.6: real migration ledger, triggers and Chairman terminal transaction", { skip: !enabled }, async (t) => {
  const options = productionOptions(process.env);
  // No mocked authorizer, calculated-mark validator, source tables, review requirements
  // or transaction manager. The only injected faults below are at the audit/hook edge.
  const campaign = await productionCampaign(options);
  try {
    await t.test("actual Chairman last: four effects commit once; duplicate approval is denied", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope); await reviews(db, scope);
      await approve(db, scope); assert.deepEqual(await counts(db), [1, 1, 1, 1]);
      await assert.rejects(approve(db, scope), /already Chairman-approved/);
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("Summative first: missing /40 is a no-op, then real Final Formative owner creates /100", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await reviews(db, scope); await approve(db, scope); assert.deepEqual(await counts(db), [1, 1, 0, 0]);
      await formative(db, scope, true); assert.deepEqual(await counts(db), [1, 1, 1, 1]);
      await formative(db, scope, true); assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("missing Summative approval creates neither partial composition nor audit", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope, true); assert.deepEqual(await counts(db), [0, 0, 0, 0]);
      assert.equal(await db.formativeFinalResult.count(), 1);
    }));
    for (const scenario of PRODUCTION_CASES) await t.test(`real locked sources: ${scenario.key}`, () => campaign.fixture(async (db) => {
      const ids = await resolveLiveFixtureIds(db, scenario.key); await formative(db, ids); await reviews(db, ids); await approve(db, ids);
      const result = await db.courseResultComposition.findFirstOrThrow({ where: { examinationCourseId: ids.examinationCourseId } });
      assert.equal(result.formativeMark.toString(), scenario.formative); assert.equal(result.summativeMark.toString(), scenario.summative);
      assert.equal(result.totalMark.toString(), new Prisma.Decimal(scenario.formative).plus(scenario.summative).toString());
      assert.deepEqual([result.formativeFullMark.toString(), result.summativeFullMark.toString(), result.totalFullMark.toString()], ["40", "60", "100"]);
      assert.deepEqual([result.formativePassed, result.summativePassed, result.coursePassed],
        [scenario.formativePassed, scenario.summativePassed, scenario.formativePassed && scenario.summativePassed]);
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    for (const failure of ["after-all-writes", "missing-composition-audit", "original-audit"] as const)
      await t.test(`actual Chairman transaction rolls back all four effects: ${failure}`, () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
        await formative(db, scope); await reviews(db, scope);
        if (failure === "original-audit") {
          // Injection is failure-only; it cannot grant authority or replace a database constraint.
          const original = db.$transaction.bind(db);
          const failingDb = new Proxy(db, { get(target, key) {
            if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, config: object) =>
              original(async (tx) => work(new Proxy(tx, { get(client, field) {
                if (field === "auditLog") return { ...tx.auditLog, create: async (input: Prisma.AuditLogCreateArgs) => {
                  if (input.data.action === approvalAction) throw Error("injected original audit failure");
                  return tx.auditLog.create(input);
                } };
                const value = Reflect.get(client, field); return typeof value === "function" ? value.bind(client) : value;
              } })), config);
            const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
          } });
          await assert.rejects(approve(failingDb, scope), /injected original audit failure/);
        } else {
          const hook = { reconcileInTransaction: async (tx: Prisma.TransactionClient, ...args: [string, string, string, string]) => {
            const client = failure === "missing-composition-audit" ? new Proxy(tx, { get(target, key) {
              if (key === "auditLog") return { create: async () => ({}) };
              const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
            } }) : tx;
            const result = await composition.reconcileInTransaction(client, ...args);
            if (failure === "after-all-writes") throw Error("injected terminal interruption");
            return result;
          } };
          await assert.rejects(approve(db, scope, hook));
        }
        assert.deepEqual(await counts(db), [0, 0, 0, 0]);
        assert.equal(await db.formativeFinalResult.count(), 1, "Previously committed Formative evidence survives rollback");
      }));
    await t.test("actual concurrent Chairman requests converge to one approval and one composition", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope); await reviews(db, scope);
      const results = await Promise.allSettled([approve(db, scope), approve(db, scope)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.filter((r) => r.status === "rejected").length, 1);
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("real Member CORRECTION_REQUIRED cannot satisfy Chairman approval", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope); await reviews(db, scope, "CORRECTION_REQUIRED");
      await assert.rejects(approve(db, scope)); assert.deepEqual(await counts(db), [0, 0, 0, 0]);
    }));
    for (const change of ["revoked-grant", "inactive-user"] as const)
      await t.test(`current Chairman denied: ${change}`, () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
        await formative(db, scope); await reviews(db, scope); const chair = await occupant(db, scope, "CHAIRMAN");
        if (change === "revoked-grant") await db.userRole.updateMany({ where: { userId: chair.assignedUserId! }, data: { revokedAt: new Date() } });
        else await db.user.update({ where: { id: chair.assignedUserId! }, data: { status: "SUSPENDED" } });
        await assert.rejects(approve(db, scope)); assert.deepEqual(await counts(db), [0, 0, 0, 0]);
      }));
    await t.test("expired/revoked current authority cannot invalidate legitimately locked historical sources", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await reviews(db, scope); await approve(db, scope); const chair = await occupant(db, scope, "CHAIRMAN");
      await db.userRole.updateMany({ where: { userId: chair.assignedUserId! }, data: { revokedAt: new Date() } });
      await formative(db, scope, true); assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("forged header grants no authority; valid principal remains in its own department", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope); await reviews(db, scope); const chair = await occupant(db, scope, "CHAIRMAN");
      await assert.rejects(asUser(db, chair.assignedUserId!, () => workflow(db).approveAndFinalLock(scope.calculatedMarkId), "crc_fixture_foreign", true));
      assert.deepEqual(await counts(db), [0, 0, 0, 0]);
      await asUser(db, chair.assignedUserId!, () => workflow(db).approveAndFinalLock(scope.calculatedMarkId), "crc_fixture_foreign");
      assert.equal((await db.courseResultComposition.findFirstOrThrow()).departmentId, scope.departmentId);
    }));
    await t.test("foreign calculated object and another examination's candidate fail safely", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      const chair = await occupant(db, scope, "CHAIRMAN");
      for (const id of ["crc_fixture_foreign_calculated", (await resolveLiveFixtureIds(db, "boundary")).calculatedMarkId])
        await assert.rejects(asUser(db, chair.assignedUserId!, () => workflow(db).approveAndFinalLock(id)));
      assert.deepEqual(await counts(db), [0, 0, 0, 0]);
    }));
    await t.test("real certified lineage and source-version guards reject replacements", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope);
      await assert.rejects(db.summativeCalculatedMark.update({ where: { id: scope.calculatedMarkId }, data: { calculatedMarkVersion: 99 } }));
      await assert.rejects(db.summativeExaminationCandidate.update({ where: { id: scope.candidateId }, data: { enrollmentId: fixtureIds("boundary").enrollmentId } }));
      const edge = await db.examinationCandidateCourse.findFirstOrThrow({ where: { examinationCourseId: scope.examinationCourseId, enrollmentId: scope.enrollmentId } });
      await assert.rejects(db.examinationCandidateCourse.update({ where: { id: edge.id }, data: { enrollmentId: fixtureIds("boundary").enrollmentId } }));
      await assert.rejects(db.examinationCandidateRegistration.update({ where: { id: edge.registrationId }, data: { version: 99 } }));
      assert.deepEqual(await counts(db), [0, 0, 0, 0]);
    }));
    await t.test("real new constraints reject forged marks, versions, scope, rules and excessive provenance", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await reviews(db, scope); await approve(db, scope); await formative(db, scope);
      const changes: Record<string, unknown>[] = [
        { totalMark: "99" }, { formativeFullMark: "100" }, { summativeFullMark: "100" }, { totalFullMark: "60" },
        { formativeMark: "0" }, { summativeMark: "0" }, { coursePassed: false }, { calculatedMarkVersion: 99 },
        { departmentId: "crc_fixture_foreign" }, { enrollmentId: fixtureIds("boundary").enrollmentId },
        { registrationId: "crc_fixture_wrong_registration" }, { ruleVersionCode: "UNVERIFIED" },
        { provenanceJson: { unrelatedProfile: "must-not-persist" } },
      ];
      for (const change of changes) {
        await assert.rejects(evidenceTransaction(db as never, (tx) => composition.reconcileInTransaction(
          new Proxy(tx, { get(target, key) {
            if (key === "courseResultComposition") return {
              findUnique: tx.courseResultComposition.findUnique.bind(tx.courseResultComposition),
              create: ({ data }: { data: Prisma.CourseResultCompositionUncheckedCreateInput }) =>
                tx.courseResultComposition.create({ data: { ...data, ...change } }),
            };
            const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
          } }), scope.departmentId, scope.examinationId, scope.examinationCourseId, scope.enrollmentId)));
        assert.deepEqual(await counts(db), [1, 1, 0, 0]);
      }
    }));
    await t.test("permitted candidate created_at/updated_at changes do not cause false source drift", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope); await reviews(db, scope); await approve(db, scope);
      const before = await db.courseResultComposition.findFirstOrThrow();
      // The REAL candidate identity trigger protects registered_at, but permits these metadata fields.
      await db.summativeExaminationCandidate.update({ where: { id: scope.candidateId }, data: { createdAt: new Date("2026-01-01"), updatedAt: new Date() } });
      await formative(db, scope, true);
      assert.deepEqual(await db.courseResultComposition.findFirstOrThrow(), before);
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("real aggregate, approval, Formative and protected audit UPDATE/DELETE remain blocked", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await formative(db, scope); await reviews(db, scope); await approve(db, scope);
      for (const sql of ["UPDATE course_result_compositions SET total_mark=0", "DELETE FROM course_result_compositions",
        "UPDATE formative_final_results SET mark=0", "DELETE FROM formative_final_results",
        "UPDATE summative_chairman_approvals SET approved_summative_value_snapshot=0", "DELETE FROM summative_chairman_approvals",
        "UPDATE audit_logs SET context_json='{}' WHERE action='course-result.composed'", "DELETE FROM audit_logs WHERE action='course-result.composed'"])
        await assert.rejects(db.$executeRawUnsafe(sql));
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("pre-existing ready pair: read-only discovery, expected-count rollback, explicit apply and idempotency", () => campaign.fixture(async (db, raw) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await reviews(db, scope); await approve(db, scope); await formative(db, scope);
      assert.deepEqual(await counts(db), [1, 1, 0, 0]); // Old /40 operational path must not create /100.
      const url = new URL(raw), database = url.pathname.slice(1);
      const args = ["--department", scope.departmentId, "--examination", scope.examinationId, "--examination-course", scope.examinationCourseId,
        "--expected-database", database, "--expected-host", url.hostname, "--expected-port", url.port || "5432", "--expected-schema", "public", "--environment", "disposable"];
      const dry = validateCompositionOptions(args, raw, "disposable", undefined);
      assert.deepEqual(await reconcileCompositionScope(db, dry), { mode: "DRY_RUN", contexts: 1, ready: 1, existing: 0, notReady: 0, created: 0 });
      assert.deepEqual(await counts(db), [1, 1, 0, 0]);
      const apply = validateCompositionOptions([...args, "--apply", "--expected-contexts", "1", "--expected-create", "1"], raw, "disposable", `disposable:${database}`);
      await assert.rejects(reconcileCompositionScope(db, { ...apply, expectedCreate: 0 }));
      assert.deepEqual(await counts(db), [1, 1, 0, 0]);
      assert.equal((await reconcileCompositionScope(db, apply)).created, 1);
      assert.equal((await reconcileCompositionScope(db, { ...apply, expectedCreate: 0 })).existing, 1);
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
    await t.test("competing exact reconciliations converge without replacement", () => campaign.fixture(async (db) => {
      const scope = await resolveLiveFixtureIds(db, "precision");
      await reviews(db, scope); await approve(db, scope); await formative(db, scope);
      const reconcile = () => evidenceTransaction(db as never, (tx) => composition.reconcileInTransaction(tx,
        scope.departmentId, scope.examinationId, scope.examinationCourseId, scope.enrollmentId));
      const results = await Promise.all([reconcile(), reconcile()]);
      assert.deepEqual(results.map((r) => r.status).sort(), ["CREATED", "EXISTING"]);
      assert.deepEqual(await counts(db), [1, 1, 1, 1]);
    }));
  } finally { await campaign.close(); }
});
