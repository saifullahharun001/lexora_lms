export interface DepartmentAcademicConfigRecord {
  id: string;
  departmentId: string;
  selfEnrollmentEnabled: boolean;
  selfEnrollmentRequiresApproval: boolean;
  teacherAssignmentRequiredForSession: boolean;
  attendanceManualOverrideRequiresReason: boolean;
  biometricAttendanceEnabled: boolean;
  eligibilityEnforcementEnabled: boolean;
  attendanceSettingsJson?: Record<string, unknown> | null;
  eligibilitySettingsJson?: Record<string, unknown> | null;
  updatedByUserId?: string | null;
}

