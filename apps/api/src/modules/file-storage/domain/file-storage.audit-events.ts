export const FILE_STORAGE_AUDIT_EVENTS = {
  REGISTERED_PENDING_SCAN: "file-storage.file.registered-pending-scan",
  SCAN_RECORDED: "file-storage.file.scan-recorded",
  AVAILABLE: "file-storage.file.available",
  PROMOTION_RECONCILIATION_REQUIRED:
    "file-storage.file.promotion-reconciliation-required",
  INFECTED_QUARANTINE_RECONCILIATION_REQUIRED:
    "file-storage.file.infected-quarantine-reconciliation-required",
  QUARANTINED: "file-storage.file.quarantined",
  REJECTED: "file-storage.file.rejected",
  ARCHIVED: "file-storage.file.archived",
  SCAN_JOB_ENQUEUED: "file-storage.scan-job.enqueued",
  SCAN_JOB_RETRY_SCHEDULED: "file-storage.scan-job.retry-scheduled",
  SCAN_JOB_DEAD_LETTERED: "file-storage.scan-job.dead-lettered",
  SCAN_JOB_EXPIRED_CLAIM_RECOVERED:
    "file-storage.scan-job.expired-claim-recovered",
  DELETED: "file-storage.file.deleted",
} as const;
