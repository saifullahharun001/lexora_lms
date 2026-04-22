import type {
  AttendanceImportBatchRecord,
  AttendanceRecordEntry
} from "../../contracts/attendance.contracts";

export interface AttendanceService {
  captureAttendance(input: AttendanceRecordEntry): Promise<AttendanceRecordEntry>;
  overrideAttendance(input: AttendanceRecordEntry): Promise<AttendanceRecordEntry>;
  createImportBatch(input: AttendanceImportBatchRecord): Promise<AttendanceImportBatchRecord>;
  cancelImportBatch(id: string): Promise<void>;
}

