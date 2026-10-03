import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export const FORMATIVE_FINAL_RULE = "FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1";
export const canonicalCompare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const finalFingerprint = (tokens: string[]) => createHash("sha256")
  .update(tokens.map((value) => `${Buffer.byteLength(value, "utf8")}:${value}`).join("")).digest("hex");

export interface FinalSource {
  activityId: string; submissionId: string; submissionVersion: number; submissionFingerprint: string;
  submissionItemId: string; markEvidenceId: string; weightedMark: string;
}
export function deriveFinalResult(enrollmentId: string, studentUserId: string, sources: FinalSource[]) {
  if (!sources.length || new Set(sources.map((s) => s.activityId)).size !== sources.length)
    throw new RangeError("Exactly one source per activity required");
  const ordered = [...sources].sort((a, b) => canonicalCompare(a.activityId, b.activityId));
  let total = new Prisma.Decimal(0);
  for (const source of ordered) {
    const mark = new Prisma.Decimal(source.weightedMark);
    if (!mark.isFinite() || mark.lt(0) || mark.gt(30) || mark.decimalPlaces() > 2)
      throw new RangeError("Invalid weighted source mark");
    total = total.add(mark);
  }
  if (total.gt(30)) throw new RangeError("Invalid Activities total");
  return { enrollmentId, studentUserId, mark: total.toFixed(2), fullMark: "30.00",
    sourceFingerprint: finalFingerprint([FORMATIVE_FINAL_RULE, enrollmentId, studentUserId,
      ...ordered.flatMap((s) => [s.activityId, s.submissionId, String(s.submissionVersion), s.submissionFingerprint,
        s.submissionItemId, s.markEvidenceId, new Prisma.Decimal(s.weightedMark).toFixed(2)])]), sources: ordered };
}
