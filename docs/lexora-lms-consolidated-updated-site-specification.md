---
title: "Lexora LMS — Consolidated and Updated Developer-Ready Functional Specification"
project: "Lexora LMS"
client: "HEAT-12211-CU, Department of Law, University of Chittagong"
initial_scope: "Department of Law"
future_scope: "Multi-department expansion"
document_status: "Authoritative Consolidated Target Specification"
version: "2.0"
date: "2026-08-06"
---

# Lexora LMS — Consolidated and Updated Developer-Ready Functional Specification

## Document Control

| Item | Value |
|---|---|
| Project | Lexora LMS |
| Client | HEAT-12211-CU, Department of Law, University of Chittagong |
| Initial department scope | Department of Law |
| Future scope | Multi-department expansion |
| Platform type | Responsive Web Application / Progressive Web App |
| Architecture direction | Security-first modular monolith |
| Academic authority | Current applicable LL.B. (Honours) Academic Ordinance |
| Document purpose | Complete consolidated site specification |
| Implementation status | Target specification; not a claim of completed implementation |
| Supersedes | Conflicting or incomplete requirements in earlier teacher/assessment briefs |

## How to Read This Document

This document is the complete updated Site Specification for Lexora LMS.

It retains the full functional scope of the original Site Specification and incorporates the confirmed updates relating to:

- OBE course planning;
- formative assessment;
- Comprehensive Examination;
- summative examination marks management;
- First, Second, and Third Examiner workflows;
- three-member Examination Committee review and Chairman approval;
- biometric-first attendance;
- teacher manual attendance fallback;
- Present/Absent-only attendance values;
- curriculum and syllabus versioning;
- CLO/PLO attainment;
- Course File;
- marks-only Moot Court support;
- result locking and amendment;
- security and audit requirements.

Where a previous brief conflicts with the current applicable Academic Ordinance, the Ordinance prevails.

---

# 1. Project Overview

## 1.1 Project Name

**Lexora LMS**

## 1.2 Client

**HEAT-12211-CU, Department of Law, University of Chittagong**

## 1.3 Initial Department Scope

The initial production scope is the **Department of Law**.

## 1.4 Future Scope

The system must support future multi-department expansion without major architectural redesign.

## 1.5 Platform Type

- Responsive Web Application
- Progressive Web App
- Mobile-responsive teacher, student, and departmental interfaces

## 1.6 Primary Objectives

Lexora LMS must:

- digitise course delivery and academic management;
- provide OBE-aligned teaching workflows;
- support approved curriculum and syllabus versions;
- ensure reliable attendance tracking;
- enforce Ordinance-based examination eligibility;
- support biometric attendance integration;
- provide teacher manual attendance fallback when biometric capture fails;
- manage formative assessment and feedback;
- record Comprehensive Examination marks;
- manage offline summative examination marks securely;
- preserve independent Examiner submissions;
- support Third Examination when required;
- enforce Examination Committee review and Chairman approval;
- reduce manual paperwork and administrative workload;
- improve transparency for students and teachers;
- support secure result preparation and publication;
- support transcript generation and verification;
- provide audit-ready academic records;
- support CLO/PLO attainment and CQI;
- support Comprehensive Course Files;
- improve accreditation and quality-assurance readiness.

## 1.7 Core Design Principle

Lexora LMS must be treated as a durable academic platform, not a quick or temporary LMS.

The system must remain:

- secure;
- modular;
- department-isolated;
- audit-ready;
- academically trustworthy;
- configuration-driven;
- maintainable;
- future-expandable.

---

# 2. MVP and Product Scope

## 2.1 Included in the Core Product Scope

The complete Lexora product scope includes:

- user registration and authentication;
- role and permission management;
- department-based access control;
- user profiles;
- programme and curriculum configuration;
- curriculum and syllabus versioning;
- academic year and term management;
- course management;
- course-offering management;
- teacher assignments;
- student enrolment;
- OBE course outline;
- CLO/PLO mapping;
- weekly and lesson planning;
- class/session management;
- biometric attendance intake;
- teacher manual attendance fallback;
- attendance reconciliation;
- attendance marks;
- examination eligibility;
- formative assessment;
- assignments;
- quizzes;
- presentations and other formative methods;
- rubrics;
- submissions;
- feedback;
- academic-integrity review;
- Comprehensive Examination marks;
- summative examination marks management;
- Examiner assignment;
- question-wise marks entry;
- variance detection;
- Third Examination;
- Examination Committee review;
- Chairman approval;
- final result processing;
- GPA/CGPA;
- transcript generation and verification;
- notifications;
- search;
- dashboards;
- discussion and communication;
- secure file storage;
- audit logs;
- CLO/PLO attainment;
- CQI;
- Comprehensive Course File;
- reports and exports;
- PWA/offline-safe functionality.

## 2.2 Explicitly Offline / Outside Lexora

The following remain offline and manual:

- summative examination delivery;
- physical answer scripts;
- physical answer-script distribution;
- physical answer-script evaluation;
- question-paper drafting;
- question-paper storage;
- question-paper moderation;
- question-paper printing;
- answer-script scanning or upload.

Lexora manages only the approved digital marks and workflow records associated with these offline processes.

## 2.3 Excluded or Deferred

### Full Moot Court Module

A full Moot Court module is deferred.

Current support is limited to:

- configured marks components;
- marks entry;
- validation;
- approval;
- locking;
- result integration.

Future expansion may add:

- team formation;
- case allocation;
- memorial submission;
- hearing schedules;
- judge/panel workflow;
- oral-round scoring;
- competition management.

The current data model must not prevent this future expansion.

---

# 3. User Roles and Scoped Academic Assignments

## 3.1 Department Admin

Department Admins have control only over their own department.

### Department Admin Permissions

Admins may:

- manage users;
- manage teachers and students;
- manage roles and scoped assignments;
- manage programmes;
- manage curriculum versions;
- manage syllabus versions;
- manage academic years and terms;
- manage courses and course offerings;
- manage enrolments;
- manage teacher assignments;
- manage class/session configuration;
- review attendance;
- reconcile biometric/manual mismatches;
- override attendance with mandatory reason;
- manage examination eligibility;
- override eligibility with mandatory reason;
- manage assignment and quiz configuration;
- manage assessment templates;
- manage Examination Committees;
- manage Examiner assignments;
- review examination workflow;
- approve and publish final results according to policy;
- manage transcript generation;
- manage notifications;
- moderate discussions;
- temporarily unlock archived courses;
- manage storage quota;
- review audit logs;
- manage department-level configuration;
- manage Course File monitoring;
- generate departmental and QA reports.

