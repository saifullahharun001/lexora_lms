import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { comprehensiveDecimal, deriveComprehensive, COMPREHENSIVE_SEATS, requiredSeats } from "./comprehensive.rules";

const maximum = new Prisma.Decimal(5);
for (const value of ["-1", "5.0001", "NaN", "Infinity", "1e0", " 1", "1 ", "1.12345", "", ".5", "1.", null, undefined, 4]) {
  test(`reject malformed/out-of-range mark ${String(value)}`, () => assert.throws(() => comprehensiveDecimal(value as string, maximum)));
}
for (const value of ["0", "0.0000", "1.2345", "5", "5.0000"]) {
  test(`accept exact bounded mark ${value}`, () => assert.ok(comprehensiveDecimal(value, maximum).eq(value)));
}
test("four seat average retains the exact six decimal places without rounding", () => {
  const marks = ["0", "0", "0", "0.0001"];
  assert.equal(deriveComprehensive("ALL_MEMBERS_AVERAGE", maximum, COMPREHENSIVE_SEATS.map((seat, i) => ({ seat, mark: new Prisma.Decimal(marks[i]!) }))).toFixed(), "0.000025");
});
test("average of four distinct seat marks", () => {
  assert.equal(deriveComprehensive("ALL_MEMBERS_AVERAGE", maximum, COMPREHENSIVE_SEATS.map((seat, i) => ({ seat, mark: new Prisma.Decimal(i + 1) }))).toFixed(), "2.5");
});
test("external seat is mandatory; three marks never become a final mark", () => {
  assert.throws(() => deriveComprehensive("ALL_MEMBERS_AVERAGE", maximum, COMPREHENSIVE_SEATS.slice(0, 3).map((seat) => ({ seat, mark: maximum }))));
});
test("duplicate seats cannot substitute for missing external evidence", () => {
  assert.throws(() => deriveComprehensive("ALL_MEMBERS_AVERAGE", maximum, Array.from({ length: 4 }, () => ({ seat: "CHAIRMAN", mark: maximum }))));
});
test("distributed value comes only from assigned seat", () => {
  assert.equal(deriveComprehensive("COURSE_DISTRIBUTED", maximum, [{ seat: "EXTERNAL_MEMBER", mark: new Prisma.Decimal("4.1234") }], "EXTERNAL_MEMBER").toFixed(), "4.1234");
  assert.throws(() => deriveComprehensive("COURSE_DISTRIBUTED", maximum, [{ seat: "MEMBER_1", mark: maximum }], "EXTERNAL_MEMBER"));
});
test("Chairman-only has no invented Member review requirement", () => {
  assert.deepEqual(requiredSeats("CHAIRMAN_ONLY"), ["CHAIRMAN"]);
  assert.equal(deriveComprehensive("CHAIRMAN_ONLY", maximum, [{ seat: "CHAIRMAN", mark: new Prisma.Decimal(0) }]).toFixed(), "0");
});
test("full mark is configuration-driven", () => {
  assert.ok(comprehensiveDecimal("8", new Prisma.Decimal(10)).eq(8));
  assert.throws(() => comprehensiveDecimal("5", new Prisma.Decimal(3)));
});
