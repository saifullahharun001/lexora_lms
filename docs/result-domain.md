# Result Domain

**Current classification:** generic result-processing foundation implemented with recorded runtime tests; authoritative complete-course result engine and publication/registry boundary **pending**. Formative /40 and Summative /60 have separately bounded runtime proof. See the [runtime index](runtime-test-checklist.md#current-verified-baseline-index).

The newer finalisation/publication architecture is authoritative wherever older generic foundation wording conflicts. Generic result computation/publication APIs below remain a current implementation surface; they are not the new Chairman/Controller academic authority workflow.

## Current implementation versus target

| Boundary | Classification |
| --- | --- |
| Grade scales, generic GradingRecord-based compute, verify/publish/lock, amendment foundation, term GPA/CGPA | Implemented; recorded server/runtime-tested foundation, not complete Law result processing |
| Activities /30, Attendance /5 and Regular Comprehensive /5 | Implemented; component-specific server/runtime or targeted runtime evidence |
| Automatic authoritative Final Formative /40 | Targeted canonical runtime verified 2026-10-07 for existing Comprehensive idempotent terminal-owner path |
| Summative Examiner calculation and Committee Chairman /60 final lock | Implemented; tested runtime matrices and targeted Committee runtime 2026-09-18 |
| /40 + /60 integration, /100, separate 16/40 and 24/60 pass engine, final grade/grade point | Pending |
| Complete-result Chairman finalisation and official documents | Pending |
| Controller publication, immutable/versioned published registry, provider ingestion and downstream integration | Pending |
| CU_CENTRAL integration and broader amendment/republication hardening | Future/pending |

## Existing generic foundation domain


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


## Existing generic API (implemented foundation)

These routes are retained current APIs, not proof of institutional Controller publication. All require AuthGuard, PolicyGuard, @RequirePolicy() and principal-derived department context. Students are own-resource scoped; Teachers can prepare/compute only assigned offerings and cannot verify, publish, approve/apply amendments or manage grade scales.

The existing department_admin/exam_office publication authority is limited to this legacy foundation. It must not substitute for the future Controller authority required below.

## Endpoints

| Method | Path | Policy | Description |
| --- | --- | --- | --- |
| POST | `/grade-scales` | `result-processing.grade-scale.manage` | Create a grade scale and optional grade rules. |
| GET | `/grade-scales` | `result-processing.grade-scale.read` | List grade scales. |
| GET | `/grade-scales/:id` | `result-processing.grade-scale.read` | Get one grade scale. |
| PATCH | `/grade-scales/:id` | `result-processing.grade-scale.manage` | Update a grade scale and optionally replace rules. |
| POST | `/results/compute` | `result-processing.result.compute` | Compute draft result records from grading records. |
| GET | `/results` | `result-processing.result.read` | List result records. Students only see their own records. |
| GET | `/results/:id` | `result-processing.result.read` | Get one result record. |
| POST | `/results/:id/verify` | `result-processing.result.verify` | Verify a computed result. |
| POST | `/results/:id/publish` | `result-processing.result.publish` | Publish and lock a verified result. |
| POST | `/gpa/compute-term` | `result-processing.gpa.compute` | Compute term GPA from published results. |
| GET | `/gpa` | `result-processing.gpa.read` | List GPA records. |
| GET | `/cgpa` | `result-processing.gpa.read` | List or compute-and-read CGPA records. |
| POST | `/result-publications` | `result-processing.publication.manage` | Create a result publication batch record. |
| GET | `/result-publications` | `result-processing.publication.manage` | List publication batches. |
| GET | `/result-publications/:id` | `result-processing.publication.manage` | Get one publication batch. |
| POST | `/result-amendments` | `result-processing.amendment.request` | Request an amendment for a published or locked result. |
| GET | `/result-amendments` | `result-processing.amendment.request` | List amendment records. |
| POST | `/result-amendments/:id/approve` | `result-processing.amendment.approve` | Approve a requested amendment. |
| POST | `/result-amendments/:id/apply` | `result-processing.amendment.apply` | Apply an approved amendment. |

## Pagination

The high-volume list endpoints below accept `limit` and `offset` query parameters. `limit`
defaults to `50` and is capped at `100`; `offset` defaults to `0`.

- `GET /results`
- `GET /result-publications`
- `GET /result-amendments`

## Security Constraints

- Every repository query and update is scoped by `departmentId`.
- Cross-department access is rejected by guards and repeated in service/repository checks.
- Teachers can compute draft results only for course offerings where they have an active teacher assignment.
- Teachers cannot verify, publish, approve amendments, apply amendments, or manage grade scales.
- Department admin or exam-office authority is required for verification, publication, GPA computation, grade scale management, publication management, amendment approval, and amendment application.
- Computation only writes `DRAFT` or `COMPUTED` result records. `VERIFIED`, `PUBLISHED`, `LOCKED`, and `AMENDED` records are not directly overwritten.
- Published or locked corrections must use the append-only amendment request, approval, and apply flow.
- Sensitive actions write audit log entries.
- Safe `updateMany` plus `findFirst` transaction patterns are used for status transitions and guarded updates.

## Computation MVP

- Result computation reads existing `GradingRecord` rows for an offering.
- Components are derived from assignment submissions and quiz attempts where linked.
- Component scores are normalized against assignment or quiz max points and weighted evenly for MVP.
- Percentages are mapped through active `GradeRule` rows from the selected or default grade scale.
- Result records store normalized percentage, letter grade, grade point, credit snapshot, quality points, and computation snapshot JSON.
- GPA is computed from published result records for an academic term.
- CGPA is computed from cumulative GPA records.

Transcript, notification, frontend, and full publication workflow side effects are intentionally out of scope.


## Durable generic computation and amendment constraints

Generic components preserve raw/max/normalized scores and source snapshots. The MVP normalizes assignment/quiz grading and weights components evenly; configurable explicit weights must sum to 100 for a normal graded course. Special pass/fail grading requires an explicit scale contract. GradeScale/GradeRule preserve department configuration and active range mapping.

Generic foundation rounding at stable boundaries is two decimal places; this must not round or reconstruct authoritative Formative component values (which preserve six-place Decimal precision) or substitute for the future authoritative grade engine.

Quality points = grade point * credit snapshot. Term GPA = published term quality points / attempted credits; CGPA = cumulative published quality points / attempted credits, excluding non-grade-bearing/dropped/withdrawn/archived outcomes according to valid academic policy. Eligibility, attendance enforcement, valid enrollment and completion-ready offering state are publication gates, not replacement grading sources. Runtime verification of every design gate is not implied.

DRAFT/COMPUTED may be recomputed; VERIFIED/PUBLISHED/LOCKED/AMENDED cannot be directly overwritten. Published changes require append-oriented request/approval/apply history, reasons, audit and controlled GPA/CGPA recalculation. Separate approver and step-up are required security design; full challenge enforcement remains pending. Preserve prior published snapshots and source versions; applying a generic AMENDED status is not proof of the new registry's versioned republication.

Audit computation, verification, publication/batches/locks, GPA/CGPA computation, amendment request/approval/rejection/application and denied direct locked-result mutation. Use scoped guarded transactions; no cross-department bypass or client-header override.

## Authoritative complete-course result and publication contract (pending engine)

The following contract is confirmed target architecture, not implementation evidence. The Formative source is the now-materialised immutable automatic Final Formative /40, with **no separate human /40 approval**. The Summative source is exact Chairman-approved/final-locked /60. Generic GradingRecord arithmetic is not an alternative source.

## Confirmed Component Structure and Pass Rules

The final course result uses two separately authoritative components:

- locked Formative Assessment: `/40`;
- approved and locked Summative Examination: `/60`.

Course total:

`Formative /40 + Summative /60 = Total /100`

The student must pass both components separately.

Confirmed pass thresholds:

- Formative Assessment: **16 out of 40**;
- Summative Examination: **24 out of 60**.

A student who fails either required component does not pass the course merely because the combined numerical total reaches 40 or another overall grade boundary.

The exact source versions used for both components must remain preserved.

## Formative Source

The final course-result workflow must consume the authoritative **locked Final Formative Assessment /40 produced by the Formative workflow**.

The Result Processing layer must not independently reconstruct formative marks from raw activities when a locked authoritative Formative total already exists.

The locked Formative source identity/version must be preserved in final-result evidence.

## Summative Source

The Summative contribution must come from the exact Chairman-approved and final-locked Summative calculation.

The final-result workflow must not:

- recompute Examiner arithmetic independently;
- select a different nearest pair;
- accept a client-provided Summative value;
- consume an unapproved calculated Summative mark.

The exact calculated-mark version and Chairman approval/final-lock evidence must remain bound to the final result.

## Examination Committee Chairman Finalisation

Two Chairman boundaries must be distinguished.

### 6.1 Summative approval

The existing Summative workflow ends with the Examination Committee Chairman approving and final-locking the Summative `/60`.

### 6.2 Final course-result finalisation

After authoritative Formative `/40` and Chairman-approved Summative `/60` are combined, the **Examination Committee Chairman is the academic authority that finalises the complete course/result set** before official result documents are produced for publication.

This final-result finalisation is a future implementation boundary and must not be confused with the already implemented Summative-only Chairman approval.

The Chairman must not manually override server-derived component values, total, grade, or pass/fail state.

## Official Result Documents

After Examination Committee Chairman finalisation, the system must be able to generate required official result documents.

Confirmed document outputs are:

1. **Tabulation Sheet**
2. **Student Marksheet**
3. **Average Sheet**
4. **Examiner Final Mark Submission Sheet**

### 7.1 Tabulation Sheet

The exact institutional format will be supplied separately.

It will be generated from authoritative finalised result evidence.

### 7.2 Student Marksheet

The exact institutional format will be supplied separately.

It must derive from authoritative finalised/published result evidence according to the applicable lifecycle.

### 7.3 Average Sheet

Lexora may define the initial design, subject to later institutional review.

The Average Sheet is primarily Summative calculation evidence.

Expected academic information includes, as applicable:

- candidate/result identity;
- First Examiner total;
- Second Examiner total;
- variance/difference;
- whether Third Examination was required;
- Third Examiner total where applicable;
- pairwise differences;
- selected nearest pair;
- equal-distance selection reason where applicable;
- derived Summative average;
- rule/version identity;
- Committee review state;
- Chairman approval/final-lock state.

Confidentiality must be preserved.

Ordinary presentation should prefer seat labels such as:

- Examiner 1;
- Examiner 2;
- Examiner 3;

rather than exposing unnecessary Examiner identity.

### 7.4 Examiner Final Mark Submission Sheet

Each Examiner must be able to obtain a printable/downloadable official mark-submission sheet after that Examiner has irreversibly finalised/locked the applicable mark submission.

The exact institutional format will be supplied separately.

Rules:

- the document must be generated from the exact immutable locked submission version;
- it must not be treated as authoritative before final submission/lock;
- after final lock, the underlying submission cannot be edited through normal workflow;
- regenerated copies must resolve to the same locked evidence/version;
- one Examiner's sheet must not disclose another Examiner's confidential marks.

## Controller of Examinations Publication Authority

The **Controller of Examinations** is the official publication authority in the current target workflow.

A dedicated narrow Lexora role/capability may therefore be introduced for the Controller publication boundary.

The Controller publication authority must not automatically receive Examiner, Committee Member, Chairman, Department Admin, or mark-editing authority.

The Controller must not be able to:

- alter Examiner marks;
- alter locked Formative marks;
- alter calculated Summative marks;
- perform Member review;
- act as Examination Committee Chairman;
- manually change the server-derived final total;
- bypass component-pass rules.

The Controller acts on a Chairman-finalised result set.

## Publication Before Core Result Consumption

The core Lexora result domain must not treat an unpublished working/finalised result as the student's authoritative published result.

Current target lifecycle:

Chairman-finalised result
→ required official documents
→ Controller of Examinations publication
→ immutable/versioned published-result snapshot
→ core Lexora result ingestion/registry
→ student-facing and downstream academic use.

Publication must be auditable, department-scoped where applicable, idempotent, and transactionally safe.

## Published Result Registry / Consumption Boundary

Lexora must separate:

### A. Result Processing

Examples:

- Formative processing;
- Summative Examiner workflow;
- comparison;
- Third Examination;
- nearest-pair calculation;
- Committee review;
- Chairman approval;
- Formative + Summative combination;
- finalisation;
- document generation;
- publication workflow.

### B. Published Result Consumption

Examples:

- student profile;
- published course result display;
- GPA;
- CGPA;
- transcript;
- academic history;
- eligibility or downstream academic services that are permitted to depend on published results.

Downstream consumers must read from a canonical authoritative **published-result boundary/registry**, not directly from Examiner, Summative-calculation, Committee-review, or unpublished result-processing tables.

## Replaceable Result-Source Architecture

The published-result layer must support explicit source/provenance.

Initial/internal provider:

`LEXORA_INTERNAL`

Future provider:

`CU_CENTRAL`

The downstream Lexora result consumers must not be tightly coupled to `LEXORA_INTERNAL`.

Conceptually:

`LEXORA_INTERNAL result processing`
or
`CU_CENTRAL authoritative published result`
→ controlled result ingestion
→ canonical published-result registry
→ student profile / GPA / CGPA / transcript / downstream features.

## Future University of Chittagong Central Result Processing System

The system must be prepared for a future University of Chittagong Central Result Processing System.

When that system becomes authoritative:

- Lexora's own result-processing workflow may be retired, disabled, or retained only for historical records;
- Lexora itself remains operational;
- Lexora must be able to receive authoritative published result data from the CU central system;
- ingestion may be through a direct authenticated integration, secure API, approved file/batch import, or another formally approved mechanism;
- Lexora must not assume that its own Examiner/Committee processing remains the source of truth.

The central result source must be treated as an external authoritative provider only after the applicable institutional trust/integration boundary has been established.

## External/Central Result Provenance

Future imported/ingested authoritative results should preserve sufficient provenance, including where available:

- result source/provider;
- source-system record identifier;
- source version/revision;
- student identity mapping;
- programme/session/semester/course identity;
- publication identity/status;
- publication timestamp;
- received/imported timestamp;
- source integrity/checksum/signature evidence where applicable;
- import/synchronisation status;
- supersession/amendment relationship;
- audit evidence.

Raw credentials, access tokens, secrets, password hashes, and other sensitive authentication material must never be stored as result provenance.

## Idempotency and Amendment Safety

Repeated receipt of the same authoritative result must not create duplicate academic outcomes.

Published-result ingestion must be idempotent.

If a published result is later formally amended:

- the old published snapshot/history must be preserved;
- the new authoritative version must supersede it through a controlled amendment path;
- existing Lexora Result Amendment protections must not be bypassed;
- GPA/CGPA recalculation must remain controlled and centralised;
- no silent overwrite of published academic history is permitted.

## Department Isolation and Object-Level Safety

Current Lexora department-isolation requirements remain mandatory.

No result source or import mechanism may use a client-provided department header to override an authenticated principal's real scope.

Where future CU central results span multiple departments, the integration layer must perform explicit trusted academic identity mapping and must not weaken department-scoped access inside Lexora.

Student-facing access remains own-resource scoped.


## Development boundary

Implement authoritative /40 + approved/locked /60 integration first, preserving exact source identities/versions, component pass decisions and server-derived /100/grade evidence. Then complete-result Chairman finalisation, official document foundations, Controller publication, immutable/versioned published snapshots, idempotent registry ingestion and controlled downstream GPA/CGPA/transcript consumption.

Document formats remain a dependency: institution supplies Tabulation, Student Marksheet and Examiner Final Mark Submission Sheet formats; initial Average Sheet design is permitted subject to institutional review. No browser/UI or generic publish endpoint may bypass these authority boundaries.

The full historical [result publication architecture](result-processing-publication-architecture.md) retains original decision dates and runtime supersession evidence. Current implementation priority is owned by [the roadmap](project-status-and-roadmap.md), and security risks by [the backlog](security-and-production-hardening-backlog.md).
