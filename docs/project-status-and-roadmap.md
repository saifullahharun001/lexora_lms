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

## Summative Examination Current Status Supersession — 2026-08-30

This section supersedes older roadmap statements that classify the entire Summative
Examination backend as unimplemented.

Current implementation HEAD:

`89b4440dfbbf0b2cf4c3e675039c38c1e8417fff`

### Current status

**PARTIAL / ACTIVE DEVELOPMENT**

Implemented and deployed backend scope:

- Summative Examination setup;
- Ordinance-aligned four-seat Examination Committee foundation;
- external-member identity metadata;
- independent First/Second Examiner assignment;
- dynamic versioned question configuration;
- Enrollment-derived candidate roster foundation;
- blind First/Second question-wise marking;
- draft/final lock behavior;
- exact mixed-role authorization provisioning.

Verified deployment evidence includes:

- server Prisma generation;
- API typecheck/build;
- selected regression `199/199 PASS`;
- disposable PostgreSQL 18.6 five-migration verification;
- ordinary PostgreSQL deployment;
- 10 tables / 7 enums / 55 indexes / 82 constraints / 4 triggers;
- 49 restrictive Summative FKs;
- zero Prisma drift;
- idempotent repeated migration deployment;
- permanent Admin/Teacher authorization separation;
- idempotent repeated provisioning;
- PM2 restart and healthy activation;
- loopback-only API binding preserved;
- unauthenticated Summative marking route returns HTTP 401.

### Not yet closed

The authenticated First/Second Examiner functional/security runtime matrix is still
pending.

Also not yet implemented:

- First/Second variance/comparison;
- 15% Third Examination trigger;
- candidate/script-scoped Third Examiner;
- nearest-pair/equal-distance calculation;
- Committee Member review;
- Chairman approval/final lock;
- correction/reopen lifecycle;
- approved Summative result;
- idempotent result-engine handoff;
- final result/amendment integration;
- mandatory Summative 2FA enforcement;
- frontend integration.

Candidate/exam-roll/physical-script reference governance is also unresolved and must
not be invented without formal institutional rules.

Detailed current module status:

`docs/summative-examination.md`

Strongest runtime source of truth:

`docs/runtime-test-checklist.md`

---

## Summative First/Second Functional Runtime Closure — 2026-09-01

This section supersedes the 2026-08-30 statement that the authenticated
First/Second Examiner functional/security runtime matrix was still pending.

Historical roadmap text remains preserved as point-in-time evidence.

Implementation/runtime HEAD before this documentation update:

`95022543bdca4f6e969eedc12bf5a8705f7681d5`

### Updated current status

**Summative Examination overall: PARTIAL / ACTIVE DEVELOPMENT**

Within that broader partial module, the following narrow backend phase is now closed:

> **Blind First/Second Examiner question-wise marking =
> IMPLEMENTED + DEPLOYED + FUNCTIONAL/SECURITY RUNTIME VERIFIED**

Verified scope includes:

- exact First/Second Examiner authority;
- reciprocal blindness;
- DRAFT and LOCKED marking lifecycle;
- server-calculated totals;
- validation boundaries;
- object/department isolation;
- forged-department-header resistance;
- live User/UserRole/Examiner-assignment revocation behavior;
- replacement-Examiner version protection;
- concurrency safety;
- save/finalize race handling;
- PostgreSQL integrity-trigger enforcement;
- transactional audit-failure rollback;
- audit-content review;
- final disposable-fixture cleanup;
- measured baseline restoration.

Final cleanup result:

`summative_final_cleanup_rc=0`

After cleanup:

- all ten Summative business tables returned to `0`;
- Law runtime AcademicSession/SyllabusVersion fixture rows returned to `0`;
- temporary assessment components returned to `0`;
- runtime Offering/Enrollment fixture returned to `0`;
- hardening Student/SCA fixture returned to `0`;
- all four Summative protection triggers remained enabled;
- permanent Summative authorization remained unchanged;
- temporary Examiner authority was removed;
- runtime test identities became archived/login-disabled audit anchors;
- platform health and loopback-only API exposure remained intact.

### Next Summative backend phase

The next implementation target is:

1. persistent First/Second comparison evidence;
2. absolute First/Second difference;
3. variance percentage against the authoritative Summative full mark;
4. `>= 15%` Third Examination referral decision.

