export const FILE_STORAGE_AUDIT_EVENTS = {
  REGISTERED_PENDING_SCAN: "file-storage.file.registered-pending-scan",
  SCAN_RECORDED: "file-storage.file.scan-recorded",
  AVAILABLE: "file-storage.file.available",
  PROMOTION_RECONCILIATION_REQUIRED:
    "file-storage.file.promotion-reconciliation-required",
  QUARANTINED: "file-storage.file.quarantined",
  REJECTED: "file-storage.file.rejected",
  ARCHIVED: "file-storage.file.archived",
  DELETED: "file-storage.file.deleted",
} as const;
