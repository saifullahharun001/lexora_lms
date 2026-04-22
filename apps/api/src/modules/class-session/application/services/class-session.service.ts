import type { ClassSessionRecord } from "../../contracts/class-session.contracts";

export interface ClassSessionService {
  createSession(input: ClassSessionRecord): Promise<ClassSessionRecord>;
  updateSession(input: ClassSessionRecord): Promise<ClassSessionRecord>;
  cancelSession(id: string): Promise<void>;
  lockSession(id: string): Promise<void>;
}