Only after that should candidate/script-scoped Third Examiner marking be implemented.

The complete Summative workflow is still **not complete**.

Still pending after the comparison/variance layer:

- Third Examiner blind marking;
- nearest-pair calculation;
- equal-distance higher-pair rule;
- Committee Member review;
- Chairman approval/final lock;
- controlled correction/reopen lifecycle;
- approved Summative result;
- idempotent result-engine handoff;
- final-result/amendment integration;
- confidentiality-filtered reporting/export;
- frontend;
- mandatory Summative 2FA;
- formal exam-roll/candidate-number/physical-script-reference governance.

Third Examiner must not be modelled as a permanent standing ExaminationCourse seat.

## Summative Examination Development Supersession — 2026-09-01

This section supersedes only the older Summative current-status list that described
comparison/variance and Third Examination marking as unimplemented.

Current promoted local/main implementation HEAD:

`ff6325af66f9a2c4a95f98eeae8dfab902c2d708`

### Newly implemented since the 2026-08-30 documentation checkpoint

Implemented, committed and pushed:

- immutable exact-source First/Second Examiner comparison evidence;
- absolute-difference calculation;
- variance against the authoritative Summative full mark;
- inclusive 15% Third Examination decision;
- candidate-scoped Third Examination referral;
- active eligible Third Examiner authority;
- prevention of First/Second-as-Third;
- blind Third Examiner question-wise marking;
- Third DRAFT / LOCKED submission lifecycle;
- server-calculated Third total;
- locked Third academic-evidence immutability;
- concurrency/idempotency protections;
- structural audit and audit-failure rollback protections.

Relevant commits:

- `02e79c5cdc529f4450198dc66bcd4c862606d3fd` — `feat: add summative examiner comparison variance`
- `8dde2d148d6ed4bc30c1ff3d05b572c52f001729` — `feat: add summative third examiner referrals`
- `ff6325af66f9a2c4a95f98eeae8dfab902c2d708` — `feat: add blind third examiner marking`

Final focused local acceptance at `ff6325af66f9a2c4a95f98eeae8dfab902c2d708`:

- Third marking: 57/57 PASS;
- Third Referral: 71/71 PASS;
- First/Second marks + comparison: 63/63 PASS;
- combined focused regression: 191/191 PASS;
- API typecheck/build: PASS;
- Prisma validate/generate: PASS.

### Correct current classification

The new comparison/Third bundles are:

**IMPLEMENTED + COMMITTED + PUSHED / AUTOMATED STATICALLY VERIFIED**

They are not yet server-deployed or server-runtime verified.

The earlier deployed First/Second Summative backend and its 2026-08-30 runtime evidence
remain separately preserved in `docs/runtime-test-checklist.md`.

### Next Summative backend work

Remaining sequence:

1. three-total nearest-pair calculation;
2. equal-distance higher-pair selection;
3. final derived Summative calculation evidence;
4. Committee Member review;
5. Chairman approval/final lock;
6. authorised reopen/correction/re-review/re-approval/re-lock;
7. approved Summative result record;
8. transactional/idempotent result-engine handoff;
9. final-result/amendment integration;
10. approved Summative CLO selected-pair analytical evidence where required;
11. reports/export confidentiality filtering;
12. frontend integration.

Mandatory Summative 2FA remains pending.

Formal candidate/exam-roll/physical-script/masking governance remains unresolved and
must not be invented from implementation convenience.

The full Summative Examination workflow therefore remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

It must not yet be described as a complete or production-hardened Summative product.
## Summative Nearest-Pair Development Supersession — 2026-09-02

This append-only section supersedes only older roadmap statements that still list
three-total nearest-pair calculation, equal-distance higher-pair selection and
derived Summative calculation evidence as unimplemented.

Promoted implementation commit:

`ae2499303e7009d3ecbe256f5966c9ff445d6d72`

Commit:

`feat: add summative nearest-pair calculation`

### Newly closed local/static backend scope

The following are now implemented, committed and pushed:

- immutable three-total calculation evidence;
- exact First/Second/Third source binding;
- exact pairwise distance calculation;
- nearest-pair selection;
- equal-distance higher-pair resolution;
- deterministic all-equal canonical evidence;
- exact derived Summative value;
- versioned calculation evidence;
- restrictive database relationships;
- database-side evidence validation;
- protected Third-finalisation integration;
- structural audit integration;
- referral/comparison rule-version binding;
- exact Third Examiner audit-actor binding.

