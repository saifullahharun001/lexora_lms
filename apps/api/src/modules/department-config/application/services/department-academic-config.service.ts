import type { DepartmentAcademicConfigRecord } from "../../contracts/department-academic-config.contract";

export interface DepartmentAcademicConfigService {
  getConfig(departmentId: string): Promise<DepartmentAcademicConfigRecord | null>;
  upsertConfig(input: DepartmentAcademicConfigRecord): Promise<DepartmentAcademicConfigRecord>;
}

