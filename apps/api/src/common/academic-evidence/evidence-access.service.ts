import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RequestContextService } from "../request-context/request-context.service";
import { isPermissionGrantFromLoadedRole } from "../authorization/principal-authority";
import { EXAMINATION_PERMISSION_DEFINITIONS } from "../authorization/examination-policies";

export interface EvidenceActor { departmentId: string; actorUserId: string; }

@Injectable()
export class EvidenceAccessService {
  constructor(private readonly context: RequestContextService) {}

  principal(policy: string): EvidenceActor {
    const p = this.context.get()?.principal;
    const permission = EXAMINATION_PERMISSION_DEFINITIONS.find((d) => `${d.resource}.${d.action}` === policy);
    if (!p?.isAuthenticated || p.actorType !== "user" || !p.actorId || !p.activeDepartmentId || !permission ||
      !p.permissions.some((g) => g.resource === permission.resource && g.action === permission.action &&
        g.scope === "department" && isPermissionGrantFromLoadedRole(p, g))) throw new ForbiddenException("Exact examination permission required");
    return { departmentId: p.activeDepartmentId, actorUserId: p.actorId };
  }

  async live(tx: Prisma.TransactionClient, actor: EvidenceActor, policy: string) {
    const def = EXAMINATION_PERMISSION_DEFINITIONS.find((d) => `${d.resource}.${d.action}` === policy)!;
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT ur.id FROM users u JOIN departments d ON d.id = u.department_id
      JOIN user_roles ur ON ur.user_id = u.id AND ur.department_id = u.department_id
      JOIN roles r ON r.id = ur.role_id AND r.department_id = ur.department_id
      JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = ${actor.actorUserId} AND u.department_id = ${actor.departmentId}
      AND u.status = 'ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
      AND d.status = 'ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
      AND r.archived_at IS NULL AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at > clock_timestamp())
      AND p.code = ${def.code} AND p.resource = ${def.resource} AND p.action = ${def.action} AND p.scope = 'DEPARTMENT'
      FOR SHARE OF u,d,ur,r,rp,p`);
    if (!rows.length) throw new ForbiddenException("Live examination permission required");
  }

  async audit(tx: Prisma.TransactionClient, actor: EvidenceActor, action: string, targetId: string, contextJson: Prisma.InputJsonObject = {}) {
    const request = this.context.get();
    await tx.auditLog.create({ data: { departmentId: actor.departmentId, actorUserId: actor.actorUserId,
      actorType: "USER", action, targetType: action.startsWith("comprehensive.") ? "comprehensive_examination" : "examination_governance",
      targetId, outcome: "SUCCESS", requestId: request?.requestId, ipAddress: request?.audit.ipAddress,
      userAgent: request?.audit.userAgent, contextJson } });
  }
}