Admins must not bypass Examiner independence or Chairman approval rules.

## 3.2 Teacher

Teachers may access only formally assigned courses and formally assigned academic duties.

### Course Teacher Permissions

A Course Teacher may:

- access assigned course offerings;
- view enrolled students in assigned courses;
- access approved curriculum and syllabus data;
- prepare course outlines;
- create lesson plans;
- manage class sessions;
- start attendance sessions;
- use manual attendance fallback when biometric capture fails;
- upload materials and recordings subject to secure file controls;
- create formative assessments;
- create quizzes and assignments;
- review submissions;
- provide feedback;
- enter formative marks;
- submit final formative marks;
- view CLO coverage and attainment;
- prepare Course Files;
- participate in assigned-course discussions;
- view final approved summative marks when authorised;
- view published final results for assigned courses.

A Course Teacher is not automatically an Examiner.

## 3.3 Examiner Roles

Examiner access requires a separate active assignment.

### First Examiner

May:

- access only assigned examination-course records;
- enter question-wise marks;
- save drafts;
- submit and lock marks.

May not:

- see Second Examiner marks;
- see Third Examiner marks;
- approve final summative marks;
- alter another Examiner's records.

### Second Examiner

Has the same independent access pattern as the First Examiner.

### Third Examiner

May access only scripts formally referred for Third Examination.

May not see First or Second Examiner marks before submission.

## 3.4 Examination Committee

Each applicable examination has:

- one Chairman;
- two Members.

### Committee Members

Members may:

- review Examiner assignment completeness;
- review calculations;
- review Third Examination referrals;
- review selected nearest-mark pairs;
- record review comments;
- return records for authorised correction.

Members do not provide final approval.

### Chairman

The Chairman:

- reviews Member comments;
- authorises reopening;
- approves final summative marks;
- locks approved records;
- authorises result-engine handoff.

Chairman approval is mandatory.

## 3.5 Student

Students may access only their own profile and authorised enrolled-course data.

### Student Permissions

Students may:

- register and log in;
- verify email;
- manage their own profile;
- enrol in eligible courses where self-enrolment is allowed;
- access enrolled courses;
- access materials;
- submit assignments;
- take quizzes;
- participate in course discussions;
- view attendance;
- view progress;
- view formal eligibility;
- view authorised feedback;
- view published results;
- view GPA/CGPA;
- view and download authorised result sheets;
- view and download transcripts.

Students may not:

- mark their own attendance;
- access another student's records;
- view unpublished marks;
- view Examiner submissions;
- access committee-only data.

## 3.6 Additional Scoped Roles

The system should support:

- Co-Teacher;
- Batch Coordinator;
- Programme Coordinator;
- Comprehensive Examination Panel Member;
- Academic Integrity Reviewer;
- Quality-Assurance Reviewer;
- PSAC/OBE Reviewer;
- Academic Committee authority.

All such roles must be:

- department-scoped;
- assignment-scoped;
- time-bound where appropriate;
- workflow-stage-aware.

---

# 4. Department-Based Access Control

## 4.1 Department Isolation

Each department has isolated:

- users;
- roles;
- profiles;
- programmes;
- curricula;
- syllabi;
- academic years;
- terms;
- courses;
- course offerings;
- teacher assignments;
- enrolments;
- class sessions;
- attendance;
- assessments;
- results;
- transcripts;
- notifications;
- discussions;
- Course Files;
- reports;
- settings;
- audit records.

## 4.2 Department Admin Scope

Department Admins may manage only their own department.

## 4.3 Teacher Scope

Teachers may access only:

- assigned courses;
- assigned students;
- assigned examination duties;
- assigned committee duties.

## 4.4 Student Scope

Students may access only:

- their own profile;
- their own enrolments;
- their own submissions;
- their own attendance;
- their own eligibility;
- their own results;
- their own transcript.

## 4.5 No In-System Central Super Admin

There is no unrestricted central super-admin role inside the academic application.

New department onboarding is handled through a controlled vendor/developer or platform-operations process.

## 4.6 Department Header Safety

A client-supplied department identifier must never override the valid authenticated principal's real department scope.

## 4.7 Direct Object Access

Cross-department or out-of-scope direct object access should return safe not-found behaviour where appropriate.

---

# 5. Authentication and Security

## 5.1 Login Methods

Support:

- official email + password;
- authorised ID + password where configured.

## 5.2 Registration Rules

- Only approved official university email domains are allowed.
- Initial email verification is mandatory.
- New self-registered users are created as Student by default.
- Teacher and Admin roles require authorised assignment.
- Examiner and committee authority requires separate scoped assignment.

## 5.3 Password Policy

Configurable strong password policy must support:

- minimum length within approved range;
- uppercase;
- lowercase;
- number;
- special character;
- common-password blocking;
- password-history protection where required.

## 5.4 Login Protection

- Repeated failed login attempts trigger temporary lockout.
- Failed and successful attempts are logged.
- Brute-force protection is required.
- Sensitive endpoints require rate limiting.
- Suspicious login detection should consider IP, device, session, and history.
- Unusual concurrent login may trigger warning or forced logout.

## 5.5 Password Reset and Verification

- Forgot-password flow must be available.
- Password-reset tokens must be single-use and time-limited.
- Email-verification tokens must be single-use and time-limited.
- Sensitive actions may require OTP or re-authentication.

## 5.6 Two-Factor Authentication

- Admin accounts require mandatory 2FA.
- Teacher accounts require mandatory 2FA.
- Examiner and Examination Committee access requires mandatory 2FA.
- Student 2FA is optional unless policy changes.

## 5.7 Session Policy

- Session/token expiration is configurable.
- Access-token and refresh-token strategies must be secure.
- Students may use multiple devices subject to policy.
- Admin, Teacher, Examiner, and Committee accounts have limited concurrent sessions.
- Sensitive examination actions should record session/device information.

## 5.8 Inactive Account Policy

- Student accounts inactive for 1-2 years may be marked inactive.
- Teacher/Admin accounts inactive for 3-6 months may be disabled or reviewed.
- Expired Examiner and committee assignments must remove access automatically.

## 5.9 Mandatory Application Security

The system must protect against:

- CSRF;
- XSS;
- IDOR;
- broken object-level authorisation;
- brute-force attacks;
- malicious file uploads;
- MIME spoofing;
- unsafe direct-object access;
- unsafe mass assignment;
- session fixation;
- token replay;
- insecure exports.

## 5.10 Sensitive Data