Final local acceptance included:

- Prisma validate: PASS;
- Prisma generate: PASS;
- API typecheck: PASS;
- API build: PASS;
- `git diff --check`: PASS.

Post-normalisation focused evidence recorded `33/33 PASS` across the strongest
runnable schema/migration and nearest-pair subset plus the production-source
TypeScript harness.

A broader earlier current-source focused campaign recorded `61/61 PASS`; this remains
qualified local/static evidence rather than server-runtime evidence.

### Correct current classification

Three-total nearest-pair backend:

**IMPLEMENTED + COMMITTED + PUSHED / AUTOMATED STATICALLY VERIFIED**

It is not yet server-deployed or server-runtime verified.

Comparison/variance, Third Referral, Third Marking and nearest-pair calculation should
be covered by a controlled combined server-runtime campaign before the next authority
layer is promoted.

### Next Summative backend authority boundary

Remaining sequence now begins with:

1. Committee Member review;
2. Chairman approval/final lock;
3. authorised reopen/correction/re-review/reapproval/relock;
4. approved Summative result record;
5. transactional/idempotent result-engine handoff;
6. final-result/amendment integration;
7. approved Summative CLO selected-pair analytical evidence where required;
8. reports/export confidentiality filtering;
9. frontend integration.

Mandatory Summative 2FA remains pending.

Candidate/exam-roll/physical-script/masking governance remains unresolved.

Committee composition must be source-reviewed against the current Academic Ordinance
and any later formal institutional decision before Committee Member Review
implementation. This checkpoint does not alter existing Committee implementation.

The complete Summative Examination workflow remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

It must not be described as a complete or production-hardened Summative product.

---

## Summative Comparison / Third / Nearest-Pair Runtime Supersession — 2026-09-02

This section supersedes the 2026-09-01 current-status statements that classified the
comparison/variance, Third Examination and nearest-pair bundles as only automated
static verification or as remaining implementation work.

Historical roadmap sections remain preserved as point-in-time evidence.

Implementation/runtime HEAD:

`9560ee8e78ea022f2a39196b7ad1f4adaa7d13e7`

### Current verified Summative backend scope

The following phase is now:

**IMPLEMENTED + DEPLOYED + FUNCTIONAL/SECURITY RUNTIME VERIFIED FOR THE TESTED MATRIX**

Verified scope includes:

- blind First/Second question-wise marking;
- immutable First/Second comparison evidence;
- authoritative Summative-full-mark variance;
- inclusive `>= 15%` Third Examination trigger;
- candidate-scoped Third referral;
- Third authority/blindness;
- Third referral expiry and controlled replacement;
- blind Third question-wise marking;
- Third DRAFT / LOCKED lifecycle;
- nearest-pair calculation;
- `EQUAL_DISTANCE_HIGHER_PAIR`;
- deterministic all-equal handling;
- concurrency/idempotency protection;
- PostgreSQL immutable academic-evidence protection;
- required-audit transactional rollback;
- final disposable-fixture cleanup;
- measured baseline restoration.

The current Summative implementation still does **not** represent a complete
Summative Examination product.

Overall status remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

### Runtime closure highlights

Runtime verification proved:

- below-threshold, exact `15%` threshold and above-threshold comparison decisions;
- Third referral eligibility and negative authority cases;
- Third blindness from First/Second marks/totals;
- Third question-wise marking and final lock;
- nearest-pair unique and equal-distance cases;
- expired Third referral loses read/write/finalise authority;
- expired predecessor becomes `EXPIRED` during controlled replacement;
- successor receives the next assignment version;
- concurrent repeated finalisation remains idempotent;
- direct PostgreSQL mutation of protected LOCKED/calculation evidence is blocked;
- forced required-audit failure rolls back the associated business mutation;
- temporary failure-injection DDL leaves zero residue.

Final focused expiry/Third regression:

`53/53 PASS`

Final campaign cleanup restored:

- tracked Summative business tables: `0`;
- runtime AcademicSession: `0`;
- runtime StudentBatch: `0`;
- runtime SyllabusVersion: `0`;
- runtime CourseOffering: `0`;
- runtime Enrollments: `0`;
- runtime assessment components: `0`;
- USER Summative audits: `0`;
- SERVICE Summative audits: `0`.

