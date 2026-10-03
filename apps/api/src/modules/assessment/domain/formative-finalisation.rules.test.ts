import assert from "node:assert/strict";
import test from "node:test";
import { deriveFinalResult, finalFingerprint, FORMATIVE_FINAL_RULE, type FinalSource } from "./formative-finalisation.rules";
import { FORMATIVE_RULE, weightedMark } from "./formative.rules";

const source = (activityId: string, weighted = "0.13"): FinalSource => ({ activityId, submissionId: `p-${activityId}`,
  submissionVersion: 2, submissionFingerprint: "a".repeat(64), submissionItemId: `i-${activityId}`,
  markEvidenceId: `m-${activityId}`, weightedMark: weighted });
test("final aggregation has a distinct rule and sums HALF_UP two-decimal source marks", () => {
  assert.notEqual(FORMATIVE_FINAL_RULE, FORMATIVE_RULE.versionCode);
  const mark = weightedMark("1", "8", "1").toFixed(2);
  assert.equal(deriveFinalResult("e", "s", [source("a", mark), source("b", "28.00")]).mark, "28.13");
  assert.equal(deriveFinalResult("e", "s", [source("a", "30")]).fullMark, "30.00");
});
test("framing is UTF-8 byte based and source ordering canonical", () => {
  const sources = [source("é"), source("z")];
  assert.deepEqual(deriveFinalResult("e", "s", sources), deriveFinalResult("e", "s", [...sources].reverse()));
  assert.notEqual(finalFingerprint(["é", "1:2"]), finalFingerprint(["é1", ":2"]));
  for (const field of ["activityId", "submissionId", "submissionFingerprint", "submissionItemId", "markEvidenceId"] as const)
    assert.notEqual(deriveFinalResult("e", "s", sources).sourceFingerprint,
      deriveFinalResult("e", "s", [{ ...sources[0]!, [field]: "changed" }, sources[1]!]).sourceFingerprint);
});
test("final result rejects missing/duplicate sources, non-finite, negative, over-bound and over-precision marks", () => {
  assert.throws(() => deriveFinalResult("e", "s", []));
  assert.throws(() => deriveFinalResult("e", "s", [source("a"), source("a")]));
  for (const value of ["NaN", "Infinity", "-0.01", "30.01", "0.001"])
    assert.throws(() => deriveFinalResult("e", "s", [source("a", value)]));
  assert.throws(() => deriveFinalResult("e", "s", [source("a", "20"), source("b", "20")]));
});