Sensitive data must be encrypted at rest where applicable.

Never store or document:

- raw access tokens;
- raw refresh tokens;
- raw verification tokens;
- password hashes;
- database credentials;
- production secrets;
- fingerprint templates.

---

# 6. User Profiles

## 6.1 Student Profile

Student profile fields should include:

- full name;
- Student ID;
- registration number;
- batch;
- current semester;
- academic year;
- programme;
- curriculum version;
- email;
- phone;
- profile photo;
- guardian information;
- address;
- blood group;
- emergency contact;
- current status;
- attendance summary;
- eligibility summary;
- result summary;
- GPA/CGPA summary;
- earned credits;
- academic standing.

Student ID is the canonical academic identifier for display and institutional matching.

Internal relations must use immutable internal IDs.

## 6.2 Teacher Profile

Teacher profile fields should include:

- full name;
- Teacher ID;
- designation;
- department;
- email;
- phone;
- profile photo;
- office room;
- academic specialisation;
- assigned courses;
- teaching history;
- Examiner assignments;
- committee assignments;
- account status;
- performance summary;
- Course File completion summary.

## 6.3 Admin Profile

Admin profile fields should include:

- full name;
- Admin ID;
- designation;
- department/unit;
- email;
- phone;
- profile photo;
- access level;
- last login;
- account status.

---

# 7. Academic Structure and Ordinance Control

## 7.1 Programme Configuration

The programme master must support:

| Item | Approved LL.B. (Honours) structure |
|---|---:|
| Programme duration | 4 academic years |
| Total semesters | 8 |
| Credits offered | 140 |
| Minimum credits required | 134 |
| Total courses | 58 |
| Total programme marks | 5,800 |
| Core credits | 98 |
| GED credits | 35 |
| Capstone credits | 7 |
| Core courses | 42 |
| GED courses | 13 |
| Capstone courses | 3 |
| Teaching weeks per semester | 14 |
| Notional hours per credit | 40 |

## 7.2 Academic Year and Semester

Academic year is system-derived based on:

- student batch;
- current semester;
- programme structure;
- curriculum version.

Admin may override academic year or semester only in exceptional authorised cases.

## 7.3 Curriculum and Syllabus Versioning

Every relevant record must retain:

- academic session;
- curriculum version;
- syllabus version;
- year;
- semester;
- student category;
- examination category;
- assessment-template version;
- academic-rule version.

Old versions must never be overwritten.

## 7.4 Semester Progression

Student progression occurs only after:

- approved final-result publication;
- applicable Ordinance conditions;
- configured progression rules.

Course completion inside the LMS does not itself promote the student.

## 7.5 Offline Final Examination

The final summative examination is conducted physically/offline.

Lexora manages only marks-related workflow and result integration.

## 7.6 Department-Level Academic Configuration

Each department may configure, subject to approved authority:

- programme duration;
- total semesters;
- semesters per year;
- credit rules;
- pass mark;
- grading scale;
- course categories;
- curriculum versions;
- syllabus versions;
- assessment templates;
- progression rules;
- attendance-mark rules;
- examination-eligibility rules;
- result workflow;
- transcript display;
- CLO/PLO attainment thresholds;
- Course File rules.

## 7.7 Academic Rule Hierarchy

For academic matters:

1. Current applicable Ordinance.
2. Formal University/Academic Committee decision.
3. Approved curriculum.
4. Approved department configuration.
5. Software defaults.

Software defaults must not override the Ordinance.

---

# 8. Course Lifecycle

## 8.1 Course States

- Draft
- Published
- Enrollment Open
- In Progress
- Completed
- Archived
- Cancelled

## 8.2 Archived Course Rules

When archived:

- the course becomes read-only;
- students may view old materials;
- students may view old assignments;
- students may view old attendance;
- students may view old results;
- students may view notices;
- students may view grades;
- students cannot submit new work;
- teachers cannot edit;
- discussions become read-only;
- Admin may temporarily unlock with reason and audit.

## 8.3 Course Cloning

Archived courses may be cloned for a future term.

### Cloned

- syllabus structure;
- approved curriculum reference;
- course materials;
- assignment structure;
- quiz structure;
- grading policy;
- attendance settings;
- announcement templates;
- lesson-plan templates;
- rubric templates;
- assessment-template references.

### Not Cloned

- student data;
- marks;
- attendance records;
- submissions;
- results;
- discussions;
- Examiner submissions;
- committee approvals;
- Course File evidence.

## 8.4 Version Safety

A clone must point to the correct curriculum and syllabus version.

---

# 9. Enrollment Rules

## 9.1 Self-Enrollment

Students may self-enrol instantly where the department permits.

No approval is required unless configuration says otherwise.

## 9.2 Visibility

Students may view and enrol only in courses belonging to:

- their department;
- their programme;
- their academic year;
- their semester;
- their curriculum version;
- their authorised candidate category.

Students cannot view higher/lower-year courses unless policy allows.

## 9.3 Server-Side Enforcement

All eligibility and visibility rules must be enforced server-side.

## 9.4 Duplicate and Cross-Scope Prevention

The system must prevent:

- duplicate enrolment;
- wrong-department enrolment;
- wrong-term enrolment;
- wrong-curriculum enrolment;
- enrolment into an unavailable course offering.

---

# 10. Class Session Lifecycle

## 10.1 Session States

- Draft
- Scheduled
- Active
- Ended/Completed
- Archived
- Cancelled
- Rescheduled
- Locked

## 10.2 Attendance Rule

Attendance may be captured only during the Active state.

## 10.3 Cancelled Session

A cancelled session:

- is not counted as conducted;
- does not create absence;
- is excluded from the attendance denominator.

## 10.4 Teacher Scope

Only an assigned teacher may manage the session.

---

# 11. Attendance Management

## 11.1 Primary Method

Primary attendance method:

- fingerprint/biometric device;
- biometric matching handled externally;
- Lexora receives verified attendance results;
- fingerprint templates are never stored in Lexora.

## 11.2 Manual Teacher Fallback

When the biometric device or synchronisation fails, an assigned teacher may manually record attendance during an Active session.

Manual fallback requires:

- mandatory reason code;
- explanatory note;
- actor;
- timestamp;
- session;
- student/enrolment;
- attendance value;
- source;
- audit log;
- reconciliation status.

## 11.3 Attendance Values

Only:

- Present
- Absent

No Late, Excused, Partial, or Manual Override student status is used in the current implementation.

## 11.4 Attendance Source

Recommended source values:

- BIOMETRIC
- TEACHER_MANUAL_FALLBACK
- ADMIN_RECONCILIATION
- ADMIN_OVERRIDE

Source is separate from attendance value.

## 11.5 Student Restrictions

Students cannot mark attendance.

## 11.6 Failure Handling

The system must support:

- sync retry queue;
- failed sync log;
- Admin alert;
- reconciliation screen;
- unmatched student list;
- unmatched session list;
- duplicate detection;
- conflict resolution;
- partial-batch status;
- preserved raw source row.

## 11.7 Biometric/Manual Conflict

Biometric data must not silently overwrite teacher fallback data.

Conflicts enter reconciliation.

## 11.8 Attendance Percentage

```text
Attendance Percentage
=
Present Count
÷ Counted Conducted Classes
× 100
```

Cancelled and invalid sessions are excluded.

## 11.9 Attendance Mark Rubric

| Attendance percentage | Attendance mark |
|---|---:|
| 100% | 5 |
| 90% to below 100% | 4 |
| 80% to below 90% | 3 |
| 70% to below 80% | 2 |
| 60% to below 70% | 0 |

There is no 1-mark band.

Below-60% attendance mark remains configurable until formally approved.

## 11.10 Attendance Workflow

```text
OPEN
→ CAPTURED
→ TEACHER_SUBMITTED
→ DEPARTMENT_VERIFIED
→ ELIGIBILITY_FINALISED
→ LOCKED
```

Correction:

```text
REOPENING_REQUESTED
→ AUTHORISED
→ CORRECTED
→ REVERIFIED
→ RELOCKED
```

All original and corrected values remain preserved.

---

# 12. Examination Eligibility

## 12.1 Status Options

- Eligible
- Not Eligible
- Pending
- Marginal Review Required
- Approved Marginal
- Rejected Marginal

## 12.2 Formal Eligibility

Formal examination eligibility follows the Ordinance.

The system must calculate:

- course attendance;
- semester average attendance;
- shortage;
- provisional eligibility;
- marginal-case status;
- final approval.

## 12.3 Current Ordinance-Based Rule

- Normal eligibility: average attendance at least 70%.
- Below 70% but not below 50%: marginal-case process may apply.
- Below 50%: not automatically marginal.
- Marginal cases require special grounds, documentary evidence, and authorised academic processing.

## 12.4 Override

Emergency eligibility override requires:

- mandatory reason;
- actor;
- timestamp;
- evidence;
- approval;
- full audit log.

## 12.5 Engagement Risk

Assignment, quiz, and content completion may contribute to a separate at-risk indicator.

They must not silently replace Ordinance-based formal eligibility.

---

# 13. OBE Course Outline and Lesson Planning

## 13.1 Prepopulated Course Data

The system should prepopulate:

- course code;
- title;
- type;
- year;
- semester;
- section;
- academic session;
- curriculum version;
- syllabus version;
- credit;
- total marks;
- formative/summative allocation;
- Course Teacher;
- prerequisite;
- contact hours;
- course description;
- course objectives;
- CLOs;
- PLO mapping;
- course content;
- textbooks;
- references;
- resources.

## 13.2 Teacher-Completed Offering Data

Teachers may complete:

- course summary;
- delivery plan;
- topic-CLO alignment;
- teaching strategies;
- assessment strategy;
- evaluation policy within approved rules;
- make-up procedure within approved rules;
- learning resources;
- weekly plan;
- lesson plan.

Teachers cannot directly edit approved curriculum-owned CLO/PLO data.

## 13.3 Outline Workflow

```text
DRAFT
→ SUBMITTED_BY_TEACHER
→ COORDINATOR_REVIEW
→ RETURNED_FOR_CORRECTION
→ APPROVED
→ ACTIVE
→ ARCHIVED
```

## 13.4 Lesson Plan Fields

- date;
- week number;
- class/session number;
- scheduled time;
- actual duration;
- topic;
- specific learning outcome;
- Knowledge, Skills, Attitudes/Abilities;
- CLO mapping;
- teaching strategy;
- activity;
- teaching aids;
- materials;
- assessment technique;
- resources;
- completion status;
- teacher notes;
- verification status.

## 13.5 Constructive Alignment

Where applicable, map:

- lessons;
- activities;
- formative assessments;
- rubrics;
- assessment items;
- summative question metadata;
- capstone criteria

to approved CLOs.

---

# 14. Assignment System

## 14.1 Assignment Types

- Course-level assignment
- Class-level assignment
- Individual assignment
- Group assignment
- Physical-submission record
- Oral/performance record

## 14.2 Allowed File Types

- PDF
- DOC
- DOCX
- PPT
- PPTX
- XLSX
- ZIP
- JPG
- PNG
- approved audio/video where configured

## 14.3 File Rules

Baseline:

- maximum 20 MB per ordinary document file;
- maximum 3-5 files per submission;
- recommended formats PDF and DOCX.

Module-specific configuration may impose stricter rules.

## 14.4 Submission Features

- draft save;
- automatic timestamp;
- version history;
- one resubmission by default;
- configurable late policy;
- configurable make-up policy;
- teacher inline feedback;
- text-entry response;
- file upload;
- group submission;
- physical-submission record.

## 14.5 Plagiarism and AI Detection

- external plagiarism service/API;
- AI-detection report stored separately;
- similarity threshold;
- >20% similarity flag where Ordinance applies;
- citations/references exclusion where supported;
- human review;
- no automatic final penalty solely from detector output.

## 14.6 Security Dependency

Production upload depends on secure quarantine, MIME validation, malware scanning, controlled activation, quota, and permission-checked delivery.

---

# 15. Quiz System

## 15.1 Baseline Quiz Rules

The default quiz template may support:

- MCQ;
- single-correct;
- multiple-correct;
- no negative marking;
- no time limit;
- retake;
- randomised question order;
- pass mark 70%;
- auto-submit;
- latest attempt treated as final score.

## 15.2 Configuration

These are default quiz-template rules, not global rules for all formative activities.

The system must allow approved assessment templates to configure:

- time limit;
- attempt count;
- score-selection rule;
- negative marking;
- question type;
- availability window.

## 15.3 Security

Students may access only published quizzes in enrolled courses.

Draft quizzes must remain hidden.

---

# 16. Formative Assessment

## 16.1 Standard Theoretical Course

| Component | Marks |
|---|---:|
| Formative activities | 30 |
| Attendance | 5 |
| Comprehensive Examination | 5 |
| Total Formative Assessment | 40 |
| Summative Assessment | 60 |
| Total | 100 |

## 16.2 Supported Formative Methods

