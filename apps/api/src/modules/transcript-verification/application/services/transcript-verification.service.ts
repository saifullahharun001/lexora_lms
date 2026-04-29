import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  ResultRecordStatus,
  TranscriptRecordStatus,
  TranscriptVerificationTokenStatus,
  TranscriptVersionStatus
} from "@prisma/client";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import type { PrincipalContext } from "@lexora/types";
import type {
  CreateTranscriptSnapshotInput,
  TranscriptRecordDetails,
  TranscriptVerificationRepositoryPort
} from "../ports/transcript-verification.repository.port";
import { TRANSCRIPT_VERIFICATION_AUDIT_EVENTS } from "../../domain/transcript-verification.audit-events";
import { TRANSCRIPT_VERIFICATION_REPOSITORY } from "../../domain/transcript-verification.constants";

type TranscriptSourceResult = Prisma.ResultRecordGetPayload<{
  include: {
    academicTerm: true;
    courseOffering: { include: { course: { include: { academicProgram: true } } } };
    enrollment: { include: { studentUser: true } };
    department: true;
  };
}>;

interface AuditMetadata {
  [key: string]: unknown;
}

interface CreateTranscriptInput {
  studentUserId: string;
}

interface ListTranscriptInput {
  studentUserId?: string;
  status?: TranscriptRecordStatus;
  limit?: number;
  offset?: number;
}

interface CreateTokenInput {
  expiresAt?: Date;
}

interface ListTranscriptVersionsInput {
  limit?: number;
  offset?: number;
}

interface RevokeTranscriptInput {
  reason: string;
  appliesToAllTokens?: boolean;
}

interface CreateSealInput {
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
}

type UpdateSealInput = Partial<Omit<CreateSealInput, "transcriptVersionId">>;

