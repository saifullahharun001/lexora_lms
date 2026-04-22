import type { EnrollmentRecord } from "../../contracts/enrollment.contracts";

export interface EnrollmentRepositoryPort {
  findById(id: string): Promise<EnrollmentRecord | null>;
  findByOfferingAndStudent(
    courseOfferingId: string,
    studentUserId: string
  ): Promise<EnrollmentRecord | null>;
  save(record: EnrollmentRecord): Promise<EnrollmentRecord>;
}

