import type {
  AttendanceImportBatchRecord,
  AttendanceRecordEntry
} from "../../contracts/attendance.contracts";
import type {
  AttendanceImportBatchStatus,
  AttendanceImportSourceType,
  AttendanceRecordStatus,
  AttendanceSourceType,
  Prisma
} from "@prisma/client";

export interface AttendanceRecordListFilters {
  departmentId: string;
  courseOfferingId?: string;
  classSessionId?: string;
  enrollmentId?: string;
  studentUserId?: string;
  status?: AttendanceRecordStatus;
  sourceType?: AttendanceSourceType;
  assignedTeacherUserId?: string;
  limit: number;
  offset: number;
}

export interface AttendanceImportBatchListFilters {
  departmentId: string;
  courseOfferingId?: string;
  classSessionId?: string;
  status?: AttendanceImportBatchStatus;
  sourceType?: AttendanceImportSourceType;
  assignedTeacherUserId?: string;
  limit: number;
  offset: number;
}

export interface SaveAttendanceRecordInput {
  departmentId: string;
  classSessionId: string;
  enrollmentId: string;
  studentUserId: string;
  status: AttendanceRecordStatus;
  sourceType: AttendanceSourceType;
  externalSourceRef?: string | null;
  sourcePayloadJson?: Prisma.InputJsonValue;
  markedByUserId?: string | null;
}

export interface OverrideAttendanceRecordInput {
  status: AttendanceRecordStatus;
  sourceType: AttendanceSourceType;
  overrideByUserId: string;
  overrideReason: string;
}

export interface CreateAttendanceImportBatchInput {
  departmentId: string;
  courseOfferingId?: string | null;
  classSessionId?: string | null;
  uploadedByUserId: string;
  sourceType: AttendanceImportSourceType;
  externalSystemName?: string | null;
  externalBatchRef?: string | null;
  importWindowStartAt?: Date | null;
  importWindowEndAt?: Date | null;
  validationSummaryJson?: Prisma.InputJsonValue;
}

export interface AttendanceRepositoryPort {
  findAttendanceRecords(filters: AttendanceRecordListFilters): Promise<AttendanceRecordEntry[]>;
  findAttendanceRecordById(
    departmentId: string,
    id: string,
    assignedTeacherUserId?: string
  ): Promise<AttendanceRecordEntry | null>;
  saveAttendanceRecord(record: SaveAttendanceRecordInput): Promise<AttendanceRecordEntry>;
  overrideAttendanceRecord(
    departmentId: string,
    id: string,
    input: OverrideAttendanceRecordInput
  ): Promise<AttendanceRecordEntry | null>;
  findImportBatches(filters: AttendanceImportBatchListFilters): Promise<AttendanceImportBatchRecord[]>;
  findImportBatchById(
    departmentId: string,
    id: string,
    assignedTeacherUserId?: string
  ): Promise<AttendanceImportBatchRecord | null>;
  saveImportBatch(record: CreateAttendanceImportBatchInput): Promise<AttendanceImportBatchRecord>;
  cancelImportBatch(
    departmentId: string,
    id: string,
    reviewedByUserId: string
  ): Promise<AttendanceImportBatchRecord | null>;
}
