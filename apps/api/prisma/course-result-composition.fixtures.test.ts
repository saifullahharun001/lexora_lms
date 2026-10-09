import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { resolveLiveFixtureIds } from "./fixtures/course-composition-fixture-resolver";

test("service-generated candidate/calculated IDs, never guessed test IDs", async () => {
  const calls: unknown[] = [];
  const fake = {
    summativeExaminationCandidate: { findMany: async (arg: unknown) => {
      calls.push(arg); return [{ id: "service-generated-candidate" }]; } },
    summativeCalculatedMark: { findMany: async (arg: unknown) => {
      calls.push(arg); return [{ id: "service-generated-calculated" }]; } },
  } as unknown as PrismaClient;
  const scope = await resolveLiveFixtureIds(fake, "precision");
  assert.equal(scope.candidateId, "service-generated-candidate");
  assert.equal(scope.calculatedMarkId, "service-generated-calculated");
  assert.equal(scope.examinationCourseId, "crc_fixture_precision_course");
  assert.equal((calls[1] as { where: { candidateId: string } }).where.candidateId, "service-generated-candidate");
});

test("missing/ambiguous real candidate fails closed", async () => {
  for (const entries of [[], [{ id: "a" }, { id: "b" }]]) {
    const fake = { summativeExaminationCandidate: { findMany: async () => entries } } as unknown as PrismaClient;
    await assert.rejects(resolveLiveFixtureIds(fake, "boundary"));
  }
});

test("missing/ambiguous real calculated mark fails closed", async () => {
  for (const entries of [[], [{ id: "a" }, { id: "b" }]]) {
    const fake = {
      summativeExaminationCandidate: { findMany: async () => [{ id: "candidate" }] },
      summativeCalculatedMark: { findMany: async () => entries },
    } as unknown as PrismaClient;
    await assert.rejects(resolveLiveFixtureIds(fake, "boundary"));
  }
});
