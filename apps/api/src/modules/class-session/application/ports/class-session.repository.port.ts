import type { ClassSessionRecord } from "../../contracts/class-session.contracts";

export interface ClassSessionRepositoryPort {
  findById(id: string): Promise<ClassSessionRecord | null>;
  save(record: ClassSessionRecord): Promise<ClassSessionRecord>;
}

