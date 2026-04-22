import { Module } from "@nestjs/common";

import { HealthModule } from "./common/health/health.module";
import {
  AssignmentModule,
  AttendanceModule,
  AuditComplianceModule,
  ClassSessionModule,
  CourseManagementModule,
  DepartmentConfigModule,
  DiscussionModule,
  EnrollmentModule,
  FileStorageModule,
  IdentityAccessModule,
  IntegrationLayerModule,
  NotificationModule,
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
    DepartmentConfigModule,
    UserManagementModule,
    CourseManagementModule,
    EnrollmentModule,
    ClassSessionModule,
    AttendanceModule,
    AssignmentModule,
    QuizModule,
    ResultProcessingModule,
    TranscriptVerificationModule,
    DiscussionModule,
    NotificationModule,
    FileStorageModule,
    AuditComplianceModule,
    ReportingDashboardModule,
    SystemConfigurationModule,
    IntegrationLayerModule
  ]
})
export class AppModule {}
