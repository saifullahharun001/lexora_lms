import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { deriveTeacherSubmission, weightedMark, type SubmissionSource } from "./formative.rules";

function source(id: string, weight: string, raw = "1", max = "3"): SubmissionSource {
  return { activityId: id, status: "MARKING", rawMaximum: new Prisma.Decimal(max), assignedWeight: new Prisma.Decimal(weight),
    mark: { rawMark: new Prisma.Decimal(raw), weightedMark: weightedMark(raw, max, weight),
      feedback: "Written feedback", feedbackCompleted: true, integrityStatus: "CLEAR" } };
}
test("weighted arithmetic rounds each activity half up to two decimal places then sums", () => {
  assert.equal(weightedMark("1", "8", "10").toFixed(2), "1.25");
  assert.equal(weightedMark("1", "8", "1").toFixed(2), "0.13");
  assert.equal(deriveTeacherSubmission([source("a", "10"), source("b", "20")]).total.toFixed(2), "10.00");
});
test("weights must equal 30 independently of whether marks happen to exist", () => {
  for (const values of [[], [source("a", "29.99")], [source("a", "20"), source("b", "20")]]) {
    assert.throws(() => deriveTeacherSubmission(values), RangeError);
  }
  assert.throws(() => deriveTeacherSubmission([source("a", "15"), source("a", "15")]), /Duplicate/);
  assert.throws(() => deriveTeacherSubmission([{ ...source("a", "30"), mark: null }]), /complete marks/);
});
