import type { DepartmentAcademicConfigRecord } from "../../contracts/department-academic-config.contract";

export interface DepartmentAcademicConfigRepositoryPort {
  findByDepartmentId(departmentId: string): Promise<DepartmentAcademicConfigRecord | null>;
  save(config: DepartmentAcademicConfigRecord): Promise<DepartmentAcademicConfigRecord>;
}

