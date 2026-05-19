import type { EligibilityStatus } from "@prisma/client";

export interface EligibilityCounts {
  totalCountedSessions: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  absentCount: number;
}

export interface EligibilityComputationSnapshot {
  computedBy: string;
  computedAt: string;
  rule: {
    type: "attendance_percentage";
    thresholdPercentage: 75;
    conditionalThresholdPercentage: 65;
  };
  counts: EligibilityCounts;
  attendancePercentage: number | null;
  courseOfferingId: string;
  enrollmentId: string;
}

export interface EligibilityComputationResult {
  enrollmentId: string;
  courseOfferingId: string;
  eligibilityStatus: EligibilityStatus;
  snapshot: EligibilityComputationSnapshot;
  enrollment: unknown;
}

export interface EligibilityCourseOfferingSummary {
  totalEnrollments: number;
  computedCount: number;
  eligibleCount: number;
  conditionalCount: number;
  ineligibleCount: number;
  pendingReviewCount: number;
}

