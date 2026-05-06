**LEXORA LMS --- Project Status, Workflow, Remaining Work & Safety
Documentation**

**1. Project Identity**

**Project Name:** Lexora LMS\
**Client/Initial Scope:** Department of Law, University of Chittagong\
**Initial Department:** Law Department only\
**Future Direction:** Multi-department expansion support\
**Current Product Type:** Backend-first LMS platform with frontend
scaffold\
**Primary Goal:** Secure an academic LMS with course delivery,
attendance, assessment, result processing, transcript verification, and
audit-ready academic records.

The functional specification says the MVP should include user
registration/authentication, role management, course management,
class/session management, attendance, assignments, quizzes, progress
tracking, eligibility calculation, notifications, dashboards, result
management, transcript generation/verification, and discussion tools.

The technical blueprint recommends a **security-first modular monolith**
using NestJS, PostgreSQL, Prisma, RBAC + scoped policy checks,
auditability, and future-ready module boundaries.

**2. Current Architecture**

**2.1 Architecture Style**

Lexora LMS is currently designed as a:

Modular Monolith

Meaning:

One backend application\
but internally separated into strict modules

This is suitable for the current stage because:

-   easier to deploy than microservices

-   easier to debug

-   faster for MVP development

-   safer for a small team or AI-assisted development

-   still allows future separation if needed

**2.2 Current Tech Stack**

  -----------------------------------------------------------------------
  **Layer**        **Technology**
  ---------------- ------------------------------------------------------
  Backend          NestJS

  Language         TypeScript

  ORM              Prisma

  Database         PostgreSQL

  Package Manager  pnpm

  Validation       class-validator / DTO-based validation

  Rate Limiting    NestJS Throttler

  Frontend         Next.js scaffold exists

  Styling/UI       Tailwind/shadcn-compatible setup appears planned

  Architecture     Modular monolith

  Tenant model     Department-scoped multi-tenant model

  Authorization    RBAC + policy-based checks

  Audit            Implemented/foundation for sensitive academic flows
  -----------------------------------------------------------------------

**3. Current Repository Structure**

The uploaded ZIP shows a monorepo-style project.

Current major structure:

lexora_lms/\
├── apps/\
│ ├── api/\
│ │ ├── prisma/\
│ │ └── src/\
│ │ ├── common/\
│ │ ├── platform/\
│ │ └── modules/\
│ └── web/\
│ └── src/app/\
├── packages/\
│ ├── config/\
│ ├── eslint-config/\
│ ├── tsconfig/\
│ ├── types/\
│ └── ui/\
├── docs/\
├── package.json\
├── pnpm-workspace.yaml\
├── turbo.json\
├── docker-compose.yml\
└── .env.example

**3.1 Important Observation**

The project is not only backend code. There is also a frontend
shell/scaffold.

However:

Frontend exists as scaffold/basic pages,\
but it is not yet a complete functional LMS frontend.

So the correct status is:

Backend-first project with frontend scaffold.

Not:

No frontend at all.

**4. Backend Modules Currently Wired**

The backend AppModule imports the following modules:

PlatformModule\
HealthModule\
IdentityAccessModule\
AuthorizationModule\
AcademicModule\
AssessmentModule\
DepartmentConfigModule\
UserManagementModule\
CourseManagementModule\
EnrollmentModule\
ClassSessionModule\
AttendanceModule\
AssignmentModule\
QuizModule\
ResultProcessingModule\
TranscriptVerificationModule\
DiscussionModule\
NotificationModule\
FileStorageModule\
AuditComplianceModule\
ReportingDashboardModule\
SystemConfigurationModule\
IntegrationLayerModule

Important clarification:

A module being wired does not automatically mean it is fully
implemented.

Some modules are fully/mostly implemented. Some are foundation-only.
Some are placeholder modules for future development.

**5. Current Implementation Status Summary**

**5.1 Overall Status**

**Area Current Status**

Backend architecture : Strong foundation implemented

Department isolation : Implemented/foundation strong

RBAC + policy authorization : Implemented

Identity/Auth MVP : Implemented, but full security is incomplete

Academic core : Implemented baseline

Assessment : Basic assignment/quiz implemented

Result processing : Strong implementation

Transcript verification : Strong backend implementation

Attendance : Schema/foundation exists, full workflow pending

Class/session : Schema/foundation exists, full workflow pending

File storage : Placeholder/foundation, not complete

Notification : Foundation, not complete

Discussion : Placeholder, not complete

Dashboard/reporting : Placeholder/scaffold, not complete

Frontend : Basic scaffold/pages only

Deployment : Local Ubuntu VM deployed and verified

Runtime : production validation Completed (VM environment)

Process manager : PM2 configured with auto-start

Nginx reverse : proxy configured

Backend : accessible via LAN without exposing the application port