const VERIFICATION_TOKEN_DEFAULT_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class TranscriptVerificationService {
  constructor(
    @Inject(TRANSCRIPT_VERIFICATION_REPOSITORY)
    private readonly repository: TranscriptVerificationRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  async createTranscript(input: CreateTranscriptInput) {
    const departmentId = this.getDepartmentId();
    const actorId = this.getActorId();
    await this.assertStudentInDepartment(departmentId, input.studentUserId);

    const results = await this.prisma.resultRecord.findMany({
      where: {
        departmentId,
        status: {
          in: [
            ResultRecordStatus.PUBLISHED,
            ResultRecordStatus.LOCKED,
            ResultRecordStatus.AMENDED
          ]
        },
        enrollment: { departmentId, studentUserId: input.studentUserId }
      },
      include: {
        academicTerm: true,
        courseOffering: { include: { course: { include: { academicProgram: true } } } },
        enrollment: { include: { studentUser: true } },
        department: true
      },
      orderBy: [{ academicTerm: { sequence: "asc" } }, { courseOffering: { sectionCode: "asc" } }]
    });

    if (results.length === 0) {
      throw new BadRequestException(
        "Transcript requires at least one published, locked, or amended result"
      );
    }

    const snapshot = await this.buildSnapshotInput(departmentId, input.studentUserId, actorId, results);
    const record = await this.repository.createTranscriptSnapshot(snapshot);

    await this.writeAudit(
      TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.TRANSCRIPT_CREATED,
      "transcript_record",
      record,
      { studentUserId: input.studentUserId, latestVersionNumber: record.latestVersionNumber }
    );

    return record;
  }

  listTranscripts(input: ListTranscriptInput) {
    const principal = this.getPrincipal();
    const departmentId = this.getDepartmentId();
    const studentUserId = this.isStudent()
      ? principal.actorId
      : input.studentUserId;

    return this.repository.listTranscriptRecords({
      departmentId,
      studentUserId,
      status: input.status,
      limit: input.limit,
      offset: input.offset
    });
  }

  async getTranscript(id: string) {
    const record = await this.repository.findTranscriptRecordById(this.getDepartmentId(), id);
    this.assertCanReadRecord(record);
    if (!record) {
      throw new NotFoundException("Transcript not found");
    }
    return record;
  }

  async listVersions(transcriptRecordId: string, input: ListTranscriptVersionsInput = {}) {
    const record = await this.getTranscript(transcriptRecordId);
    return this.repository.listTranscriptVersions(this.getDepartmentId(), record.id, {
      limit: input.limit,
      offset: input.offset
    });
  }

  async getVersion(id: string) {
    const version = await this.repository.findTranscriptVersionById(this.getDepartmentId(), id);

    if (!version) {
      throw new NotFoundException("Transcript version not found");
    }

    this.assertCanReadRecord(version.transcriptRecord);
    return version;
  }

  async issueTranscript(id: string) {
    this.assertCanIssueOrRevoke();
    const record = await this.repository.issueTranscript(
      this.getDepartmentId(),
      id,
      this.getActorId()
    );

    if (!record) {
      throw new BadRequestException("Transcript has no generated version available to issue");
    }

    await this.writeAudit(
      TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.TRANSCRIPT_ISSUED,
      "transcript_record",
      record,
      { latestVersionNumber: record.latestVersionNumber }
    );

    return record;
  }

  async revokeTranscript(id: string, input: RevokeTranscriptInput) {
    this.assertCanIssueOrRevoke();
    const record = await this.repository.findTranscriptRecordById(this.getDepartmentId(), id);

    if (!record) {
      throw new NotFoundException("Transcript not found");
    }

    if (record.status !== TranscriptRecordStatus.ISSUED) {
      throw new BadRequestException("Only issued transcripts can be revoked");
    }

    const revocation = await this.repository.revokeTranscript({
      departmentId: this.getDepartmentId(),
      transcriptRecordId: id,
      actorId: this.getActorId(),
      reason: input.reason,
      appliesToAllTokens: input.appliesToAllTokens ?? true
    });

    if (!revocation) {
      throw new BadRequestException("Transcript could not be revoked");
    }

    await this.writeAudit(
      TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.TRANSCRIPT_REVOKED,
      "transcript_record",
      record,
      { revocationRecordId: revocation.id, appliesToAllTokens: revocation.appliesToAllTokens }
    );

    return revocation;
  }

  async createVerificationToken(transcriptRecordId: string, input: CreateTokenInput) {
    this.assertCanIssueOrRevoke();
    const record = await this.repository.findTranscriptRecordById(
      this.getDepartmentId(),
      transcriptRecordId
    );

    if (!record) {
      throw new NotFoundException("Transcript not found");
    }

    if (record.status !== TranscriptRecordStatus.ISSUED || record.revokedAt) {
      throw new BadRequestException("Only active issued transcripts can receive verification tokens");
    }

    const issuedVersion = record.versions.find(
      (version) => version.status === TranscriptVersionStatus.ISSUED
    );

    if (!issuedVersion) {
      throw new BadRequestException("Issued transcript version not found");
    }

    const publicCode = this.createOpaqueToken();
    const publicCodeHash = this.hashPublicToken(publicCode);
    const publicSummaryJson = this.buildPublicSummary(record, issuedVersion.versionNumber);
    const expiresAt = this.resolveVerificationTokenExpiry(input.expiresAt);
    const token = await this.repository.createVerificationToken({
      departmentId: this.getDepartmentId(),
      transcriptRecordId,
      actorId: this.getActorId(),
      publicCodeHash,
      publicSummaryJson,
      expiresAt
    });

    if (!token) {
      throw new BadRequestException("Verification token could not be created");
    }

    await this.writeAudit(
      TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.VERIFICATION_TOKEN_CREATED,
      "transcript_verification_token",
      token,
      { transcriptRecordId, transcriptVersionId: token.transcriptVersionId }
    );

    return {
      ...token,
      verificationUrlPath: `/api/v1/public/transcript-verification/${publicCode}`
    };
  }

  async verifyPublicTranscript(token: string) {
    const publicCodeHash = this.hashPublicToken(token);
    const record = await this.repository.findPublicVerificationToken(publicCodeHash);

    if (!record) {
      await this.writePublicVerificationAudit(null, null, "NOT_FOUND");
      return this.invalidPublicVerificationResponse();
    }

    if (!this.constantTimeEquals(publicCodeHash, record.publicCode)) {
      await this.writePublicVerificationAudit(record.departmentId, record.id, "HASH_MISMATCH");
      return this.invalidPublicVerificationResponse();
    }

    const now = new Date();

    if (!record.expiresAt || record.expiresAt <= now) {
      await this.repository.markVerificationTokenExpired(record.id);
      await this.writePublicVerificationAudit(record.departmentId, record.id, "EXPIRED");
      return this.invalidPublicVerificationResponse();
    }

    const transcriptVersion = record.transcriptVersion;
    const transcriptRecord = transcriptVersion.transcriptRecord;
    const valid =
      record.status === TranscriptVerificationTokenStatus.ACTIVE &&
      transcriptVersion.status === TranscriptVersionStatus.ISSUED &&
      transcriptRecord.status === TranscriptRecordStatus.ISSUED &&
      !record.revokedAt &&
      !transcriptVersion.revokedAt &&
      !transcriptRecord.revokedAt;

    if (!valid) {
      await this.writePublicVerificationAudit(record.departmentId, record.id, record.status);
      return this.invalidPublicVerificationResponse();
    }

    await this.repository.recordPublicVerification(record.id);
    await this.writePublicVerificationAudit(record.departmentId, record.id, "ACTIVE");

    return {
      valid: true,
      status: record.status,
      summary: this.safePublicSummary(record.publicSummaryJson),
      verifiedAt: now,
      seal: transcriptVersion.sealMetadata
        ? {
            sealType: transcriptVersion.sealMetadata.sealType,
            signerDisplayName: transcriptVersion.sealMetadata.signerDisplayName,
            signerTitle: transcriptVersion.sealMetadata.signerTitle,
            signatureAlgorithm: transcriptVersion.sealMetadata.signatureAlgorithm,
            payloadDigest: transcriptVersion.sealMetadata.payloadDigest,
            signedAt: transcriptVersion.sealMetadata.signedAt
          }
        : null
    };
  }

  listSeals() {
    return this.repository.listSeals(this.getDepartmentId());
  }

  async createSeal(input: CreateSealInput) {
    const seal = await this.repository.createSeal({
      departmentId: this.getDepartmentId(),
      ...input
    });

    if (!seal) {
      throw new NotFoundException("Transcript version not found");
    }

    await this.writeAudit(
      TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.SEAL_CREATED,
      "transcript_seal_metadata",
      seal,
      { transcriptVersionId: input.transcriptVersionId }
    );

    return seal;
  }

  async updateSeal(id: string, input: UpdateSealInput) {
    const seal = await this.repository.updateSeal(this.getDepartmentId(), id, input);

    if (!seal) {
      throw new NotFoundException("Transcript seal not found");
    }

    await this.writeAudit(
      TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.SEAL_UPDATED,
      "transcript_seal_metadata",
      seal,
      { transcriptVersionId: seal.transcriptVersionId }
    );

    return seal;
  }

  private async buildSnapshotInput(
    departmentId: string,
    studentUserId: string,
    actorId: string,
    results: TranscriptSourceResult[]
  ): Promise<CreateTranscriptSnapshotInput> {
    const first = results[0];
    if (!first) {
      throw new BadRequestException("Transcript source results are required");
    }
    const latestCgpa = await this.prisma.cGPARecord.findFirst({
      where: { departmentId, studentUserId },
      orderBy: { updatedAt: "desc" }
    });
    const gpaRecords = await this.prisma.gPARecord.findMany({
      where: { departmentId, studentUserId },
      orderBy: { createdAt: "asc" }
    });
    const gpaByTermId = new Map(gpaRecords.map((record) => [record.academicTermId, record]));
    const terms = new Map<string, TranscriptSourceResult[]>();

    for (const result of results) {
      const grouped = terms.get(result.academicTermId) ?? [];
      grouped.push(result);
      terms.set(result.academicTermId, grouped);
    }

    const program = first.courseOffering.course.academicProgram;

    return {
      departmentId,
      studentUserId,
      transcriptNumber: `TR-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`,
      generatedByUserId: actorId,
      sourceCgpaRecordId: latestCgpa?.id,
      studentSnapshotJson: {
        id: first.enrollment.studentUser.id,
        displayName: first.enrollment.studentUser.displayName
      },
      programSnapshotJson: program
        ? { id: program.id, code: program.code, name: program.name }
        : undefined,
      departmentSnapshotJson: {
        id: first.department.id,
        code: first.department.code,
        name: first.department.name
      },
      printStructureJson: {
        renderer: "pending",
        layoutVersion: "snapshot-mvp"
      },
      cumulativeAttemptedCredits: latestCgpa?.attemptedCredits.toString(),
      cumulativeEarnedCredits: latestCgpa?.earnedCredits.toString(),
      cgpaSnapshot: latestCgpa?.cgpa.toString(),
      termSummaries: Array.from(terms.values()).map((termResults, termIndex) => {
        const firstTermResult = termResults[0];
        if (!firstTermResult) {
          throw new BadRequestException("Transcript term source results are required");
        }

        const term = firstTermResult.academicTerm;
        const gpa = gpaByTermId.get(term.id);

        return {
          academicTermId: term.id,
          sourceGpaRecordId: gpa?.id,
          sortOrder: termIndex + 1,
          termCodeSnapshot: term.code,
          termNameSnapshot: term.name,
          attemptedCredits: gpa?.attemptedCredits.toString(),
          earnedCredits: gpa?.earnedCredits.toString(),
          qualityPoints: gpa?.qualityPoints.toString(),
          termGpaSnapshot: gpa?.gpa.toString(),
          cumulativeCgpaSnapshot: latestCgpa?.cgpa.toString(),
          courseLines: termResults.map((result, resultIndex) => ({
            resultRecordId: result.id,
            courseOfferingId: result.courseOfferingId,
            sortOrder: resultIndex + 1,
            courseCodeSnapshot: result.courseOffering.course.code,
            courseTitleSnapshot: result.courseOffering.course.title,
            creditHoursSnapshot: result.creditHoursSnapshot.toString(),
            normalizedPercentage: result.normalizedPercentage?.toString(),
            letterGrade: result.letterGrade ?? undefined,
            gradePoint: result.gradePoint?.toString(),
            qualityPoints: result.qualityPoints?.toString(),
            isCountedInGpa: true,
            completionStatus: result.status
          }))
        };
      })
    };
  }

  private buildPublicSummary(
    record: TranscriptRecordDetails,
    versionNumber: number
  ): Prisma.InputJsonValue {
    return {
      transcriptNumber: record.transcriptNumber,
      status: record.status,
      versionNumber,
      issuedAt: record.issuedAt?.toISOString() ?? null
    };
  }

  private safePublicSummary(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const summary = value as Record<string, unknown>;
    return {
      transcriptNumber: summary.transcriptNumber,
      status: summary.status,
      versionNumber: summary.versionNumber,
      issuedAt: summary.issuedAt
    };
  }

  private async assertStudentInDepartment(departmentId: string, studentUserId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentUserId, departmentId, deletedAt: null }
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }
  }

  private assertCanReadRecord(record: { studentUserId: string } | null) {
    if (!record) {
      throw new NotFoundException("Transcript not found");
    }

    if (this.isStudent() && record.studentUserId !== this.getActorId()) {
      throw new ForbiddenException("Students can read only their own transcripts");
    }
  }

  private assertCanIssueOrRevoke() {
    if (this.hasRole("teacher")) {
      throw new ForbiddenException("Teachers cannot issue or revoke transcripts");
    }

    if (!this.hasRole("department_admin") && !this.hasRole("exam_office")) {
      throw new ForbiddenException("Only department administrators or exam office can perform this action");
    }
  }

  private createOpaqueToken() {
    return randomBytes(32).toString("base64url");
  }

  private resolveVerificationTokenExpiry(expiresAt?: Date) {
    const now = new Date();
    const resolvedExpiresAt = expiresAt ?? new Date(now.getTime() + VERIFICATION_TOKEN_DEFAULT_TTL_MS);

    if (resolvedExpiresAt <= now) {
      throw new BadRequestException("Verification token expiry must be in the future");
    }

    return resolvedExpiresAt;
  }

  private invalidPublicVerificationResponse() {
    return { valid: false, status: "INVALID" };
  }

  private hashPublicToken(token: string) {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private constantTimeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private isStudent() {
    return this.hasRole("student");
  }

  private hasRole(role: string) {
    return this.getPrincipal().roleAssignments.some(
      (assignment) =>
        assignment.role === role && assignment.departmentId === this.getDepartmentId()
    );
  }

  private getDepartmentId() {
    const activeDepartmentId = this.getPrincipal().activeDepartmentId;

    if (!activeDepartmentId) {
      throw new BadRequestException("Active department context is required");
    }

    return activeDepartmentId;
  }

  private getActorId() {
    const actorId = this.getPrincipal().actorId;

    if (!actorId) {
      throw new BadRequestException("Authenticated actor is required");
    }

    return actorId;
  }

  private getPrincipal(): PrincipalContext {
    const principal = this.requestContextService.get()?.principal;

    if (!principal?.isAuthenticated) {
      throw new BadRequestException("Authenticated principal is required");
    }

    return principal;
  }

  private async writeAudit(
    action: string,
    targetType: string,
    target: { id?: string },
    metadata?: AuditMetadata
  ) {
    const requestContext = this.requestContextService.get();

    await this.prisma.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: this.getActorId(),
        actorType: "USER",
        departmentId: this.getDepartmentId(),
        action,
        targetType,
        targetId: target.id ?? null,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private async writePublicVerificationAudit(
    departmentId: string | null,
    tokenId: string | null,
    status: string
  ) {
    const requestContext = this.requestContextService.get();

    await this.prisma.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorType: "ANONYMOUS",
        departmentId,
        action: TRANSCRIPT_VERIFICATION_AUDIT_EVENTS.VERIFICATION_PUBLIC_ACCESSED,
        targetType: "transcript_verification_token",
        targetId: tokenId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: { status }
      }
    });
  }
}
