import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SummativeQuestionConfigurationStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import {
  AddQuestionConfigurationItemDto,
  UpdateQuestionConfigurationItemDto,
} from "../../presentation/http/dto/question-configuration.dto";
import {
  SummativeManagementAuthorizerService,
  type SummativeManagementAuthority,
} from "./summative-management-authorizer.service";

const MANAGEMENT_RESOURCE = "summative-examination.setup" as const;

@Injectable()
export class SummativeQuestionConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeManagementAuthorizerService,
  ) {}

  // ----------------------------------------------------------------
  // Public read operations (no mutation – authorizer-only)
  // ----------------------------------------------------------------

  async getConfigurations(examinationCourseId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    await this.assertCurrentExaminationCourseReadScope(
      authority.departmentId,
      examinationCourseId,
    );

    return this.prisma.summativeQuestionConfiguration.findMany({
      where: { examinationCourseId, departmentId: authority.departmentId },
      orderBy: { versionNumber: "desc" },
      include: { items: { orderBy: { displayOrder: "asc" } } },
    });
  }

  async getConfiguration(examinationCourseId: string, configurationId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    await this.assertCurrentExaminationCourseReadScope(
      authority.departmentId,
      examinationCourseId,
    );
    const config =
      await this.prisma.summativeQuestionConfiguration.findFirst({
        where: {
          id: configurationId,
          departmentId: authority.departmentId,
          examinationCourseId, // route scope must match
        },
        include: { items: { orderBy: { displayOrder: "asc" } } },
      });
    if (!config) throw new NotFoundException("Configuration not found");
    return config;
  }

  // ----------------------------------------------------------------
  // createDraftConfiguration
  // Fix: assertCurrentAuthority inside tx, governing row locks, bounded retry
  // ----------------------------------------------------------------

  async createDraftConfiguration(examinationCourseId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          MANAGEMENT_RESOURCE,
          transitionAt,
        );
        const scope = await this.lockGoverningExaminationCourse(
          tx,
          authority.departmentId,
          examinationCourseId,
        );

        // Safe next version using the locked ExaminationCourse scope
        const latest = await tx.summativeQuestionConfiguration.findFirst({
          where: {
            examinationCourseId: scope.examinationCourseId,
            departmentId: authority.departmentId,
          },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const nextVersion = (latest?.versionNumber ?? 0) + 1;

        const config = await tx.summativeQuestionConfiguration.create({
          data: {
            departmentId: authority.departmentId,
            examinationId: scope.examinationId,
            examinationCourseId: scope.examinationCourseId,
            versionNumber: nextVersion,
            status: SummativeQuestionConfigurationStatus.DRAFT,
            createdByUserId: authority.actorUserId,
          },
        });

        await this.writeAudit(
          tx,
          authority,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_CREATED,
          "summative_question_configuration",
          config.id,
          {
            examinationId: scope.examinationId,
            examinationCourseId: scope.examinationCourseId,
            versionNumber: config.versionNumber,
            status: config.status,
          },
        );

        return config;
      });
    } catch (error) {
      if (this.isUniqueConflict(error, "summative_question_config_version_uq")) {
        throw new ConflictException(
          "Concurrent draft creation conflict – please retry",
        );
      }
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // addItem
  // Fix: assertCurrentAuthority, FOR UPDATE on config, route scope,
  //      full CLO composite identity (curriculumVersionId+curriculumCourseId)
  // ----------------------------------------------------------------

  async addItem(
    examinationCourseId: string,
    configurationId: string,
    itemData: AddQuestionConfigurationItemDto,
  ) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          MANAGEMENT_RESOURCE,
          transitionAt,
        );

        const scope = await this.lockGoverningExaminationCourse(
          tx,
          authority.departmentId,
          examinationCourseId,
        );

        const config = await this.lockConfigurationRow(
          tx,
          authority.departmentId,
          scope.examinationCourseId,
          configurationId,
        );

        if (config.status !== SummativeQuestionConfigurationStatus.DRAFT) {
          throw new BadRequestException(
            "Only DRAFT configurations can be modified",
          );
        }

        // Resolve CLO composite identity from the governing ExaminationCourse
        let cloIdentity: {
          cloId: string;
          curriculumVersionId: string;
          curriculumCourseId: string;
        } | null = null;

        if (itemData.cloId) {
          // FOR SHARE on CLO row to validate composite identity
          const cloRows = await tx.$queryRaw<
            Array<{ id: string; curriculum_version_id: string; curriculum_course_id: string }>
          >(Prisma.sql`
            SELECT "id", "curriculum_version_id", "curriculum_course_id"
            FROM "course_learning_outcomes"
            WHERE "id" = ${itemData.cloId}
              AND "department_id" = ${authority.departmentId}
              AND "curriculum_version_id" = ${scope.curriculumVersionId}
              AND "curriculum_course_id" = ${scope.curriculumCourseId}
            FOR SHARE
          `);
          if (cloRows.length !== 1) {
            throw new NotFoundException(
              "Course Learning Outcome not found in examination course curriculum scope",
            );
          }
          cloIdentity = {
            cloId: itemData.cloId,
            curriculumVersionId: scope.curriculumVersionId,
            curriculumCourseId: scope.curriculumCourseId,
          };
        }

        const item = await tx.summativeQuestionConfigurationItem.create({
          data: {
            departmentId: authority.departmentId,
            configurationId: config.id,
            examinationCourseId: config.examinationCourseId,
            questionLabel: itemData.questionLabel.trim(),
            subQuestionLabel: itemData.subQuestionLabel?.trim() || null,
            displayOrder: itemData.displayOrder,
            fullMark: new Prisma.Decimal(itemData.fullMark),
            isRequired: itemData.isRequired,
            cloId: cloIdentity?.cloId ?? null,
            curriculumVersionId: cloIdentity?.curriculumVersionId ?? null,
            curriculumCourseId: cloIdentity?.curriculumCourseId ?? null,
            bloomLevel: itemData.bloomLevel ?? null,
            isActive: itemData.isActive,
          },
        });

        await this.writeAudit(
          tx,
          authority,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_ADDED,
          "summative_question_configuration_item",
          item.id,
          this.itemAuditContext(item, config.id, scope.examinationCourseId),
        );

        return item;
      });
    } catch (error) {
      if (
        this.isUniqueConflict(
          error,
          "summative_question_config_item_active_order_uq",
        )
      ) {
        throw new ConflictException(
          "An active item with the same display order already exists in this configuration",
        );
      }
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // updateItem
  // Fix: assertCurrentAuthority, FOR UPDATE on config, route scope,
  //      full CLO composite identity, null CLO clears all derived fields
  // ----------------------------------------------------------------

  async updateItem(
    examinationCourseId: string,
    configurationId: string,
    itemId: string,
    itemData: UpdateQuestionConfigurationItemDto,
  ) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          MANAGEMENT_RESOURCE,
          transitionAt,
        );

        const scope = await this.lockGoverningExaminationCourse(
          tx,
          authority.departmentId,
          examinationCourseId,
        );

        const config = await this.lockConfigurationRow(
          tx,
          authority.departmentId,
          scope.examinationCourseId,
          configurationId,
        );

        if (config.status !== SummativeQuestionConfigurationStatus.DRAFT) {
          throw new BadRequestException(
            "Only DRAFT configurations can be modified",
          );
        }

        // Lock and verify the specific item belongs to this configuration
        const itemRows = await tx.$queryRaw<
          Array<{ id: string; is_active: boolean }>
        >(Prisma.sql`
          SELECT "id", "is_active"
          FROM "summative_question_configuration_items"
          WHERE "id" = ${itemId}
            AND "department_id" = ${authority.departmentId}
            AND "configuration_id" = ${config.id}
            AND "examination_course_id" = ${scope.examinationCourseId}
          FOR UPDATE
        `);
        if (itemRows.length !== 1) {
          throw new NotFoundException("Item not found in this configuration");
        }

        // Resolve CLO composite identity
        let cloUpdate:
          | {
              cloId: string | null;
              curriculumVersionId: string | null;
              curriculumCourseId: string | null;
            }
          | undefined;

        if (itemData.cloId !== undefined) {
          if (itemData.cloId !== null) {
            // Setting a CLO: validate composite identity
            const cloRows = await tx.$queryRaw<
              Array<{ id: string; curriculum_version_id: string; curriculum_course_id: string }>
            >(Prisma.sql`
              SELECT "id", "curriculum_version_id", "curriculum_course_id"
              FROM "course_learning_outcomes"
              WHERE "id" = ${itemData.cloId}
                AND "department_id" = ${authority.departmentId}
                AND "curriculum_version_id" = ${scope.curriculumVersionId}
                AND "curriculum_course_id" = ${scope.curriculumCourseId}
              FOR SHARE
            `);
            if (cloRows.length !== 1) {
              throw new NotFoundException(
                "Course Learning Outcome not found in examination course curriculum scope",
              );
            }
            cloUpdate = {
              cloId: itemData.cloId,
              curriculumVersionId: scope.curriculumVersionId,
              curriculumCourseId: scope.curriculumCourseId,
            };
          } else {
            // Clearing CLO: all derived identity fields must be null atomically
            cloUpdate = {
              cloId: null,
              curriculumVersionId: null,
              curriculumCourseId: null,
            };
          }
        }

        const item = await tx.summativeQuestionConfigurationItem.update({
          where: { id: itemId },
          data: {
            questionLabel:
              itemData.questionLabel !== undefined
                ? itemData.questionLabel.trim()
                : undefined,
            subQuestionLabel:
              itemData.subQuestionLabel !== undefined
                ? itemData.subQuestionLabel?.trim() || null
                : undefined,
            displayOrder: itemData.displayOrder,
            fullMark:
              itemData.fullMark !== undefined
                ? new Prisma.Decimal(itemData.fullMark)
                : undefined,
            isRequired: itemData.isRequired,
            ...(cloUpdate !== undefined
              ? {
                  cloId: cloUpdate.cloId,
                  curriculumVersionId: cloUpdate.curriculumVersionId,
                  curriculumCourseId: cloUpdate.curriculumCourseId,
                }
              : {}),
            bloomLevel: itemData.bloomLevel,
            isActive: itemData.isActive,
          },
        });

        const activeStateChanged =
          itemData.isActive !== undefined &&
          itemData.isActive !== itemRows[0]!.is_active;
        const hasOrdinaryFieldUpdate = Object.entries(itemData).some(
          ([field, value]) => field !== "isActive" && value !== undefined,
        );
        const auditContext = this.itemAuditContext(
          item,
          config.id,
          scope.examinationCourseId,
        );

        if (hasOrdinaryFieldUpdate || !activeStateChanged) {
          await this.writeAudit(
            tx,
            authority,
            SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_UPDATED,
            "summative_question_configuration_item",
            item.id,
            auditContext,
          );
        }
        if (activeStateChanged) {
          await this.writeAudit(
            tx,
            authority,
            item.isActive
              ? SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_ACTIVATED
              : SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ITEM_DEACTIVATED,
            "summative_question_configuration_item",
            item.id,
            auditContext,
          );
        }

        return item;
      });
    } catch (error) {
      if (
        this.isUniqueConflict(
          error,
          "summative_question_config_item_active_order_uq",
        )
      ) {
        throw new ConflictException(
          "An active item with the same display order already exists in this configuration",
        );
      }
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // lockConfiguration
  // Fix: assertCurrentAuthority, governing row locks, full items lock,
  //      Cases A/B/C for locked-version replacement protection,
  //      exact Decimal summation
  // ----------------------------------------------------------------

  async lockConfiguration(
    examinationCourseId: string,
    configurationId: string,
  ) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          MANAGEMENT_RESOURCE,
          transitionAt,
        );

        // Lock governing ExaminationCourse first
        const scope = await this.lockGoverningExaminationCourse(
          tx,
          authority.departmentId,
          examinationCourseId,
        );

        // Lock target configuration (verifying scope)
        const config = await this.lockConfigurationRow(
          tx,
          authority.departmentId,
          examinationCourseId,
          configurationId,
        );

        if (config.status !== SummativeQuestionConfigurationStatus.DRAFT) {
          throw new BadRequestException(
            "Only DRAFT configurations can be locked",
          );
        }

        // Re-read governing ExaminationCourse under lock for current pointer
        const examCourse = await tx.examinationCourse.findFirst({
          where: {
            id: scope.examinationCourseId,
            departmentId: authority.departmentId,
          },
        });
        if (!examCourse) {
          throw new NotFoundException("Examination course not found");
        }

        // Case B: already points to this config (already locked)
        if (examCourse.lockedQuestionConfigurationId === configurationId) {
          throw new ConflictException(
            "This configuration is already the authoritative locked version",
          );
        }

        // Case C: points to ANOTHER configuration – reject
        if (examCourse.lockedQuestionConfigurationId !== null) {
          throw new ConflictException(
            "Examination course already has an authoritative locked configuration; cannot overwrite",
          );
        }

        // Lock all items in deterministic id order
        const lockedItemRows = await tx.$queryRaw<
          Array<{
            id: string;
            full_mark: string;
            is_active: boolean;
            is_required: boolean;
          }>
        >(Prisma.sql`
          SELECT "id", "full_mark", "is_active", "is_required"
          FROM "summative_question_configuration_items"
          WHERE "configuration_id" = ${config.id}
            AND "department_id" = ${authority.departmentId}
          ORDER BY "id"
          FOR UPDATE
        `);

        const activeItems = lockedItemRows.filter((i) => i.is_active);
        if (activeItems.length === 0) {
          throw new BadRequestException(
            "Cannot lock an empty configuration. At least one active item is required.",
          );
        }

        // Use Decimal arithmetic for exact totals – no floating point
        const totalMarks = activeItems.reduce(
          (sum, item) => sum.add(new Prisma.Decimal(item.full_mark)),
          new Prisma.Decimal(0),
        );
        if (!totalMarks.equals(examCourse.summativeFullMark)) {
          throw new BadRequestException(
            `Total configured marks (${totalMarks.toString()}) do not equal ExaminationCourse summative full mark (${examCourse.summativeFullMark.toString()})`,
          );
        }

        const hasOptionalItems = activeItems.some((i) => !i.is_required);
        if (hasOptionalItems) {
          throw new BadRequestException(
            "MVP: all active items must be required to guarantee an unambiguous total. Optional item choice groups are not yet supported.",
          );
        }

        const lockedConfig =
          await tx.summativeQuestionConfiguration.update({
            where: { id: configurationId },
            data: {
              status: SummativeQuestionConfigurationStatus.LOCKED,
              lockedAt: transitionAt,
            },
          });

        // Case A: pointer was null – set to this config (atomic)
        await tx.examinationCourse.update({
          where: { id: scope.examinationCourseId },
          data: { lockedQuestionConfigurationId: config.id },
        });

        await this.writeAudit(
          tx,
          authority,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_LOCKED,
          "summative_question_configuration",
          lockedConfig.id,
          {
            examinationCourseId: scope.examinationCourseId,
            configurationId: lockedConfig.id,
            versionNumber: lockedConfig.versionNumber,
            summativeFullMark: examCourse.summativeFullMark.toString(),
            configuredTotal: totalMarks.toString(),
            activeItemCount: activeItems.length,
            status: lockedConfig.status,
          },
        );

        return lockedConfig;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof BadRequestException) throw error;
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // archiveConfiguration
  // Fix: assertCurrentAuthority, lock governing course and config,
  //      authoritative-config protection
  // ----------------------------------------------------------------

  async archiveConfiguration(
    examinationCourseId: string,
    configurationId: string,
  ) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        MANAGEMENT_RESOURCE,
        transitionAt,
      );

      // Lock governing ExaminationCourse
      const scope = await this.lockGoverningExaminationCourse(
        tx,
        authority.departmentId,
        examinationCourseId,
      );

      // Lock target configuration
      const config = await this.lockConfigurationRow(
        tx,
        authority.departmentId,
        examinationCourseId,
        configurationId,
      );

      if (config.status === SummativeQuestionConfigurationStatus.ARCHIVED) {
        // Idempotent: already archived
        return config;
      }

      // Re-read ExaminationCourse to get current locked pointer
      const examCourse = await tx.examinationCourse.findFirst({
        where: {
          id: scope.examinationCourseId,
          departmentId: authority.departmentId,
        },
        select: { lockedQuestionConfigurationId: true },
      });

      if (examCourse?.lockedQuestionConfigurationId === configurationId) {
        throw new BadRequestException(
          "Cannot archive the currently active authoritative locked configuration",
        );
      }

      const archivedConfig =
        await tx.summativeQuestionConfiguration.update({
          where: { id: configurationId },
          data: {
            status: SummativeQuestionConfigurationStatus.ARCHIVED,
            archivedAt: transitionAt,
          },
        });

      await this.writeAudit(
        tx,
        authority,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.QUESTION_CONFIGURATION_ARCHIVED,
        "summative_question_configuration",
        archivedConfig.id,
        {
          examinationCourseId: scope.examinationCourseId,
          configurationId: archivedConfig.id,
          versionNumber: archivedConfig.versionNumber,
          status: archivedConfig.status,
        },
      );

      return archivedConfig;
    });
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private async assertCurrentExaminationCourseReadScope(
    departmentId: string,
    examinationCourseId: string,
  ) {
    const course = await this.prisma.examinationCourse.findFirst({
      where: {
        id: examinationCourseId,
        departmentId,
        archivedAt: null,
        examination: {
          is: {
            departmentId,
            archivedAt: null,
          },
        },
      },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Examination course not found");
  }

  /**
   * Lock the governing Examination and ExaminationCourse in the established
   * Summative order (Examination FOR UPDATE, then ExaminationCourse FOR UPDATE).
   * Validates department scope and non-archived state.
   */
  private async lockGoverningExaminationCourse(
    tx: Prisma.TransactionClient,
    departmentId: string,
    examinationCourseId: string,
  ): Promise<{
    examinationId: string;
    examinationCourseId: string;
    curriculumVersionId: string;
    curriculumCourseId: string;
  }> {
    // Read base without lock first to get examinationId
    const base = await tx.examinationCourse.findFirst({
      where: { id: examinationCourseId, departmentId },
      select: {
        id: true,
        examinationId: true,
        curriculumVersionId: true,
        curriculumCourseId: true,
      },
    });
    if (!base) throw new NotFoundException("Examination course not found");

    // Lock governing Examination
    const examRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examinations"
      WHERE "id" = ${base.examinationId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (examRows.length !== 1) {
      throw new NotFoundException("Examination not found or archived");
    }

    // Lock ExaminationCourse
    const courseRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_courses"
      WHERE "id" = ${examinationCourseId}
        AND "department_id" = ${departmentId}
        AND "examination_id" = ${base.examinationId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (courseRows.length !== 1) {
      throw new NotFoundException("Examination course not found or archived");
    }

    return {
      examinationId: base.examinationId,
      examinationCourseId: base.id,
      curriculumVersionId: base.curriculumVersionId,
      curriculumCourseId: base.curriculumCourseId,
    };
  }

  /**
   * Lock a SummativeQuestionConfiguration row (FOR UPDATE) and verify it
   * belongs to the exact departmentId + examinationCourseId from the route.
   */
  private async lockConfigurationRow(
    tx: Prisma.TransactionClient,
    departmentId: string,
    examinationCourseId: string,
    configurationId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "summative_question_configurations"
      WHERE "id" = ${configurationId}
        AND "department_id" = ${departmentId}
        AND "examination_course_id" = ${examinationCourseId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException("Configuration not found");
    }
    const config = await tx.summativeQuestionConfiguration.findFirst({
      where: {
        id: configurationId,
        departmentId,
        examinationCourseId,
      },
      include: { items: { orderBy: { id: "asc" } } },
    });
    if (!config) throw new NotFoundException("Configuration not found");
    return config;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    action: string,
    targetType: string,
    targetId: string,
    contextJson: Prisma.InputJsonObject,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action,
        targetType,
        targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson,
      },
    });
  }

  private itemAuditContext(
    item: {
      id: string;
      questionLabel: string;
      subQuestionLabel: string | null;
      displayOrder: number;
      fullMark: Prisma.Decimal;
      isRequired: boolean;
      cloId: string | null;
      bloomLevel: string | null;
      isActive: boolean;
    },
    configurationId: string,
    examinationCourseId: string,
  ): Prisma.InputJsonObject {
    return {
      configurationId,
      examinationCourseId,
      itemId: item.id,
      questionLabel: item.questionLabel,
      subQuestionLabel: item.subQuestionLabel,
      displayOrder: item.displayOrder,
      fullMark: item.fullMark.toString(),
      isRequired: item.isRequired,
      cloId: item.cloId,
      bloomLevel: item.bloomLevel,
      isActive: item.isActive,
    };
  }

  private isUniqueConflict(error: unknown, constraint: string) {
    if (
      !(error instanceof PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    return error.meta?.target === constraint;
  }

  private isRetryableTransactionConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      (error.code === "P2010" &&
        (error.meta?.code === "40001" || error.meta?.code === "40P01"))
    );
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (
          attempt >= 2 ||
          !this.isRetryableTransactionConflict(error)
        ) {
          throw error;
        }
      }
    }
  }
}