Cloud deployment : Pending

HTTPS : Pending

**6. Implemented Backend Areas**

**6.1 Identity & Access Module**

**Implemented**

The current backend includes:

Register\
Login\
Logout\
Refresh token\
Session tracking\
Login attempt tracking\
Basic lockout foundation\
Password reset endpoint structure\
Email verification endpoint structure

**Existing API Flow**

Likely available endpoints:

POST /api/v1/auth/register\
POST /api/v1/auth/login\
POST /api/v1/auth/logout\
POST /api/v1/auth/refresh\
POST /api/v1/auth/request-password-reset\
POST /api/v1/auth/reset-password\
POST /api/v1/auth/verify-email

**Current Strength**

This module gives the LMS a working authentication foundation.

**Still Pending / Not Complete**

The following are not yet fully production-grade:

Real email sending\
Mandatory email verification delivery\
Real password reset email delivery\
Real 2FA/TOTP\
Admin/Teacher mandatory 2FA\
Suspicious login detection\
Common password blocking\
Advanced account lockout rules\
Concurrent session restriction for admin/teacher\
Inactive account auto-disable\
Sensitive action OTP verification

**Documentation Note**

This module should be described as:

Identity & Access MVP implemented,\
but full institutional security features are pending.

**6.2 Authorization Module**

**Implemented**

Current authorization foundation includes:

AuthGuard\
PolicyGuard\
\@RequirePolicy()\
Role-to-policy mapping\
Department-scoped access\
Request-context-based tenant isolation

**Current Strength**

This is one of the strongest parts of the system.

The system is not only checking:

Is this user logged in?

It is also designed to check:

What role does the user have?\
Which department does the user belong to?\
Is the user allowed to access this specific resource?

**Required Principle**

This must never be weakened.

For Lexora LMS:

Frontend checks are not enough.\
Every sensitive access must be checked in backend service/API layer.

**Must Preserve**

No cross-department access\
No teacher access to unassigned course\
No student access to other students' data\
No direct edit of published results\
No direct edit of immutable transcript snapshots

**6.3 Academic Core Module**

**Implemented**

Current implementation includes:

Academic programs\
Courses\
Course offerings\
Enrollments\
Teacher assignments\
Department scoping

**Existing API Areas**

/programs\
/courses\
/course-offerings\
/enrollments

**Meaning**

Admin can define academic structure such as:

Program\
Course\
Course offering\
Enrollment\
Teacher assignment

**Current Strength**

This gives the foundation for the Law Department's academic course
structure.

**Still Pending / Needs Expansion**

Full academic year derivation\
Full semester progression automation\
Course lifecycle state machine\
Archived course read-only enforcement\
Course cloning\
Department-level academic rules UI/API\
Program-year-semester visibility enforcement

**6.4 Assessment Module**

**Implemented**

Current implemented assessment features include:

Assignments CRUD\
Assignment submissions\
Quizzes basic structure\
Quiz attempts\
Quiz attempt start\
Quiz attempt submit\
Student own-enrollment restriction\
Teacher assigned-offering restriction

**Existing API Areas**

/assignments\
/assignment-submissions\
/quizzes\
/quiz-attempts/start\
/quiz-attempts/submit

**Current Strength**

Basic assessment workflow exists.

**Still Pending**

Full quiz engine\
Question bank\
Single-correct MCQ\
Multiple-correct MCQ\
Randomized question order\
Auto grading advanced logic\
Retake policy implementation\
Auto-submit\
Class/session-linked quiz\
File upload submission pipeline\
Assignment resubmission rules\
Late submission policy\
Inline teacher feedback\
Plagiarism integration\
Malware scan for submitted files

**Important Rule**

Assignments should be primarily linked to:

Course Offering

Not necessarily to a single class.

But in the future, an assignment may optionally reference:

Topic / Class Session

if needed.

**6.5 Result Processing Module**

**Implemented**

This is one of the strongest completed areas.

Current implementation includes:

Grade scales\
Result records\
Result components\
Result compute\
Term GPA\
Cumulative CGPA\
Result verification\
Result publication\
Publication lock\
Result amendments\
Append-only amendment flow\
No overwrite after publish\
Department scoping\
Pagination

**Existing API Areas**

/grade-scales\
/results/compute\
/results\
/results/:id/verify\
/results/:id/publish\
/gpa/compute-term\
/gpa\
/cgpa\
/result-publications\
/result-amendments\
/result-amendments/:id/approve\
/result-amendments/:id/apply

**Current Strength**

The result system follows a secure academic-record model:

Draft / computed result\
→ verify\
→ publish\
→ lock\
→ amendment required for change

This is the right approach.

**Must Preserve**

Published result must never be directly overwritten.\
Any change after publication must go through amendment.\
Old marks/history must remain preserved.\
GPA/CGPA recalculation must happen through controlled backend logic.

