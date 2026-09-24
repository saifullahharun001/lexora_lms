import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/** Explicit exported source read model. Archival does not erase conducted classes. */
@Injectable()
export class ClassSessionEvidenceService {
  read(tx: Prisma.TransactionClient, departmentId: string, courseOfferingId: string) {
    return tx.classSession.findMany({ where: { departmentId, courseOfferingId }, orderBy: { id: "asc" }, select: {
      id: true, departmentId: true, courseOfferingId: true, status: true,
      actualStartAt: true, actualEndAt: true, canceledAt: true, attendanceEvidenceRevision: true,
    } });
  }
}
