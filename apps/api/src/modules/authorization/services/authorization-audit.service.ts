import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { AuditWriter } from "@/common/audit/audit.contract";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

@Injectable()
export class AuthorizationAuditService implements AuditWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService
  ) {}

  async write(entry: {
    action: string;
    actorId: string;
    actorType: "user" | "service";
    departmentId?: string | null;
    targetType: string;
    targetId?: string | null;
    outcome: "success" | "failure";
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const requestContext = this.requestContextService.get();

    await this.prisma.auditLog.create({
      data: {
        requestId: entry.requestId ?? requestContext?.requestId,
        actorUserId: entry.actorId,
        actorType: entry.actorType === "service" ? "SERVICE" : "USER",
        departmentId:
          entry.departmentId ?? requestContext?.audit.departmentId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        outcome: entry.outcome === "failure" ? "FAILURE" : "SUCCESS",
        ipAddress: entry.ipAddress ?? requestContext?.audit.ipAddress,
        userAgent: entry.userAgent ?? requestContext?.audit.userAgent,
        contextJson: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }
}
