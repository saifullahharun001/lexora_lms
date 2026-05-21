import { Module } from "@nestjs/common";

import { HealthModule } from "./common/health/health.module";
import {
  AcademicModule,
  AssessmentModule,
  AssignmentModule,
  AttendanceModule,
  AuditComplianceModule,
  AuthorizationModule,
  ClassSessionModule,
  CourseManagementModule,
  DepartmentConfigModule,
  DiscussionModule,
  EnrollmentModule,
  EligibilityModule,
  FileStorageModule,
  IdentityAccessModule,
  IntegrationLayerModule,
  NotificationModule,
  NoticeModule,
  QuizModule,
  ReportingDashboardModule,
  ResultProcessingModule,
  SystemConfigurationModule,
  TranscriptVerificationModule,
  UserManagementModule
} from "./modules";
import { PlatformModule } from "./platform/platform.module";

@Module({
  imports: [
    PlatformModule,
    HealthModule,
    IdentityAccessModule,
    AuthorizationModule,
    AcademicModule,
    AssessmentModule,
    DepartmentConfigModule,
    UserManagementModule,
    CourseManagementModule,
    EnrollmentModule,
    EligibilityModule,
    ClassSessionModule,
    AttendanceModule,
    AssignmentModule,
    QuizModule,
    ResultProcessingModule,
    TranscriptVerificationModule,
    DiscussionModule,
    NotificationModule,
    NoticeModule,
    FileStorageModule,
    AuditComplianceModule,
    ReportingDashboardModule,
    SystemConfigurationModule,
    IntegrationLayerModule
  ]
})
export class AppModule {}
