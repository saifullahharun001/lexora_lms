import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { EvidenceAccessService, EvidenceActor } from "@/common/academic-evidence/evidence-access.service";
import { evidenceTransaction } from "@/common/academic-evidence/transaction";
import { EXAMINATION_PERMISSION_DEFINITIONS, EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";
import { ExaminationContextService } from "../summative-examination/examination-context.service";
import { boundedReason } from "./examination-registration.service";
import { PasswordHasherService } from "../identity-access/infrastructure/password-hasher.service";
import { passwordPolicySchema } from "../identity-access/domain/password-policy";

@Injectable()
export class ExaminationAuthorityService {
  constructor(private readonly prisma: PrismaService, private readonly access: EvidenceAccessService,
    private readonly examinations: ExaminationContextService, private readonly passwords: PasswordHasherService) {}

  private provision<T>(work: (tx: Prisma.TransactionClient, actor: EvidenceActor) => Promise<T>) {
    const actor = this.access.principal(P.APPOINT);
    return evidenceTransaction(this.prisma, async (tx) => {
      // Department mutex orders appointment replacement, external provisioning and role grants.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM departments WHERE id=${actor.departmentId} FOR UPDATE`);
      await this.access.live(tx, actor, P.APPOINT);
      const admin = await tx.userRole.findFirst({ where: { departmentId: actor.departmentId, userId: actor.actorUserId,
        revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        role: { departmentId: actor.departmentId, code: "department_admin", archivedAt: null } } });
      if (!admin) throw new NotFoundException("Appointment recorder not found");
      return work(tx, actor);
    });
  }

  appointPoe(input: { userId: string; sourceReference: string; expiresAt: string }) {
    const sourceReference = boundedReason(input.sourceReference, 500);
    const expiresAt = futureExpiry(input.expiresAt);
    return this.provision(async (tx, actor) => {
      const user = await tx.user.findFirst({ where: { id: input.userId, departmentId: actor.departmentId,
        status: "ACTIVE", archivedAt: null, deletedAt: null } });
      if (!user) throw new NotFoundException("Appointment user not found");
      if (await tx.userRole.findFirst({ where: { userId: user.id, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], role: { code: "student" } } })) {
        throw new ConflictException("A Student account cannot hold POE Chairman digital authority");
      }
      const current = await tx.poeChairmanAssignment.findFirst({ where: { departmentId: actor.departmentId, revokedAt: null } });
      if (current) throw new ConflictException("Revoke the previous POE appointment before recording its successor");
      const appointment = await tx.poeChairmanAssignment.create({ data: { departmentId: actor.departmentId, userId: user.id,
        recordedByUserId: actor.actorUserId, sourceReference, startsAt: new Date(), expiresAt } });
      await this.grant(tx, actor, user.id, "poe_chairman", [P.CLASSIFY], appointment.expiresAt);
      await this.access.audit(tx, actor, "examination-authority.poe-chairman.recorded", appointment.id, { userId: user.id });
      return appointment;
    });
  }

  revokePoe(id: string) {
    return this.provision(async (tx, actor) => {
      const assignment = await tx.poeChairmanAssignment.findFirst({ where: { id, departmentId: actor.departmentId } });
      if (!assignment) throw new NotFoundException("Appointment not found");
      if (assignment.revokedAt) return assignment;
      const revokedAt = new Date();
      const revoked = await tx.poeChairmanAssignment.update({ where: { id }, data: { revokedAt, revokedByUserId: actor.actorUserId } });
      await tx.userRole.updateMany({ where: { userId: assignment.userId, departmentId: actor.departmentId, revokedAt: null,
        role: { departmentId: actor.departmentId, code: "poe_chairman" } }, data: { revokedAt } });
      await this.access.audit(tx, actor, "examination-authority.poe-chairman.revoked", id);
      return revoked;
    });
  }

  provisionExternal(examinationId: string, assignmentId: string, input: { email: string; displayName: string; expiresAt: string; sourceReference: string; temporaryPassword: string }) {
    const sourceReference = boundedReason(input.sourceReference, 500);
    const expiresAt = futureExpiry(input.expiresAt);
    if (!passwordPolicySchema.safeParse(input.temporaryPassword).success || Buffer.byteLength(input.temporaryPassword, "utf8") > 72) {
      throw new BadRequestException("The credential must satisfy the existing password policy and bcrypt byte limit");
    }
    return this.provision(async (tx, actor) => {
      await this.examinations.lock(tx, actor.departmentId, examinationId);
      const committee = await this.examinations.committee(tx, actor.departmentId, examinationId);
      const assignment = committee.assignments.find((a) => a.id === assignmentId && a.seat === "EXTERNAL_MEMBER");
      if (!assignment || assignment.assignedUserId || !assignment.externalMemberName || !assignment.externalMemberAffiliation) {
        throw new NotFoundException("Current External Member appointment not found");
      }
      if (assignment.expiresAt && expiresAt > assignment.expiresAt) throw new BadRequestException("Digital access cannot exceed appointment expiry");
      const email = input.email.trim().toLowerCase();
      const existing = await tx.externalComprehensiveAccess.findFirst({ where: { assignmentId, departmentId: actor.departmentId } });
      if (existing) throw new ConflictException("External appointment already has a digital binding");
      // A dedicated account is never converted from a Student, Teacher or Administrator account.
      const collision = await tx.user.findFirst({ where: { OR: [{ normalizedEmail: email }, { email }] }, select: { id: true } });
      if (collision) throw new ConflictException("A dedicated unused account email is required");
      const passwordHash = await this.passwords.hash(input.temporaryPassword);
      const user = await tx.user.create({ data: { email, normalizedEmail: email, displayName: boundedReason(input.displayName, 128),
        departmentId: actor.departmentId, status: "ACTIVE", passwordHash }, select: { id: true } });
      await this.grant(tx, actor, user.id, "comprehensive_external", [P.READ, P.MARK], expiresAt);
      const binding = await tx.externalComprehensiveAccess.create({ data: { departmentId: actor.departmentId, assignmentId,
        assignmentAssignedAt: assignment.assignedAt, userId: user.id, expiresAt, sourceReference, recordedByUserId: actor.actorUserId } });
      await this.access.audit(tx, actor, "examination-authority.external-comprehensive.provisioned", binding.id,
        { assignmentId, userId: user.id, examinationId });
      // Same credential mechanism as managed-user creation. The credential/hash never enters a response or audit.
      return binding;
    });
  }

  revokeExternal(id: string) {
    return this.provision(async (tx, actor) => {
      const binding = await tx.externalComprehensiveAccess.findFirst({ where: { id, departmentId: actor.departmentId } });
      if (!binding) throw new NotFoundException("External binding not found");
      if (binding.revokedAt) return binding;
      const revokedAt = new Date();
      const revoked = await tx.externalComprehensiveAccess.update({ where: { id }, data: { revokedAt, revokedByUserId: actor.actorUserId } });
      await tx.userRole.updateMany({ where: { userId: binding.userId, departmentId: actor.departmentId, revokedAt: null,
        role: { departmentId: actor.departmentId, code: "comprehensive_external" } }, data: { revokedAt } });
      await this.access.audit(tx, actor, "examination-authority.external-comprehensive.revoked", id);
      return revoked;
    });
  }

  private async grant(tx: Prisma.TransactionClient, actor: EvidenceActor, userId: string, code: string, policies: string[], expiresAt: Date) {
    const role = await tx.role.upsert({ where: { departmentId_code: { departmentId: actor.departmentId, code } },
      create: { departmentId: actor.departmentId, code, name: code }, update: {} });
    if (role.archivedAt) throw new ConflictException("Academic access role is archived");
    for (const policy of policies) {
      const def = EXAMINATION_PERMISSION_DEFINITIONS.find((d) => `${d.resource}.${d.action}` === policy)!;
      const permission = await tx.permission.upsert({ where: { code: def.code }, create: { ...def, scope: "DEPARTMENT" }, update: {} });
      if (permission.resource !== def.resource || permission.action !== def.action || permission.scope !== "DEPARTMENT") throw new ConflictException("Permission identity collision");
      await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id }, update: {} });
    }
    const granted = await tx.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: true } });
    if (granted.some((g) => !policies.includes(`${g.permission.resource}.${g.permission.action}`) || g.permission.scope !== "DEPARTMENT")) {
      throw new ConflictException("Narrow academic role has unexpected permissions");
    }
    await tx.userRole.upsert({ where: { userId_roleId_departmentId: { userId, roleId: role.id, departmentId: actor.departmentId } },
      create: { userId, roleId: role.id, departmentId: actor.departmentId, expiresAt, assignedByUserId: actor.actorUserId },
      update: { revokedAt: null, expiresAt, assignedByUserId: actor.actorUserId } });
  }
}

function futureExpiry(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new BadRequestException("A future expiry is required");
  return date;
}