**Still Pending**

CSV/Excel result upload\
Large result import processing\
Advanced validation report\
Advanced configurable weighting engine\
Admin/exam-office review UI\
Student notification after result publication\
Withheld/incomplete/failed special-case workflow

**6.6 Transcript & Verification Module**

**Implemented**

Current implementation includes:

Transcript records\
Transcript versions\
Immutable transcript snapshots\
Term summaries\
Course-line snapshots\
Public verification token system\
SHA-256 token hashing\
Constant-time token comparison\
Token expiry\
Token revocation\
Public verification endpoint\
Safe/minimal public response\
Seal metadata\
Pagination

**Existing API Areas**

/transcripts\
/transcripts/:id/issue\
/transcripts/:id/revoke\
/transcripts/:id/versions\
/transcripts/:id/verification-token\
/transcript-versions/:id\
/transcript-seals\
/public/transcript-verification/:token

**Current Strength**

The backend trust model is strong.

The system is designed so that:

A transcript version is an immutable snapshot.\
Public users can verify only safe summary data.\
Raw verification token is not stored.

**Still Pending**

PDF transcript generation\
QR code rendering\
Printable transcript layout\
Official transcript-style design\
Digital signature rendering/integration\
Public verification frontend polish\
Transcript download system

**6.7 Rate Limiting and Hardening**

**Implemented / Mentioned**

Rate limiting is applied to the public transcript verification endpoint:

/api/v1/public/transcript-verification/:token

This is important because the endpoint is public and unauthenticated.

**Current Strength**

The public verification endpoint is protected from basic abuse.

**Still Pending**

Rate limiting review for all sensitive endpoints\
Login brute-force hardening\
Upload abuse protection\
Suspicious activity monitoring\
Production logging and monitoring

**7. Foundation / Partial / Placeholder Modules**

The following modules exist in the project structure but should not be
documented as fully complete.

**7.1 Class Session Module**

**Current Status**

Foundation/contracts/schema exist.\
Full controller/service/API workflow not complete.

**Required Future Role**

This module should manage:

Class/topic/session list\
Scheduled class\
Active class\
Ended class\
Cancelled class\
Rescheduled class\
Archived class\
Class materials\
Class recordings\
Class-linked quiz\
Attendance session mapping

**Important Business Rule**

Attendance should only be counted for a valid class/session.

**7.2 Attendance Module**

**Current Status**

Foundation/contracts/schema exist.\
Full attendance workflow not complete.

**Final Biometric Decision**

This is very important:

Biometric machine will NOT connect directly to Lexora LMS.

The final approved approach is:

Biometric machine/device software will collect attendance
independently.\
Lexora LMS will later sync verified attendance data from that external
system/database.

**Final Attendance Architecture**

Biometric Machine / Vendor Attendance Software\
↓\
External Biometric Attendance Database\
↓\
Lexora Sync Adapter / Import Service\
↓\
Lexora Attendance Records\
↓\
Course/Class Attendance Summary\
↓\
Student Eligibility Calculation

**LMS Must Not Do**

LMS must not directly capture fingerprint\
LMS must not store fingerprint template\
LMS must not directly control biometric machine\
LMS must not require teacher to connect biometric machine by cable\
LMS must not depend tightly on one biometric vendor

**LMS Should Do**

Sync verified attendance records\
Map attendance to student\
Map attendance to course offering\
Map attendance to class/session/topic\
Store sync batch history\
Store failed sync logs\
Allow admin reconciliation\
Allow manual correction only with reason and audit log

**Required Attendance Data Fields**

When syncing from biometric system, Lexora should receive or map:

Student ID / registration number\
Biometric system user ID\
Course offering ID or class/session mapping\
Class/session date and time\
Attendance timestamp\
Device ID / source system\
Verification status\
Sync batch ID

**Required Attendance Statuses**

Possible attendance statuses:

Present\
Absent\
Late\
Excused\
Partial\
Manual Override

**Important Rule**

Manual override must require:

Reason\
Actor information\
Timestamp\
Audit log\
Original value\
New value

**7.3 Eligibility Module**

**Current Status**

Required by specification.\
Not fully implemented as complete workflow.

**Required Purpose**

Eligibility should decide whether a student is fit to sit for exam based
on:

Physical attendance percentage\
Recorded class completion\
Quiz completion\
Assignment completion\
Department rules\
Admin override if needed

**Eligibility Status**

Eligible\
Not Eligible\
Pending\
At Risk

**Student Profile Should Show**

Course-wise attendance percentage\
Overall physical class attendance\
Recorded class completion percentage\
Quiz completion status\
Assignment completion status\
Eligibility status\
Reason if not eligible\
Warning notification

Example:

Course: Constitutional Law I\
Physical Attendance: 72%\
Recorded Class Completion: 85%\
Quiz Completion: 8/10\
Assignment Submission: 2/3\
Eligibility Status: At Risk\
Message: Minimum 75% physical attendance required for exam eligibility.

**7.4 File Storage Module**

**Current Status**

Module exists/foundation exists.\
Full file storage implementation not complete.

**Required Future Role**

File storage is needed for:

Assignment submissions\
Class materials\
Recorded classes\
Discussion attachments\
Notices/announcements attachments\
Transcript PDF storage if needed

**Required Security Rules**

Use object storage, not local server disk for large production files\
Validate file extension\
Validate MIME type\
Sanitize filename\
Use internal storage keys\
Do not expose raw storage paths\
Use signed URLs or controlled backend proxy\
Scan uploaded files for malware\
Apply storage quota\
Use recycle bin/archive before permanent delete

**Important**

Large videos should not be stored directly on the LMS application
server.

Recommended future approach:

External object storage / video storage\
Stream/view by permission\
Download controlled by permission

**7.5 Notification Module**

**Current Status**

Foundation exists.\
Real notification delivery workflow not complete.

**Required Notification Types**

Enrollment open notification\
Enrollment reminder\
Assignment created\
Assignment deadline reminder\
Assignment feedback\
Quiz available\
Quiz result/attempt status\
Attendance warning\
Eligibility warning\
Result publication\
Result amendment update\
Transcript available\
Discussion reply\
Notice/announcement published

**Notification Channels**

In-app notification\
Email notification\
Browser/PWA push notification later

**7.6 Discussion Module**

**Current Status**

Placeholder/foundation.\
Not complete.

**Required Features**

Course discussion board\
Assignment discussion thread\
Announcement comments\
File/image attachment support\
Edit history\
Deleted comment history\
Spam/abuse report\
Admin moderation\
Read-only archived discussions

**Student Rule**

Students can only participate in enrolled course discussions.

**Teacher Rule**

Teachers can only manage discussions for assigned courses.

**7.7 Reporting Dashboard Module**

**Current Status**

Placeholder/foundation.\
Frontend dashboard pages exist but not full API-connected dashboards.

**Required Dashboards**

Admin dashboard:

Total students\
Total teachers\
Active courses\
Pending results\
Pending approvals\
Attendance summary\
Eligibility summary\
Low attendance alerts\
Recent activity logs

Teacher dashboard:

Assigned courses\
Upcoming class sessions\
Pending assignment reviews\
Pending results\
Low attendance students\
At-risk students\
Recent submissions

Student dashboard:

Current semester/year\
Enrolled courses\
Attendance percentage\
Course progress\
Pending assignments\
Upcoming deadlines\
Quiz status\
Eligibility status\
Notifications\
GPA/CGPA summary

**7.8 User Management Module**

**Current Status**

Module exists.\
Full profile management workflow not complete.

**Required Future Role**

Student profile\
Teacher profile\
Admin profile\
Profile status management\
Role assignment\
Department-scoped user management\
Account activation/deactivation\
Teacher-course assignment management

**7.9 Department Configuration Module**

**Current Status**

Foundation/contracts exist.\
Full admin configuration workflow pending.

**Required Configuration Items**

Program duration\
Total semesters\
Semesters per year\
Credit rules\
Pass mark\
Grading scale\
Attendance threshold\
Eligibility rules\
Promotion/progression rules\
Result publishing workflow\
Notification rules\
Storage quota

**Important Rule**

These should not be hardcoded.

**8. Frontend Status**

**8.1 Current Status**

Frontend app exists under:

apps/web

Current scaffold includes pages such as:

sign-in page\
forgot-password page\
admin dashboard page\
teacher dashboard page\
student dashboard page\
public verification page\
dashboard layout

**8.2 Correct Status Statement**

Frontend scaffold exists, but full functional frontend is not complete.

**8.3 Still Needed**

API-connected login\
API-connected dashboards\
Admin course management UI\
Teacher assigned course UI\
Student course enrollment UI\
Class/session list UI\
Attendance view UI\
Assignment UI\
Quiz UI\
Result entry/review/publish UI\
Transcript view/download UI\
Notice/announcement UI\
Notification UI\
File upload UI\
Role-based navigation

**9. Core Academic Delivery Workflow**

This is the main workflow Lexora LMS should support.

**9.1 Admin Course Setup Workflow**

Example:

Law Department First Year\
10 courses\
Each course has 40 topics/classes

Admin workflow:

Admin logs in\
→ Creates/updates academic program\
→ Creates courses\
→ Creates course offerings for year/semester\
→ Assigns teachers to course offerings\
→ Creates class/topic/session list under each course offering\
→ Configures attendance/eligibility rules\
→ Publishes course offerings for student enrollment

**9.2 Course and Class Relationship**

