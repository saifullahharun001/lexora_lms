# Result Processing Foundation

## Strategy Explanation

The result-processing foundation sits downstream from the academic core and assessment core. It does not replace grading, attendance, or eligibility logic. Instead, it consumes finalized academic signals, computes course-level results, derives term GPA and cumulative CGPA, governs publication, and preserves amendment integrity through append-oriented audit trails.

This design follows these rules:

- every result-processing record is department-scoped
- `ResultRecord` is the course-level result anchor and is tied to one `Enrollment` plus one `CourseOffering`
- result components are derived from grading records and stored as computation snapshots
- grade mapping is controlled by department-configured grade scales
- GPA is term-bound and computed from published result records
- CGPA is cumulative and recomputed from published term history
- teachers may prepare or trigger draft computation only for assigned course offerings
- publication locks records against direct overwrite
- amendments are append-based, auditable, and step-up protected

This phase does not implement transcript generation, transcript issuance, certificate rendering, or student-facing result APIs.

## Domain Model

### ResultRecord

- One record per `Enrollment` plus `CourseOffering`
- Stores computation status, eligibility gate outcome, normalized percentage, letter grade, grade point, quality points, and immutable publication snapshot fields
- Carries term and credit-hour snapshots so later GPA/CGPA computation does not depend on mutable course catalog data
- Becomes the authoritative course-level result after publication

### ResultComponent

- Child of `ResultRecord`
- Represents one weighted result component derived from one grading source at computation time
- Stores raw score, max score, normalized percentage, weighted contribution, and source snapshot metadata
- Allows assignment and quiz grading records to remain unchanged while results preserve the exact computation basis

### GradeScale

- Department-configurable grading policy
- Defines the grading system used by result computation for a department or department workflow
- Stores pass thresholds, default activation, and settings JSON for future grading-policy expansion

### GradeRule

- Child of `GradeScale`
- Maps percentage ranges to letter grades and grade points
- Ordered by `sortOrder` so overlapping or descending ranges can be validated deterministically
- Supports pass/fail distinction independently from grade-point value

### GPARecord

- Term-based aggregate for one student in one academic term
- Computed from published grade-bearing `ResultRecord` values
- Stores attempted credits, earned credits, quality points, GPA, and computation snapshot metadata

### CGPARecord

- Cumulative aggregate for one student across published terms
- Stores cumulative attempted credits, earned credits, cumulative quality points, CGPA, and the latest term included in the aggregation
- Remains independent from transcript rendering

### ResultPublicationBatch

- Term-scoped operational batch for publication
- Tracks a publication run across result records, GPA records, and CGPA refreshes
- Stores processing state, counts, selection snapshot, publisher identity, and failure reason

### ResultAmendmentRecord

- Append-only amendment trail for published results
- Stores requested, approved, rejected, and applied metadata without directly overwriting the published record history
- Links to the result record and may link to `OverrideAction` for audit-compliance coordination

## Prisma Schema Additions

Added enums:

- `ResultRecordStatus`
- `ResultPublicationBatchStatus`
- `ResultAmendmentStatus`
- `ResultComponentSourceType`

Added models:

- `GradeScale`
- `GradeRule`
- `ResultRecord`
- `ResultComponent`
- `GPARecord`
- `CGPARecord`
- `ResultPublicationBatch`
- `ResultAmendmentRecord`

Added relations on existing models:

- `Department`
  - `gradeScales`
  - `resultRecords`
  - `resultComponents`
  - `gpaRecords`
  - `cgpaRecords`
  - `resultPublicationBatches`
  - `resultAmendmentRecords`
- `User`
  - `gradeScalesUpdated`
  - `resultsComputed`
  - `resultsVerified`
  - `resultsPublished`
  - `gpaStudentRecords`
  - `gpaRecordsComputed`
  - `gpaRecordsPublished`
  - `cgpaStudentRecords`
  - `cgpaRecordsComputed`
  - `cgpaRecordsPublished`
  - `resultPublicationBatchesInitiated`
  - `resultPublicationBatchesPublished`
  - `resultAmendmentsRequested`
  - `resultAmendmentsApproved`
  - `resultAmendmentsApplied`
