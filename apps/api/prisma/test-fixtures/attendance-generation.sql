CREATE TYPE "AuditActorType" AS ENUM ('USER','SERVICE','ANONYMOUS');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS','FAILURE','DENIED');
-- Minimal pre-Attendance relational fixture for the opt-in disposable PostgreSQL harness.
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE','ARCHIVED','DISABLED');
CREATE TYPE "UserStatus" AS ENUM ('INVITED','ACTIVE','LOCKED','SUSPENDED','ARCHIVED');
CREATE TYPE "PermissionScope" AS ENUM ('DEPARTMENT','SELF','GLOBAL');
CREATE TYPE "ExaminationCommitteeSeat" AS ENUM ('CHAIRMAN','MEMBER_1','MEMBER_2','EXTERNAL_MEMBER');
CREATE TYPE "ExaminationCommitteeAssignmentStatus" AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');
CREATE TABLE departments(id TEXT PRIMARY KEY,status "DepartmentStatus" DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE users(id TEXT PRIMARY KEY,department_id TEXT,status "UserStatus" DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP,UNIQUE(id,department_id));
CREATE TABLE academic_programs(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE academic_sessions(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE student_batches(id TEXT PRIMARY KEY,department_id TEXT,academic_program_id TEXT,academic_session_id TEXT,archived_at TIMESTAMP);
CREATE TABLE academic_terms(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE batch_coordinator_assignments(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,coordinator_user_id TEXT,status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),expires_at TIMESTAMP,unassigned_at TIMESTAMP,archived_at TIMESTAMP);
CREATE TABLE course_offerings(id TEXT PRIMARY KEY,course_id TEXT,curriculum_course_id TEXT,syllabus_version_id TEXT,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,status TEXT DEFAULT 'IN_PROGRESS',archived_at TIMESTAMP);
CREATE TABLE enrollments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,student_user_id TEXT,academic_term_id TEXT NOT NULL DEFAULT 'term',status TEXT DEFAULT 'APPROVED',archived_at TIMESTAMP,dropped_at TIMESTAMP,UNIQUE(id,department_id,course_offering_id,student_user_id));
CREATE TABLE class_sessions(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,status TEXT DEFAULT 'COMPLETED',scheduled_start_at TIMESTAMP DEFAULT now(),scheduled_end_at TIMESTAMP DEFAULT (now()+interval '1 hour'),actual_start_at TIMESTAMP DEFAULT now(),actual_end_at TIMESTAMP DEFAULT (now()+interval '1 hour'),canceled_at TIMESTAMP);
CREATE TABLE attendance_records(id TEXT PRIMARY KEY,department_id TEXT,class_session_id TEXT,enrollment_id TEXT,student_user_id TEXT,status TEXT,source_type TEXT DEFAULT 'MANUAL',external_source_ref TEXT,marked_by_user_id TEXT,override_by_user_id TEXT,override_reason TEXT,marked_at TIMESTAMP DEFAULT now(),updated_at TIMESTAMP DEFAULT now(),archived_at TIMESTAMP,UNIQUE(class_session_id,enrollment_id));
CREATE TABLE test_audits(id TEXT PRIMARY KEY);
CREATE TYPE "ClassSessionStatus" AS ENUM ('SCHEDULED','ACTIVE','COMPLETED','CANCELED','LOCKED','ARCHIVED');
CREATE TABLE roles(id TEXT PRIMARY KEY,department_id TEXT,code TEXT,name TEXT,description TEXT,archived_at TIMESTAMP,created_at TIMESTAMP DEFAULT now(),updated_at TIMESTAMP DEFAULT now(),UNIQUE(department_id,code));
CREATE TABLE user_roles(id TEXT PRIMARY KEY,user_id TEXT,department_id TEXT,role_id TEXT,revoked_at TIMESTAMP,expires_at TIMESTAMP);
CREATE TABLE permissions(id TEXT PRIMARY KEY,code TEXT,resource TEXT,action TEXT,scope "PermissionScope");
CREATE TABLE role_permissions(id TEXT PRIMARY KEY,role_id TEXT,permission_id TEXT);
CREATE TABLE teacher_course_assignments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,teacher_user_id TEXT,status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),unassigned_at TIMESTAMP,archived_at TIMESTAMP);
CREATE TABLE examinations(id TEXT PRIMARY KEY,department_id TEXT,academic_program_id TEXT,academic_session_id TEXT,academic_term_id TEXT,archived_at TIMESTAMP,
 UNIQUE(id,department_id,academic_program_id,academic_session_id,academic_term_id));
CREATE TABLE examination_committees(id TEXT PRIMARY KEY,department_id TEXT,examination_id TEXT,archived_at TIMESTAMP,UNIQUE(id,department_id,examination_id));
CREATE TABLE examination_committee_assignments(id TEXT PRIMARY KEY,department_id TEXT,examination_id TEXT,committee_id TEXT,assigned_user_id TEXT,
 seat "ExaminationCommitteeSeat",status "ExaminationCommitteeAssignmentStatus" DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),expires_at TIMESTAMP,unassigned_at TIMESTAMP,archived_at TIMESTAMP,
 external_member_name TEXT,external_member_affiliation TEXT,UNIQUE(id,department_id,committee_id));
CREATE TABLE examination_courses(id TEXT PRIMARY KEY,department_id TEXT,examination_id TEXT,academic_program_id TEXT,academic_session_id TEXT,academic_term_id TEXT,
 course_offering_id TEXT,student_batch_id TEXT,curriculum_version_id TEXT,curriculum_course_id TEXT,syllabus_version_id TEXT,assessment_template_id TEXT,archived_at TIMESTAMP,
 locked_question_configuration_id TEXT,UNIQUE(id,department_id,examination_id,course_offering_id));
CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,department_id TEXT,academic_program_id TEXT);
CREATE TABLE curriculum_courses(id TEXT PRIMARY KEY,department_id TEXT,course_id TEXT,curriculum_version_id TEXT,assessment_template_id TEXT);
CREATE TABLE syllabus_versions(id TEXT PRIMARY KEY,department_id TEXT,curriculum_course_id TEXT);
CREATE TABLE course_assessment_templates(id TEXT PRIMARY KEY,department_id TEXT,version_number INTEGER,total_marks NUMERIC,archived_at TIMESTAMP);
CREATE TABLE assessment_template_components(id TEXT PRIMARY KEY,department_id TEXT,assessment_template_id TEXT,code TEXT,maximum_marks NUMERIC,is_required BOOLEAN);
CREATE TABLE audit_logs(id TEXT PRIMARY KEY,department_id TEXT,actor_user_id TEXT,actor_type "AuditActorType",action TEXT,target_type TEXT,target_id TEXT,outcome "AuditOutcome",
 request_id TEXT,ip_address TEXT,user_agent TEXT,context_json JSONB,occurred_at TIMESTAMP DEFAULT now());