Recommended conceptual structure:

Academic Program\
↓\
Course\
↓\
Course Offering\
↓\
Class Session / Topic

Explanation:

Course = main subject, for example Constitutional Law I\
Course Offering = that course offered in a specific semester/year/batch\
Class Session / Topic = individual class/topic under that offering

**9.3 Quiz Placement**

A quiz may be:

Course-level quiz\
or\
Class/session/topic-linked quiz

For the current target workflow:

Each class/topic should have option to create quiz.

Current system has basic quiz foundation, but class/session-linked quiz
needs enhancement.

**9.4 Assignment Placement**

Assignment should primarily belong to:

Course Offering

Not necessarily to one class.

Rule:

Assignments are course-level by default.\
Optional class/topic reference can be added later if needed.

**10. Student Workflow**

**10.1 Student Login/Profile Workflow**

Student logs in\
→ Enters student dashboard/profile\
→ Sees own department/program/year/semester\
→ Sees available course offerings\
→ Receives notification to enroll\
→ Enrolls in eligible courses\
→ Views enrolled course list

**10.2 Student Should See**

Enrolled courses\
Course materials\
Recorded classes\
Assignments\
Quizzes\
Attendance percentage\
Recorded class completion\
Eligibility status\
Result/GPA/CGPA\
Transcript\
Notifications\
Notices/announcements

**10.3 Enrollment Notification**

Student should receive notification like:

Your semester courses are available for enrollment.\
Please enroll in your eligible courses.

**10.4 Course Visibility Rule**

Student must only see:

Own department courses\
Own program courses\
Own year/semester courses\
Eligible course offerings

Student must not see:

Other department courses\
Higher year courses\
Lower year courses unless allowed by policy\
Other student data

**11. Teacher Classroom Workflow**

**11.1 Teacher Course Workflow**

Teacher logs in\
→ Opens dashboard\
→ Sees assigned course offerings\
→ Selects the course being taught\
→ Sees class/topic/session list\
→ Selects today's class/session\
→ Performs class activities

**11.2 Teacher Class Options**

For each selected class/session, teacher should see options:

1\. Attendance\
2. Class recording / recorded class management\
3. Upload recorded class\
4. Upload class material\
5. Create quiz

**11.3 Updated Attendance Flow**

Previous idea of directly connecting biometric machine to LMS is
rejected.

Final flow:

Teacher conducts class\
→ Biometric attendance is taken through biometric machine/vendor system\
→ Vendor system stores attendance\
→ Lexora syncs verified data later\
→ Attendance appears under relevant course/class/student profile

Teacher should not connect biometric machine directly to LMS.

**11.4 Class Recording**

There are two possible future approaches:

A. Teacher records outside LMS and uploads recorded class\
B. LMS provides recording integration later

Current safe baseline:

Recorded class upload should be supported first.\
Direct in-browser recording can be future enhancement.

This avoids unnecessary complexity early.

**11.5 Class Material Upload**

Teacher should be able to upload:

PDF\
DOC/DOCX\
PPT/PPTX\
XLSX\
ZIP\
Image files\
Other approved files

But upload must go through secure file storage rules.

**12. Attendance and Eligibility Workflow**

**12.1 Final Attendance Source**

External biometric system/database

**12.2 Sync Workflow**

Biometric system records attendance\
→ Lexora sync job/import adapter reads verified records\
→ Records are matched with students\
→ Records are matched with course offering/class session\
→ Attendance table is updated\
→ Student dashboard is updated\
→ Eligibility engine recalculates status

**12.3 Failed Sync Handling**

Required future features:

Sync batch history\
Failed sync log\
Duplicate detection\
Unmatched student record list\
Unmatched class/session record list\
Admin reconciliation screen\
Retry mechanism\
Audit log

**12.4 Manual Attendance / Override**

Manual attendance should exist only as fallback.

Manual attendance or correction must require:

Reason\
Actor\
Timestamp\
Department scope\
Old value\
New value\
Audit log

**12.5 Eligibility Calculation**

Eligibility may use:

Physical attendance\
Recorded class completion\
Quiz completion\
Assignment completion\
Department-specific rules

Output:

Eligible\
Not Eligible\
Pending\
At Risk

**13. Notice and Announcement System**

**13.1 Requirement**

Lexora LMS homepage should include a beautiful notice/announcement
section.

**13.2 Notice Types**

General notice\
Department notice\
Program notice\
Semester/year notice\
Course notice\
Exam notice\
Result notice\
Urgent announcement

**13.3 Notice Fields**

Title\
Body\
Published by\
Target audience\
Department\
Program/year/semester if applicable\
Course if applicable\
Attachment\
Publish date\
Expiry date\
Pinned/important status\
Visibility status

**13.4 Status**

This should be considered:

Required feature, not fully implemented yet.

