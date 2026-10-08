# Formative Assessment

**Current classification (2026-10-07): implemented, ordinary-DB deployed, PM2 activated, targeted authenticated canonical-server runtime verified for the tested Comprehensive idempotent terminal-owner path.** Automatic authoritative Final Formative /40 is closed within that backend/runtime boundary. The complete result workflow remains partial.

The [runtime checklist](runtime-test-checklist.md#current-verified-baseline-index) is implementation proof. The [implementation review](final-formative-materialisation-implementation.md) retains detailed PostgreSQL campaigns, failure diagnosis, migrations/checksums, harness corrections, recovery evidence and operational reconciliation instructions.

## Authoritative components and academic authority

| Component | Current durable boundary | Evidence classification |
| --- | --- | --- |
| Activities /30 | Activity-level Course Teacher submission/correction, then exact Examination Committee Chairman offering-wide finalisation/freeze | Targeted authenticated server/runtime verified 2026-10-05; wider disposable PostgreSQL matrices separately recorded |
| Attendance /5 | Exact Examination Committee Chairman atomic semester/exam-wide generation and irreversible freeze | Authenticated deployed runtime verified 2026-09-30; wider database matrix separately recorded |
| Regular Comprehensive Examination /5 | Certified REGULAR candidate registration, configured marking mode and Chairman-finalised immutable source | Targeted authenticated server/runtime verified 2026-09-23 |
| Final Formative /40 | Automatic exact sum of the three immutable authoritative parents | Targeted authenticated canonical runtime verified 2026-10-07 |

There is **no separate human Final Formative approval/finalisation**. Department Admin, Department Chairman, Course Teacher, Batch Coordinator and Examination Committee Chairman duties are not interchangeable.

### Activities /30

Teachers work only within current assigned offerings and exact permissions. Activity configuration may not exceed total weight /30. Mark capture preserves immutable revisions and server-derived weighted values. Submission is activity-level and versioned; duplicate unchanged submission conflicts. Ordinary post-submission changes are forbidden. Controlled adjustment requires exact authority and a nonblank reason, appends mark evidence, makes the prior package stale and requires a current successor submission.

Chairman finalisation is one whole-offering batch for an ExaminationCourse, not an entire-exam batch or per-student manual approval. It requires complete current activity packages, weights totaling /30, complete roster evidence and current authority. `FORMATIVE_ACTIVITIES_FINAL_30_SUM_V1` binds exact current versions/fingerprints and preserves final per-enrollment marks. Stale packages cannot be bound. Clients cannot supply trusted final marks or source fingerprints. Finalised parent, results, source items and Activities are frozen with required `formative.activities.chairman-finalised` audit. Duplicate finalisation conflicts; no ordinary post-final correction/reopen.

### Attendance /5

Ordinary attendance capture is ACTIVE-session/scheduled-window bound; raw records and scheduled-end/non-conducted session semantics are described in [Academic Core](academic-core.md). Before generation, assigned Teacher, Department Chairman or Department Admin may make explicitly authorized reasoned append-only corrections. Students cannot correct.

Current generation uses Examination Committee Chairman authority and atomically freezes the applicable complete semester/examination evidence. Zero conducted classes, missing/unsupported/conflicting or unresolved evidence, an open academic period, stale source fingerprints or incompatible academic scope block generation. Missing evidence never silently becomes ABSENT. Current resolved values are PRESENT/ABSENT only.

Rule `FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1` evaluates exact present/conducted ratio before display rounding:

| Attendance percentage | Mark /5 |
| --- | --- |
| >=90 | 5 |
| >=85 | 4.5 |
| >=80 | 4 |
| >=75 | 3.5 |
| >=70 | 3 |
| >=65 | 2.5 |
| >=60 | 2 |
| <60 | 0 |

After successful generation there is no ordinary correction, reopen, regeneration or replacement Attendance version. Historical Batch Coordinator READY -> VERIFIED -> FINALISED -> LOCKED/reopen evidence remains preserved but is policy-superseded. Attendance marks and Examination Eligibility remain separate decisions; override reasons and audit are mandatory.

### Comprehensive Examination /5

Certified REGULAR candidate sources preserve exact StudentCurriculumAssignment, student, enrollment, course and registration versions. Tested modes are `ALL_MEMBERS_AVERAGE` (all four required Committee sources), `CHAIRMAN_ONLY` and `COURSE_DISTRIBUTED`. Marking/review/finalisation follows exact current duty, scope and mode. External access is separately controlled; external metadata alone does not confer an ordinary internal login.

Chairman finalisation preserves immutable per-roster results and exact source marks under `COMPREHENSIVE_EXACT_DECIMAL_V1`, including six-decimal precision. The recorded regular pre-finalisation absence path and authority revocation checks do not prove every absence, improvement/retake or exceptional-candidate workflow. Direct-DB fixture setup is not Examination setup API evidence.

## Exact Final Formative source contract


`FormativeFinalResult` / `formative_final_results` contains one complete immutable package.
There is no aggregate workflow status, approval actor, version replacement, partial child
package, client mark input, controller, or HTTP finalisation endpoint.

The unique key is `(departmentId, examinationCourseId, enrollmentId)`. Composite restrictive
foreign keys retain Examination/programme/session/term identity, ExaminationCourse/offering
identity, offering/batch/term identity, and enrollment/student/offering identity. Six further
restrictive references bind:

- Activities finalisation and per-enrollment final result;
- Attendance generation and generated version;
- Comprehensive finalisation and per-roster final result.

The immutable provenance JSON retains Activities source-item/submission/version/fingerprint
identities, Attendance revision and fingerprints, Comprehensive final-source/mark identities,
Regular candidate registration/version/course/roster identities, curriculum assignment/version/course,
syllabus, assessment template, and component rules. Composition uses the single rule
`FINAL_FORMATIVE_40_SUM_V1`.

All awarded/full marks are stored as `Decimal(10,6)`. This preserves the existing Comprehensive
six-place precision. The server uses `Prisma.Decimal.plus`; there is no floating-point mark
calculation and no rounding of authoritative component values. Attendance has no separate
persisted full-mark field; `/5` is resolved from its exact approved rule identity. Numeric
checks enforce 0..30, 0..5, 0..5, and 0..40 and exact addition.

`final_formative_sources(department, examinationCourse, enrollment)` is the intentionally shared
read projection across the three authoritative component owners. It is an internal SQL
contract used by the exported `FinalFormativeService`, with the same contract rechecked by
the deferred database validator. It reads final packages and academic identity/provenance;
it never recalculates raw Activities, Attendance, or Comprehensive marks. It does not recheck
historical actors against today's revocable authority grants.

Missing authoritative parents produce a no-op. Once all parents exist, missing or inconsistent
expected Regular children, scope/provenance mismatches, stale/duplicate packages, and invalid
marks fail closed. Non-candidates and non-Regular candidates have no applicable Regular
Comprehensive source and produce no aggregate. Existing authoritative evidence is returned
only when the resolved complete source package still matches exactly; it is never replaced.


## Transactions, provenance and audit

The exported FinalFormativeService reconciles after authoritative source creation and required audit in Activities finalise, Attendance generate, and Comprehensive finalise (including its existing idempotent-return path). It accepts the source owner's Serializable transaction; source, aggregate and required audits commit or roll back together. No controller or separate HTTP /40 approval endpoint exists.

AssessmentModule and AttendanceModule import FinalFormativeModule; the latter imports PrismaModule, not either source-owning module. The explicit internal SQL projection `final_formative_sources` is the shared read contract and is rechecked by the deferred database validator. It reads immutable final packages rather than recalculating raw component marks or rechecking historical actors against today's revocable grants.

The Examination mutex, deterministic ExaminationCourse/Enrollment ordering, bounded serialization/deadlock retry and unique context key protect concurrent owner arrivals. Database guards require Serializable insertion, exact source/range/full-mark/sum/rule consistency, restrictive provenance, immutable UPDATE/DELETE rejection and a same-transaction matching protected success audit.

`formative.final.materialised` uses the SERVICE actor, not a human approval actor. It records aggregate/context/source identities, snapshots, provenance, rule and total. Exactly one matching success audit accompanies creation; repeated exact reconciliation creates neither a replacement aggregate nor a duplicate success audit. Audit mutation/deletion and duplicate/foreign-transaction audit binding are blocked.

Pre-existing ready triples may be reconciled only through the explicitly authorized operational service/CLI with exact database/scope safeguards. There is no automatic startup backfill or migration-time academic calculation. Detailed operator steps remain in the implementation review.

## Current canonical runtime proof and limits

Implementation `9c407ef4da4eaeb777a72e8cc7ec056f557fcb80` and migration `202610060001_automatic_final_formative` were deployed and activated for the recorded campaign.

The existing Comprehensive-finalisation idempotent terminal-owner request produced exactly one immutable Final Formative result: `24.00 + 3.50 + 4.00 = 31.50 / 40.00` under `FINAL_FORMATIVE_40_SUM_V1`, with exact source/version provenance and exactly one SERVICE success audit. The existing Comprehensive finalisation and its audit each remained at one record.

Unauthenticated access returned 401; Teacher at the Chairman object boundary received expected safe 404 with no aggregate/audit. A repeated Chairman request with forged `x-department-id` remained in the principal's department and produced no duplicates or foreign-department result. Ordinary PostgreSQL UPDATE/DELETE probes against aggregate and protected audit were blocked.

**Evidence boundary:** this did not separately observe a brand-new Comprehensive finalisation's first-ever terminal transaction creating /40. It did not rerun every concurrency, malformed-source, forced-audit-failure, rollback, source-arrival-order, stale-source or conflict scenario on the ordinary server. Wider current-byte PostgreSQL evidence (371/371 PASS) and component/service campaigns remain separate evidence, not broader canonical-runtime claims.

Retain and neutralize immutable runtime academic evidence; do not delete it merely to restore fixture counts. Temporary credentials/sessions are cleaned without recording secrets.

## Next boundary and limitations

Next: **authoritative immutable Final Formative /40 + Chairman-approved/final-locked Summative /60 integration**.

Pending: complete /100, separate 16/40 and 24/60 pass enforcement in the complete engine, grade/grade-point derivation, complete-result Chairman finalisation, official result documents, Controller publication, immutable/versioned published registry and downstream GPA/CGPA/transcript integration. Broader corrections/amendments, exceptional Comprehensive cases, frontend, mandatory Summative 2FA, formal exam-roll/script governance and public/cloud hardening remain outside this closure.
