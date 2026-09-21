import { Prisma } from "@prisma/client";

// Supersedes the old marking rubric only. Never used by Examination Eligibility.
// Future evidence must retain this version and the exact counted source evidence.
export const ATTENDANCE_MARK_RULE = Object.freeze({
  versionCode: "FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1",
  maximum: "5.0",
  bands: Object.freeze([
    Object.freeze({ minimum: "90", mark: "5.0" }),
    Object.freeze({ minimum: "85", mark: "4.5" }),
    Object.freeze({ minimum: "80", mark: "4.0" }),
    Object.freeze({ minimum: "75", mark: "3.5" }),
    Object.freeze({ minimum: "70", mark: "3.0" }),
    Object.freeze({ minimum: "65", mark: "2.5" }),
    Object.freeze({ minimum: "60", mark: "2.0" }),
    Object.freeze({ minimum: "0", mark: "0" }),
  ]),
});

/** Internal arithmetic only: no endpoint accepts a client percentage. */
export function attendanceMarkForPercentage(value: string | Prisma.Decimal) {
  let percentage: Prisma.Decimal;
  try {
    percentage = new Prisma.Decimal(value);
  } catch {
    throw new RangeError("Invalid attendance percentage");
  }
  if (!percentage.isFinite() || percentage.lt(0) || percentage.gt(100)) {
    throw new RangeError("Invalid attendance percentage");
  }
  const band = ATTENDANCE_MARK_RULE.bands.find((entry) => percentage.gte(entry.minimum))!;
  return new Prisma.Decimal(band.mark);
}

/** Compare exact count ratios against thresholds before any display rounding. */
export function attendanceMarkForCounts(attended: number, conducted: number) {
  if (!Number.isSafeInteger(attended) || !Number.isSafeInteger(conducted) ||
      attended < 0 || conducted <= 0 || attended > conducted) {
    throw new RangeError("Complete nonempty counted attendance evidence is required");
  }
  const numerator = new Prisma.Decimal(attended).mul(100);
  const band = ATTENDANCE_MARK_RULE.bands.find((entry) =>
    numerator.gte(new Prisma.Decimal(entry.minimum).mul(conducted)))!;
  return { mark: new Prisma.Decimal(band.mark), ruleVersionCode: ATTENDANCE_MARK_RULE.versionCode };
}

/** Only for already persisted legacy evidence; never authorises capture. */
export function historicalAttendanceWasAttended(status: string) {
  if (["PRESENT", "LATE", "EXCUSED"].includes(status)) return true;
  if (status === "ABSENT") return false;
  throw new RangeError("Unresolved attendance status");
}

export function assertCurrentAttendanceStatus(status: string) {
  if (status !== "PRESENT" && status !== "ABSENT") {
    throw new RangeError("Current attendance evidence must be PRESENT or ABSENT");
  }
}