- `AcademicTerm`
  - `resultRecords`
  - `gpaRecords`
  - `cgpaRecordsAsOf`
  - `resultPublicationBatches`
- `CourseOffering`
  - `resultRecords`
- `Enrollment`
  - `resultRecords`
- `GradingRecord`
  - `resultComponents`
- `OverrideAction`
  - `resultAmendments`

Representative Prisma additions:

```prisma
enum ResultRecordStatus {
  DRAFT
  COMPUTED
  VERIFIED
  PUBLISHED
  LOCKED
  AMENDED
}

enum ResultPublicationBatchStatus {
  PENDING
  PROCESSING
  PUBLISHED
  FAILED
}

enum ResultAmendmentStatus {
  REQUESTED
  APPROVED
  REJECTED
  APPLIED
}

model GradeScale {
  id              String    @id @default(cuid())
  departmentId    String    @map("department_id")
  code            String
  name            String
  isDefault       Boolean   @default(false) @map("is_default")
  isActive        Boolean   @default(true) @map("is_active")
  passGradePoint  Decimal?  @db.Decimal(4, 2) @map("pass_grade_point")
  passPercentage  Decimal?  @db.Decimal(5, 2) @map("pass_percentage")
  settingsJson    Json?     @map("settings_json")
  updatedByUserId String?   @map("updated_by_user_id")
  archivedAt      DateTime? @map("archived_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
}

model GradeRule {
  id            String   @id @default(cuid())
  gradeScaleId  String   @map("grade_scale_id")
  sortOrder     Int      @default(0) @map("sort_order")
  minPercentage Decimal  @db.Decimal(5, 2) @map("min_percentage")
  maxPercentage Decimal  @db.Decimal(5, 2) @map("max_percentage")
  letterGrade   String   @map("letter_grade")
  gradePoint    Decimal  @db.Decimal(4, 2) @map("grade_point")
  isPassing     Boolean  @default(true) @map("is_passing")
  isActive      Boolean  @default(true) @map("is_active")
}

model ResultRecord {
  id                    String             @id @default(cuid())
  departmentId          String             @map("department_id")
  academicTermId        String             @map("academic_term_id")
  courseOfferingId      String             @map("course_offering_id")
  enrollmentId          String             @map("enrollment_id")
  gradeScaleId          String             @map("grade_scale_id")
  publicationBatchId    String?            @map("publication_batch_id")
  status                ResultRecordStatus @default(DRAFT)
  eligibilityStatus     EligibilityStatus  @default(PENDING_REVIEW) @map("eligibility_status")
  totalRawScore         Decimal?           @db.Decimal(8, 2) @map("total_raw_score")
  normalizedPercentage  Decimal?           @db.Decimal(5, 2) @map("normalized_percentage")
  letterGrade           String?            @map("letter_grade")
  gradePoint            Decimal?           @db.Decimal(4, 2) @map("grade_point")
  creditHoursSnapshot   Decimal            @db.Decimal(4, 2) @map("credit_hours_snapshot")
  qualityPoints         Decimal?           @db.Decimal(8, 2) @map("quality_points")
  isPublished           Boolean            @default(false) @map("is_published")
  computedSnapshotJson  Json?              @map("computed_snapshot_json")
  publishedSnapshotJson Json?              @map("published_snapshot_json")
}

model ResultComponent {
  id                   String                    @id @default(cuid())
  departmentId         String                    @map("department_id")
  resultRecordId       String                    @map("result_record_id")
  gradingRecordId      String?                   @map("grading_record_id")
  sourceType           ResultComponentSourceType @map("source_type")
  componentCode        String                    @map("component_code")
  componentName        String                    @map("component_name")
  weightPercent        Decimal                   @db.Decimal(5, 2) @map("weight_percent")
  rawScore             Decimal                   @db.Decimal(8, 2) @map("raw_score")
  maxScore             Decimal                   @db.Decimal(8, 2) @map("max_score")
  normalizedPercentage Decimal                   @db.Decimal(5, 2) @map("normalized_percentage")
  weightedScore        Decimal                   @db.Decimal(8, 2) @map("weighted_score")
  isIncluded           Boolean                   @default(true) @map("is_included")
  sourceSnapshotJson   Json?                     @map("source_snapshot_json")
}

model GPARecord {
  id                 String   @id @default(cuid())
  departmentId       String   @map("department_id")
  academicTermId     String   @map("academic_term_id")
  studentUserId      String   @map("student_user_id")
  publicationBatchId String?  @map("publication_batch_id")
  attemptedCredits   Decimal  @db.Decimal(6, 2) @map("attempted_credits")
  earnedCredits      Decimal  @db.Decimal(6, 2) @map("earned_credits")
  qualityPoints      Decimal  @db.Decimal(8, 2) @map("quality_points")
  gpa                Decimal  @db.Decimal(4, 2)
}

model CGPARecord {
  id                      String   @id @default(cuid())
  departmentId            String   @map("department_id")
  studentUserId           String   @map("student_user_id")
  asOfAcademicTermId      String?  @map("as_of_academic_term_id")
  publicationBatchId      String?  @map("publication_batch_id")
  attemptedCredits        Decimal  @db.Decimal(6, 2) @map("attempted_credits")
  earnedCredits           Decimal  @db.Decimal(6, 2) @map("earned_credits")
  cumulativeQualityPoints Decimal  @db.Decimal(10, 2) @map("cumulative_quality_points")
  cgpa                    Decimal  @db.Decimal(4, 2)
}

model ResultPublicationBatch {
  id                    String                       @id @default(cuid())
  departmentId          String                       @map("department_id")
  academicTermId        String                       @map("academic_term_id")
  batchCode             String                       @map("batch_code")
  name                  String
  status                ResultPublicationBatchStatus @default(PENDING)
  resultCount           Int                          @default(0) @map("result_count")
  gpaCount              Int                          @default(0) @map("gpa_count")
  cgpaCount             Int                          @default(0) @map("cgpa_count")
  selectionSnapshotJson Json?                        @map("selection_snapshot_json")
  failureReason         String?                      @map("failure_reason")
}

model ResultAmendmentRecord {
  id                   String                @id @default(cuid())
  departmentId         String                @map("department_id")
  resultRecordId       String                @map("result_record_id")
  overrideActionId     String?               @map("override_action_id")
  status               ResultAmendmentStatus @default(REQUESTED)
  reason               String
  requestedByUserId    String                @map("requested_by_user_id")
  approvedByUserId     String?               @map("approved_by_user_id")
  appliedByUserId      String?               @map("applied_by_user_id")
  requestSnapshotJson  Json?                 @map("request_snapshot_json")
  previousSnapshotJson Json?                 @map("previous_snapshot_json")
  appliedSnapshotJson  Json?                 @map("applied_snapshot_json")
}
```

