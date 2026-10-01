-- Step 4A only. Preserve all historical whole-package evidence and its guards.
BEGIN;

-- Keep old writers out between validation and installation of the new guard.
-- Fail closed without modifying any historical configuration or evidence.
LOCK TABLE formative_activities IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM formative_activities
    GROUP BY department_id, course_offering_id
    HAVING sum(assigned_weight) > 30.00
  ) THEN
    RAISE EXCEPTION 'Existing Formative activity configuration exceeds the /30 budget; controlled review is required before migration'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- All configured activities count. Partial totals are valid; final /30 equality
-- belongs to future Chairman finalisation, not to an individual submission.
CREATE FUNCTION formative_activity_weight_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total NUMERIC;
BEGIN
  PERFORM id FROM course_offerings WHERE id = NEW.course_offering_id AND department_id = NEW.department_id FOR UPDATE;
  -- Keep the same mutex, and create a row version without changing offering data.
  -- This also prevents an old REPEATABLE READ snapshot from passing a stale sum:
  -- a concurrent configuration writer must see the committed total or fail serialization.
  UPDATE course_offerings SET id = id WHERE id = NEW.course_offering_id AND department_id = NEW.department_id;
  SELECT coalesce(sum(assigned_weight), 0) INTO total FROM formative_activities
    WHERE department_id = NEW.department_id AND course_offering_id = NEW.course_offering_id
      AND id <> NEW.id;
  IF total + NEW.assigned_weight > 30.00 THEN
    RAISE EXCEPTION 'Activity weights cannot exceed the offering 30.00 budget' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_activity_weight_budget_guard BEFORE INSERT OR UPDATE ON formative_activities
  FOR EACH ROW EXECUTE FUNCTION formative_activity_weight_budget_guard();