- class test;
- tutorial;
- quiz;
- assignment;
- presentation;
- case study;
- problem question;
- legal writing;
- oral exercise;
- report;
- spot test;
- simulated exercise;
- group work;
- approved other method;
- marks-only Moot Court activity.

## 16.3 Assessment Configuration

Each assessment includes:

- title;
- type;
- instructions;
- individual/group mode;
- open date;
- due date;
- assessment date;
- raw maximum;
- weight within 30;
- topics;
- CLOs;
- Bloom level;
- rubric;
- submission method;
- file types;
- late rule;
- make-up rule;
- integrity requirement;
- feedback deadline;
- publication settings.

Weights must total exactly 30 before finalisation.

## 16.4 Raw and Weighted Marks

```text
Weighted Mark
=
(Raw Mark ÷ Raw Maximum)
× Assigned Weight
```

Preserve:

- raw maximum;
- raw mark;
- assigned weight;
- weighted mark;
- authorised adjustment;
- final counted mark.

## 16.5 Assessment Items

Support:

- item number;
- full mark;
- CLO mapping;
- Bloom level;
- rubric criterion;
- student score;
- feedback.

## 16.6 Rubrics

Support versioned:

- criteria;
- performance levels;
- descriptions;
- weights;
- marks;
- comments;
- overall feedback.

Used rubric versions cannot be silently changed.

## 16.7 Mandatory Feedback

An assessment cannot be marked Feedback Completed without at least one approved feedback form:

- written comment;
- rubric feedback;
- annotated script;
- audio feedback;
- class-level feedback;
- documented face-to-face feedback.

## 16.8 Formative Workflow

```text
DRAFT
→ PUBLISHED
→ SUBMISSION_OPEN
→ SUBMISSION_CLOSED
→ MARKING
→ FEEDBACK_PENDING
→ FEEDBACK_COMPLETED
→ MARKS_SUBMITTED
→ VERIFIED
→ FINALISED
→ LOCKED
```

## 16.9 Manual Adjustment

Requires:

- authorised permission;
- reason;
- previous value;
- revised value;
- evidence;
- audit.

---

# 17. Comprehensive Examination — 5 Marks

## 17.1 Ownership

The 5-mark Comprehensive Examination is controlled by the authorised Examination Committee/panel, not by the ordinary Course Teacher.

## 17.2 LMS Workflow

Support:

- semester-level examination;
- committee/panel;
- roster;
- date;
- criteria/rubric;
- marks;
- absence;
- special-examination request;
- evidence;
- Academic Committee approval;
- expense/fee status;
- final approval;
- course-level allocation.

## 17.3 Proportional Allocation

The exact proportional formula remains configurable until formally approved.

## 17.4 Special Examination

Support:

- application;
- evidence;
- recommendation;
- permission;
- deadline;
- fee;
- approval;
- audit.

## 17.5 Teacher Display

Course Teacher sees read-only:

- activities /30;
- attendance /5;
- Comprehensive Examination /5;
- formative total /40.

---

# 18. Final Formative Assessment — 40 Marks

```text
Final Formative Mark
=
Activities /30
+
Attendance /5
+
Comprehensive Examination /5
```

Validation:

- activities ≤30;
- attendance ≤5;
- Comprehensive Examination ≤5;
- total ≤40;
- required components present;
- feedback complete;
- no blocking integrity case;
- no unauthorised override.

Workflow:

```text
DRAFT
→ COMPONENT_VALIDATION
→ TEACHER_SUBMITTED
→ VERIFIED
→ APPROVED
→ LOCKED
```

No improvement is permitted for formative assessment.

Locked formative marks are carried forward to improvement examinations.

---

# 19. Summative Examination Marks Management — 60 Marks

## 19.1 Scope

The examination is offline.

Lexora records only the marks workflow.

## 19.2 Not Included

- question paper;
- question-paper upload;
- question setter;
- moderation;
- online examination;
- answer-script upload;
- digital script viewing.

## 19.3 Examination Setup

Store:

- department;
- programme;
- session;
- semester;
- examination category;
- course;
- candidate roster;
- curriculum version;
- syllabus version;
- full mark;
- question configuration;
- committee;
- First Examiner;
- Second Examiner;
- deadlines;
- rule version.

## 19.4 Question Configuration

Before marks entry:

- configure number of questions;
- support at least 10 question rows in UI;
- use dynamic child records;
- configure question label;
- configure full mark;
- configure display order;
- configure required/optional status;
- optionally map CLO/Bloom metadata;
- do not store question text.

For baseline compulsory-question exams, configured counted marks must equal 60.

## 19.5 First Examiner

The First Examiner:

- enters question-wise marks;
- cannot see Second Examiner marks;
- cannot see Third Examiner marks;
- submits independently;
- total is system-calculated;
- submission locks after finalisation.

## 19.6 Second Examiner

Same rules as First Examiner.

## 19.7 Question-Wise Validation

- mark ≥0;
- mark ≤ question full mark;
- missing required mark blocks submission;
- zero and missing are distinct;
- total equals sum of question marks;
- candidate belongs to roster;
- Examiner assignment is active.

## 19.8 Variance Formula

```text
Absolute Difference
=
|First Examiner Total − Second Examiner Total|
```

```text
Variance Percentage
=
Absolute Difference
÷ Summative Full Mark
× 100
```

Third Examination is required when:

```text
Variance Percentage >= 15%
```

For 60 marks, 15% equals 9 marks.

## 19.9 No Third Examination

```text
Final Summative Mark
=
(First Examiner Total + Second Examiner Total)
÷ 2
```

## 19.10 Third Examination

Only triggered scripts go to Third Examiner.

Third Examiner:

- receives only assigned scripts;
- cannot see prior Examiner marks;
- enters question-wise marks;
- submits independently;
- total is system-calculated.

## 19.11 Final Mark with Three Examiners

Calculate:

```text
|First − Second|
|First − Third|
|Second − Third|
```

Select the nearest pair.

```text
Final Summative Mark
=
Average of the Two Nearest Marks
```

## 19.12 Equal-Distance Rule

If lower and higher marks are equally distant from the middle mark, select the two higher marks.

## 19.13 Analytical Question Marks

The system may average the corresponding question marks from the selected pair for CLO analysis.

Original Examiner marks remain immutable.

## 19.14 Examination Committee

Three members:

- one Chairman;
- two Members.

Members review.

Chairman approves.

## 19.15 Workflow

