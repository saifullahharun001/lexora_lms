import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(path.resolve(process.cwd(), "prisma/migrations/202609210002_add_regular_comprehensive_workflow/migration.sql"), "utf8");

function sqlFunction(name: string) {
  const body = migration.match(new RegExp(`CREATE FUNCTION ${name}\\([\\s\\S]*?\\$\\$;`))?.[0];
  assert.ok(body, `${name} must exist`);
  return body;
}

test("exact permission helper mirrors the live department grant chain independently of Committee role identity", () => {
  const helper = sqlFunction("ce_exact_permission");
  for (const predicate of [
    "JOIN departments d ON d.id=u.department_id",
    "JOIN user_roles ur ON ur.user_id=u.id AND ur.department_id=u.department_id",
    "JOIN roles r ON r.id=ur.role_id AND r.department_id=ur.department_id",
    "JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id",
    "u.id=actor_id AND u.department_id=dept",
    "u.status='ACTIVE' AND u.archived_at IS NULL AND u.deleted_at IS NULL",
    "d.status='ACTIVE' AND d.archived_at IS NULL AND d.deleted_at IS NULL",
    "r.archived_at IS NULL AND ur.revoked_at IS NULL AND (ur.expires_at IS NULL OR ur.expires_at>clock_timestamp())",
    "p.code=permission_code AND p.resource=resource_arg AND p.action=action_arg AND p.scope='DEPARTMENT'",
    "FOR SHARE OF u,d,ur,r,rp,p", "RETURN FOUND;",
  ]) assert.ok(helper.includes(predicate), predicate);
  assert.doesNotMatch(helper, /r\.code|ce_current_member|ce_current_chair|\bLIKE\b|\bILIKE\b/);
  assert.doesNotMatch(sqlFunction("ce_current_member"), /ce_exact_permission/);
  assert.match(sqlFunction("ce_current_chair"), /ce_current_member/);
});

