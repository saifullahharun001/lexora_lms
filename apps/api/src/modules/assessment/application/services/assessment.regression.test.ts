import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AssessmentService } from "./assessment.service";

test("existing Assignment/Quiz creation preserves assigned-Teacher restrictions and audit events", async () => {
  let assigned = true;
  const audits: string[] = [];
  const service = new AssessmentService({
    createAssignment: async (data: unknown) => ({ id: "assignment", ...(data as object) }),
    createQuiz: async (data: unknown) => ({ id: "quiz", ...(data as object) }),
  } as any, {
    courseOffering: { findFirst: async () => ({ id: "offering" }) },
    teacherCourseAssignment: { findFirst: async () => assigned ? { id: "teacher-assignment" } : null },
    auditLog: { create: async ({ data }: any) => { audits.push(data.action); return data; } },
  } as any, { get: () => ({ principal: { isAuthenticated: true, actorId: "teacher", activeDepartmentId: "law", roleAssignments: [{ role: "teacher", departmentId: "law" }] }, audit: {} }) } as any);
  await service.createAssignment({ courseOfferingId: "offering", title: "Assignment" } as any);
  await service.createQuiz({ courseOfferingId: "offering", title: "Quiz" } as any);
  assert.deepEqual(audits, ["assessment.assignment.created", "assessment.quiz.created"]);
  assigned = false;
  await assert.rejects(service.createAssignment({ courseOfferingId: "offering" } as any), ForbiddenException);
  await assert.rejects(service.createQuiz({ courseOfferingId: "offering" } as any), ForbiddenException);
  assert.equal(audits.length, 2);
});