```text
EXAMINATION_CONFIGURED
→ EXAMINERS_ASSIGNED
→ FIRST/SECOND_MARKING
→ FIRST/SECOND_SUBMITTED
→ VARIANCE_COMPARED
→ THIRD_EXAM_REQUIRED / NOT_REQUIRED
→ THIRD_MARKING, where required
→ CALCULATED
→ MEMBER_1_REVIEW
→ MEMBER_2_REVIEW
→ CHAIRMAN_APPROVAL
→ LOCKED
→ RESULT_HANDOFF
```

## 19.16 Correction Workflow

```text
RETURNED_FOR_CORRECTION
→ CHAIRMAN_AUTHORISED_REOPENING
→ CORRECTED
→ RESUBMITTED
→ RECALCULATED
→ MEMBER_REREVIEW
→ CHAIRMAN_REAPPROVAL
→ RELOCKED
```

## 19.17 Approved Summative Record

Store:

- candidate;
- course;
- examination;
- question configuration version;
- Examiner assignments;
- Examiner totals;
- variance;
- third-examination status;
- selected pair;
- final mark;
- Member reviews;
- Chairman approval;
- approval timestamp;
- version;
- handoff status.

## 19.18 Result Handoff

Only Chairman-approved locked marks enter the main result engine.

Handoff must be:

- transactional;
- idempotent;
- audited;
- department-scoped;
- versioned.

---

# 20. Result Management

## 20.1 Result Workflow

### Draft

- locked formative mark;
- approved summative mark;
- capstone/special components;
- automatic validation.

### Review

- component validation;
- separate pass validation;
- approved-rule verification;
- committee/exam-office review.

### Publish

- authorised Admin/exam authority publishes;
- published result locks.

## 20.2 Amendment Workflow

- Teacher or authorised officer requests amendment;
- reason mandatory;
- approval mandatory;
- old history preserved;
- student notified;
- GPA/CGPA recalculated centrally.

## 20.3 No Direct Overwrite

Published results cannot be directly edited.

---

# 21. Result Structure

## 21.1 Mandatory Fields

- course code;
- course title;
- semester;
- year;
- session;
- curriculum version;
- syllabus version;
- course type;
- credits;
- formative full mark;
- formative obtained;
- activities full mark;
- activities obtained;
- attendance full mark;
- attendance obtained;
- Comprehensive Examination full mark;
- Comprehensive Examination obtained;
- summative full mark;
- summative obtained;
- total full mark;
- total obtained.

## 21.2 Formative Breakdown

- assignment;
- presentation;
- quiz;
- class test;
- tutorial;
- other approved component;
- raw marks;
- weighted marks;
- total /30.

## 21.3 Special Components

- practical;
- dissertation;
- defence;
- viva;
- Moot Court marks-only component;
- custom component.

## 21.4 Calculated Fields

- percentage;
- component pass/fail;
- letter grade;
- grade point;
- overall pass/fail;
- remarks;
- GPA contribution;
- point secured.

## 21.5 Separate Component Pass

The system must validate separate formative and summative passing.

Exact numerical thresholds remain configurable until formally approved.

## 21.6 Grading Scale

| Numerical mark | Letter | GP | Performance |
|---|---|---:|---|
| 80-100 | A+ | 4.00 | Outstanding |
| 75-79 | A | 3.75 | Excellent |
| 70-74 | A- | 3.50 | Very Good |
| 65-69 | B+ | 3.25 | Good |
| 60-64 | B | 3.00 | Satisfactory |
| 55-59 | B- | 2.75 | Above Average |
| 50-54 | C+ | 2.50 | Average |
| 45-49 | C | 2.25 | Below Average |
| 40-44 | D | 2.00 | Pass |
| Below 40 | F | 0.00 | Fail |

## 21.7 GPA/CGPA

- configurable scale;
- configurable pass mark;
- configurable grade-point mapping;
- credit-weighted GPA/CGPA;
- central backend calculation;
- versioned snapshots.

---

# 22. Candidate Categories and Improvement

Support:

- regular;
- irregular;
- failed;
- improvement;
- re-admitted;
- earlier-syllabus candidate.

## 22.1 Improvement

- formative cannot change;
- locked formative is carried forward;
- eligible summative component is re-examined;
- higher result replaces previous result only where policy allows;
- unsuccessful attempt does not invalidate previous valid result;
- limits tracked;
- attempt history retained.

## 22.2 Earlier Syllabus

Use:

- original syllabus version;
- original CLO version;
- correct assessment template;
- correct question configuration;
- correct rule version.

---

# 23. Capstone and Moot Court Templates

## 23.1 Capstone

### 0421-4108

| Component | Marks |
|---|---:|
| Defence | 40 |
| Practical | 60 |
| Total | 100 |

### 0421-4207

| Component | Marks |
|---|---:|
| Defence | 40 |
| Dissertation | 60 |
| Total | 100 |

### 0421-4208

| Component | Marks |
|---|---:|
| Defence | 40 |
| Practical | 60 |
| Total | 100 |

Do not apply `30+5+5+60` automatically.

## 23.2 Moot Court

Current scope:

- marks template;
- marks entry;
- validation;
- approval;
- locking;
- result integration.

Future expansion must remain possible.

---

# 24. Transcript and Result Download

## 24.1 Student Access

Students may view:

- course-wise marks breakdown;
- formative result;
- summative result;
- total;
- grade;
- GPA/CGPA;
- pass/fail;
- semester summary;
- amendment history;
- result history;
- downloadable personal result copy.

## 24.2 Transcript Fields

- semester GPA;
- cumulative CGPA;
- credits attempted;
- credits earned;
- cumulative credits earned;
- academic standing;
- graduation/completion status.

## 24.3 Download Formats

- printable web page;
- PDF;
- official transcript-style layout.

## 24.4 Transcript Security

- QR verification;
- digital signature;
- official seal;
- immutable transcript version;
- issue timestamp;
- expiry;
- revocation;
- token hashing.

## 24.5 Public Verification

Public page is read-only and exposes minimal necessary data only.

It must not expose excessive personal or academic details.

---

# 25. Dashboards

## 25.1 Admin Dashboard

- total students;
- total teachers;
- active courses;
- semester-wise courses;
- pending approvals;
- pending results;
- attendance summary;
- eligibility summary;
- low-attendance alerts;
- Examination Committee status;
- Examiner-submission status;
- Course File completion;
- recent audit activity.

## 25.2 Teacher Dashboard

- assigned courses;
- sections;
- student count;
- upcoming sessions;
- classes completed/remaining;
- attendance completion;
- pending assessment reviews;
- pending feedback;
- pending formative marks;
- low-attendance students;
- at-risk students;
- recent submissions;
- CLO coverage;
- Course File completion;
- Examiner duties;
- committee duties;
- marks deadlines;
- correction requests;
- finalisation status.

