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

export interface CourseManagementService {
  createAcademicProgram(input: AcademicProgramRecord): Promise<AcademicProgramRecord>;
  createAcademicYear(input: AcademicYearRecord): Promise<AcademicYearRecord>;
  createAcademicTerm(input: AcademicTermRecord): Promise<AcademicTermRecord>;
  createCourse(input: CourseRecord): Promise<CourseRecord>;
  createCourseOffering(input: CourseOfferingRecord): Promise<CourseOfferingRecord>;
  assignTeacher(input: TeacherCourseAssignmentRecord): Promise<TeacherCourseAssignmentRecord>;
  createEligibilityRule(input: EligibilityRuleDefinitionRecord): Promise<EligibilityRuleDefinitionRecord>;
  bindEligibilityRule(input: EligibilityRuleBindingRecord): Promise<EligibilityRuleBindingRecord>;
}

