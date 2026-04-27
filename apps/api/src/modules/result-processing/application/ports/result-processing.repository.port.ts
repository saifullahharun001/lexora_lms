import type {
  CGPARecord,
  EligibilityStatus,
  GPARecord,
  GradeScale,
  ResultAmendmentRecord,
  ResultComponent,
  ResultPublicationBatch,
  Prisma,
  ResultAmendmentStatus,
  ResultPublicationBatchStatus,
  ResultRecord,
  ResultRecordStatus
} from "@prisma/client";

export type GradeScaleWithRules = Prisma.GradeScaleGetPayload<{
  include: { gradeRules: true };
}>;

export type ResultRecordWithDetails = Prisma.ResultRecordGetPayload<{
  include: {
    components: true;
    gradeScale: true;
    enrollment: true;
  };
}>;

export type ResultRecordWithComponents = Prisma.ResultRecordGetPayload<{
  include: { components: true };
}>;

export interface GradeRuleInput {
  minPercentage: string;
  maxPercentage: string;
  letterGrade: string;
  gradePoint: string;
  isPassing?: boolean;
  sortOrder?: number;
  metadataJson?: Prisma.InputJsonValue;
}

export interface CreateGradeScaleInput {
  departmentId: string;
  code: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
  passGradePoint?: string;
  passPercentage?: string;
  settingsJson?: Prisma.InputJsonValue;
  updatedByUserId: string;
  rules?: GradeRuleInput[];
}

export type UpdateGradeScaleInput = Partial<Omit<CreateGradeScaleInput, "departmentId" | "rules">> & {
  rules?: GradeRuleInput[];
};

export interface ResultFilters {
  departmentId: string;
  academicTermId?: string;
  courseOfferingId?: string;
  enrollmentId?: string;
  studentUserId?: string;
  status?: ResultRecordStatus;
}

export interface GradeScaleFilters {
  departmentId: string;
  isActive?: boolean;
}

export interface UpsertResultInput {
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  enrollmentId: string;
  gradeScaleId: string;
  eligibilityStatus: EligibilityStatus;
  eligibilityReason?: string;
  totalRawScore: string;
  normalizedPercentage: string;
  letterGrade: string;
  gradePoint: string;
  creditHoursSnapshot: string;
  qualityPoints: string;
  computedSnapshotJson: Prisma.InputJsonValue;
  computedByUserId: string;
}

export interface ResultComponentInput {
  departmentId: string;
  resultRecordId: string;
  gradingRecordId?: string;
  sourceType: "ASSIGNMENT" | "QUIZ" | "MANUAL";
  sourceEntityId?: string;
  componentCode: string;
  componentName: string;
  weightPercent: string;
  rawScore: string;
  maxScore: string;
  normalizedPercentage: string;
  weightedScore: string;
  sourceSnapshotJson?: Prisma.InputJsonValue;
}

export interface GpaFilters {
  departmentId: string;
  academicTermId?: string;
  studentUserId?: string;
}

export interface CgpaFilters {
  departmentId: string;
  studentUserId?: string;
  asOfAcademicTermId?: string;
}

export interface PublicationFilters {
  departmentId: string;
  academicTermId?: string;
  status?: ResultPublicationBatchStatus;
}

export interface AmendmentFilters {
  departmentId: string;
  resultRecordId?: string;
  status?: ResultAmendmentStatus;
}

export interface ResultProcessingRepositoryPort {
  findGradeScales(filters: GradeScaleFilters): Promise<GradeScaleWithRules[]>;
  findGradeScaleById(departmentId: string, id: string): Promise<GradeScaleWithRules | null>;
  findGradeScaleByCode(departmentId: string, code: string): Promise<GradeScale | null>;
  createGradeScale(input: CreateGradeScaleInput): Promise<GradeScaleWithRules>;
  updateGradeScale(
    departmentId: string,
    id: string,
    input: UpdateGradeScaleInput
  ): Promise<GradeScaleWithRules | null>;

  findResults(filters: ResultFilters): Promise<ResultRecordWithDetails[]>;
  findResultById(departmentId: string, id: string): Promise<ResultRecordWithDetails | null>;
  findResultByEnrollment(
    departmentId: string,
    enrollmentId: string,
    courseOfferingId: string
  ): Promise<ResultRecordWithComponents | null>;
  upsertDraftResult(input: UpsertResultInput): Promise<ResultRecord | null>;
  replaceResultComponents(
    departmentId: string,
    resultRecordId: string,
    components: ResultComponentInput[]
  ): Promise<ResultComponent[]>;
  verifyResult(departmentId: string, id: string, actorId: string): Promise<ResultRecord | null>;
  publishResult(
    departmentId: string,
    id: string,
    actorId: string,
    publicationBatchId?: string
  ): Promise<ResultRecord | null>;

  createPublicationBatch(input: {
    departmentId: string;
    academicTermId: string;
    batchCode: string;
    name: string;
    selectionSnapshotJson?: Prisma.InputJsonValue;
    initiatedByUserId: string;
  }): Promise<ResultPublicationBatch>;
  findPublicationBatches(filters: PublicationFilters): Promise<ResultPublicationBatch[]>;
  findPublicationBatchById(
    departmentId: string,
    id: string
  ): Promise<ResultPublicationBatch | null>;

  upsertGpaRecord(input: {
    departmentId: string;
    academicTermId: string;
    studentUserId: string;
    attemptedCredits: string;
    earnedCredits: string;
    qualityPoints: string;
    gpa: string;
    resultCount: number;
    computedSnapshotJson: Prisma.InputJsonValue;
    computedByUserId: string;
  }): Promise<GPARecord>;
  findGpaRecords(filters: GpaFilters): Promise<GPARecord[]>;
  upsertCgpaRecord(input: {
    departmentId: string;
    studentUserId: string;
    asOfAcademicTermId?: string;
    attemptedCredits: string;
    earnedCredits: string;
    cumulativeQualityPoints: string;
    cgpa: string;
    termCount: number;
    computedSnapshotJson: Prisma.InputJsonValue;
    computedByUserId: string;
  }): Promise<CGPARecord>;
  findCgpaRecords(filters: CgpaFilters): Promise<CGPARecord[]>;

  createAmendment(input: {
    departmentId: string;
    resultRecordId: string;
    reason: string;
    requestedByUserId: string;
    requestSnapshotJson?: Prisma.InputJsonValue;
    previousSnapshotJson?: Prisma.InputJsonValue;
  }): Promise<ResultAmendmentRecord>;
  findAmendments(filters: AmendmentFilters): Promise<ResultAmendmentRecord[]>;
  approveAmendment(
    departmentId: string,
    id: string,
    actorId: string
  ): Promise<ResultAmendmentRecord | null>;
  applyAmendment(
    departmentId: string,
    id: string,
    actorId: string,
    appliedSnapshotJson?: Prisma.InputJsonValue
  ): Promise<ResultAmendmentRecord | null>;
}
