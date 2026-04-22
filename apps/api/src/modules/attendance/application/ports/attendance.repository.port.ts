import type {
  AttendanceImportBatchRecord,
  AttendanceRecordEntry
} from "../../contracts/attendance.contracts";

export interface AttendanceRepositoryPort {
  findAttendanceRecordById(id: string): Promise<AttendanceRecordEntry | null>;
  saveAttendanceRecord(record: AttendanceRecordEntry): Promise<AttendanceRecordEntry>;
  findImportBatchById(id: string): Promise<AttendanceImportBatchRecord | null>;
  saveImportBatch(record: AttendanceImportBatchRecord): Promise<AttendanceImportBatchRecord>;
}

