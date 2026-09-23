import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const COMPREHENSIVE_MODES = ["ALL_MEMBERS_AVERAGE", "COURSE_DISTRIBUTED", "CHAIRMAN_ONLY"] as const;
export const COMPREHENSIVE_SEATS = ["CHAIRMAN", "MEMBER_1", "MEMBER_2", "EXTERNAL_MEMBER"] as const;
export const COMPREHENSIVE_CALCULATION = "COMPREHENSIVE_EXACT_DECIMAL_V1";

/** Four entered decimal places; averaging four needs six. No academic rounding is performed. */
export function comprehensiveDecimal(value: string, fullMark: Prisma.Decimal) {
  if (typeof value !== "string" || !/^\d{1,4}(\.\d{1,4})?$/.test(value)) throw new BadRequestException("Mark must be a decimal string with at most four decimal places");
  const mark = new Prisma.Decimal(value);
  if (!mark.isFinite() || mark.lt(0) || mark.gt(fullMark)) throw new BadRequestException("Mark is outside the authoritative component range");
  return mark;
}

export function requiredSeats(mode: string, assignedSeat?: string) {
  if (mode === "ALL_MEMBERS_AVERAGE") return [...COMPREHENSIVE_SEATS];
  if (mode === "CHAIRMAN_ONLY") return ["CHAIRMAN"];
  if (mode === "COURSE_DISTRIBUTED" && assignedSeat && (COMPREHENSIVE_SEATS as readonly string[]).includes(assignedSeat)) return [assignedSeat];
  throw new ConflictException("Complete current course distribution is required");
}

export function deriveComprehensive(mode: string, fullMark: Prisma.Decimal,
  sources: Array<{ seat: string; mark: Prisma.Decimal }>, assignedSeat?: string) {
  const seats = requiredSeats(mode, assignedSeat);
  if (sources.length !== seats.length || new Set(sources.map((s) => s.seat)).size !== seats.length ||
    seats.some((seat) => !sources.some((s) => s.seat === seat))) throw new ConflictException("Required submitted seat evidence is incomplete");
  for (const source of sources) comprehensiveDecimal(source.mark.toFixed(), fullMark);
  return sources.reduce((sum, source) => sum.plus(source.mark), new Prisma.Decimal(0)).div(seats.length);
}