## Enums

### Result Records

- `DRAFT`
- `COMPUTED`
- `VERIFIED`
- `PUBLISHED`
- `LOCKED`
- `AMENDED`

### Publication Batches

- `PENDING`
- `PROCESSING`
- `PUBLISHED`
- `FAILED`

### Amendment Records

- `REQUESTED`
- `APPROVED`
- `REJECTED`
- `APPLIED`

## Computation Model

### Source Collection

- result computation reads the effective grading record for each assignment submission and quiz attempt tied to the target enrollment and offering
- if multiple grading records exist for the same assessment target, the latest approved record is the effective source, with regrade records superseding prior grades
- attendance and eligibility are read as gating signals, not as grading sources

### Assignment and Quiz Aggregation

- each included assessment source becomes a `ResultComponent`
- component raw score comes from `GradingRecord.pointsAwarded`
- component max score comes from the assessment definition snapshot used at compute time
- result computation may aggregate multiple low-stakes assessments into one logical component in the snapshot, but the default foundation keeps one effective assessment source per component for auditability

### Weighting

- each component has an explicit `weightPercent`
- sum of included component weights must equal `100.00` for a normal graded course
- if a course uses pass/fail or special grading, the grade scale `settingsJson` may declare an alternate weighting contract

Formula:

```text
component_normalized_percentage = (raw_score / max_score) * 100
component_weighted_score = component_normalized_percentage * (weight_percent / 100)
result_normalized_percentage = sum(component_weighted_score)
```

