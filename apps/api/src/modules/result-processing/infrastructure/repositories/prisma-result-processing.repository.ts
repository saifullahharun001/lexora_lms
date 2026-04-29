import { Injectable } from "@nestjs/common";
import {
  Prisma,
  ResultAmendmentStatus,
  ResultPublicationBatchStatus,
  ResultRecordStatus
} from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  CreateGradeScaleInput,
  GradeScaleFilters,
  ResultComponentInput,
  ResultFilters,
  ResultProcessingRepositoryPort,
  UpdateGradeScaleInput,
  UpsertResultInput
} from "../../application/ports/result-processing.repository.port";
import type {
  AmendmentFilters,
  CgpaFilters,
  GpaFilters,
  PublicationFilters
} from "../../application/ports/result-processing.repository.port";

type JsonRecord = Record<string, Prisma.JsonValue | undefined>;

@Injectable()
export class PrismaResultProcessingRepository implements ResultProcessingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findGradeScales(filters: GradeScaleFilters) {
    return this.prisma.gradeScale.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        ...(filters.isActive === undefined ? {} : { isActive: filters.isActive })
      },
      include: {
        gradeRules: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  findGradeScaleById(departmentId: string, id: string) {
    return this.prisma.gradeScale.findFirst({
      where: { id, departmentId, archivedAt: null },
      include: {
        gradeRules: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" }
        }
      }
    });
  }

  findGradeScaleByCode(departmentId: string, code: string) {
    return this.prisma.gradeScale.findFirst({
      where: { departmentId, code, archivedAt: null }
    });
  }

  createGradeScale(input: CreateGradeScaleInput) {
    return this.prisma.gradeScale.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name,
        description: input.description,
        isDefault: input.isDefault,
        isActive: input.isActive,
        passGradePoint: input.passGradePoint
          ? new Prisma.Decimal(input.passGradePoint)
          : undefined,
        passPercentage: input.passPercentage
          ? new Prisma.Decimal(input.passPercentage)
          : undefined,
        settingsJson: input.settingsJson,
        updatedByUserId: input.updatedByUserId,
        gradeRules: input.rules
          ? {
              create: input.rules.map((rule, index) => ({
                sortOrder: rule.sortOrder ?? index,
                minPercentage: new Prisma.Decimal(rule.minPercentage),
                maxPercentage: new Prisma.Decimal(rule.maxPercentage),
                letterGrade: rule.letterGrade,
                gradePoint: new Prisma.Decimal(rule.gradePoint),
                isPassing: rule.isPassing,
                metadataJson: rule.metadataJson
              }))
            }
          : undefined
      },
      include: { gradeRules: { orderBy: { sortOrder: "asc" } } }
    });
  }

  updateGradeScale(departmentId: string, id: string, input: UpdateGradeScaleInput) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.gradeScale.updateMany({
        where: { id, departmentId, archivedAt: null },
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          isDefault: input.isDefault,
          isActive: input.isActive,
          passGradePoint: input.passGradePoint
            ? new Prisma.Decimal(input.passGradePoint)
            : undefined,
          passPercentage: input.passPercentage
            ? new Prisma.Decimal(input.passPercentage)
            : undefined,
          settingsJson: input.settingsJson,
          updatedByUserId: input.updatedByUserId
        }
      });

      if (result.count === 0) {
        return null;
      }

      if (input.rules) {
        await tx.gradeRule.deleteMany({ where: { gradeScaleId: id } });
        await tx.gradeRule.createMany({
          data: input.rules.map((rule, index) => ({
            gradeScaleId: id,
            sortOrder: rule.sortOrder ?? index,
            minPercentage: new Prisma.Decimal(rule.minPercentage),
            maxPercentage: new Prisma.Decimal(rule.maxPercentage),
            letterGrade: rule.letterGrade,
            gradePoint: new Prisma.Decimal(rule.gradePoint),
            isPassing: rule.isPassing ?? true,
            metadataJson: rule.metadataJson
          }))
        });
      }

      return tx.gradeScale.findFirst({
        where: { id, departmentId, archivedAt: null },
        include: { gradeRules: { orderBy: { sortOrder: "asc" } } }
      });
    });
  }

  findResults(filters: ResultFilters) {
    return this.prisma.resultRecord.findMany({
      where: {
        departmentId: filters.departmentId,
        archivedAt: null,
        ...(filters.academicTermId ? { academicTermId: filters.academicTermId } : {}),
        ...(filters.courseOfferingId ? { courseOfferingId: filters.courseOfferingId } : {}),
        ...(filters.enrollmentId ? { enrollmentId: filters.enrollmentId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        enrollment: filters.studentUserId ? { studentUserId: filters.studentUserId } : undefined
      },
      include: {
        components: true,
        gradeScale: true,
        enrollment: true
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      skip: filters.offset
    });
  }

  findResultById(departmentId: string, id: string) {
    return this.prisma.resultRecord.findFirst({
      where: { id, departmentId, archivedAt: null },
      include: {
        components: true,
        gradeScale: true,
        enrollment: true
      }
    });
  }

  findResultByEnrollment(departmentId: string, enrollmentId: string, courseOfferingId: string) {
    return this.prisma.resultRecord.findFirst({
      where: { departmentId, enrollmentId, courseOfferingId, archivedAt: null },
      include: { components: true }
    });
  }

  upsertDraftResult(input: UpsertResultInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.resultRecord.findFirst({
        where: {
          departmentId: input.departmentId,
          enrollmentId: input.enrollmentId,
          courseOfferingId: input.courseOfferingId,
          archivedAt: null
        },
        select: { id: true, status: true }
      });

      const blockedStatuses: ResultRecordStatus[] = [
        ResultRecordStatus.VERIFIED,
        ResultRecordStatus.PUBLISHED,
        ResultRecordStatus.LOCKED,
        ResultRecordStatus.AMENDED
      ];

      if (existing && blockedStatuses.includes(existing.status)) {
        return null;
      }

      const data = {
        departmentId: input.departmentId,
        academicTermId: input.academicTermId,
        courseOfferingId: input.courseOfferingId,
        enrollmentId: input.enrollmentId,
        gradeScaleId: input.gradeScaleId,
        status: ResultRecordStatus.COMPUTED,
        eligibilityStatus: input.eligibilityStatus,
        eligibilityReason: input.eligibilityReason,
        totalRawScore: new Prisma.Decimal(input.totalRawScore),
        normalizedPercentage: new Prisma.Decimal(input.normalizedPercentage),
        letterGrade: input.letterGrade,
        gradePoint: new Prisma.Decimal(input.gradePoint),
        creditHoursSnapshot: new Prisma.Decimal(input.creditHoursSnapshot),
        qualityPoints: new Prisma.Decimal(input.qualityPoints),
        computedSnapshotJson: input.computedSnapshotJson,
        computedByUserId: input.computedByUserId,
        computedAt: new Date()
      };

      if (!existing) {
        return tx.resultRecord.create({ data });
      }

      const result = await tx.resultRecord.updateMany({
        where: {
          id: existing.id,
          departmentId: input.departmentId,
          status: { in: [ResultRecordStatus.DRAFT, ResultRecordStatus.COMPUTED] },
          archivedAt: null
        },
        data
      });

      if (result.count === 0) {
        return null;
      }

      return tx.resultRecord.findFirst({
        where: { id: existing.id, departmentId: input.departmentId, archivedAt: null }
      });
    });
  }

  replaceResultComponents(
    departmentId: string,
    resultRecordId: string,
    components: ResultComponentInput[]
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.resultRecord.findFirst({
        where: {
          id: resultRecordId,
          departmentId,
          status: { in: [ResultRecordStatus.DRAFT, ResultRecordStatus.COMPUTED] },
          archivedAt: null
        },
        select: { id: true }
      });

      if (!result) {
        return [];
      }

      await tx.resultComponent.deleteMany({ where: { departmentId, resultRecordId } });

      if (components.length === 0) {
        return [];
      }

      await tx.resultComponent.createMany({
        data: components.map((component) => ({
          departmentId,
          resultRecordId,
          gradingRecordId: component.gradingRecordId,
          sourceType: component.sourceType,
          sourceEntityId: component.sourceEntityId,
          componentCode: component.componentCode,
          componentName: component.componentName,
          weightPercent: new Prisma.Decimal(component.weightPercent),
          rawScore: new Prisma.Decimal(component.rawScore),
          maxScore: new Prisma.Decimal(component.maxScore),
          normalizedPercentage: new Prisma.Decimal(component.normalizedPercentage),
          weightedScore: new Prisma.Decimal(component.weightedScore),
          sourceSnapshotJson: component.sourceSnapshotJson
        }))
      });

      return tx.resultComponent.findMany({ where: { departmentId, resultRecordId } });
    });
  }

  verifyResult(departmentId: string, id: string, actorId: string) {
    return this.transitionResult(departmentId, id, {
      allowed: [ResultRecordStatus.COMPUTED],
      data: {
        status: ResultRecordStatus.VERIFIED,
        verifiedAt: new Date()
      },
      afterUpdate: { verifiedByUser: { connect: { id: actorId } } }
    });
  }

  publishResult(departmentId: string, id: string, actorId: string, publicationBatchId?: string) {
    return this.transitionResult(departmentId, id, {
      allowed: [ResultRecordStatus.VERIFIED],
      data: {
        status: ResultRecordStatus.PUBLISHED,
        isPublished: true,
        publishedAt: new Date(),
        lockedAt: new Date(),
        publishedSnapshotJson: { publishedAt: new Date().toISOString() }
      },
      afterUpdate: {
        publishedByUser: { connect: { id: actorId } },
        ...(publicationBatchId
          ? { publicationBatch: { connect: { id: publicationBatchId } } }
          : {})
      }
    });
  }

  createPublicationBatch(input: {
    departmentId: string;
    academicTermId: string;
    batchCode: string;
    name: string;
    selectionSnapshotJson?: Prisma.InputJsonValue;
    initiatedByUserId: string;
  }) {
    return this.prisma.resultPublicationBatch.create({
      data: {
        departmentId: input.departmentId,
        academicTermId: input.academicTermId,
        batchCode: input.batchCode,
        name: input.name,
        selectionSnapshotJson: input.selectionSnapshotJson,
        initiatedByUserId: input.initiatedByUserId,
        status: ResultPublicationBatchStatus.PENDING
      }
    });
  }

  findPublicationBatches(filters: PublicationFilters) {
    return this.prisma.resultPublicationBatch.findMany({
      where: {
        departmentId: filters.departmentId,
        ...(filters.academicTermId ? { academicTermId: filters.academicTermId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      skip: filters.offset
    });
  }

  findPublicationBatchById(departmentId: string, id: string) {
    return this.prisma.resultPublicationBatch.findFirst({ where: { id, departmentId } });
  }

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
  }) {
    return this.prisma.gPARecord.upsert({
      where: {
        departmentId_academicTermId_studentUserId: {
          departmentId: input.departmentId,
          academicTermId: input.academicTermId,
          studentUserId: input.studentUserId
        }
      },
      update: {
        attemptedCredits: new Prisma.Decimal(input.attemptedCredits),
        earnedCredits: new Prisma.Decimal(input.earnedCredits),
        qualityPoints: new Prisma.Decimal(input.qualityPoints),
        gpa: new Prisma.Decimal(input.gpa),
        resultCount: input.resultCount,
        computedSnapshotJson: input.computedSnapshotJson,
        computedByUserId: input.computedByUserId,
        computedAt: new Date()
      },
      create: {
        departmentId: input.departmentId,
        academicTermId: input.academicTermId,
        studentUserId: input.studentUserId,
        attemptedCredits: new Prisma.Decimal(input.attemptedCredits),
        earnedCredits: new Prisma.Decimal(input.earnedCredits),
        qualityPoints: new Prisma.Decimal(input.qualityPoints),
        gpa: new Prisma.Decimal(input.gpa),
        resultCount: input.resultCount,
        computedSnapshotJson: input.computedSnapshotJson,
        computedByUserId: input.computedByUserId,
        computedAt: new Date()
      }
    });
  }

  findGpaRecords(filters: GpaFilters) {
    return this.prisma.gPARecord.findMany({
      where: {
        departmentId: filters.departmentId,
        ...(filters.academicTermId ? { academicTermId: filters.academicTermId } : {}),
        ...(filters.studentUserId ? { studentUserId: filters.studentUserId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

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
  }) {
    return this.prisma.cGPARecord.upsert({
      where: {
        departmentId_studentUserId: {
          departmentId: input.departmentId,
          studentUserId: input.studentUserId
        }
      },
      update: {
        asOfAcademicTermId: input.asOfAcademicTermId,
        attemptedCredits: new Prisma.Decimal(input.attemptedCredits),
        earnedCredits: new Prisma.Decimal(input.earnedCredits),
        cumulativeQualityPoints: new Prisma.Decimal(input.cumulativeQualityPoints),
        cgpa: new Prisma.Decimal(input.cgpa),
        termCount: input.termCount,
        computedSnapshotJson: input.computedSnapshotJson,
        computedByUserId: input.computedByUserId,
        computedAt: new Date()
      },
      create: {
        departmentId: input.departmentId,
        studentUserId: input.studentUserId,
        asOfAcademicTermId: input.asOfAcademicTermId,
        attemptedCredits: new Prisma.Decimal(input.attemptedCredits),
        earnedCredits: new Prisma.Decimal(input.earnedCredits),
        cumulativeQualityPoints: new Prisma.Decimal(input.cumulativeQualityPoints),
        cgpa: new Prisma.Decimal(input.cgpa),
        termCount: input.termCount,
        computedSnapshotJson: input.computedSnapshotJson,
        computedByUserId: input.computedByUserId,
        computedAt: new Date()
      }
    });
  }

  findCgpaRecords(filters: CgpaFilters) {
    return this.prisma.cGPARecord.findMany({
      where: {
        departmentId: filters.departmentId,
        ...(filters.studentUserId ? { studentUserId: filters.studentUserId } : {}),
        ...(filters.asOfAcademicTermId ? { asOfAcademicTermId: filters.asOfAcademicTermId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  createAmendment(input: {
    departmentId: string;
    resultRecordId: string;
    reason: string;
    requestedByUserId: string;
    requestSnapshotJson?: Prisma.InputJsonValue;
    previousSnapshotJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.resultAmendmentRecord.create({
      data: {
        departmentId: input.departmentId,
        resultRecordId: input.resultRecordId,
        reason: input.reason,
        requestedByUserId: input.requestedByUserId,
        requestSnapshotJson: input.requestSnapshotJson,
        previousSnapshotJson: input.previousSnapshotJson,
        status: ResultAmendmentStatus.REQUESTED
      }
    });
  }

  findAmendments(filters: AmendmentFilters) {
    return this.prisma.resultAmendmentRecord.findMany({
      where: {
        departmentId: filters.departmentId,
        ...(filters.resultRecordId ? { resultRecordId: filters.resultRecordId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      skip: filters.offset
    });
  }

  approveAmendment(departmentId: string, id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.resultAmendmentRecord.updateMany({
        where: { id, departmentId, status: ResultAmendmentStatus.REQUESTED },
        data: {
          status: ResultAmendmentStatus.APPROVED,
          approvedByUserId: actorId,
          approvedAt: new Date()
        }
      });

      if (result.count === 0) {
        return null;
      }

      return tx.resultAmendmentRecord.findFirst({ where: { id, departmentId } });
    });
  }

  applyAmendment(
    departmentId: string,
    id: string,
    actorId: string,
    appliedSnapshotJson?: Prisma.InputJsonValue
  ) {
    return this.prisma.$transaction(async (tx) => {
      const amendment = await tx.resultAmendmentRecord.findFirst({
        where: { id, departmentId, status: ResultAmendmentStatus.APPROVED },
        include: { resultRecord: true }
      });

      if (!amendment) {
        return null;
      }

      const proposed = this.asJsonRecord(amendment.requestSnapshotJson);
      const proposedSnapshot = this.toInputJsonObject(proposed);
      const previousComputedSnapshotJson = amendment.resultRecord.computedSnapshotJson
        ? this.toInputJsonValue(amendment.resultRecord.computedSnapshotJson)
        : undefined;
      const resultData: Prisma.ResultRecordUpdateManyMutationInput = {
        amendedAt: new Date(),
        status: ResultRecordStatus.AMENDED,
        computedSnapshotJson: {
          ...(previousComputedSnapshotJson ? { previousComputedSnapshotJson } : {}),
          amendmentId: amendment.id,
          proposed: proposedSnapshot
        }
      };

      const normalizedPercentage = this.getStringField(proposed, "normalizedPercentage");
      const letterGrade = this.getStringField(proposed, "letterGrade");
      const gradePoint = this.getStringField(proposed, "gradePoint");

      if (normalizedPercentage) {
        resultData.normalizedPercentage = new Prisma.Decimal(normalizedPercentage);
      }
      if (letterGrade) {
        resultData.letterGrade = letterGrade;
      }
      if (gradePoint) {
        resultData.gradePoint = new Prisma.Decimal(gradePoint);
        resultData.qualityPoints = new Prisma.Decimal(gradePoint).mul(
          amendment.resultRecord.creditHoursSnapshot
        );
      }

      const resultUpdate = await tx.resultRecord.updateMany({
        where: {
          id: amendment.resultRecordId,
          departmentId,
          status: { in: [ResultRecordStatus.PUBLISHED, ResultRecordStatus.LOCKED] },
          archivedAt: null
        },
        data: resultData
      });

      if (resultUpdate.count === 0) {
        return null;
      }

      await tx.resultAmendmentRecord.updateMany({
        where: { id, departmentId, status: ResultAmendmentStatus.APPROVED },
        data: {
          status: ResultAmendmentStatus.APPLIED,
          appliedByUserId: actorId,
          appliedAt: new Date(),
          appliedSnapshotJson
        }
      });

      return tx.resultAmendmentRecord.findFirst({ where: { id, departmentId } });
    });
  }

  private transitionResult(
    departmentId: string,
    id: string,
    input: {
      allowed: ResultRecordStatus[];
      data: Prisma.ResultRecordUpdateManyMutationInput;
      afterUpdate?: Prisma.ResultRecordUpdateInput;
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.resultRecord.updateMany({
        where: {
          id,
          departmentId,
          status: { in: input.allowed },
          archivedAt: null
        },
        data: input.data
      });

      if (result.count === 0) {
        return null;
      }

      if (input.afterUpdate) {
        await tx.resultRecord.update({
          where: { id },
          data: input.afterUpdate
        });
      }

      return tx.resultRecord.findFirst({
        where: { id, departmentId, archivedAt: null }
      });
    });
  }

  private asJsonRecord(value: Prisma.JsonValue | null): JsonRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as JsonRecord;
  }

  private getStringField(record: JsonRecord, key: string) {
    const value = record[key];
    return typeof value === "string" ? value : undefined;
  }

  private toInputJsonObject(record: JsonRecord): Prisma.InputJsonObject {
    const output: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) {
        continue;
      }

      output[key] = value === null ? null : this.toInputJsonValue(value) ?? null;
    }

    return output as Prisma.InputJsonObject;
  }

  private toInputJsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue | undefined {
    if (value === null) {
      return undefined;
    }

    if (typeof value !== "object") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => {
        return item === null ? null : this.toInputJsonValue(item) ?? null;
      }) as Prisma.InputJsonArray;
    }

    return this.toInputJsonObject(value as JsonRecord);
  }
}