Permanent authorization:

`4/4 PRESERVED`

Production Summative protection triggers:

`10/10 ENABLED`

Recovered private post-cleanup evidence SHA-256:

`D5D72C9DDA60BE9829B2B3EA30039F78421EF987B822A8188CDAAAC42030EC94`

### Next Summative backend implementation point

The next cohesive backend phase is now:

**Committee Member Review + Chairman Approval / Final Lock**

After that:

1. authorised reopen/correction/re-review/re-approval/re-lock;
2. approved Summative result record;
3. transactional/idempotent result-engine handoff;
4. final-result/amendment integration;
5. approved Summative CLO selected-pair analytical evidence where formally required;
6. confidentiality-filtered reporting/export;
7. frontend integration.

Separately pending:

- mandatory Summative 2FA enforcement/runtime verification;
- formal candidate/exam-roll/physical-script/masking governance.

Third Examiner remains candidate/referral scoped and must not be converted into a
permanent standing course-level Examiner seat.

The current Ordinance-aligned Examination Committee composition remains:

- Chairman;
- two Internal Members;
- one External Member.

---

## Summative Committee approval implementation checkpoint — 2026-09-03

Current classification:

**IMPLEMENTED / LOCAL STATICALLY VERIFIED**

The calculated-mark convergence, two internal-Member reviews and Chairman
approval/final-lock backend bundle is implemented locally. It supports both no-Third
and Third candidates through one immutable calculated-evidence boundary and preserves
the Ordinance-backed four-seat Committee while keeping the External Member
metadata-only for this digital phase.

Authorization now has two separate exact Teacher coarse-duty definitions:

- `summative-examination.member-review.review_department`;
- `summative-examination.chairman-approval.approve_department`.

These definitions do not authorize by role alone. Every read/write additionally
requires the exact live Committee assignment, required seat, principal department and
calculated-mark/Examination/Committee scope. Department Admin management authority and
Examiner assignment do not substitute for Committee duty. Runtime provisioning was
not applied, so the prior `4/4` permanent Summative runtime links remain the latest
runtime evidence.

Local evidence:

- Prisma schema validation with Prisma CLI `6.19.3`: PASS in the canonical
  `D:\Lexora` workspace;
- Prisma Client generation: PASS in the canonical `D:\Lexora` workspace;
- API typecheck: PASS in the canonical `D:\Lexora` workspace;
- API build: PASS in the canonical `D:\Lexora` workspace;
- focused new bundle tests: `85/85 PASS`;
- selected existing Summative regressions: `200/200 PASS`;
- changed production-source isolated TypeScript analysis: no non-environment
  diagnostics;
- additive migration/history, evidence chronology, Committee workspace readiness and
  confidentiality/security review: PASS.

The later canonical `D:\Lexora` verification supersedes an earlier managed-runner
`EPERM ... lstat 'D:\\'` tooling limitation. No ordinary database migration,
provisioning, deployment, PM2 activation, authenticated HTTP verification,
PostgreSQL trigger verification or real concurrency test was performed. The
classification is local/static only.

Remaining Summative sequence:

1. authorised reopen/correction/re-review/re-approval/re-lock;
2. approved Summative result-engine record;
3. transactional/idempotent result-engine handoff;
4. final-result/amendment integration;
5. approved Summative CLO selected-pair analytical evidence where required;
6. confidentiality-filtered reports/export;
7. frontend integration.

Mandatory Summative 2FA and candidate/exam-roll/physical-script/masking governance
remain pending. Overall Summative status remains **PARTIAL / ACTIVE BACKEND
DEVELOPMENT**.

## Result Finalisation / Publication Roadmap Supersession — 2026-09-03

This roadmap checkpoint records confirmed project direction.

The current Summative Committee Member Review + Chairman Approval / Final Lock
implementation at commit:

`9035a28cdbd9be8757e2aaf15e924d55cbc2ff60`

is locally/static verified and pushed, but server runtime verification remains pending.

### Revised normal result path

The normal happy-path result workflow now takes priority before broad correction/reopen
expansion.

Planned sequence:

