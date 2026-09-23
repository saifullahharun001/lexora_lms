import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export async function evidenceTransaction<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const retry = error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)));
        if (retry && attempt < 2) continue;
        if (retry || error.code === "P2002") throw new ConflictException("Concurrent or duplicate evidence operation; reload the workspace");
      }
      throw error;
    }
  }
}