### Normalization Strategy

- normalize every component to a 0-100 percentage before weighting
- keep both raw and normalized values in `ResultComponent` so later audits can distinguish score capture from weighted contribution
- round only at stable boundaries:
  - component normalized percentage: 2 decimals
  - weighted score: 2 decimals
  - final result percentage: 2 decimals
  - grade point, GPA, and CGPA: 2 decimals

### Grade Mapping

- once final normalized percentage is computed, match the first active `GradeRule` whose range contains the percentage
- resolved output is:
  - percentage
  - letter grade
  - grade point
  - pass/fail outcome

### GPA and CGPA

- term GPA uses published `ResultRecord` values for one student in one academic term
- quality points per course:

```text
quality_points = grade_point * credit_hours_snapshot
```

- GPA:

```text
GPA = sum(term quality points) / sum(term attempted credits)
```

- CGPA:

```text
CGPA = sum(all published quality points to date) / sum(all published attempted credits to date)
```

- dropped, withdrawn, archived, or non-grade-bearing results should be excluded according to scale settings and result eligibility state

### Eligibility Gating

- result computation is allowed only when enrollment belongs to the same offering and department
- teacher-initiated draft preparation or draft computation must be restricted to offerings backed by an active `TeacherCourseAssignment`
- result verification and publication additionally require:
  - enrollment status is academically valid for grading
  - offering lifecycle is at least completion-ready
  - attendance rule outcome does not block publication if enforcement is enabled
  - eligibility status is not `INELIGIBLE`
- if gating fails, the record may remain `COMPUTED` with eligibility metadata but must not become `VERIFIED` or `PUBLISHED`

## Rules and Constraints

- result is tied to `Enrollment` plus `CourseOffering`; uniqueness is enforced by `@@unique([enrollmentId, courseOfferingId])`
- result department, term, offering, enrollment, and grade scale must all resolve inside the same department
- result components are derived from grading records and stored as snapshots; grading records remain the upstream truth
- attendance and eligibility can block verification or publication even when scores are computable
- grade scale is department-configurable and versionable through `GradeScale` plus `GradeRule`
- GPA is term-based and unique per student plus academic term
- CGPA is cumulative and unique per student
- once published, a result transitions to `LOCKED`; normal services must reject direct mutation
- published result changes must go through `ResultAmendmentRecord`
- no direct overwrite of a published result is allowed; amendment applies a new computed snapshot and marks the result `AMENDED`
- amendment requires audit, override correlation, and step-up authentication
- regrade propagation must recalculate the affected `ResultRecord` and then refresh the dependent GPA and CGPA aggregates

## Authorization and Audit Notes

### Authorization

Within the current Lexora role set, the cleanest foundation is:

- prepare result drafts or trigger draft computation:
  - `teacher`, but only for assigned course offerings
  - `department_admin`
  - internal system worker acting as service principal for scheduled draft-generation runs
- compute results:
  - `department_admin`
  - internal system worker acting as service principal for scheduled/bulk runs
