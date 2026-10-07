import { Prisma } from "@prisma/client";

export const FINAL_FORMATIVE_RULE = "FINAL_FORMATIVE_40_SUM_V1";
export const FINAL_FORMATIVE_AUDIT_EVENTS = { MATERIALISED: "formative.final.materialised" } as const;

/** These inputs are authoritative snapshots resolved internally, never request values. */
export function composeFinalFormative(activities: string, attendance: string, comprehensive: string) {
  const marks = [activities, attendance, comprehensive].map((value) => new Prisma.Decimal(value));
  marks.forEach((mark, i) => {
    if (!mark.isFinite() || mark.lt(0) || mark.gt([30, 5, 5][i]!)) throw new RangeError("Invalid Final Formative component");
  });
  const total = marks.reduce((sum, mark) => sum.plus(mark), new Prisma.Decimal(0));
  if (!total.isFinite() || total.lt(0) || total.gt(40) || total.decimalPlaces() > 6)
    throw new RangeError("Invalid Final Formative total");
  return total;
}
