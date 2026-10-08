# Project status and roadmap

Current-state consolidation of recorded evidence through **2026-10-07**. No runtime campaign or deployment was performed during this documentation review. [Latest runtime proof](runtime-test-checklist.md#current-verified-baseline-index) governs all classifications below.

## 1. Current Baseline

Lexora is a security-first, department-scoped modular-monolith LMS for the Department of Law, University of Chittagong, with future multi-department scope. NestJS/TypeScript, Prisma/PostgreSQL and pnpm form the backend foundation; Next.js provides a partially implemented frontend with verified focused admin/teacher/student workflows.

Implemented academic workflows extend substantially beyond foundation scaffolding. Module registration or a target requirement alone never establishes completion. Academic authority, department isolation, scoped policies, object authorization, audit and immutable source lineage remain mandatory.

## 2. Current Runtime / Deployment State

Latest recorded runtime implementation: `9c407ef4da4eaeb777a72e8cc7ec056f557fcb80`. The 2026-10-07 Final Formative campaign records ordinary PostgreSQL migration `202610060001_automatic_final_formative`, PM2 activation, direct/Nginx health 200 and loopback-only API listener `127.0.0.1:4000` on the Ubuntu VM.

PM2/systemd recovery and Nginx/LAN operation have recorded evidence. Validated private pre-mutation backups and retained/neutralized academic test evidence exist for relevant campaigns. These are point-in-time VM observations, not cloud/public readiness, a production disaster-recovery programme or fresh live health confirmation.

## 3. Module Status Matrix

| Module/boundary | Current classification | Remaining boundary |
| --- | --- | --- |
| Identity/authorization | Implemented MVP; authentication/scoping exercised in server/runtime campaigns | Full 2FA/step-up, email, CSRF, session/risk and cache hardening |
| Academic Core/enrollment | Implemented; scoped APIs and curriculum-aware workflows runtime verified | Remaining curriculum/exception governance and complete UI |
| Curriculum/syllabus/CLO-PLO | Schema/content and focused binding/lifecycle/read boundaries database/server/runtime verified | Full attainment, mapping, Course File and academic-content workflows |
| Course Outline/batches/coordinators | Focused backend transitions through archive runtime verified | Permanent approval/activation/archival authority; amendment/read-selection/content/UI |
| Class Session/ordinary attendance | Scheduled-end lifecycle and reasoned corrections deployed/runtime verified 2026-09-28/29 | Broader UI, external biometric reconciliation |
| Eligibility | Configurable evaluation/override foundation runtime tested | Full institutional and production integrations |
| Generic assessment | Assignment/submission/quiz/attempt API foundation runtime tested | Full grading/question-engine/evaluation/file integration |
| Activities /30 | Targeted authenticated runtime verified 2026-10-05 | Broader post-final amendment and UI |
| Attendance /5 | Chairman generation/irreversible freeze authenticated runtime verified 2026-09-30 | Exceptional post-freeze amendment governance and UI |
| Regular Comprehensive /5 | Targeted authenticated runtime verified 2026-09-23 | Exceptional/non-Regular cases and full product/UI |
| Automatic Final Formative /40 | Targeted canonical runtime verified 2026-10-07, tested Comprehensive idempotent owner path | /40 + /60 integration; broader ordinary-server matrices not claimed |
| Summative /60 | Blind marking/comparison/Third calculation runtime matrices; targeted Committee/Chairman final lock 2026-09-18 | Broader reopen/amendment, 2FA, formal physical-script governance, UI |
| Generic results/GPA/CGPA | Implemented runtime-tested foundation | Authoritative /100 engine, complete-result finalisation and new publication/registry workflow |
| Transcript | Snapshot/token/revocation API foundation runtime tested | Published registry linkage, PDF/QR/signature/rendering and complete UI |
| Notification/notice | In-app/API foundations with runtime evidence | Real email/push, queue delivery, full template/UI workflows |
| File storage/malware scan | Real isolated MinIO/ClamAV paths and database worker foundation verified; deployed default-disabled worker idle runtime tested | Actionable jobs, active-operation shutdown, atomicity/reconciliation and authorized production upload/download |
| Frontend | Focused sign-in/session/route, academic admin and assigned/enrolled course panels runtime verified | Complete LMS and authoritative academic workflows |
| Discussion/reporting/integration | Partial/foundation or pending except separately recorded surfaces | Full product functionality |
| Public/cloud operations | Pending/future hardening | HTTPS/domain, monitoring, backups/restore operations, production security and release evidence |

## 4. Runtime-Verified / Closed Boundaries

“Closed” means only the recorded tested boundary. The runtime index links each latest applicable checkpoint.

- Student own-resource and Teacher assigned-course isolation retests, safe object denials and principal-derived department/header resistance.
- Academic structure, exact curriculum/enrollment/syllabus lineage and scoped governance; Course Outline technical lifecycle through ACTIVE -> ARCHIVED with transaction/audit checks.
- Class Session scheduled-end/non-conducted handling and explicit reasoned ordinary Attendance correction.
- Examination Committee Chairman irreversible Attendance /5 generation; activity-level Activities submissions/corrections and Chairman /30 finalisation.
- Certified Regular Comprehensive modes and immutable exact Decimal final sources.
- Automatic Final Formative /40 through the tested existing Comprehensive idempotent terminal-owner path; source provenance, idempotency and aggregate/protected-audit immutability.
- Summative blind First/Second, variance/Third/nearest-pair matrices and targeted internal Member review + Chairman /60 final lock.
- Generic result/transcript and in-app notification foundations, with their own narrower runtime scope.

## 5. Partial Boundaries

The overall LMS, assessment and result products remain partial. Generic results are not authoritative Law /100 processing. Generic transcript status selection still includes AMENDED and must be reconciled with explicit published-version evidence. Course Outline technical approval does not establish permanent institutional authority. Scan worker idle verification does not prove actionable production delivery.

Canonical Final Formative testing did not separately observe a first-ever Comprehensive finalisation creating /40. Wider PostgreSQL failure/concurrency/source-order matrices remain separately classified. Preserve negative findings and limitations even where later retests close the corresponding defect.

## 6. Pending Boundaries

Authoritative /100 composition/pass/grade engine; complete-result Chairman finalisation; official documents; Controller publication; immutable/versioned published registry; downstream result consumption; broad controlled amendments/republication; future CU_CENTRAL integration. Full frontend, remaining curriculum/OBE/Course File content, production biometric sync, real email/push and production infrastructure also remain pending.

Detailed risks and required improvements belong to the [hardening backlog](security-and-production-hardening-backlog.md), not a duplicated roadmap checklist.

## 7. Current Academic Result Pipeline

Activities /30 (Chairman finalised) + Attendance /5 (Chairman generated/frozen) + Comprehensive /5 (Chairman finalised) -> automatic immutable Final Formative /40 under FINAL_FORMATIVE_40_SUM_V1.

Offline First/Second marks -> comparison (>=15% of authoritative /60 triggers Third) -> nearest-pair calculation where needed -> current internal Member reviews -> Chairman-approved/final-locked Summative /60.

**Pending connection:** exact /40 + exact /60 -> /100 with separate Formative >=16 and Summative >=24 -> grade/grade point -> complete-result Chairman finalisation -> official result documents -> Controller publication -> immutable/versioned published registry -> student result/GPA/CGPA/transcript consumers.

No separate human /40 approval; Summative Chairman lock does not finalise the complete course result. Controller publication never grants mark editing or Committee/Chairman authority.

## 8. Immediate Next Development Boundary

**Authoritative immutable Final Formative /40 + Chairman-approved/final-locked Summative /60 integration.**

Consume exact authoritative versions/provenance; do not reconstruct raw Activities or Examiner arithmetic, accept client totals, or treat an unapproved calculated mark as final. Build /100 and separate 16/40 + 24/60 pass decisions server-side with department/object authorization, idempotency, locks and transactional audit. This is new implementation work, not part of Phase 1 documentation.

## 9. Near-Term Roadmap

1. Close the /40 + /60 integration and complete-course total/pass/grade boundary with scoped evidence.
2. Implement complete-result Chairman finalisation without manual component override.
3. Establish official document data/output contracts: Average Sheet initial design; institutional formats required for Tabulation, Student Marksheet and Examiner Final Mark Submission Sheet.
4. Implement narrow Controller publication and immutable/versioned published snapshots.
5. Add idempotent published registry ingestion and controlled GPA/CGPA/transcript consumption with source provenance.
6. Extend controlled amendment/supersession/republication, preserving history and centralized recalculation.
7. Complete frontend and independently scoped academic governance/integration work; prepare future CU_CENTRAL provider compatibility.
8. Close production/security backlog with explicit verification before public deployment.

## 10. Production Readiness Summary

**Not production ready.** Verified local/VM academic boundaries and isolated infrastructure evaluations do not establish full public security or operational readiness. Mandatory privileged/Summative 2FA, CSRF/session controls, public HTTPS/cloud deployment, monitoring, operational backup/restore assurance and authorized production file delivery remain unresolved. Production file upload remains disabled in the latest applicable evidence.

## 11. Canonical Documentation References

The [documentation map](README.md) assigns every canonical responsibility. [Product specification](product-specification.md) is target scope; [architecture/security](architecture-security.md) defines invariants; [runtime checklist](runtime-test-checklist.md#current-verified-baseline-index) owns proof; [hardening backlog](security-and-production-hardening-backlog.md) owns risks. [Academic Core](academic-core.md), [Assessment Core](assessment-core.md), [Formative](formative-assessment.md), [Summative](summative-examination.md), [Result Domain](result-domain.md), [Transcript](transcript-verification.md) and [Notification](notification.md) own their contracts.

Original chronology is retained in [the Phase-1 snapshot](legacy/phase-1/project-status-and-roadmap.md) and runtime ledger. Future current-state edits should use Git history instead of more status supersession blocks.