- verify results:
  - `department_admin`
  - exam office or equivalent administrative result authority
  - recommend segregation of duties so verifier is not the original computer when feasible
- publish results:
  - `department_admin`
  - exam office or equivalent administrative result authority
  - step-up required
- amend results:
  - `department_admin`
  - exam office or equivalent administrative result authority
  - step-up required
  - approval path should prefer a separate approver from the requester for high-risk amendments
- read department results:
  - `department_admin`
  - `auditor`
- read own result:
  - `student` after publication according to self-scope policy
- teacher:
  - may supply grading evidence upstream
  - may prepare result drafts or trigger draft computation for assigned offerings only
  - must not verify, publish, or amend final results in this foundation

Administrative finalization authority:

- final result verification and publication belong to admin or exam-office workflows, not teacher workflows
- published result amendments remain admin-only, audit-mandatory, and step-up protected

Recommended step-up behavior:

- reuse `STEP_UP_POLICY_NAMES.RESULT_OVERRIDE` immediately for amendment application
- introduce dedicated result-compute and result-publish step-up policies later if controller flows need separate challenge behavior

### Mandatory Audit Events

- computation start or batch start
- result computed
- result verification
- publication batch created
- publication batch processing started
- result published
- result locked
- GPA computed
- CGPA computed
- amendment requested
- amendment approved
- amendment rejected
- amendment applied
- regrade propagated to result/GPA/CGPA
- denied attempt to mutate a locked or published result directly

## NestJS Scaffolding

Folder shape:

```text
result-processing/
  application/
    ports/
    services/
  contracts/
  domain/
```

Public contracts:

- `ResultRecord`
- `ResultComponent`
- `GradeScale`
- `GradeRule`
- `GPARecord`
- `CGPARecord`
- `ResultPublicationBatch`
- `ResultAmendmentRecord`

Repository boundary:

- repository port owns persistence for result records, components, grade scales/rules, GPA/CGPA aggregates, publication batches, and amendments
- grading, attendance, enrollment, offering, and eligibility source data must be consumed through module boundaries or query adapters later, not by embedding cross-module business rules in the repository port

Service boundary:

- service orchestrates computation, verification, publication locking, GPA/CGPA refresh, amendment approval/application, and regrade propagation
- service must enforce immutable-after-publication behavior

Policy names:

- `result-processing.result.read`
- `result-processing.result.draft.prepare`
- `result-processing.result.compute`
- `result-processing.result.verify`
- `result-processing.result.publish`
- `result-processing.result.amend`
- `result-processing.grade-scale.manage`
- `result-processing.gpa.read`
- `result-processing.publication-batch.read`

Audit events:

- `result-processing.grade-scale.created`
- `result-processing.grade-scale.updated`
- `result-processing.result.computed`
- `result-processing.result.verified`
- `result-processing.result.published`
- `result-processing.result.locked`
- `result-processing.gpa.computed`
- `result-processing.cgpa.computed`
- `result-processing.publication-batch.created`
- `result-processing.publication-batch.processing`
- `result-processing.publication-batch.published`
- `result-processing.publication-batch.failed`
- `result-processing.amendment.requested`
- `result-processing.amendment.approved`
- `result-processing.amendment.rejected`
- `result-processing.amendment.applied`
- `result-processing.regrade.propagated`

Implemented scaffolding files:

- `apps/api/src/modules/result-processing/contracts/result-processing.contracts.ts`
- `apps/api/src/modules/result-processing/application/ports/result-processing.repository.port.ts`
- `apps/api/src/modules/result-processing/application/services/result-processing.service.ts`
- `apps/api/src/modules/result-processing/domain/result-processing.policy-names.ts`
- `apps/api/src/modules/result-processing/domain/result-processing.audit-events.ts`

## Document Content

This document is intentionally limited to result-processing foundations. Transcript generation, transcript issuance, transcript rendering, and certificate rendering stay out of scope until result computation, locking, publication, and amendment semantics are stable.