test("operation guards require exact permissions in addition to live appointments", () => {
  const config = sqlFunction("ce_configuration_guard");
  assert.match(config, /IF TG_OP='INSERT'[^\n]*NEW.configured_by_user_id IS DISTINCT FROM OLD.configured_by_user_id[^\n]*NEW.exam_date IS DISTINCT FROM OLD.exam_date THEN\s+IF NOT ce_exact_permission\(NEW.configured_by_user_id,NEW.department_id,'comprehensive-examination.configuration.manage_department','comprehensive-examination.configuration','manage'\) THEN RAISE EXCEPTION/);
  assert.match(config, /IF NOT ce_current_chair\(NEW.configured_assignment_id,NEW.department_id,NEW.committee_id,NEW.configured_by_user_id\)/);
  const mark = sqlFunction("ce_mark_guard");
  const markCheck = "IF NOT ce_exact_permission(NEW.actor_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter') THEN RAISE EXCEPTION";
  assert.ok(mark.includes(markCheck));
  assert.ok(mark.indexOf(markCheck) < mark.indexOf("IF TG_OP='INSERT'"), "Permission must cover draft UPDATE and every INSERT revision");
  assert.match(mark, /OR NOT ce_current_member\(a.id,c.department_id,c.committee_id,NEW.actor_user_id,NEW.external_access_id\)/);
  const review = sqlFunction("ce_review_guard");
  assert.doesNotMatch(review, /\b(?:FROM|JOIN) comprehensive_marks (?:AS )?m\b/, "The local mark record m must not also be a table alias");
  const reviewCheck = "IF NOT ce_exact_permission(NEW.actor_user_id,c.department_id,'comprehensive-examination.chairman.review_department','comprehensive-examination.chairman','review') THEN RAISE EXCEPTION";
  assert.ok(review.includes(reviewCheck));
  assert.ok(review.indexOf(reviewCheck) < review.indexOf("IF TG_TABLE_NAME='comprehensive_mark_returns'"), "Review permission must cover both return and absence");
  assert.match(review, /NOT ce_current_chair\(NEW.chairman_assignment_id,c.department_id,c.committee_id,NEW.actor_user_id\)/);
  assert.match(review, /OR NOT ce_current_member\(m.committee_assignment_id,c.department_id,c.committee_id,m.actor_user_id,m.external_access_id\)\s+OR NOT ce_exact_permission\(m.actor_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter'\)/);
  const final = sqlFunction("ce_final_guard");
  assert.match(final, /IF TG_TABLE_NAME='comprehensive_finalisations' THEN\s+IF NOT ce_exact_permission\(NEW.actor_user_id,c.department_id,'comprehensive-examination.chairman.finalise_department','comprehensive-examination.chairman','finalise'\) THEN RAISE EXCEPTION/);
  assert.match(final, /NOT ce_current_chair\(NEW.chairman_assignment_id,c.department_id,c.committee_id,NEW.actor_user_id\)/);
  for (const [trigger, table, guard] of [
    ["ce_configuration_guard", "comprehensive_examinations", "ce_configuration_guard"],
    ["ce_mark_guard", "comprehensive_marks", "ce_mark_guard"],
    ["ce_return_guard", "comprehensive_mark_returns", "ce_review_guard"],
    ["ce_absence_guard", "comprehensive_absences", "ce_review_guard"],
    ["ce_finalisation_guard", "comprehensive_finalisations", "ce_final_guard"],
  ]) assert.ok(migration.includes(`CREATE TRIGGER ${trigger} BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${guard}();`));
});

test("deferred final package rechecks exact finalise and submitted source mark-enter grants", () => {
  const finalPackage = sqlFunction("ce_package_validate");
  assert.match(finalPackage, /NOT ce_current_chair\(f.chairman_assignment_id,c.department_id,c.committee_id,f.actor_user_id\)/);
  assert.match(finalPackage, /IF NOT ce_exact_permission\(f.actor_user_id,c.department_id,'comprehensive-examination.chairman.finalise_department','comprehensive-examination.chairman','finalise'\) THEN RAISE EXCEPTION/);
  assert.match(finalPackage, /AND ce_current_member\(a.id,c.department_id,c.committee_id,m.actor_user_id,m.external_access_id\)\s+AND ce_exact_permission\(m.actor_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter'\)/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER ce_package_validate AFTER INSERT OR UPDATE ON comprehensive_examinations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ce_package_validate\(\)/);
});

test("candidate categories and certification form an explicit source separate from enrollment", () => {
  assert.match(schema, /enum ExaminationCandidateCategory\s*\{\s*REGULAR\s+IRREGULAR\s+IMPROVEMENT\s*\}/);
  assert.match(migration, /Roster requires exact certified REGULAR registration\/course sources/);
  assert.match(migration, /CREATE TRIGGER ce_candidate/);
  assert.match(migration, /ce_registered_source_guard/);
  assert.doesNotMatch(migration, /ON DELETE (CASCADE|SET NULL)|DROP TABLE|TRUNCATE|INSERT INTO/i);
});

test("candidate list and registration require department-scoped recording POE appointment FKs", () => {
  for (const [model, table, constraint] of [
    ["ExaminationCandidateList", "examination_candidate_lists", "ce_examinationcandidatelist_recordedpoeassignment_fk"],
    ["ExaminationCandidateRegistration", "examination_candidate_registrations", "ce_examinationcandidateregistration_recordedpoeassignment_fk"],
  ]) {
    const definition = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(definition);
    assert.match(definition, /recordedPoeAssignmentId String @map\("recorded_poe_assignment_id"\)/);
    assert.ok(definition.includes(`recordedPoeAssignment PoeChairmanAssignment @relation("${model}_recordedPoeAssignment", fields: [recordedPoeAssignmentId, departmentId], references: [id, departmentId], onDelete: Restrict, onUpdate: Restrict, map: "${constraint}")`));
    assert.ok(schema.includes(`${model}[] @relation("${model}_recordedPoeAssignment")`));
    const tableDefinition = migration.match(new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(tableDefinition);
    assert.match(tableDefinition, /"recorded_poe_assignment_id" TEXT NOT NULL,/);
    assert.ok(migration.includes(`ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("recorded_poe_assignment_id", "department_id") REFERENCES "poe_chairman_assignments" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;`));
  }
});

test("DRAFT recording requires exact live POE appointment and exact classification permission separately", () => {
  const helper = sqlFunction("ce_require_draft_poe");
  assert.match(helper, /PERFORM id FROM poe_chairman_assignments WHERE id=assignment_id AND department_id=dept\s+AND user_id=actor_id AND revoked_at IS NULL AND starts_at<=clock_timestamp\(\) AND expires_at>clock_timestamp\(\) FOR SHARE;\s+IF NOT FOUND THEN RAISE EXCEPTION 'Current recorded POE Chairman appointment required'; END IF;/);
  assert.match(helper, /IF NOT ce_exact_permission\(actor_id,dept,'examination-candidate.classification.manage_department','examination-candidate.classification','manage'\) THEN RAISE EXCEPTION 'Exact classification permission required for draft recording'; END IF;/);
  assert.doesNotMatch(helper, /r\.code|current_user|session_user|ce_current_member|ce_current_chair/);
  const candidate = sqlFunction("ce_candidate_guard");
  assert.match(candidate, /IF TG_OP='INSERT' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Certification requires draft list'; END IF;\s+IF TG_OP='INSERT' THEN\s+PERFORM ce_require_draft_poe\(NEW.recorded_poe_assignment_id,dept,NEW.recorded_by_user_id\);\s+END IF;/);
  assert.match(candidate, /THEN RAISE EXCEPTION 'Candidate revision requires a classification or curriculum change'; END IF;\s+END IF;\s+PERFORM ce_require_draft_poe\(NEW.recorded_poe_assignment_id,dept,NEW.recorded_by_user_id\);\s+ELSE/);
  assert.equal(candidate.match(/PERFORM ce_require_draft_poe\(/g)?.length, 2);
  // List recording provenance stays historical when a successor certifies the list.
  assert.match(candidate, /IF TG_OP='UPDATE' AND \(to_jsonb\(NEW\)-'status'-'certified_at'-'certified_by_user_id'-'chairman_assignment_id'\)\s+IS DISTINCT FROM \(to_jsonb\(OLD\)-'status'-'certified_at'-'certified_by_user_id'-'chairman_assignment_id'\) THEN RAISE EXCEPTION 'Candidate list identity is immutable'; END IF;/);
});

test("DRAFT registration INSERT starts at 1 and UPDATE advances exactly one meaningful revision", () => {
  const candidate = sqlFunction("ce_candidate_guard");
  const registration = candidate.match(/IF TG_TABLE_NAME='examination_candidate_registrations' THEN\s+IF NEW.examination_id[\s\S]*?\n ELSE/)?.[0];
  assert.ok(registration, "Transition rules must be scoped to registration rows in the shared trigger");
  assert.match(candidate, /IF l.status<>'DRAFT' THEN RAISE EXCEPTION 'Certified classification and enrollment sources are immutable'; END IF;\s+IF TG_OP='DELETE' THEN RETURN OLD; END IF;/);
  assert.match(registration, /IF TG_OP='INSERT' THEN\s+IF NEW.version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Candidate initial version must be 1'; END IF;\s+ELSIF TG_OP='UPDATE' THEN\s+IF NEW.version IS DISTINCT FROM OLD.version\+1 THEN RAISE EXCEPTION 'Candidate revision version must increment by exactly 1'; END IF;/);
  assert.match(registration, /IF NEW.category IS NOT DISTINCT FROM OLD.category AND NEW.curriculum_assignment_id IS NOT DISTINCT FROM OLD.curriculum_assignment_id\s+THEN RAISE EXCEPTION 'Candidate revision requires a classification or curriculum change'; END IF;/);
  assert.doesNotMatch(registration, /NEW.recorded_by_user_id\s*(?:<>|IS DISTINCT FROM)\s*OLD.recorded_by_user_id/);
  assert.ok(migration.includes("CREATE TRIGGER ce_candidate_registration_guard BEFORE INSERT OR UPDATE OR DELETE ON examination_candidate_registrations FOR EACH ROW EXECUTE FUNCTION ce_candidate_guard();"));
});

test("DRAFT registration structural identity and creation timestamp are immutable", () => {
  const candidate = sqlFunction("ce_candidate_guard");
  const identity = candidate.match(/IF TG_OP='UPDATE' AND \(NEW.list_id[\s\S]*?THEN RAISE EXCEPTION 'Draft candidate identity cannot move'; END IF;/)?.[0];
  assert.ok(identity);
  for (const field of ["id", "department_id", "list_id", "examination_id", "student_user_id"]) {
    assert.ok(identity.includes(`NEW.${field}<>OLD.${field}`), field);
  }
  assert.ok(identity.includes("NEW.created_at IS DISTINCT FROM OLD.created_at"));
});

test("certification independently requires exact classification permission and the current bound POE appointment", () => {
  const candidate = sqlFunction("ce_candidate_guard");
  // These guards restrict the CERTIFIED branch to the DRAFT -> CERTIFIED transition.
  assert.match(candidate, /TG_OP='UPDATE' AND OLD.status='CERTIFIED'/);
  assert.match(candidate, /IF TG_OP='INSERT' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION/);
  assert.match(candidate, /IF NEW.status='CERTIFIED' THEN\s+PERFORM id FROM poe_chairman_assignments WHERE id=NEW.chairman_assignment_id AND department_id=dept\s+AND user_id=NEW.certified_by_user_id AND revoked_at IS NULL AND starts_at<=clock_timestamp\(\) AND expires_at>clock_timestamp\(\) FOR SHARE;\s+IF NOT FOUND THEN RAISE EXCEPTION 'Current POE Chairman certification is required'; END IF;\s+IF NOT ce_exact_permission\(NEW.certified_by_user_id,dept,'examination-candidate.classification.manage_department','examination-candidate.classification','manage'\) THEN RAISE EXCEPTION/);
  assert.match(candidate, /-- Reverse completeness:[\s\S]*?THEN RAISE EXCEPTION 'Certification examination sources incomplete'; END IF;/);
});

test("certification reverse-checks the exact current academic source set for every category", () => {
  const reverseCheck = migration.match(/-- Reverse completeness:[\s\S]*?THEN RAISE EXCEPTION 'Certification examination sources incomplete'; END IF;/)?.[0];
  assert.ok(reverseCheck, "Certification must reject missing current examination sources");
  for (const identity of [
    "cr.list_id=NEW.id", "cr.department_id=dept", "cr.examination_id=NEW.examination_id",
    "s.id=cr.curriculum_assignment_id", "s.department_id=cr.department_id", "s.student_user_id=cr.student_user_id",
    "e.student_curriculum_assignment_id=s.id", "e.department_id=s.department_id", "e.student_user_id=s.student_user_id",
    "ec.course_offering_id=e.course_offering_id", "ec.department_id=e.department_id",
    "ec.curriculum_course_id=e.curriculum_course_id", "ec.curriculum_version_id=s.curriculum_version_id",
    "ec.examination_id=NEW.examination_id", "s.academic_program_id=NEW.academic_program_id",
    "ec.academic_program_id=NEW.academic_program_id", "e.academic_term_id=NEW.academic_term_id",
    "ec.academic_term_id=NEW.academic_term_id", "ec.archived_at IS NULL", "e.status='APPROVED'",
    "e.enrolled_at IS NOT NULL", "e.dropped_at IS NULL", "e.archived_at IS NULL",
    "o.id=e.course_offering_id", "o.department_id=e.department_id", "o.archived_at IS NULL",
    "o.status NOT IN ('ARCHIVED','CANCELED')",
  ]) assert.ok(reverseCheck.includes(identity), identity);
  assert.match(reverseCheck, /NOT EXISTS\(SELECT 1 FROM examination_candidate_courses cc\s+WHERE cc.registration_id=cr.id AND cc.department_id=dept\s+AND cc.examination_course_id=ec.id AND cc.enrollment_id=e.id\)/);
  assert.doesNotMatch(reverseCheck, /cr\.category/);
  assert.match(migration, /Certification academic sources are no longer current/);
});

test("Comprehensive evidence has restrictive provenance FKs and deferred complete final-package checks", () => {
  for (const source of ["candidate_list", "registration", "candidate_course", "committee_assignment", "assessment_component", "chairman_assignment"]) {
    assert.ok(migration.includes(`"${source}_id"`), source);
  }
  for (const guard of ["ce_mark_guard", "ce_review_guard", "ce_final_guard", "ce_final_boundary_validate", "ce_package_validate"]) {
    assert.ok(migration.includes(`CREATE FUNCTION ${guard}`), guard);
  }
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /WHEN c.mode='ALL_MEMBERS_AVERAGE' THEN 4 ELSE 1/);
  assert.match(migration, /item.mark IS DISTINCT FROM average_mark/);
  assert.match(migration, /Unresolved absence cannot become a mark/);
  assert.match(migration, /Submitted mark and draft provenance are immutable/);
  // Shared triggers must branch before touching columns absent on another table.
  assert.doesNotMatch(migration, /IF TG_TABLE_NAME='comprehensive_final_(?:results|sources)' AND/);
  assert.doesNotMatch(migration, /IF TG_TABLE_NAME='comprehensive_finalisations' AND/);
});

test("appointment reactivation cannot silently revive digital bindings or frozen allocations", () => {
  assert.match(migration, /x.assignment_assigned_at=a.assigned_at/);
  assert.match(migration, /a.assigned_at=co.allocated_assignment_assigned_at/);
  assert.match(migration, /m.assignment_assigned_at=a.assigned_at/);
  assert.match(migration, /Course allocation\/configuration is frozen/);
  assert.match(schema, /allocatedAssignmentAssignedAt DateTime\?/);
});

test("control actor fields have restrictive department-qualified relations independently of target and configurator", () => {
  for (const [model, table, field, column, target, targetTable, relation, constraint] of [
    ["ComprehensiveExamination", "comprehensive_examinations", "rosterLockedByUserId", "roster_locked_by_user_id", "User", "users", "rosterLockedByUser", "ce_roster_lock_actor_fk"],
    ["ComprehensiveExamination", "comprehensive_examinations", "rosterLockedByAssignmentId", "roster_locked_by_assignment_id", "ExaminationCommitteeAssignment", "examination_committee_assignments", "rosterLockedByAssignment", "ce_roster_lock_assignment_fk"],
    ["ComprehensiveExamination", "comprehensive_examinations", "markingStartedByUserId", "marking_started_by_user_id", "User", "users", "markingStartedByUser", "ce_marking_start_actor_fk"],
    ["ComprehensiveExamination", "comprehensive_examinations", "markingStartedByAssignmentId", "marking_started_by_assignment_id", "ExaminationCommitteeAssignment", "examination_committee_assignments", "markingStartedByAssignment", "ce_marking_start_assignment_fk"],
    ["ComprehensiveExamination", "comprehensive_examinations", "markingStartedExternalAccessId", "marking_started_external_access_id", "ExternalComprehensiveAccess", "external_comprehensive_access", "markingStartedExternalAccess", "ce_marking_start_external_fk"],
    ["ComprehensiveCourse", "comprehensive_courses", "allocationChangedByUserId", "allocation_changed_by_user_id", "User", "users", "allocationChangedByUser", "ce_allocation_actor_fk"],
    ["ComprehensiveCourse", "comprehensive_courses", "allocationChangedByAssignmentId", "allocation_changed_by_assignment_id", "ExaminationCommitteeAssignment", "examination_committee_assignments", "allocationChangedByAssignment", "ce_allocation_actor_assignment_fk"],
  ]) {
    const definition = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`))?.[0]; assert.ok(definition);
    assert.ok(definition.includes(`${field} String? @map("${column}")`));
    assert.ok(definition.includes(`${relation} ${target}? @relation("${model}_${relation}", fields: [${field}, departmentId], references: [id, departmentId], onDelete: Restrict, onUpdate: Restrict, map: "${constraint}")`));
    assert.ok(migration.includes(`ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}", "department_id") REFERENCES "${targetTable}" ("id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;`));
  }
  for (const [field, column] of [["rosterLockedByAssignmentAssignedAt", "roster_locked_by_assignment_assigned_at"],
    ["markingStartedByAssignmentAssignedAt", "marking_started_by_assignment_assigned_at"], ["allocationChangedByAssignmentAssignedAt", "allocation_changed_by_assignment_assigned_at"]]) {
    assert.ok(schema.includes(`${field} DateTime? @map("${column}")`)); assert.ok(migration.includes(`"${column}" TIMESTAMP(3),`));
  }
  const roster = schema.match(/model ComprehensiveRosterEntry \{[\s\S]*?\n\}/)![0];
  assert.doesNotMatch(roster, /LockedBy|ChangedBy|StartedBy/);
});

test("allocation target changes require independent exact Chairman configuration authority and reject actor-only edits", () => {
  const helper = sqlFunction("ce_require_control_chair");
  assert.match(helper, /department_id=dept\s+AND committee_id=committee_id_arg AND assigned_at=assigned_at_arg FOR SHARE/);
  assert.match(helper, /NOT ce_current_chair\(assignment_id,dept,committee_id_arg,actor_id\)/);
  assert.match(helper, /ce_exact_permission\(actor_id,dept,'comprehensive-examination.configuration.manage_department','comprehensive-examination.configuration','manage'\)/);
  const guard = sqlFunction("ce_configuration_guard");
  assert.match(guard, /allocation_changed:=\(NEW.assigned_committee_assignment_id,NEW.allocated_assignment_assigned_at\)\s+IS DISTINCT FROM \(OLD.assigned_committee_assignment_id,OLD.allocated_assignment_assigned_at\)/);
  assert.match(guard, /IF allocation_changed THEN\s+PERFORM ce_require_control_chair\(NEW.allocation_changed_by_assignment_id,c.department_id,c.committee_id,\s+NEW.allocation_changed_by_user_id,NEW.allocation_changed_by_assignment_assigned_at\)/);
  assert.match(guard, /Allocation actor requires a target change/);
  assert.match(guard, /NEW.assigned_committee_assignment_id IS NOT NULL AND \(c.mode<>'COURSE_DISTRIBUTED'/);
  assert.doesNotMatch(migration, /Course allocation and roster rows have no acting-user provenance/);
});

test("control tuples are complete and roster lock and marking start are immutable explicit transitions", () => {
  for (const name of ["ce_allocation_actor_tuple", "ce_roster_lock_actor_tuple", "ce_marking_start_actor_tuple"]) {
    const check = migration.match(new RegExp(`ADD CONSTRAINT ${name} CHECK \\([\\s\\S]*?\\);`))?.[0]; assert.ok(check);
    assert.match(check, /IS NULL/); assert.match(check, /IS NOT NULL/);
  }
  const guard = sqlFunction("ce_control_transition_guard");
  assert.match(guard, /Control evidence requires explicit transitions/);
  assert.match(guard, /OLD.roster_locked_at IS NULL AND NEW.roster_locked_at IS NOT NULL/);
  assert.match(guard, /PERFORM ce_require_control_chair\(NEW.roster_locked_by_assignment_id,NEW.department_id,NEW.committee_id,\s+NEW.roster_locked_by_user_id,NEW.roster_locked_by_assignment_assigned_at\)/);
  assert.match(guard, /PERFORM ce_validate_roster_lock\(NEW\)/);
  assert.match(guard, /Roster lock provenance is immutable outside its lock transition/);
  assert.match(guard, /OLD.status<>'CONFIGURED' OR NEW.status<>'MARKING' OR OLD.roster_locked_at IS NULL/);
  assert.match(guard, /IF NOT ce_marking_start_authorized\(NEW\) THEN RAISE EXCEPTION/);
  assert.match(guard, /Marking-start provenance is immutable outside its start transition/);
  assert.match(guard, /OLD.marking_started_at IS NOT NULL AND NEW.status='CONFIGURED'/);
  assert.ok(migration.includes("CREATE TRIGGER ce_control_transition_guard BEFORE INSERT OR UPDATE ON comprehensive_examinations FOR EACH ROW EXECUTE FUNCTION ce_control_transition_guard();"));
  assert.doesNotMatch(guard, /current_user|session_user|current_setting/);
});

test("roster lock compares exact certified REGULAR multisets including both omissions and extras", () => {
  const helper = sqlFunction("ce_validate_roster_lock");
  for (const predicate of ["l.id=c.candidate_list_id", "l.department_id=c.department_id", "l.examination_id=c.examination_id", "l.status='CERTIFIED'",
    "cr.list_id=c.candidate_list_id", "cr.department_id=c.department_id", "cr.examination_id=c.examination_id", "cr.category='REGULAR'",
    "cc.registration_id=cr.id", "cc.department_id=cr.department_id", "co.examination_course_id=cc.examination_course_id", "co.comprehensive_id=c.id", "co.department_id=c.department_id",
    "cr.version AS registration_version", "cc.id AS candidate_course_id", "SELECT * FROM expected EXCEPT ALL SELECT * FROM actual", "SELECT * FROM actual EXCEPT ALL SELECT * FROM expected"]) assert.ok(helper.includes(predicate), predicate);
  assert.doesNotMatch(helper, /FROM enrollments|Roster lock course has no REGULAR candidate/);
  assert.doesNotMatch(helper, /IF NOT EXISTS\(SELECT 1 FROM comprehensive_roster_entries/);
});

test("marking start requires the exact member and External binding plus the operation's exact permission", () => {
  const helper = sqlFunction("ce_marking_start_authorized");
  assert.match(helper, /department_id=c.department_id AND committee_id=c.committee_id AND assigned_at=c.marking_started_by_assignment_assigned_at FOR SHARE/);
  assert.match(helper, /ce_current_member\(a.id,c.department_id,c.committee_id,c.marking_started_by_user_id,c.marking_started_external_access_id\)/);
  assert.match(helper, /ce_exact_permission\(c.marking_started_by_user_id,c.department_id,'comprehensive-examination.mark.enter_department','comprehensive-examination.mark','enter'\)/);
  assert.match(helper, /a.seat='CHAIRMAN' AND c.marking_started_external_access_id IS NULL\s+AND ce_exact_permission\(c.marking_started_by_user_id,c.department_id,'comprehensive-examination.chairman.review_department','comprehensive-examination.chairman','review'\)/);
  assert.match(helper, /c.mode='CHAIRMAN_ONLY' AND a.seat='CHAIRMAN'/);
  assert.match(helper, /co.assigned_committee_assignment_id=a.id AND co.allocated_assignment_assigned_at=a.assigned_at/);
  assert.doesNotMatch(helper, /configured_by_user_id|current_user|session_user|current_setting/);
});

test("first marking transition has deferred matching mark-or-absence evidence validation", () => {
  const guard = sqlFunction("ce_marking_start_validate");
  for (const predicate of [
    "m.comprehensive_id=NEW.id AND m.department_id=NEW.department_id",
    "m.actor_user_id=NEW.marking_started_by_user_id",
    "m.committee_assignment_id=NEW.marking_started_by_assignment_id",
    "m.assignment_assigned_at=NEW.marking_started_by_assignment_assigned_at",
    "m.external_access_id IS NOT DISTINCT FROM NEW.marking_started_external_access_id",
    "a.comprehensive_id=NEW.id AND a.department_id=NEW.department_id",
    "a.actor_user_id=NEW.marking_started_by_user_id",
    "a.chairman_assignment_id=NEW.marking_started_by_assignment_id",
    "a.assignment_assigned_at=NEW.marking_started_by_assignment_assigned_at",
    "NEW.marking_started_external_access_id IS NULL",
  ]) assert.ok(guard.includes(predicate), predicate);
  assert.match(guard, /IF NOT EXISTS\(SELECT 1 FROM comprehensive_marks m[\s\S]*AND NOT EXISTS\(SELECT 1 FROM comprehensive_absences a/);
  assert.match(guard, /THEN RAISE EXCEPTION 'Marking start requires matching first mark or absence evidence in the same transaction'/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER ce_marking_start_validate AFTER UPDATE ON comprehensive_examinations\s+DEFERRABLE INITIALLY DEFERRED FOR EACH ROW\s+WHEN \(OLD.marking_started_at IS NULL AND NEW.marking_started_at IS NOT NULL\)\s+EXECUTE FUNCTION ce_marking_start_validate\(\)/);
  // Pre-start evidence and later replacement/deletion cannot manufacture deferred proof.
  assert.match(sqlFunction("ce_mark_guard"), /c.status<>'MARKING'/);
  assert.match(sqlFunction("ce_review_guard"), /c.status<>'MARKING'/);
  assert.match(sqlFunction("ce_mark_guard"), /Mark history cannot be deleted|Submitted mark and draft provenance are immutable/);
  assert.match(sqlFunction("ce_review_guard"), /TG_OP<>'INSERT'/);
});
