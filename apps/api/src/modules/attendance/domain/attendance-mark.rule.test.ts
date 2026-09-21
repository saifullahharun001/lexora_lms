import assert from "node:assert/strict";
import test from "node:test";
import { attendanceMarkForCounts, attendanceMarkForPercentage, assertCurrentAttendanceStatus, historicalAttendanceWasAttended, ATTENDANCE_MARK_RULE } from "./attendance-mark.rule";

test("approved Attendance /5 intervals are exact at every boundary", () => {
  for (const [percentage, expected] of [
    ["100", "5"], ["90", "5"], ["89.99", "4.5"], ["85", "4.5"],
    ["84.99", "4"], ["80", "4"], ["79.99", "3.5"], ["75", "3.5"],
    ["74.99", "3"], ["70", "3"], ["69.99", "2.5"], ["65", "2.5"],
    ["64.99", "2"], ["60", "2"], ["59.99", "0"], ["0", "0"],
    ["89.999999999999", "4.5"],
  ]) assert.equal(attendanceMarkForPercentage(percentage!).toString(), expected);
});

test("count ratios are compared without rounding across a band; undefined denominator is blocked", () => {
  assert.equal(attendanceMarkForCounts(89999, 100000).mark.toString(), "4.5");
  assert.equal(attendanceMarkForCounts(9, 10).mark.toString(), "5");
  assert.equal(attendanceMarkForCounts(6, 10).mark.toString(), "2");
  assert.equal(attendanceMarkForCounts(0, 10).mark.toString(), "0");
  assert.equal(attendanceMarkForCounts(9, 10).ruleVersionCode, ATTENDANCE_MARK_RULE.versionCode);
  for (const counts of [[0, 0], [1, 0], [-1, 10], [11, 10], [1.5, 10], [1, NaN]]) {
    assert.throws(() => attendanceMarkForCounts(counts[0]!, counts[1]!), RangeError);
  }
  for (const value of ["-0.01", "100.01", "NaN", "Infinity"]) assert.throws(() => attendanceMarkForPercentage(value));
});

test("malformed attendance percentages produce the safe domain validation failure", () => {
  assert.throws(() => attendanceMarkForPercentage("abc"), {
    name: "RangeError",
    message: "Invalid attendance percentage",
  });
});

test("legacy compatibility never authorises new LATE or EXCUSED evidence", () => {
  for (const status of ["PRESENT", "LATE", "EXCUSED"]) assert.equal(historicalAttendanceWasAttended(status), true);
  assert.equal(historicalAttendanceWasAttended("ABSENT"), false);
  for (const status of ["LATE", "EXCUSED", "UNRESOLVED"]) assert.throws(() => assertCurrentAttendanceStatus(status), RangeError);
  for (const status of ["PRESENT", "ABSENT"]) assert.doesNotThrow(() => assertCurrentAttendanceStatus(status));
  assert.throws(() => historicalAttendanceWasAttended("UNRESOLVED"), RangeError);
  assert.ok(Object.isFrozen(ATTENDANCE_MARK_RULE));
  assert.ok(Object.isFrozen(ATTENDANCE_MARK_RULE.bands));
  assert.ok(ATTENDANCE_MARK_RULE.bands.every(Object.isFrozen));
});