CREATE TABLE formative_activity_submissions (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  course_offering_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  previous_id TEXT UNIQUE,
  activity_version INTEGER NOT NULL CHECK (activity_version > 0),
  raw_maximum DECIMAL(6,2) NOT NULL CHECK (raw_maximum > 0),
  assigned_weight DECIMAL(6,2) NOT NULL CHECK (assigned_weight > 0 AND assigned_weight <= 30),
  rule_version_code VARCHAR(64) NOT NULL CHECK (rule_version_code = 'FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1'),
  enrollment_count INTEGER NOT NULL CHECK (enrollment_count > 0),
  source_fingerprint VARCHAR(64) NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_snapshot_json JSONB NOT NULL,
  actor_user_id TEXT NOT NULL,
  teacher_assignment_id TEXT NOT NULL,
  assignment_assigned_at TIMESTAMP(3) NOT NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fa_submission_lineage_check CHECK ((version = 1 AND previous_id IS NULL) OR (version > 1 AND previous_id IS NOT NULL)),
  CONSTRAINT fa_submission_scope_uq UNIQUE (id, department_id, course_offering_id, activity_id),
  CONSTRAINT fa_submission_version_uq UNIQUE (department_id, activity_id, version),
  CONSTRAINT fa_submission_activity_fk FOREIGN KEY (activity_id, department_id, course_offering_id)
    REFERENCES formative_activities(id, department_id, course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fa_submission_assignment_fk FOREIGN KEY (teacher_assignment_id, department_id, course_offering_id, actor_user_id)
    REFERENCES teacher_course_assignments(id, department_id, course_offering_id, teacher_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fa_submission_previous_fk FOREIGN KEY (previous_id, department_id, course_offering_id, activity_id)
    REFERENCES formative_activity_submissions(id, department_id, course_offering_id, activity_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX fa_submission_offering_idx ON formative_activity_submissions(department_id, course_offering_id);

CREATE TABLE formative_activity_submission_items (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  course_offering_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  mark_evidence_id TEXT NOT NULL,
  CONSTRAINT fa_item_enrollment_uq UNIQUE (submission_id, enrollment_id),
  CONSTRAINT fa_item_submission_fk FOREIGN KEY (submission_id, department_id, course_offering_id, activity_id)
    REFERENCES formative_activity_submissions(id, department_id, course_offering_id, activity_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fa_item_enrollment_fk FOREIGN KEY (enrollment_id, department_id, course_offering_id)
    REFERENCES enrollments(id, department_id, course_offering_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fa_item_mark_fk FOREIGN KEY (mark_evidence_id, department_id, course_offering_id, enrollment_id, activity_id)
    REFERENCES formative_mark_evidence(id, department_id, course_offering_id, enrollment_id, activity_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX fa_item_mark_idx ON formative_activity_submission_items(mark_evidence_id);

CREATE FUNCTION formative_activity_package_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Activity submission evidence is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER fa_submission_immutable BEFORE UPDATE OR DELETE ON formative_activity_submissions
  FOR EACH ROW EXECUTE FUNCTION formative_activity_package_immutable();
CREATE TRIGGER fa_item_immutable BEFORE UPDATE OR DELETE ON formative_activity_submission_items
  FOR EACH ROW EXECUTE FUNCTION formative_activity_package_immutable();

CREATE FUNCTION formative_legacy_submission_cutover() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legacy whole-package Teacher submission writes are retired' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER formative_legacy_submission_cutover BEFORE INSERT ON formative_teacher_submissions
  FOR EACH ROW EXECUTE FUNCTION formative_legacy_submission_cutover();

-- Additional guards, never replacements for the legacy no-delete, configuration,
-- mark immutability, integrity and enrollment-freeze guards.
CREATE FUNCTION formative_submitted_activity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM formative_activity_submissions WHERE activity_id = OLD.id AND department_id = OLD.department_id) THEN
    RAISE EXCEPTION 'Submitted activity configuration is frozen' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_submitted_activity_guard BEFORE UPDATE ON formative_activities
  FOR EACH ROW EXECUTE FUNCTION formative_submitted_activity_guard();

-- Exact live Course Teacher only. This is deliberately not a Chairman authorizer.
CREATE FUNCTION formative_activity_teacher_authority(dept TEXT, offering TEXT, actor TEXT, assignment TEXT,
  assigned_at_snapshot TIMESTAMP, adjustment BOOLEAN) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM a.id FROM teacher_course_assignments a
    JOIN users u ON u.id = a.teacher_user_id AND u.department_id = a.department_id
    JOIN departments d ON d.id = a.department_id
    JOIN user_roles ur ON ur.user_id = u.id AND ur.department_id = a.department_id
    JOIN roles r ON r.id = ur.role_id AND r.department_id = a.department_id
    WHERE a.id = assignment AND a.department_id = dept AND a.course_offering_id = offering AND a.teacher_user_id = actor
      AND a.status = 'ACTIVE' AND a.assigned_at <= CURRENT_TIMESTAMP AND a.assigned_at = assigned_at_snapshot
      AND a.unassigned_at IS NULL AND a.archived_at IS NULL
      AND u.status = 'ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL
      AND d.status = 'ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL
      AND r.code = 'teacher' AND r.archived_at IS NULL AND ur.revoked_at IS NULL
      AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
      AND (NOT adjustment OR EXISTS (SELECT 1 FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id = r.id AND p.resource = 'formative.mark' AND p.action = 'adjust' AND p.scope = 'DEPARTMENT' FOR SHARE OF p, rp))
    FOR SHARE OF a, u, d, ur, r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact active Course Teacher authority required' USING ERRCODE = '23514'; END IF;
END;
$$;

CREATE FUNCTION formative_post_submission_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM course_offerings WHERE id = NEW.course_offering_id AND department_id = NEW.department_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM formative_activity_submissions WHERE activity_id = NEW.activity_id AND department_id = NEW.department_id) THEN
    IF NEW.reason IS NULL OR NEW.reason !~ '[^[:space:]]' THEN
      RAISE EXCEPTION 'Post-submission revision requires an adjustment reason' USING ERRCODE = '23514';
    END IF;
    PERFORM formative_activity_teacher_authority(NEW.department_id, NEW.course_offering_id, NEW.actor_user_id,
      NEW.teacher_assignment_id, NEW.assignment_assigned_at, true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER formative_post_submission_revision_guard BEFORE INSERT ON formative_mark_evidence
  FOR EACH ROW EXECUTE FUNCTION formative_post_submission_revision_guard();

CREATE FUNCTION formative_activity_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous formative_activity_submissions;
BEGIN
  PERFORM id FROM course_offerings WHERE id = NEW.course_offering_id AND department_id = NEW.department_id
    AND archived_at IS NULL AND status NOT IN ('CANCELED', 'ARCHIVED') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid activity offering' USING ERRCODE = '23514'; END IF;
  PERFORM formative_activity_teacher_authority(NEW.department_id, NEW.course_offering_id, NEW.actor_user_id,
    NEW.teacher_assignment_id, NEW.assignment_assigned_at, false);
  SELECT * INTO previous FROM formative_activity_submissions
    WHERE department_id = NEW.department_id AND activity_id = NEW.activity_id ORDER BY version DESC LIMIT 1;
  IF NEW.version <> coalesce(previous.version, 0) + 1 OR NEW.previous_id IS DISTINCT FROM previous.id THEN
    RAISE EXCEPTION 'Invalid activity submission predecessor/version' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_fingerprint = previous.source_fingerprint THEN
    RAISE EXCEPTION 'Activity sources are unchanged' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fa_submission_guard BEFORE INSERT ON formative_activity_submissions
  FOR EACH ROW EXECUTE FUNCTION formative_activity_submission_guard();

CREATE FUNCTION formative_activity_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A committed package must never acquire children, even if enrollment scope grows.
  IF NOT EXISTS (SELECT 1 FROM formative_activity_submissions WHERE id = NEW.submission_id AND xmin = pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'Activity source items must be inserted with their parent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fa_item_guard BEFORE INSERT ON formative_activity_submission_items
  FOR EACH ROW EXECUTE FUNCTION formative_activity_item_guard();

-- Derived freshness: history stays immutable when sources or enrollment scope change.
-- A future Chairman consumer MUST recheck this under the offering mutex in its
-- Serializable transaction; this function grants no finalisation authority or batching scope.
CREATE FUNCTION formative_activity_submission_is_current(submission TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM formative_activity_submissions p JOIN formative_activities a ON a.id = p.activity_id
    WHERE p.id = submission AND a.status = 'MARKING' AND a.version = p.activity_version
      AND a.raw_maximum = p.raw_maximum AND a.assigned_weight = p.assigned_weight
      AND NOT EXISTS (SELECT 1 FROM formative_activity_submissions next WHERE next.previous_id = p.id)
      AND p.enrollment_count = (SELECT count(*) FROM enrollments e WHERE e.department_id = p.department_id
        AND e.course_offering_id = p.course_offering_id AND e.status = 'APPROVED' AND e.archived_at IS NULL)
      AND p.enrollment_count = (SELECT count(*) FROM formative_activity_submission_items i
        JOIN enrollments e ON e.id = i.enrollment_id JOIN formative_mark_evidence m ON m.id = i.mark_evidence_id
        WHERE i.submission_id = p.id AND e.status = 'APPROVED' AND e.archived_at IS NULL
          AND m.raw_mark IS NOT NULL AND m.feedback_completed AND m.feedback ~ '[^[:space:]]' AND m.integrity_status = 'CLEAR'
          AND m.raw_maximum = p.raw_maximum AND m.assigned_weight = p.assigned_weight
          AND m.weighted_mark = round(m.raw_mark / p.raw_maximum * p.assigned_weight, 2)
          AND NOT EXISTS (SELECT 1 FROM formative_mark_evidence later WHERE later.department_id = m.department_id
            AND later.activity_id = m.activity_id AND later.enrollment_id = m.enrollment_id AND later.revision > m.revision))
      AND p.enrollment_count = (SELECT count(*) FROM formative_activity_submission_items i WHERE i.submission_id = p.id)
  );
$$;

CREATE FUNCTION formative_fingerprint_token(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT octet_length(convert_to(value, 'UTF8'))::TEXT || ':' || value;
$$;

-- Reconstruct the bound standard configuration independently of application JSON.
-- Lock the same curriculum/template/component rows as standardConfiguration().
CREATE FUNCTION formative_activity_configuration(dept TEXT, offering TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE component RECORD; configuration JSONB; components JSONB := '[]'; codes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR component IN
    SELECT t.id AS template_id, t.version_number, t.total_marks, c.id, c.code, c.maximum_marks, c.is_required
    FROM course_offerings o JOIN curriculum_courses cc
      ON cc.id = o.curriculum_course_id AND cc.department_id = o.department_id AND cc.course_id = o.course_id
    JOIN course_assessment_templates t ON t.id = cc.assessment_template_id AND t.department_id = cc.department_id
    JOIN assessment_template_components c ON c.assessment_template_id = t.id AND c.department_id = t.department_id
    WHERE o.id = offering AND o.department_id = dept AND t.archived_at IS NULL
    ORDER BY c.code COLLATE "C" FOR SHARE OF cc, t, c
  LOOP
    IF component.is_required IS DISTINCT FROM true OR component.total_marks IS DISTINCT FROM 100::NUMERIC
      OR component.code = ANY(codes) OR component.maximum_marks IS DISTINCT FROM
        (CASE component.code WHEN 'FORMATIVE_ACTIVITIES' THEN 30::NUMERIC WHEN 'ATTENDANCE' THEN 5::NUMERIC
          WHEN 'COMPREHENSIVE_EXAMINATION' THEN 5::NUMERIC WHEN 'SUMMATIVE_EXAMINATION' THEN 60::NUMERIC END) THEN
      RAISE EXCEPTION 'A bound standard 30/5/5/60 assessment template is required' USING ERRCODE = '23514';
    END IF;
    codes := array_append(codes, component.code);
    configuration := jsonb_build_object('templateId', component.template_id, 'templateVersion', component.version_number);
    components := components || jsonb_build_array(jsonb_build_object('id', component.id, 'code', component.code,
      'maximum', component.maximum_marks::NUMERIC(6,2)::TEXT));
  END LOOP;
  IF cardinality(codes) <> 4 THEN
    RAISE EXCEPTION 'A bound standard 30/5/5/60 assessment template is required' USING ERRCODE = '23514';
  END IF;
  RETURN configuration || jsonb_build_object('components', components);
END;
$$;

CREATE FUNCTION formative_configuration_fingerprint_tokens(configuration JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT formative_fingerprint_token(configuration->>'templateId')
    || formative_fingerprint_token(configuration->>'templateVersion')
    || (SELECT string_agg(formative_fingerprint_token(c->>'id') || formative_fingerprint_token(c->>'code')
      || formative_fingerprint_token(c->>'maximum'), '' ORDER BY (c->>'code') COLLATE "C")
      FROM jsonb_array_elements(configuration->'components') c);
$$;

CREATE FUNCTION formative_activity_submission_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE package formative_activity_submissions; a formative_activities; sources JSONB; fingerprint TEXT; configuration JSONB;
BEGIN
  IF TG_TABLE_NAME = 'formative_activity_submission_items' THEN
    SELECT * INTO package FROM formative_activity_submissions WHERE id = NEW.submission_id;
  ELSE
    package := NEW;
  END IF;
  PERFORM id FROM course_offerings WHERE id = package.course_offering_id AND department_id = package.department_id FOR UPDATE;
  IF (SELECT coalesce(sum(assigned_weight), 0) FROM formative_activities
      WHERE department_id = package.department_id AND course_offering_id = package.course_offering_id) > 30.00 THEN
    RAISE EXCEPTION 'Current Formative activity configuration exceeds the /30 budget' USING ERRCODE = '23514';
  END IF;
  PERFORM id FROM enrollments WHERE department_id = package.department_id AND course_offering_id = package.course_offering_id
    AND status = 'APPROVED' AND archived_at IS NULL ORDER BY id COLLATE "C" FOR SHARE;
  IF NOT formative_activity_submission_is_current(package.id) THEN
    RAISE EXCEPTION 'Incomplete or stale activity submission package' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO a FROM formative_activities WHERE id = package.activity_id;
  configuration := formative_activity_configuration(package.department_id, package.course_offering_id);
  SELECT jsonb_agg(jsonb_build_object('enrollmentId', i.enrollment_id, 'markEvidenceId', m.id, 'markRevision', m.revision,
      'rawMark', m.raw_mark::TEXT, 'weightedMark', m.weighted_mark::TEXT, 'feedback', m.feedback,
      'feedbackCompleted', m.feedback_completed, 'integrityStatus', m.integrity_status) ORDER BY i.enrollment_id COLLATE "C"),
    string_agg(formative_fingerprint_token(i.enrollment_id) || formative_fingerprint_token(m.id) || formative_fingerprint_token(m.revision::TEXT),
      '' ORDER BY i.enrollment_id COLLATE "C") INTO sources, fingerprint
    FROM formative_activity_submission_items i JOIN formative_mark_evidence m ON m.id = i.mark_evidence_id WHERE i.submission_id = package.id;
  fingerprint := formative_fingerprint_token(package.department_id) || formative_fingerprint_token(package.course_offering_id)
    || formative_fingerprint_token(a.id) || formative_fingerprint_token(a.version::TEXT)
    || formative_fingerprint_token(a.raw_maximum::TEXT) || formative_fingerprint_token(a.assigned_weight::TEXT)
    || formative_fingerprint_token(package.rule_version_code)
    || formative_configuration_fingerprint_tokens(configuration) || fingerprint;
  IF package.source_fingerprint <> encode(sha256(convert_to(fingerprint, 'UTF8')), 'hex') OR
    package.source_snapshot_json IS DISTINCT FROM jsonb_build_object('configuration', configuration, 'activity', jsonb_build_object('id', a.id, 'version', a.version,
      'title', a.title, 'method', a.method, 'rawMaximum', a.raw_maximum::TEXT, 'assignedWeight', a.assigned_weight::TEXT), 'sources', sources) THEN
    RAISE EXCEPTION 'Activity source snapshot/fingerprint mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER fa_submission_complete AFTER INSERT ON formative_activity_submissions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_activity_submission_complete();
CREATE CONSTRAINT TRIGGER fa_item_complete AFTER INSERT ON formative_activity_submission_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION formative_activity_submission_complete();

COMMIT;
