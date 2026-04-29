import { Injectable } from "@nestjs/common";
import {
  Prisma,
  TranscriptRecordStatus,
  TranscriptRevocationStatus,
  TranscriptVerificationTokenStatus,
  TranscriptVersionStatus
} from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  CreateTranscriptSnapshotInput,
  ListTranscriptFilters,
  PublicVerificationTokenDetails,
  TranscriptRecordDetails,
  TranscriptSealDetails,
  TranscriptVerificationRepositoryPort,
  TranscriptVersionDetails
} from "../../application/ports/transcript-verification.repository.port";

@Injectable()
export class PrismaTranscriptVerificationRepository
  implements TranscriptVerificationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  listTranscriptRecords(filters: ListTranscriptFilters) {
    return this.prisma.transcriptRecord.findMany({
      where: {
        departmentId: filters.departmentId,
        studentUserId: filters.studentUserId,
        status: filters.status as TranscriptRecordStatus | undefined,
        archivedAt: null
      },
      orderBy: { updatedAt: "desc" },
      take: filters.limit,
      skip: filters.offset
    });
  }

  findTranscriptRecordById(departmentId: string, id: string) {
    return this.prisma.transcriptRecord.findFirst({
      where: { id, departmentId, archivedAt: null },
      include: this.recordInclude()
    });
  }

  createTranscriptSnapshot(input: CreateTranscriptSnapshotInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.transcriptRecord.findFirst({
        where: {
          departmentId: input.departmentId,
          studentUserId: input.studentUserId,
          archivedAt: null
        },
        orderBy: { createdAt: "asc" }
      });

      const versionNumber = (existing?.latestVersionNumber ?? 0) + 1;
      const record = existing
        ? await tx.transcriptRecord.update({
            where: { id: existing.id },
            data: { latestVersionNumber: versionNumber }
          })
        : await tx.transcriptRecord.create({
            data: {
              departmentId: input.departmentId,
              studentUserId: input.studentUserId,
              transcriptNumber: input.transcriptNumber,
              status: TranscriptRecordStatus.GENERATED,
              latestVersionNumber: versionNumber,
              generatedByUserId: input.generatedByUserId
            }
          });

      const version = await tx.transcriptVersion.create({
        data: {
          departmentId: input.departmentId,
          transcriptRecordId: record.id,
          sourceCgpaRecordId: input.sourceCgpaRecordId,
          versionNumber,
          status: TranscriptVersionStatus.GENERATED,
          generatedByUserId: input.generatedByUserId,
          studentSnapshotJson: input.studentSnapshotJson,
          programSnapshotJson: input.programSnapshotJson,
          departmentSnapshotJson: input.departmentSnapshotJson,
          printStructureJson: input.printStructureJson,
          cumulativeAttemptedCredits: input.cumulativeAttemptedCredits
            ? new Prisma.Decimal(input.cumulativeAttemptedCredits)
            : undefined,
          cumulativeEarnedCredits: input.cumulativeEarnedCredits
            ? new Prisma.Decimal(input.cumulativeEarnedCredits)
            : undefined,
          cgpaSnapshot: input.cgpaSnapshot ? new Prisma.Decimal(input.cgpaSnapshot) : undefined,
          academicStandingStatus: input.academicStandingStatus,
          completionStatus: input.completionStatus,
          graduationStatus: input.graduationStatus
        }
      });

      for (const term of input.termSummaries) {
        const summary = await tx.transcriptTermSummary.create({
          data: {
            departmentId: input.departmentId,
            transcriptVersionId: version.id,
            academicTermId: term.academicTermId,
            sourceGpaRecordId: term.sourceGpaRecordId,
            sortOrder: term.sortOrder,
            termCodeSnapshot: term.termCodeSnapshot,
            termNameSnapshot: term.termNameSnapshot,
            attemptedCredits: term.attemptedCredits
              ? new Prisma.Decimal(term.attemptedCredits)
              : undefined,
            earnedCredits: term.earnedCredits
              ? new Prisma.Decimal(term.earnedCredits)
              : undefined,
            qualityPoints: term.qualityPoints
              ? new Prisma.Decimal(term.qualityPoints)
              : undefined,
            termGpaSnapshot: term.termGpaSnapshot
              ? new Prisma.Decimal(term.termGpaSnapshot)
              : undefined,
            cumulativeCgpaSnapshot: term.cumulativeCgpaSnapshot
              ? new Prisma.Decimal(term.cumulativeCgpaSnapshot)
              : undefined,
            academicStandingStatus: term.academicStandingStatus
          }
        });

        if (term.courseLines.length > 0) {
          await tx.transcriptCourseLine.createMany({
            data: term.courseLines.map((line) => ({
              departmentId: input.departmentId,
              transcriptVersionId: version.id,
              transcriptTermSummaryId: summary.id,
              resultRecordId: line.resultRecordId,
              courseOfferingId: line.courseOfferingId,
              sortOrder: line.sortOrder,
              courseCodeSnapshot: line.courseCodeSnapshot,
              courseTitleSnapshot: line.courseTitleSnapshot,
              creditHoursSnapshot: new Prisma.Decimal(line.creditHoursSnapshot),
              normalizedPercentage: line.normalizedPercentage
                ? new Prisma.Decimal(line.normalizedPercentage)
                : undefined,
              letterGrade: line.letterGrade,
              gradePoint: line.gradePoint ? new Prisma.Decimal(line.gradePoint) : undefined,
              qualityPoints: line.qualityPoints
                ? new Prisma.Decimal(line.qualityPoints)
                : undefined,
              isCountedInGpa: line.isCountedInGpa,
              completionStatus: line.completionStatus,
              remarks: line.remarks
            }))
          });
        }
      }

      return tx.transcriptRecord.findFirstOrThrow({
        where: { id: record.id, departmentId: input.departmentId, archivedAt: null },
        include: this.recordInclude()
      });
    });
  }

  listTranscriptVersions(
    departmentId: string,
    transcriptRecordId: string,
    pagination?: { limit?: number; offset?: number }
  ) {
    return this.prisma.transcriptVersion.findMany({
      where: {
        departmentId,
        transcriptRecordId,
        transcriptRecord: { departmentId, archivedAt: null }
      },
      include: this.versionInclude(),
      orderBy: { versionNumber: "desc" },
      take: pagination?.limit,
      skip: pagination?.offset
    });
  }

  findTranscriptVersionById(departmentId: string, id: string) {
    return this.prisma.transcriptVersion.findFirst({
      where: { id, departmentId, transcriptRecord: { departmentId, archivedAt: null } },
      include: this.versionInclude()
    });
  }

  issueTranscript(departmentId: string, transcriptRecordId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.transcriptVersion.findFirst({
        where: {
          departmentId,
          transcriptRecordId,
          status: TranscriptVersionStatus.GENERATED,
          transcriptRecord: { departmentId, archivedAt: null }
        },
        orderBy: { versionNumber: "desc" }
      });

      if (!version) {
        return null;
      }

      const now = new Date();
      const versionUpdate = await tx.transcriptVersion.updateMany({
        where: { id: version.id, departmentId, status: TranscriptVersionStatus.GENERATED },
        data: {
          status: TranscriptVersionStatus.ISSUED,
          issuedByUserId: actorId,
          issuedAt: now
        }
      });

      if (versionUpdate.count === 0) {
        return null;
      }

      await tx.transcriptVersion.updateMany({
        where: {
          departmentId,
          transcriptRecordId,
          id: { not: version.id },
          status: TranscriptVersionStatus.ISSUED
        },
        data: {
          status: TranscriptVersionStatus.SUPERSEDED,
          supersededAt: now
        }
      });

      const recordUpdate = await tx.transcriptRecord.updateMany({
        where: {
          id: transcriptRecordId,
          departmentId,
          status: { in: [TranscriptRecordStatus.DRAFT, TranscriptRecordStatus.GENERATED, TranscriptRecordStatus.ISSUED] },
          archivedAt: null
        },
        data: {
          status: TranscriptRecordStatus.ISSUED,
          issuedAt: now,
          revokedAt: null
        }
      });

      if (recordUpdate.count === 0) {
        return null;
      }

      return tx.transcriptRecord.findFirst({
        where: { id: transcriptRecordId, departmentId, archivedAt: null },
        include: this.recordInclude()
      });
    });
  }

  revokeTranscript(input: {
    departmentId: string;
    transcriptRecordId: string;
    actorId: string;
    reason: string;
    appliesToAllTokens: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const issuedVersion = await tx.transcriptVersion.findFirst({
        where: {
          departmentId: input.departmentId,
          transcriptRecordId: input.transcriptRecordId,
          status: TranscriptVersionStatus.ISSUED,
          transcriptRecord: { departmentId: input.departmentId, archivedAt: null }
        },
        orderBy: { versionNumber: "desc" }
      });

      const now = new Date();
      const recordUpdate = await tx.transcriptRecord.updateMany({
        where: {
          id: input.transcriptRecordId,
          departmentId: input.departmentId,
          status: TranscriptRecordStatus.ISSUED,
          archivedAt: null
        },
        data: { status: TranscriptRecordStatus.REVOKED, revokedAt: now }
      });

      if (recordUpdate.count === 0) {
        return null;
      }

      if (issuedVersion) {
        await tx.transcriptVersion.updateMany({
          where: {
            id: issuedVersion.id,
            departmentId: input.departmentId,
            status: TranscriptVersionStatus.ISSUED
          },
          data: { status: TranscriptVersionStatus.REVOKED, revokedAt: now }
        });
      }

      if (input.appliesToAllTokens && issuedVersion) {
        await tx.transcriptVerificationToken.updateMany({
          where: {
            departmentId: input.departmentId,
            transcriptVersionId: issuedVersion.id,
            status: TranscriptVerificationTokenStatus.ACTIVE
          },
          data: { status: TranscriptVerificationTokenStatus.REVOKED, revokedAt: now }
        });
      }

      return tx.transcriptRevocationRecord.create({
        data: {
          departmentId: input.departmentId,
          transcriptRecordId: input.transcriptRecordId,
          transcriptVersionId: issuedVersion?.id,
          status: TranscriptRevocationStatus.APPLIED,
          reason: input.reason,
          requestedByUserId: input.actorId,
          appliedByUserId: input.actorId,
          appliesToAllTokens: input.appliesToAllTokens,
          requestSnapshotJson: {
            transcriptRecordId: input.transcriptRecordId,
            transcriptVersionId: issuedVersion?.id ?? null,
            appliesToAllTokens: input.appliesToAllTokens
          },
          requestedAt: now,
          appliedAt: now
        }
      });
    });
  }

  createVerificationToken(input: {
    departmentId: string;
    transcriptRecordId: string;
    actorId: string;
    publicCodeHash: string;
    publicSummaryJson: Prisma.InputJsonValue;
    expiresAt: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const issuedVersion = await tx.transcriptVersion.findFirst({
        where: {
          departmentId: input.departmentId,
          transcriptRecordId: input.transcriptRecordId,
          status: TranscriptVersionStatus.ISSUED,
          transcriptRecord: {
            departmentId: input.departmentId,
            status: TranscriptRecordStatus.ISSUED,
            archivedAt: null,
            revokedAt: null
          }
        },
        orderBy: { versionNumber: "desc" }
      });

      if (!issuedVersion) {
        return null;
      }

      const { expiresAt } = input;

      return tx.transcriptVerificationToken.create({
        data: {
          departmentId: input.departmentId,
          transcriptVersionId: issuedVersion.id,
          issuedByUserId: input.actorId,
          publicCode: input.publicCodeHash,
          publicSummaryJson: input.publicSummaryJson,
          expiresAt
        }
      });
    });
  }

  findPublicVerificationToken(
    publicCodeHash: string
  ): Promise<PublicVerificationTokenDetails | null> {
    return this.prisma.transcriptVerificationToken.findUnique({
      where: { publicCode: publicCodeHash },
      include: {
        transcriptVersion: {
          include: {
            transcriptRecord: true,
            sealMetadata: true
          }
        }
      }
    });
  }

  markVerificationTokenExpired(id: string) {
    return this.prisma.transcriptVerificationToken.update({
      where: { id },
      data: { status: TranscriptVerificationTokenStatus.EXPIRED }
    });
  }

  recordPublicVerification(id: string) {
    return this.prisma.transcriptVerificationToken.update({
      where: { id },
      data: {
        verificationCount: { increment: 1 },
        lastVerifiedAt: new Date()
      }
    });
  }

  listSeals(departmentId: string): Promise<TranscriptSealDetails[]> {
    return this.prisma.transcriptSealMetadata.findMany({
      where: {
        departmentId,
        transcriptVersion: { departmentId, transcriptRecord: { departmentId, archivedAt: null } }
      },
      include: { transcriptVersion: { include: { transcriptRecord: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  createSeal(input: {
    departmentId: string;
    transcriptVersionId: string;
    sealType: string;
    signerDisplayName?: string;
    signerTitle?: string;
    signatureAlgorithm?: string;
    signatureReference?: string;
    sealReference?: string;
    payloadDigest?: string;
    metadataJson?: Prisma.InputJsonValue;
    signedAt?: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.transcriptVersion.findFirst({
        where: {
          id: input.transcriptVersionId,
          departmentId: input.departmentId,
          status: { in: [TranscriptVersionStatus.GENERATED, TranscriptVersionStatus.ISSUED] },
          transcriptRecord: { departmentId: input.departmentId, archivedAt: null }
        }
      });

      if (!version) {
        return null;
      }

      const seal = await tx.transcriptSealMetadata.create({
        data: input
      });

      return tx.transcriptSealMetadata.findFirst({
        where: { id: seal.id, departmentId: input.departmentId },
        include: { transcriptVersion: { include: { transcriptRecord: true } } }
      });
    });
  }

  updateSeal(
    departmentId: string,
    id: string,
    input: Partial<{
      sealType: string;
      signerDisplayName: string | null;
      signerTitle: string | null;
      signatureAlgorithm: string | null;
      signatureReference: string | null;
      sealReference: string | null;
      payloadDigest: string | null;
      metadataJson: Prisma.InputJsonValue;
      signedAt: Date | null;
    }>
  ) {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.transcriptSealMetadata.updateMany({
        where: {
          id,
          departmentId,
          transcriptVersion: { departmentId, transcriptRecord: { departmentId, archivedAt: null } }
        },
        data: input
      });

      if (update.count === 0) {
        return null;
      }

      return tx.transcriptSealMetadata.findFirst({
        where: { id, departmentId },
        include: { transcriptVersion: { include: { transcriptRecord: true } } }
      });
    });
  }

  private recordInclude() {
    return {
      versions: {
        orderBy: { versionNumber: "desc" as const },
        include: {
          termSummaries: {
            orderBy: { sortOrder: "asc" as const },
            include: { courseLines: { orderBy: { sortOrder: "asc" as const } } }
          },
          sealMetadata: true
        }
      },
      revocationRecords: { orderBy: { requestedAt: "desc" as const } }
    };
  }

  private versionInclude() {
    return {
      transcriptRecord: true,
      termSummaries: {
        orderBy: { sortOrder: "asc" as const },
        include: { courseLines: { orderBy: { sortOrder: "asc" as const } } }
      },
      verificationTokens: true,
      sealMetadata: true
    };
  }
}