**14. Security Model**

**14.1 Current Security Strengths**

Implemented/foundation includes:

Department isolation\
RBAC\
Policy guard\
Request context\
Hashed tokens\
Constant-time token comparison for transcript verification\
Append-only sensitive flows\
No overwrite after result publication\
Audit logs for sensitive actions\
Rate limit for public transcript verification endpoint\
Pagination for sensitive/list endpoints

**14.2 Security Rules That Must Never Be Broken**

Do not remove department isolation.\
Do not allow cross-tenant access.\
Do not allow the teacher to access unassigned course data.\
Do not allow students to access another student's data.\
Do not store the raw biometric fingerprint template.\
Do not directly connect the biometric device to LMS.\
Do not store raw transcript verification tokens.\
Do not overwrite published result records.\
Do not edit transcript versions after issuance.\
Do not expose excessive data on the public verification page.\
Do not bypass backend authorization because the frontend has checks.

**15. Deployment Status**

**15.1 Current Status**

Build/typecheck passes.

Backend successfully deployed and executed in local Ubuntu VM.

Production-like runtime test (VM environment) completed.

PM2 process manager configured and running

PM2 auto-start enabled via systemd

Nginx is installed and configured as a reverse proxy

Default Nginx site disabled

Custom routing configured

Backend accessible via:

http://\<server-ip\>/api/v1/\*

(no direct port exposure)

Verified from the host machine (LAN access)

**15.2 Deployment Target**

Remaining:

Cloud deployment (AWS/DO/Hetzner)

Domain configuration