1. runtime-verify the current Member Review + Summative Chairman Approval bundle;
2. consume authoritative locked Final Formative `/40`;
3. consume Chairman-approved locked Summative `/60`;
4. derive final course total `/100`;
5. enforce separate component pass marks:
   - Formative `16/40`;
   - Summative `24/60`;
6. derive authoritative grade / grade point;
7. Examination Committee Chairman finalises the complete result;
8. generate result-document data;
9. implement Average Sheet;
10. implement Tabulation Sheet after institutional format is supplied;
11. implement Student Marksheet after institutional format is supplied;
12. implement Examiner Final Mark Submission Sheet after institutional format is supplied;
13. introduce narrow Controller of Examinations publication authority;
14. publish an immutable/versioned authoritative result snapshot;
15. idempotently ingest the published result into the canonical Lexora published-result
    layer;
16. drive student profile, GPA/CGPA, transcript and permitted downstream features from
    that published-result layer;
17. implement controlled correction/amendment/republication hardening;
18. retain a replaceable result-provider boundary for future `CU_CENTRAL` integration.

### Durable provider boundary

Current provider:

`LEXORA_INTERNAL`

Future provider:

`CU_CENTRAL`

Future University central result processing must be able to replace Lexora's internal
processing without requiring student-profile/GPA/CGPA/transcript consumers to be
redesigned.

Detailed decision:

`docs/result-processing-publication-architecture.md`

The overall final-result workflow remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

<!-- roadmap-summative-committee-runtime-closed-20260918 -->

## Summative Committee Runtime Verification Supersession — 2026-09-18

The roadmap item to runtime-verify the current Committee Member Review +
Summative Chairman Approval / Final Lock bundle is now **completed for the
targeted normal workflow boundary**.

Runtime-verified implementation/fix commit:

`dc5cb5a7cd8307ca5f7aa66b958296cc1edd1bd3`

Verified normal-path evidence includes:

- replacement-aware MEMBER_1 immutable review versioning;
- preserved historical correction evidence;
- current MEMBER_1 v2 `VERIFIED`;
- current MEMBER_2 v1 `VERIFIED`;
- real-PostgreSQL Member timestamp coherence;
- Chairman workspace and exact authority;
- complete four-seat Committee readiness;
- valid External Member metadata;
- authenticated Chairman approval/final lock;
- authoritative locked Summative snapshot `46/60`;
- exact Member-review source binding;
- real-PostgreSQL Chairman timestamp coherence;
- required success audit;
- duplicate final-lock conflict (`409`) with no duplicate durable evidence;
- temporary-auth cleanup and no raw-secret documentation;
- healthy server/runtime state after the verification.

### Current normal-result priority

Broad correction/reopen expansion remains intentionally later work.

The next normal happy-path result boundary should consume:

1. the authoritative locked Final Formative Assessment `/40`;
2. the authoritative Chairman-approved and locked Summative Examination `/60`.

The result layer must then derive server-side:

- total `/100`;
- separate Formative pass/fail using `16/40`;
- separate Summative pass/fail using `24/60`;
- authoritative grade and grade point.

After that, the distinct complete-course-result Chairman finalisation,
result-document generation and Controller of Examinations publication
boundaries remain to be implemented and verified.

### Still pending

The following are not closed by this checkpoint:

- authorised correction/reopen/re-review/re-approval/re-lock;
- approved Summative/result-engine handoff where not yet implemented;
- Final Formative + Summative result integration;
- complete course-result finalisation;
- result-document workflow;
- Controller publication;
- immutable/versioned published-result registry and ingestion;
- mandatory Summative 2FA;
- candidate/exam-roll/physical-script/masking governance;
- confidentiality-filtered reporting/export hardening;
- frontend integration;
- production hardening.

The complete Summative Examination and final-result workflows therefore remain
**PARTIAL / ACTIVE BACKEND DEVELOPMENT**.

<!-- roadmap-formative-activities-30-runtime-closed-20260921 -->

## Formative Activities `/30` Runtime Verification Supersession — 2026-09-21

The ordinary Course Teacher's Formative Activities `/30` management,
marking, feedback, authorised-adjustment and immutable Teacher-submission
slice is now:

**IMPLEMENTED + COMMITTED + PUSHED + DEPLOYED + TARGETED AUTHENTICATED SERVER-RUNTIME VERIFIED**

Runtime-verified implementation commit:

`c61610171a7f2d2b56d906ce6ad5bf717efafae7`

The verified boundary reaches an immutable Teacher:

`MARKS_SUBMITTED`

package for the Activities `/30` component.

The targeted authenticated runtime campaign verified:

- fresh Teacher authority;
- assigned-course enforcement;
- wrong-role denial;
- safe cross-department direct-object denial;
- forged-department-header resistance;
- exact `formative.mark.adjust` permission;
- mandatory adjustment reason;
- append-only mark revision history;
- mandatory written-feedback completion;
- exact `/30` configured weight;
- server-derived weighted marks;
- incomplete-submission rejection;
- real PostgreSQL deferred whole-package completeness rejection;
- exact immutable submission-source binding;
- Teacher-assignment provenance;
- required success audits;
- duplicate-submission conflict;
- post-submission API freeze;
- direct PostgreSQL append-only/freeze protection;
- authenticated read-back;
- live assignment-revocation enforcement.

Verified Teacher submission:

`cmuao7i83001h2iwk21yoxd1v`

Runtime result:

`24.00/30.00`

Rule version:

`FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1`

A first direct-database negative probe used a non-canonical test
`rule_version_code` and was correctly rejected by the database rule-version
check before the intended deferred completeness trigger. The campaign
preserved the existing successful evidence, resumed with the canonical rule
version and then verified the intended deferred trigger.

That event is classified as:

**verification-harness correction; no product defect**

### Formative work still pending

This `/30` runtime closure does not complete the Formative Assessment domain.

Still pending:

- authoritative Attendance `/5` calculation and immutable source evidence;
- authoritative Comprehensive Examination `/5` workflow and source evidence;
- source-backed authority for Formative `VERIFIED`;
- source-backed authority for `APPROVED` / `FINALISED` / `LOCKED` as
  applicable to the final academic workflow;
- controlled post-submission correction/reopen handling;
- authoritative immutable Final Formative `/40`;
- Formative frontend integration.

The Comprehensive Examination `/5` remains an Examination Committee/panel
boundary and must not be assigned to the ordinary Course Teacher.

The current final Formative dependency remains:

`Activities /30 + Attendance /5 + Comprehensive Examination /5 = Final Formative /40`

The final-result workflow must consume the future authoritative locked Final
Formative `/40` together with the already Chairman-approved locked Summative
`/60`.

The overall Formative Assessment workflow therefore remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

The Activities `/30` Teacher-submission slice is closed for the tested normal
runtime boundary; the complete `/40` workflow is not.

<!-- roadmap-regular-comprehensive-local-verified-20260923 -->

## Examination Candidate Registration + Regular Comprehensive /5 Status Supersession — 2026-09-23

The current Regular Comprehensive `/5` status is:

**BACKEND IMPLEMENTED + LOCAL / DISPOSABLE POSTGRESQL VERIFIED;
DEPLOYMENT AND AUTHENTICATED RUNTIME VERIFICATION PENDING**

This section supersedes older statements that the entire authoritative
Comprehensive `/5` backend is still unimplemented, only for this Regular
workflow. Historical evidence remains preserved. It does not place the
workflow in production.

Implemented scope includes explicit POE Chairman-certified candidate
classification, separate from Enrollment, with `REGULAR`, `IRREGULAR` and
`IMPROVEMENT` categories. Only certified REGULAR candidate/course sources
feed this Comprehensive workflow. Classification support does not implement
IRREGULAR or IMPROVEMENT Comprehensive workflows.

Regular Comprehensive supports `ALL_MEMBERS_AVERAGE`, `COURSE_DISTRIBUTED`
and `CHAIRMAN_ONLY` under the exact four-seat Examination Committee. Narrow
appointment-bound External access remains separate from Teacher, Admin and
Summative authority. Exact roster, configuration/allocation provenance,
transaction-coupled first-mark/absence provenance, immutable revisions,
Chairman returns, reason-idempotent absence evidence and immutable final
result/source packages are implemented with exact permissions, department
isolation and required transactional audits.