## 25.3 Student Dashboard

- current semester;
- enrolled courses;
- attendance percentage;
- course progress;
- pending assignments;
- deadlines;
- quiz status;
- eligibility;
- notifications;
- published result;
- GPA summary.

---

# 26. Discussion System

## 26.1 Features

- course boards;
- assignment threads;
- announcement comments;
- file/image attachments.

## 26.2 Rules

- no anonymous posting;
- students participate only in enrolled courses;
- teachers manage only assigned-course discussions;
- Admin moderates department discussions.

## 26.3 Student Restrictions

- limited-time edit;
- no direct deletion;
- deletion request;
- abuse reporting.

## 26.4 Attachment Rules

Baseline:

- maximum 3 attachments;
- maximum 10 MB each;
- image, PDF, DOCX, ZIP;
- no video attachment.

## 26.5 Moderation

- edit history;
- deleted-comment history;
- reporting;
- review queue;
- archived discussions read-only.

---

# 27. Notifications

## 27.1 Channels

- in-app;
- browser/PWA push;
- email where configured.

## 27.2 Events

- enrolment success;
- class/session update;
- assignment creation;
- deadline reminder;
- feedback;
- resubmission request;
- quiz availability;
- quiz submission/result;
- attendance warning;
- eligibility warning;
- formative-mark issue;
- Examiner assignment;
- Examiner deadline;
- Third Examiner referral;
- Member review request;
- Chairman approval request;
- result publication;
- amendment;
- transcript availability;
- discussion reply;
- moderation action;
- Course File correction.

## 27.3 Queue

Mass notification delivery must use a background queue/worker.

## 27.4 Isolation

Students may see only their own notifications.

Critical notifications cannot be disabled where policy locks them.

---

# 28. Storage and File Management

## 28.1 Storage Rules

- external object storage for large files;
- no large production file on app server;
- large video stream/view only;
- download based on permission;
- safe internal storage keys;
- no raw bucket exposure.

## 28.2 Secure Upload Pipeline

```text
Permission Check
→ Size Limit
→ Quarantine
→ Extension Validation
→ MIME/Magic Validation
→ Filename Sanitisation
→ Malware Scan
→ Metadata Save
→ Activation
→ Permission-Controlled Access
```

## 28.3 Deletion

- recycle bin/archive first;
- permanent deletion after 30-90 days or approved retention;
- audit permanent deletion.

## 28.4 Quotas

- per teacher;
- per course;
- configurable by Admin.

## 28.5 Malware Scanning

All uploads require malware/virus scanning before activation.

---

# 29. Audit Logs

## 29.1 Mandatory Events

- login/logout;
- failed login;
- password reset;
- role change;
- teacher assignment;
- Examiner assignment;
- committee assignment;
- attendance fallback;
- attendance override;
- reconciliation;
- eligibility override;
- enrolment;
- assignment review;
- feedback completion;
- profile update;
- notification;
- discussion moderation;
- formative finalisation;
- Examiner draft save;
- Examiner submission;
- mark reopening;
- variance calculation;
- Third Examination;
- Member review;
- Chairman approval;
- result handoff;
- result edit;
- result publication;
- amendment;
- transcript issue/revoke;
- file access;
- export.

## 29.2 Audit Fields

- actor;
- role;
- scoped assignment;
- department;
- timestamp;
- target;
- old value;
- new value;
- reason;
- approval reference;
- session/IP where permitted;
- correlation ID.

## 29.3 Override Rule

Every override requires:

- mandatory reason;
- timestamp;
- actor;
- old/new value;
- audit record.

---

# 30. Offline and PWA Support

## 30.1 Supported

- offline cache for safe read-only pages;
- recently viewed materials;
- non-sensitive draft saving;
- auto-sync when online;
- poor-internet warning.

## 30.2 Restricted

Do not cache offline:

- Examiner marks;
- committee reviews;
- Chairman approvals;
- unpublished results;
- sensitive integrity records;
- verification secrets.

---

# 31. CLO/PLO Attainment and CQI

## 31.1 Data Sources

- formative items;
- rubric criteria;
- summative question metadata;
- selected-pair analytical marks;
- capstone criteria;
- student scores;
- CLO weights.

## 31.2 Teacher View

- lesson coverage;
- assessment coverage;
- items per CLO;
- Bloom distribution;
- class average;
- student attainment;
- students below benchmark;
- unassessed CLO;
- over-assessed CLO;
- formative/summative contribution;
- action areas.

## 31.3 Configurable Rules

- attainment threshold;
- class benchmark;
- direct/indirect ratio;
- aggregation;
- PLO target;
- rounding.

## 31.4 CQI Workflow

```text
ATTAINMENT_GENERATED
→ TEACHER_ANALYSIS
→ GAP_IDENTIFIED
→ ACTION_PROPOSED
→ COORDINATOR_REVIEW
→ APPROVED
→ IMPLEMENTED_NEXT_OFFERING
→ EFFECTIVENESS_REVIEWED
```

---

# 32. Comprehensive Course File

## 32.1 Contents

- approved OBE curriculum;
- course outline;
- CLO/PLO mapping;
- lesson plans;
- lecture materials;
- learning resources;
- attendance logs;
- attendance summary;
- eligibility report;
- formative plans;
- instruments;
- rubrics;
- submissions;
- marks;
- feedback;
- best/mediocre/poor samples;
- Comprehensive Examination allocation;
- final formative summary;
- approved summative summary;
- approval reference;
- CLO attainment;
- reflection;
- CQI;
- integrity records where authorised;
- QA evidence.

## 32.2 Excluded Confidential Content

Ordinary Course File must not contain:

- question paper;
- question-paper draft;
- moderation paper;
- physical answer script;
- individual confidential Examiner mark sheet;
- committee deliberation.

## 32.3 Completion Status

- complete;
- incomplete;
- pending verification;
- returned for correction;
- approved;
- archived.

## 32.4 Sample Selection

System may suggest high/middle/low samples.

Teacher confirms best/mediocre/poor.

## 32.5 Export Profiles

- Teacher package;
- Coordinator package;
- QA package;
- Examination Committee package;
- Accreditation archive;
- redacted external package.

---

# 33. Search

Search must be:

- department-scoped;
- role-aware;
- assignment-aware;
- workflow-aware;
- state-aware.

Search must not leak:

