-- Additive scheduled-end boundary. Historical Attendance guards remain installed unchanged.
ALTER TYPE "ClassSessionStatus" ADD VALUE 'NOT_CONDUCTED';
ALTER TABLE class_sessions ADD COLUMN non_conducted_at TIMESTAMP(3);
CREATE INDEX class_sessions_due_idx ON class_sessions(status, scheduled_end_at, id);

-- Use text here so this migration also works when the enum addition is in the same transaction.
ALTER TABLE class_sessions ADD CONSTRAINT class_session_non_conducted_check CHECK (
  (status::text = 'NOT_CONDUCTED' AND non_conducted_at IS NOT NULL
    AND non_conducted_at = scheduled_end_at AND actual_start_at IS NULL
    AND actual_end_at IS NULL AND canceled_at IS NULL)
  OR (status::text <> 'NOT_CONDUCTED' AND non_conducted_at IS NULL)
);

CREATE FUNCTION class_session_deadline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Validate every attempted non-conducted transition, including premature ones.
  -- The CHECK constraint alone only proves the resulting row's provenance shape.
  IF NEW.status::text = 'NOT_CONDUCTED' THEN
    IF OLD.status::text IS DISTINCT FROM 'SCHEDULED' THEN
      RAISE EXCEPTION 'Only a scheduled class session can become non-conducted' USING ERRCODE = '23514';
    END IF;
    IF OLD.scheduled_end_at IS NULL OR OLD.scheduled_end_at > (clock_timestamp() AT TIME ZONE 'UTC') THEN
      RAISE EXCEPTION 'Class session scheduled end has not been reached' USING ERRCODE = '23514';
    END IF;
    IF NEW.scheduled_start_at IS DISTINCT FROM OLD.scheduled_start_at
      OR NEW.scheduled_end_at IS DISTINCT FROM OLD.scheduled_end_at
      OR OLD.actual_start_at IS NOT NULL OR OLD.actual_end_at IS NOT NULL OR OLD.canceled_at IS NOT NULL
      OR NEW.actual_start_at IS NOT NULL OR NEW.actual_end_at IS NOT NULL OR NEW.canceled_at IS NOT NULL
      OR NEW.non_conducted_at IS DISTINCT FROM OLD.scheduled_end_at THEN
      RAISE EXCEPTION 'Non-conducted transition requires unchanged schedule and never-started evidence' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM attendance_records WHERE class_session_id = OLD.id)
      OR EXISTS (SELECT 1 FROM formative_attendance_source_items WHERE class_session_id = OLD.id)
      OR EXISTS (SELECT 1 FROM formative_attendance_corrections WHERE class_session_id = OLD.id) THEN
      RAISE EXCEPTION 'Never-started class session has contradictory Attendance evidence' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Check the OLD boundary: an expired schedule cannot be extended before the sweep.
  IF OLD.status::text IN ('SCHEDULED','ACTIVE') AND OLD.scheduled_end_at <= (clock_timestamp() AT TIME ZONE 'UTC') THEN
    IF NEW.scheduled_end_at IS DISTINCT FROM OLD.scheduled_end_at
      OR NEW.scheduled_start_at IS DISTINCT FROM OLD.scheduled_start_at THEN
      RAISE EXCEPTION 'Class session scheduled end has passed' USING ERRCODE = '23514';
    END IF;
    IF OLD.status::text = 'SCHEDULED' THEN
      RAISE EXCEPTION 'Expired scheduled session requires non-conducted reconciliation' USING ERRCODE = '23514';
    ELSE
      IF OLD.actual_start_at IS NULL OR OLD.actual_start_at >= OLD.scheduled_end_at
        OR OLD.actual_end_at IS NOT NULL OR OLD.canceled_at IS NOT NULL
        OR NEW.status::text <> 'COMPLETED'
        OR NEW.canceled_at IS NOT NULL
        OR NEW.actual_start_at IS DISTINCT FROM OLD.actual_start_at
        OR NEW.actual_end_at IS DISTINCT FROM OLD.scheduled_end_at THEN
        RAISE EXCEPTION 'Expired active session requires valid scheduled-end completion' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  -- Ordinary rescheduling must not manufacture an immediately expired SCHEDULED row.
  IF NEW.status::text = 'SCHEDULED' AND NEW.scheduled_end_at <= (clock_timestamp() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Updated scheduled session must have a future scheduled end' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER class_session_deadline_guard BEFORE UPDATE ON class_sessions
FOR EACH ROW EXECUTE FUNCTION class_session_deadline_guard();

-- Runs after the existing source guard (alphabetical trigger order), preserving its
-- offering mutex, identity checks, immutable evidence checks and revision stamping.
-- This is the RAW capture/override boundary only. Existing raw override is ACTIVE-only.
-- Post-class authorised correction INSERTs an immutable formative_attendance_corrections
-- overlay and successor version, with exact Coordinator authority, reason, actor,
-- timestamp, source lineage and transactional audit enforced by the existing path.
-- It does not UPDATE attendance_records and is not subject to this deadline trigger.
-- override_by_user_id / override_reason on a raw row are mutable, reusable metadata;
-- they do not prove a fresh authorised correction and must not exempt a raw UPDATE.
CREATE FUNCTION class_session_attendance_deadline_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s class_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM class_sessions WHERE id = NEW.class_session_id
    AND department_id = NEW.department_id FOR SHARE;
  IF NOT FOUND OR s.status::text <> 'ACTIVE' OR s.canceled_at IS NOT NULL
    OR s.scheduled_end_at <= (clock_timestamp() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Attendance capture requires ACTIVE session before scheduledEndAt' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER class_session_attendance_deadline_guard BEFORE INSERT OR UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION class_session_attendance_deadline_guard();
