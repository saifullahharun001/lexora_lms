import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { deriveActivitySubmission, deriveTeacherSubmission, weightedMark, type FormativeConfiguration, type SubmissionSource } from "./formative.rules";

const configuration: FormativeConfiguration = { templateId: "template", templateVersion: 3, components: [
  { id: "attendance", code: "ATTENDANCE", maximum: "5.00" },
  { id: "comprehensive", code: "COMPREHENSIVE_EXAMINATION", maximum: "5.00" },
  { id: "activities", code: "FORMATIVE_ACTIVITIES", maximum: "30.00" },
  { id: "summative", code: "SUMMATIVE_EXAMINATION", maximum: "60.00" },
] };

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

test("activity packages sort exact enrollment sources deterministically and retain the numerical rule", () => {
  const activity = { id: "a", departmentId: "law", courseOfferingId: "o", version: 2, title: "Test", method: "QUIZ",
    status: "MARKING", rawMaximum: new Prisma.Decimal(8), assignedWeight: new Prisma.Decimal(1) };
  const evidence = { ...source("a", "1", "1", "8").mark!, id: "m", revision: 1,
    rawMaximum: activity.rawMaximum, assignedWeight: activity.assignedWeight };
  const sources = [{ enrollmentId: "z", mark: evidence }, { enrollmentId: "é", mark: { ...evidence, id: "m2" } }];
  const result = deriveActivitySubmission(activity, sources, configuration);
  assert.equal(result.sourceSnapshotJson.sources[0]!.weightedMark, "0.13");
  assert.deepEqual(result.sourceSnapshotJson.configuration, configuration);
  assert.equal(result.ruleVersionCode, "FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1");
  assert.deepEqual(result, deriveActivitySubmission(activity, [...sources].reverse(), { ...configuration, components: [...configuration.components].reverse() }));
  assert.notEqual(result.sourceFingerprint, deriveActivitySubmission(activity, [{ enrollmentId: "z", mark: { ...evidence, id: "revised", revision: 2 } }, sources[1]!], configuration).sourceFingerprint);
  for (const changed of [
    { ...configuration, templateId: "other-template" }, { ...configuration, templateVersion: 4 },
    { ...configuration, components: configuration.components.map((c) => c.code === "FORMATIVE_ACTIVITIES" ? { ...c, id: "other-component" } : c) },
    { ...configuration, components: configuration.components.map((c) => c.code === "FORMATIVE_ACTIVITIES" ? { ...c, maximum: "29.00" } : c) },
  ]) assert.notEqual(result.sourceFingerprint, deriveActivitySubmission(activity, sources, changed).sourceFingerprint);
  assert.throws(() => deriveActivitySubmission(activity, [], configuration), /approved enrollments/);
  assert.throws(() => deriveActivitySubmission(activity, [sources[0]!, sources[0]!], configuration), /Duplicate/);
  assert.throws(() => deriveActivitySubmission(activity, [{ enrollmentId: "z", mark: { ...evidence, weightedMark: new Prisma.Decimal(1) } }], configuration), /Inconsistent/);
});
test("weights must equal 30 independently of whether marks happen to exist", () => {
  for (const values of [[], [source("a", "29.99")], [source("a", "20"), source("b", "20")]]) {
    assert.throws(() => deriveTeacherSubmission(values), RangeError);
  }
  assert.throws(() => deriveTeacherSubmission([source("a", "15"), source("a", "15")]), /Duplicate/);
  assert.throws(() => deriveTeacherSubmission([{ ...source("a", "30"), mark: null }]), /complete marks/);
});
