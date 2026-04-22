export interface AcademicProgramRecord {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  status: string;
}

export interface AcademicYearRecord {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export interface AcademicTermRecord {
  id: string;
  departmentId: string;
  academicYearId: string;
  code: string;
  name: string;
  sequence: number;
  status: string;
}

export interface CourseRecord {
  id: string;
  departmentId: string;
  academicProgramId?: string | null;
  code: string;
  title: string;
  status: string;
}

export interface CourseOfferingRecord {
  id: string;
  departmentId: string;
  courseId: string;
  academicTermId: string;
  sectionCode: string;
  status: string;
}

export interface TeacherCourseAssignmentRecord {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  teacherUserId: string;
  roleCode: string;
  status: string;
}

export interface EligibilityRuleDefinitionRecord {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  scope: string;
  criteriaJson: Record<string, unknown>;
  version: number;
  isActive: boolean;
}

export interface EligibilityRuleBindingRecord {
  id: string;
  departmentId: string;
  eligibilityRuleDefinitionId: string;
  academicProgramId?: string | null;
  academicTermId?: string | null;
  courseOfferingId?: string | null;
  isActive: boolean;
}

