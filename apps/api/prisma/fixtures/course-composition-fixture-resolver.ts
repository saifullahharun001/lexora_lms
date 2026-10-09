import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { fixtureIds } from "./course-composition-production-baseline";

/** Real services assign candidate and calculation IDs. Never fake them. */
export async function resolveLiveFixtureIds(db: PrismaClient, key: string) {
  const fixed = fixtureIds(key);
  const candidates = await db.summativeExaminationCandidate.findMany({
    where: { departmentId: fixed.departmentId, examinationId: fixed.examinationId,
      examinationCourseId: fixed.examinationCourseId, enrollmentId: fixed.enrollmentId },
    select: { id: true }, take: 2,
  });
  assert.equal(candidates.length, 1, `Exactly one registered candidate required: ${key}`);
  const calculated = await db.summativeCalculatedMark.findMany({
    where: { departmentId: fixed.departmentId, examinationId: fixed.examinationId,
      examinationCourseId: fixed.examinationCourseId, candidateId: candidates[0]!.id },
    select: { id: true }, take: 2,
  });
  assert.equal(calculated.length, 1, `Exactly one calculated mark required: ${key}`);
  return { ...fixed, candidateId: candidates[0]!.id, calculatedMarkId: calculated[0]!.id };
}