HTTPS (SSL via Let\'s Encrypt)

Monitoring/logging system

Backup and restore strategy

**15.3 Ubuntu VM Deployment Tasks**

Status: Completed (local VM)

Notes:

\- API successfully booted

\- All modules initialized

\- Routes mapped correctly

\- Dependency injection issues resolved

\- Runtime alias configuration added (tsconfig-paths)

**Additional Completed Tasks:**

\- pnpm install completed\
- Prisma client generated\
- Database synced via prisma db push\
- API build completed\
- Runtime alias resolution configured (tsconfig-paths)\
- PM2 process manager configured\
- PM2 auto-start enabled (systemd integration)\
- Nginx installed and configured\
- Default Nginx site removed\
- Reverse proxy routing configured\
- Backend exposed via port 80 (no direct port 4000 exposure)\
- Verified API access from the host machine

**15.4 Deployment Must Verify**

Database connection works\
Prisma migration works\
Register/login works\
Refresh token works\
Department scoping works\
Course APIs work\
Enrollment APIs work\
Assignment APIs work\
Quiz attempt APIs work\
Result compute/verify/publish works\
Amendment flow works\
Transcript issue/token/verify/revoke works\
Public verification rate limit works\
Pagination works

Reverse proxy routing works

API accessible via Nginx (port 80)

Application port (4000) not publicly exposed

PM2 process persistence after reboot

Reverse proxy routing works

API accessible via Nginx (port 80)

Application port (4000) not publicly exposed

PM2 process persistence after reboot

**15.5 Deployment Challenges & Fixes**

Major runtime issues encountered and resolved:\
\
1. Prisma environment variable issue (DATABASE_DIRECT_URL)\
2. PostgreSQL authentication and connection fix\
3. TypeScript builds output issue (noEmit / outDir)\
4. Runtime path alias resolution issue (@/\*)\
5. NestJS dependency injection (DI) resolution issues across modules\
6. Cross-module provider visibility (PlatformModule,
AuthorizationModule)\
7. Guard dependency propagation across modules

8\. PM2 duplicate process causing port conflict (EADDRINUSE)

9\. Port binding issue debugging (port 4000)

10\. Nginx default site overriding custom configuration

11\. Reverse proxy routing validation

12\. Ubuntu mirrors download failure (nginx install issue)\
\
Solutions:\
- Explicit tsconfig override\
- Runtime alias resolver (register-paths.js)\
- Proper module import/export restructuring\
- Clean rebuild after DI fixes\
\
This phase significantly stabilized the backend runtime.

**15.6 Current Deployment Architecture**

Client (Browser / Host Machine)\
↓\
Nginx (Port 80)\
↓\
PM2 (Process Manager)\
↓\
NestJS API (Port 4000)\
↓\
PostgreSQL Database

**16. Existing Documentation Inside Project**

The project already contains documentation files under:

docs/

Existing docs include:

academic-core-api.md\
academic-core-foundation.md\
architecture-rules.md\
assessment-api.md\
assessment-core.md\
authorization.md\
identity-access-design.md\
identity-access-implementation.md\
notification-foundation.md\
result-processing-api.md\
result-processing.md\
transcript-verification-api.md\
transcript-verification.md

These should not be deleted.

They should be treated as:

Existing developer notes / module documentation

Future documentation should update and consolidate them, not replace
them blindly.

**17. Current Done / Partial / Pending Classification**

**17.1 Done or Mostly Done**

Backend modular architecture\
Prisma/PostgreSQL schema foundation\
Identity/Auth MVP\
Session tracking\
Login attempt tracking\
Authorization guard/policy foundation\
Department-scoped access foundation\
Academic programs\
Courses\
Course offerings\
Enrollments\
Teacher assignments\
Basic assignments\
Basic submissions\
Basic quizzes\
Basic quiz attempts\
Grade scales\
Result records\
Result components\
Result compute\
GPA\
CGPA\
Result verification\
Result publication lock\
Result amendment system\
Transcript records\
Transcript immutable versions\
Transcript public verification token\
Token hashing\
Token revocation\
Safe public verification summary\
Rate limit on public transcript verification\
Pagination on selected list endpoints

**17.2 Partial / Foundation Exists**

Password reset\
Email verification\
Assignment separate module\
Quiz separate module\
Class session module\
Attendance module\
Notification module\
File storage module\
Audit compliance module\
Department configuration module\
Enrollment separate module\
Course management separate module\
User management module\
Frontend dashboard shell\
Public verification frontend page

**17.3 Not Done / Important Pending**

Real email sending\
Real 2FA\
Advanced grading rules\
CSV/Excel result upload\
Full quiz engine\
Class/session full workflow\
Attendance sync adapter\
Biometric database sync\
Eligibility engine\
Recorded class upload workflow\
Class material upload workflow\
Secure file storage\
Malware scanning\
Storage quota\
Notice/announcement system\
Discussion system\
Notification delivery\
Dashboard analytics\
PDF transcript\
QR code rendering\
Digital signature rendering\
Background jobs/queues\
Monitoring/logging system\
Cloud deployment

HTTPS (SSL)

Monitoring/logging system\
Backup/restore automation\
End-to-end tests\
Security tests\
Full frontend

**18. Recommended Development Roadmap**

**Phase 1 --- Protect Current Work**

Before more coding:

Commit the current stable code\
Push to GitHub\
Create a local backup ZIP\
Keep this documentation in project/docs

Recommended file:

docs/project-status-and-roadmap.md

**Phase 2 --- Ubuntu VM Deployment**

Goal:

Run the current backend on a production-like local server.

Tasks:

Node + pnpm setup\
PostgreSQL setup\
.env setup\
Prisma migrate\
Build API\
Run API\
Test endpoints\
Fix runtime issues\
PM2 setup

**Phase 3 --- Runtime Test Existing Modules**

Test:

Auth\
Authorization\
Department isolation\
Academic core\
Assignment\
Quiz\
Result processing\
Transcript verification\
Pagination\
Rate limiting

**Phase 4 --- Class Session Module**

Implement:

Class/topic/session CRUD\
Session lifecycle\
Course offering linkage\
The teacher assigned the course access\
Student visibility\
Archived/read-only state

**Phase 5 --- Attendance Sync Module**

Implement based on the final decision:

External biometric DB/API sync\
Attendance import batch\
Attendance record matching\
Failed sync logs\
Admin reconciliation\
Manual override with audit\
Attendance percentage calculation

**Phase 6 --- Eligibility Engine**

Implement:

Eligibility rule configuration\
Physical attendance threshold\
Recorded class completion\
Quiz completion\
Assignment completion\
Eligibility status calculation\
Student warning notification\
Admin override with audit

**Phase 7 --- File Storage and Materials**

Implement:

Object storage adapter\
File metadata\
Upload validation\
Malware scan placeholder/pipeline\
Signed URL or protected download\
Class material uploads\
Recorded class upload\
Assignment file submission\
Quota management\
Recycle bin/archive

**Phase 8 --- Notification and Notice**

Implement:

Notice board\
In-app notification\
Enrollment reminder\
Assignment reminder\
Attendance warning\
Eligibility warning\
Result publication notification\
Transcript notification

**Phase 9 --- Frontend Completion**

Build a role-based frontend:

Admin dashboard\
Teacher dashboard\
Student dashboard\
Course pages\
Class/session pages\
Assignment pages\
Quiz pages\
Result pages\
Transcript pages\
Notice pages\
Profile pages

**Phase 10 --- Production Hardening**

Implement:

2FA\
Email delivery\
Monitoring\
Structured logging\
Backup policy\
Security testing\
E2E testing\
Performance testing\
HTTPS\
Cloud deployment

**19. AI-Assisted Development Workflow**

Since the project is being built with ChatGPT + Codex, this workflow
should be followed strictly.

**19.1 Safe Workflow**

1\. Decide the feature\
2. Ask ChatGPT for a feature breakdown\
3. Ask ChatGPT for database/API/security plan\
4. Ask ChatGPT for the Codex prompt\
5. Paste prompt into Codex\
6. Let Codex modify code\
7. Copy Codex output/errors to ChatGPT\
8. ChatGPT reviews and gives a fix prompt\
9. Run typecheck/build\
10. Test manually\
11. Git add\
12. Git commit\
13. Git push\
14. Update documentation

**19.2 Never Ask Codex**

Avoid prompts like:

Build the full LMS.\
Refactor everything.\
Simplify all security.\
Remove authorization errors.\
Disable guards for now.\
Make everything public for testing.

These can damage the system.

**19.3 Safe Prompt Style**

Use prompts like:

Implement only the Class Session module without changing existing Auth,
Authorization, Result Processing, or Transcript Verification logic.
Preserve department isolation and existing policy guards. Do not
refactor unrelated modules.

**20. Git and Backup Safety Policy**

Because the project was accidentally deleted once, this is mandatory.

**20.1 After Every Stable Change**

Run:

git status\
git add.\
git commit -m \"describe the completed work\"\
git push

**20.2 Good Commit Examples**

git commit -m \"document current backend status\"\
git commit -m \"add class session API foundation\"\
git commit -m \"implement attendance sync batch model\"\
git commit -m \"verify result publication lock\"\
git commit -m \"configure ubuntu deployment environment\"

**20.3 Backup Rule**

Keep three copies:

1\. GitHub remote repository\
2. Local project folder\
3. ZIP backup on another drive

**20.4 ZIP Backup Naming**

Use names like:

lexora_lms_backup_2026-04-30_backend-baseline.zip\
lexora_lms_backup_2026-05-01_vm-deployment-tested.zip\
lexora_lms_backup_2026-05-05_attendance-sync-started.zip

**20.5 Important Exclusions for Backup ZIP**

When possible, exclude:

node_modules\
.git\
dist\
build\
.next\
coverage\
logs\
tmp\
.env\
.env.local\
.env.production

But always keep:

.env.example\
README.md\
docs/\
package.json\
pnpm-lock.yaml\
apps/\
packages/\
prisma schema

**21. What Must Not Be Changed Without Care**

These parts are sensitive and should not be casually refactored:

Authorization guards\
Policy checks\
Department isolation\
Request context\
Result publication lock\
Result amendment flow\
Transcript version immutability\
Transcript verification token hashing\
Public verification response\
Audit logging\
Prisma relations for result/transcript

Any future Codex prompt should explicitly say:

Do not weaken security.\
Do not bypass guards.\
Do not remove department scoping.\
Do not modify result/transcript critical flows unless explicitly
requested.

**22. Current Project Verdict**

Lexora LMS is not yet a complete LMS product. However, it now has a
strong production-style backend foundation with verified deployment
capability.

The strongest completed areas are:

-   Modular backend architecture

-   Authorization system

-   Department isolation

-   Academic core baseline

-   Assessment baseline

-   Result processing system

-   Transcript verification system

-   Security-sensitive academic record handling

-   Local Ubuntu VM deployment

-   PM2 process management

-   Nginx reverse proxy configuration

-   Production-style runtime validation

The biggest remaining areas are:

-   Cloud deployment (AWS / DigitalOcean / Hetzner)

-   HTTPS (SSL via Let\'s Encrypt)

-   Monitoring and centralized logging

-   Backup and restore strategy

-   Full runtime and integration testing

-   Class/session workflow

-   Attendance sync from external biometric software/database

-   Eligibility calculation

-   File/media storage

-   Notifications

-   Notice board

-   Dashboards

-   Frontend completion

-   PDF/QR transcript generation

-   Background jobs and queues

-   Advanced production hardening

Correct project status:

-   Production-style backend baseline: Yes

-   Local deployment verified system: Yes

-   Complete backend MVP: Not yet

-   Complete LMS product: Not yet

-   Frontend product: Not yet

-   Cloud production deployment: Not yet

**23. Final Safe Summary**

Lexora LMS has already completed a major portion of the difficult
backend engineering foundation. The project now includes a modular
NestJS backend, Prisma/PostgreSQL database architecture,
department-scoped tenant isolation, RBAC and policy-based authorization,
academic core management, assessment baseline, result processing system,
and secure transcript verification infrastructure.

The backend has also been successfully deployed and validated in a local
Ubuntu VM production-like environment. PM2 process management, automatic
startup persistence, and Nginx reverse proxy configuration have been
completed and verified. The API is accessible through reverse proxy
routing without exposing the internal application port directly.

However, the system still requires cloud deployment, HTTPS
configuration, monitoring/logging infrastructure, backup strategy, full
runtime/integration testing, advanced academic workflow completion,
frontend completion, PDF/QR transcript generation, background
jobs/queues, and final production hardening before being considered a
complete production LMS platform.
