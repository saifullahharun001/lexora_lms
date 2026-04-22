import type {
  AcademicProgramRecord,
  AcademicTermRecord,
  AcademicYearRecord,
  CourseOfferingRecord,
  CourseRecord,
  EligibilityRuleBindingRecord,
  EligibilityRuleDefinitionRecord,
  TeacherCourseAssignmentRecord
} from "../../contracts/course-management.contracts";

export interface CourseManagementRepositoryPort {
  findAcademicProgramById(id: string): Promise<AcademicProgramRecord | null>;
  findAcademicYearById(id: string): Promise<AcademicYearRecord | null>;
  findAcademicTermById(id: string): Promise<AcademicTermRecord | null>;
  findCourseById(id: string): Promise<CourseRecord | null>;
  findCourseOfferingById(id: string): Promise<CourseOfferingRecord | null>;
  findTeacherAssignmentById(id: string): Promise<TeacherCourseAssignmentRecord | null>;
  findEligibilityRuleDefinitionById(id: string): Promise<EligibilityRuleDefinitionRecord | null>;
  saveAcademicProgram(record: AcademicProgramRecord): Promise<AcademicProgramRecord>;
  saveAcademicYear(record: AcademicYearRecord): Promise<AcademicYearRecord>;
  saveAcademicTerm(record: AcademicTermRecord): Promise<AcademicTermRecord>;
  saveCourse(record: CourseRecord): Promise<CourseRecord>;
  saveCourseOffering(record: CourseOfferingRecord): Promise<CourseOfferingRecord>;
  saveTeacherAssignment(record: TeacherCourseAssignmentRecord): Promise<TeacherCourseAssignmentRecord>;
  saveEligibilityRuleDefinition(record: EligibilityRuleDefinitionRecord): Promise<EligibilityRuleDefinitionRecord>;
  saveEligibilityRuleBinding(record: EligibilityRuleBindingRecord): Promise<EligibilityRuleBindingRecord>;
}

