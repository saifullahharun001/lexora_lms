import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const COURSE_COMPOSITION_RULE = "LAW_COURSE_100_COMPONENT_PASS_V1";
export const COURSE_COMPOSITION_AUDIT = "course-result.composed";

/** Consumes awarded source values only. No grade mapping or intermediate rounding. */
export function composeCourseResult(formative: string, summative: string, formativeFull: string, summativeFull: string) {
  const f = new Prisma.Decimal(formative), s = new Prisma.Decimal(summative);
  if (!new Prisma.Decimal(formativeFull).eq(40) || !new Prisma.Decimal(summativeFull).eq(60) ||
    !f.isFinite() || !s.isFinite() || f.lt(0) || f.gt(40) || s.lt(0) || s.gt(60) ||
    f.decimalPlaces() > 6 || s.decimalPlaces() > 6) {
    throw new ConflictException("Incompatible authoritative course-result marks");
  }
  const formativePassed = f.gte(16), summativePassed = s.gte(24);
  return { totalMark: f.plus(s), totalFullMark: new Prisma.Decimal(100),
    formativePassed, summativePassed, coursePassed: formativePassed && summativePassed };
}