Local/disposable regression verification passed **574/574**, with **0 failed
and 0 skipped**. The focused Comprehensive service suite passed **78/78**.
Prisma validate/generate and API typecheck/build passed; disposable PostgreSQL
cleanup was confirmed. Reviewed High #1–#3, Medium #1–#3, Medium #4A/#4B and
the Low absence-idempotency finding are closed for this bounded checkpoint.
Detailed verification, negative cases, reconciliation and database actor
assurance limits are recorded in the
[2026-09-23 runtime checklist checkpoint](runtime-test-checklist.md#examination-candidate-registration--regular-comprehensive-examination-5--local--disposable-postgresql-verification-checkpoint--2026-09-23),
which remains the authoritative evidence record.

At the time the verification evidence was generated, the implementation
remained uncommitted and undeployed. This documentation records that
pre-commit verification boundary; it does not assert an implementation
commit hash. The ordinary Lexora database was not accessed, the server
repository was not modified, and deployment/authenticated deployed runtime
verification remain pending.

### Remaining roadmap and component separation

Still pending are Special Comprehensive, IRREGULAR/IMPROVEMENT Comprehensive
workflows, authoritative Attendance `/5`, authoritative Final Formative `/40`
and its `VERIFIED` / `APPROVED` / `FINALISED` / `LOCKED` lifecycle, frontend,
ordinary DB migration, deployment and authenticated deployed runtime
verification. Further result integration/publication remains outside this
checkpoint. DB-derived transition timestamp consistency and audit
target-type/taxonomy polish remain future, non-blocking hardening items.

The already verified Activities `/30` Course Teacher checkpoint is unchanged.
Regular Comprehensive `/5` is a distinct Examination Committee-controlled
component; Attendance `/5` remains pending. These components do not yet
constitute authoritative locked Final Formative `/40`. The complete Formative
and final-result workflows remain **PARTIAL / ACTIVE BACKEND DEVELOPMENT**.

<!-- roadmap-regular-comprehensive-targeted-runtime-closure-20260923 -->

## Regular Comprehensive `/5` Runtime Status Supersession — 2026-09-23

Implementation/runtime baseline:

`abd2505a49c18b7d663152b96d02670e949d6574`

Current classification:

> **Regular Comprehensive core backend is implemented and has strong targeted authenticated Ubuntu server-runtime evidence for Candidate Registration, `ALL_MEMBERS_AVERAGE`, `CHAIRMAN_ONLY`, `COURSE_DISTRIBUTED`, correction/revision, normal Regular absence blocking, Chairman finalisation, immutable evidence and scoped Committee authority.**

This is targeted evidence, **not exhaustive runtime verification**.

Verified core scope includes:

- certified REGULAR candidate source;
- all three configured marking modes;
- mode-specific mark authority;
- correction/revision provenance;
- Chairman return where permitted;
- mode/distribution freeze;
- exact final sources and finalisation idempotency;
- post-final lock;
- Regular absence recording and immutability;
- absence not converted to zero;
- unresolved absence blocking normal marking/finalisation;
- audit evidence;
- temporary authority/credential/session cleanup.

Evidence limitations remain:

- one Regular student in alternate-mode fixtures;
- one applicable course in target alternate modes;
- successful distributed path used internal MEMBER_1;
- successful External distributed marking not exercised;
- multi-course/multi-member distribution not exercised;
- exhaustive server concurrency/security matrix not rerun;
- direct-DB Examination/Committee prerequisite creation was fixture setup only;
- power-cut evidence is service persistence, not transaction crash-consistency testing.

The complete Comprehensive feature therefore remains **PARTIAL**.

Still pending:

- Special Comprehensive lifecycle;
- Special/failure resolution;
- IRREGULAR Comprehensive workflow;
- IMPROVEMENT Comprehensive workflow;
- frontend integration;
- any later exhaustive assurance matrix if required.

A real power cut during the campaign provided additional reboot-persistence evidence: PostgreSQL, Nginx and PM2 returned active, `lexora-api` automatically returned online, direct/Nginx health returned HTTP `200`, and PostgreSQL was not in recovery mode. PM2 PID changed normally from `18530` to `1418`.

### Next focused academic sequence

1. commit this documentation reconciliation;
2. implement authoritative Attendance `/5`;
3. run typecheck/build and focused tests;
4. run targeted authenticated Attendance `/5` runtime verification;
5. implement and lock Final Formative `/40` from Activities `/30` + Attendance `/5` + Comprehensive `/5`;
6. then continue to Final Formative `/40` + locked Summative `/60` result integration.

The existing generic attendance infrastructure is not the authoritative Attendance `/5` calculation.

<!-- roadmap-authoritative-attendance-5-local-disposable-verified-20260924 -->

## Authoritative Formative Attendance `/5` Status Supersession — 2026-09-24

Current authoritative Attendance `/5` backend status:

**BACKEND IMPLEMENTED + INDEPENDENTLY REVIEWED + LOCAL / DISPOSABLE POSTGRESQL VERIFIED;
COMMIT/PUSH, ORDINARY DEPLOYMENT AND AUTHENTICATED RUNTIME VERIFICATION PENDING**

This section supersedes earlier roadmap statements that authoritative Attendance
`/5` is unimplemented or only a rule/foundation boundary, only for the bounded
backend implementation described here.

Historical status text remains preserved as point-in-time evidence.

### Verified backend boundary

Implemented scope now includes:

- server-derived Attendance `/5`;
- rule version
  `FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1`;
- `PRESENT` / `ABSENT` authoritative academic evidence;
- missing/conflicting/unresolved evidence blocking instead of automatic absence;
- exact Batch Coordinator academic authority;
- department + StudentBatch + AcademicTerm scope;
- current Enrollment and CourseOffering revalidation;
- immutable/versioned source packages;
- stale-evidence protection;
- verification/finalisation/locking lifecycle;
- controlled reopen/correction lineage;
- post-lock raw-evidence protection;
- concurrency-safe transitions;
- direct-database academic integrity protection.

The approved period-closure rule is implemented:

> non-cancelled `SCHEDULED` or `ACTIVE` ClassSession present
> → Attendance `/5` cannot be `FINALISED` or `LOCKED`.

Preview/calculation may continue while the period is open.

`VERIFIED` may exist when currently conducted evidence is otherwise resolved.

### Verification status

Local focused result:

- `75` total;
- `74` passed;
- `0` failed;
- `1` expected disposable-PostgreSQL skip.

Final isolated real PostgreSQL result:

- `54` total;
- `54` passed;
- `0` failed;
- `0` skipped.

Migration SHA-256:

`12c981ade6f5f1ed7b4682300e8d52cf873054a475429e3f62818464d09d8b66`

Compiled PostgreSQL verifier SHA-256:

`1361dcd18d24cea2e3141467517220797e748614f85b8a0505c0c107bf800fc3`

The ordinary `lexora_lms` database was not accessed by disposable verification.

### Important non-claims

This checkpoint does not claim:

- implementation commit/push;
- ordinary database migration;
- deployment;
- authenticated application-runtime verification;
- production-grade biometric reconciliation;
- complete Examination Eligibility redesign;
- frontend completion;
- Final Formative `/40` completion.

Attendance `/5` remains separate from Examination Eligibility.

Production biometric sync reconciliation remains a separate hardening backlog.

Changing the historical class set after authoritative Attendance locking remains
a future separately authorised academic workflow.

### Formative component status

Current component boundaries:

- Activities `/30`:
  implemented, committed, pushed, deployed and targeted authenticated
  server-runtime verified for the ordinary Teacher submission boundary;
- Attendance `/5`:
  implemented and local/disposable PostgreSQL verified; commit/deployment and
  authenticated runtime verification remain pending;
- Regular Comprehensive `/5`:
  implemented with strong targeted authenticated runtime evidence for the
  verified Regular scope; the complete Comprehensive feature remains partial.

These components still do **not** constitute authoritative locked Final
Formative `/40`.

The complete Formative workflow therefore remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

### Next focused sequence

1. review the final Attendance `/5` implementation + documentation diff;
2. create one focused implementation/documentation commit and push it;
3. inspect and reconcile the currently dirty Ubuntu server worktree before any
   deployment action;
4. fast-forward the server only after the worktree is understood and clean;
5. create a validated private pre-migration backup;
6. apply the reviewed Attendance migration to the ordinary PostgreSQL database;
7. verify migration history/catalog/drift plus API build and health;
8. run targeted authenticated Attendance `/5` runtime verification;
9. reconcile the resulting deployed runtime evidence in documentation;
10. only then implement authoritative locked Final Formative `/40`;
11. after that continue to locked Final Formative `/40` + locked Summative
    `/60` result integration.

The final result layer must consume authoritative locked Final Formative `/40`;
it must not rebuild that `/40` independently from raw component records.