- another department's data;
- unassigned courses;
- another student's records;
- confidential Examiner marks;
- unpublished results;
- committee-only records;
- restricted integrity cases.

---

# 34. Reports and Exports

## 34.1 Teacher Reports

- roster;
- weekly plan;
- class completion;
- attendance register;
- attendance percentage;
- attendance mark;
- formative plan;
- raw/weighted marks;
- feedback completion;
- final formative /40;
- CLO coverage;
- CLO attainment;
- Course File completion.

## 34.2 Examination Reports

- committee appointment;
- Examiner assignment;
- question configuration;
- missing marks;
- Examiner comparison;
- variance;
- Third Examination referral;
- Third Examination calculation;
- nearest-pair selection;
- Member review;
- Chairman approval;
- approved summative /60;
- result handoff;
- candidate-category list.

## 34.3 Administrative/QA Reports

- eligibility;
- marginal attendance;
- grade sheet;
- GPA/CGPA;
- failed component;
- separate component pass;
- course result analysis;
- semester analysis;
- PLO attainment;
- CQI;
- Course File audit;
- PSAC/QA report;
- audit report.

## 34.4 Export Formats

- printable web;
- PDF;
- Excel;
- CSV;
- permission-filtered archival package.

---

# 35. Non-Functional Requirements

The system must be:

- scalable;
- modular;
- secure;
- department-configurable;
- audit-ready;
- developer-friendly;
- mobile-responsive;
- PWA-capable;
- multi-department-ready;
- integration-ready;
- maintainable;
- observable;
- recoverable.

## 35.1 Operational Expectations

Define:

- expected users;
- concurrent active users;
- response-time targets;
- uptime target;
- backup frequency;
- restore testing;
- disaster recovery;
- browser matrix;
- logging;
- monitoring;
- queue monitoring;
- storage growth;
- connection pooling;
- rollback plan.

---

# 36. Academic Rules Configuration Register

Remain configurable until formally approved:

- separate pass mark out of 40;
- separate pass mark out of 60;
- attendance mark below 60%;
- Comprehensive Examination allocation formula;
- 30-mark internal distribution;
- fixed number of activities;
- best-of rule;
- general make-up rule;
- late penalty;
- rounding/decimal policy;
- CLO benchmark;
- PLO benchmark;
- result approval chain;
- Course File approval chain;
- course-code display;
- optional-question structure;
- digital signature standard;
- retention period.

Confirmed:

- only Present/Absent attendance;
- biometric primary;
- reason-required teacher fallback;
- offline summative examination;
- no question-paper storage;
- question-wise marks entry;
- at least 10 dynamic question rows;
- 15% variance;
- Third Examination at ≥15%;
- nearest-pair average;
- equal-distance higher pair;
- Members review;
- Chairman approves;
- Course Teacher not automatically Examiner;
- marks-only Moot Court.

---

# 37. Success Metrics

The project is successful if:

- attendance works reliably;
- biometric/manual reconciliation is trustworthy;
- Ordinance-based eligibility is accurate;
- teacher workload decreases;
- formative workflow is complete;
- feedback evidence improves;
- summative marks are securely consolidated;
- Third Examination is calculated correctly;
- Chairman approval is enforced;
- result publication is accurate;
- student transparency increases;
- paperwork decreases;
- eligibility disputes decrease;
- audit and accreditation become easier;
- Course Files are complete;
- CLO/PLO reporting is usable;
- department isolation remains intact;
- sensitive examination data remains confidential.

---

# 38. Minimum Acceptance Criteria

## 38.1 Authentication and Security

- official-domain registration works;
- email verification works;
- 2FA works for sensitive roles;
- lockout works;
- department isolation passes;
- object-level authorisation passes.

## 38.2 Course and OBE

- teacher sees only assigned course;
- approved curriculum is read-only;
- lesson plans map to CLOs;
- outline approval/versioning works.

## 38.3 Attendance

- biometric import works;
- no fingerprint template stored;
- manual fallback requires reason;
- only Present/Absent;
- only Active session;
- cancelled class excluded;
- reconciliation preserves evidence;
- marks and eligibility follow approved rules.

## 38.4 Formative

- weights total 30;
- raw/weighted preserved;
- rubrics versioned;
- feedback mandatory;
- Comprehensive Examination committee-controlled;
- final formative =30+5+5;
- improvement cannot alter formative.

## 38.5 Summative

- no question paper stored;
- committee has 3 members;
- Members review;
- Chairman approves;
- Course Teacher not automatically Examiner;
- at least 10 dynamic question rows;
- question full marks configured first;
- question-wise entry works;
- totals auto-calculate;
- Examiners cannot see each other's marks;
- 15% variance works;
- only triggered scripts go Third Examiner;
- nearest-pair works;
- equal-distance higher pair works;
- approved marks hand off idempotently.

## 38.6 Results

- formative/summative separate;
- component pass checked;
- published results locked;
- amendment preserves history;
- GPA/CGPA central;
- transcript verification secure.

## 38.7 QA

- CLO attainment from real data;
- Course File generated;
- confidential Examiner records excluded;
- old versions remain accessible.

---

# 39. Recommended Implementation Order

1. Academic Rules Configuration Register.
2. Programme/curriculum/syllabus versioning.
3. Teacher Course Workspace.
4. OBE outline and lesson plan.
5. Attendance simplification to Present/Absent.
6. Manual fallback reason and reconciliation.
7. Ordinance-based attendance marks/eligibility.
8. Generic formative assessment.
9. Rubrics, feedback, integrity.
10. Comprehensive Examination.
11. Final formative /40.
12. Examination Committee and Examiner assignment.
13. Dynamic question configuration.
14. Blind First/Second question-wise marks.
15. Variance and Third Examination.
16. Member review and Chairman approval.
17. Approved summative result handoff.
18. Final result integration.
19. Transcript.
20. CLO/PLO/CQI.
21. Course File.
22. Reports and exports.
23. Production hardening.

After backend TypeScript/API changes:

```bash
pnpm --filter @lexora/api typecheck
pnpm --filter @lexora/api build
```

---

# 40. Final Implementation Principle

Lexora LMS must provide a complete academic platform while preserving strict separation between:

- teaching authority;
- formative-assessment authority;
- Comprehensive Examination authority;
- Examiner authority;
- committee review;
- Chairman approval;
- final result publication.

The summative examination, question paper, physical answer scripts, and physical evaluation remain outside Lexora.

Lexora manages only the secure, independent, auditable marks workflow and controlled result integration.

The platform must remain secure, department-isolated, Ordinance-compliant, auditable, maintainable, and future-expandable.
