import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { AuditWriter } from "@/common/audit/audit.contract";
import type { AuditLogEntry } from "@lexora/types";

import { PrismaService } from "@/common/prisma/prisma.service";

const ACTOR_TYPE_MAP = {
  user: "USER",
  service: "SERVICE"
} as const;

const OUTCOME_MAP = {
  success: "SUCCESS",
  failure: "FAILURE"
} as const;

@Injectable()
export class IdentityAccessAuditWriter implements AuditWriter {
  constructor(private readonly prisma: PrismaService) {}

  async write(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        requestId: entry.requestId,
        actorUserId: entry.actorId,
        actorType: ACTOR_TYPE_MAP[entry.actorType],
        departmentId: entry.departmentId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        outcome: OUTCOME_MAP[entry.outcome],
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        contextJson: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }
}
