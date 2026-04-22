import type { EnrollmentRecord } from "../../contracts/enrollment.contracts";

export interface EnrollmentService {
  createEnrollment(input: EnrollmentRecord): Promise<EnrollmentRecord>;
  updateEnrollment(input: EnrollmentRecord): Promise<EnrollmentRecord>;
  archiveEnrollment(id: string): Promise<void>;
}

