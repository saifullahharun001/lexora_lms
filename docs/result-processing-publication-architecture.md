# Lexora LMS — Result Finalisation, Publication, and Published-Result Integration Architecture

<!-- phase2-reference-note -->
> **Retained historical reference — not the current module specification.** Academic authority decisions, decision dates, source versions and historical supersession evidence remain reference material. Current contracts/status: [result-domain.md](result-domain.md). Runtime proof: [Current Verified Baseline Index](runtime-test-checklist.md#current-verified-baseline-index). Historical statements below retain their original scope and do not override later canonical evidence.
<!-- /phase2-reference-note -->

**Decision date:** 2026-09-03
**Status:** Confirmed project direction; implementation is partial and runtime evidence is tracked separately.

## 1. Purpose

This document defines the durable boundary between:

1. assessment/result processing;
2. academic finalisation;
3. official publication;
4. published-result ingestion;
5. downstream result consumption inside Lexora.

The design deliberately keeps result consumption independent from the system that performs result processing.

This allows the current Department-level Lexora result-processing workflow to operate now while remaining replaceable by a future University of Chittagong Central Result Processing System.

## 2. Current Summative Processing Boundary

The currently implemented Summative backend reaches:

First Examiner
→ Second Examiner
→ First/Second comparison
→ >=15% variance decision
→ Third Examiner where required
→ nearest-pair/equal-distance calculation
→ common calculated Summative mark
→ Internal Member 1 review
→ Internal Member 2 review
→ Examination Committee Chairman approval
→ Summative final lock.

The Committee Member Review + Chairman Approval / Final Lock implementation is committed at:

`9035a28cdbd9be8757e2aaf15e924d55cbc2ff60`

Current classification of that implementation:

**IMPLEMENTED + COMMITTED + PUSHED + LOCALLY/STATICALLY VERIFIED — SERVER RUNTIME VERIFICATION PENDING**

This document does not upgrade it to deployed or runtime-verified status.

Earlier comparison / Third / nearest-pair runtime evidence remains independently preserved in `docs/runtime-test-checklist.md`.

## 3. Confirmed Component Structure and Pass Rules

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

## 4. Formative Source

The final course-result workflow must consume the authoritative **locked Final Formative Assessment /40 produced by the Formative workflow**.

The Result Processing layer must not independently reconstruct formative marks from raw activities when a locked authoritative Formative total already exists.

The locked Formative source identity/version must be preserved in final-result evidence.

## 5. Summative Source

The Summative contribution must come from the exact Chairman-approved and final-locked Summative calculation.

The final-result workflow must not:

- recompute Examiner arithmetic independently;
- select a different nearest pair;
- accept a client-provided Summative value;
- consume an unapproved calculated Summative mark.

The exact calculated-mark version and Chairman approval/final-lock evidence must remain bound to the final result.

## 6. Examination Committee Chairman Finalisation

Two Chairman boundaries must be distinguished.

### 6.1 Summative approval

The existing Summative workflow ends with the Examination Committee Chairman approving and final-locking the Summative `/60`.

### 6.2 Final course-result finalisation

After authoritative Formative `/40` and Chairman-approved Summative `/60` are combined, the **Examination Committee Chairman is the academic authority that finalises the complete course/result set** before official result documents are produced for publication.

This final-result finalisation is a future implementation boundary and must not be confused with the already implemented Summative-only Chairman approval.

The Chairman must not manually override server-derived component values, total, grade, or pass/fail state.

## 7. Official Result Documents

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

## 8. Controller of Examinations Publication Authority

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

## 9. Publication Before Core Result Consumption

The core Lexora result domain must not treat an unpublished working/finalised result as the student's authoritative published result.

Current target lifecycle:

Chairman-finalised result
→ required official documents
→ Controller of Examinations publication
→ immutable/versioned published-result snapshot
→ core Lexora result ingestion/registry
→ student-facing and downstream academic use.

Publication must be auditable, department-scoped where applicable, idempotent, and transactionally safe.

## 10. Published Result Registry / Consumption Boundary

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

## 11. Replaceable Result-Source Architecture

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

## 12. Future University of Chittagong Central Result Processing System

The system must be prepared for a future University of Chittagong Central Result Processing System.

When that system becomes authoritative:

- Lexora's own result-processing workflow may be retired, disabled, or retained only for historical records;
- Lexora itself remains operational;
- Lexora must be able to receive authoritative published result data from the CU central system;
- ingestion may be through a direct authenticated integration, secure API, approved file/batch import, or another formally approved mechanism;
- Lexora must not assume that its own Examiner/Committee processing remains the source of truth.

The central result source must be treated as an external authoritative provider only after the applicable institutional trust/integration boundary has been established.

## 13. External/Central Result Provenance

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

## 14. Idempotency and Amendment Safety

Repeated receipt of the same authoritative result must not create duplicate academic outcomes.

Published-result ingestion must be idempotent.

If a published result is later formally amended:

- the old published snapshot/history must be preserved;
- the new authoritative version must supersede it through a controlled amendment path;
- existing Lexora Result Amendment protections must not be bypassed;
- GPA/CGPA recalculation must remain controlled and centralised;
- no silent overwrite of published academic history is permitted.

## 15. Department Isolation and Object-Level Safety

Current Lexora department-isolation requirements remain mandatory.

No result source or import mechanism may use a client-provided department header to override an authenticated principal's real scope.

Where future CU central results span multiple departments, the integration layer must perform explicit trusted academic identity mapping and must not weaken department-scoped access inside Lexora.

Student-facing access remains own-resource scoped.

## 16. Current Implementation Sequence

The normal happy-path result workflow should now be developed before broad correction/reopen expansion.

Planned sequence:

1. runtime-verify current Committee Member Review + Chairman Summative Approval bundle;
2. authoritative locked Formative `/40` consumption;
3. Chairman-approved Summative `/60` consumption;
4. server-side final course total `/100`;
5. separate component-pass validation using `16/40` and `24/60`;
6. grade / grade-point calculation using authoritative rules;
7. Examination Committee Chairman final-result finalisation;
8. result-document data foundations;
9. Average Sheet design/generation;
10. Tabulation Sheet generation after institutional format is supplied;
11. Student Marksheet generation after institutional format is supplied;
12. Examiner Final Mark Submission Sheet after institutional format is supplied;
13. Controller of Examinations publication authority/workflow;
14. immutable/versioned published-result snapshot;
15. idempotent handoff into the canonical Lexora published-result registry;
16. student profile / GPA / CGPA / transcript consumption from the published-result layer;
17. controlled correction/amendment hardening around these authority boundaries;
18. future `CU_CENTRAL` provider/integration support.

Implementation may be regrouped into cohesive secure bundles, but authority boundaries must not be collapsed merely for convenience.

## 17. Current Status

This architecture document defines confirmed project direction.

It does not claim implementation of:

- final Formative/Summative result integration;
- 16/40 or 24/60 enforcement in a final-result engine;
- Examination Committee Chairman finalisation of the complete course result;
- official result-document generation;
- Controller of Examinations role or publication workflow;
- published-result registry/provider abstraction;
- CU central-system integration.

Those remain pending until separately implemented and verified.

The overall Summative/final-result scope remains:

**PARTIAL / ACTIVE BACKEND DEVELOPMENT**

The latest `docs/runtime-test-checklist.md` remains the strongest source of truth for runtime status.

<!-- result-architecture-runtime-evidence-supersession-20260918 -->

## Runtime Evidence Supersession — Summative Committee Final Lock — 2026-09-18

This note updates runtime evidence classification only. It does not change the
confirmed result-processing/publication architecture.

The current Committee Member Review + Summative Chairman Approval / Final Lock
bundle, including the later persistence timestamp-coherence fix, is now
targeted authenticated Ubuntu server-runtime verified at implementation HEAD:

`dc5cb5a7cd8307ca5f7aa66b958296cc1edd1bd3`

Verified runtime outcome:

- authoritative calculated Summative evidence: `46/60`, calculated version `1`;
- current MEMBER_1: `VERIFIED`;
- current MEMBER_2: `VERIFIED`;
- complete four-seat Committee readiness;
- exact current Chairman authority;
- Chairman approval/final lock: HTTP `201`;
- approval ID: `cmu5vqugt000x2i3e22rvg4kp`;
- approval version: `1`;
- approved Summative snapshot: `46/60`;
- exact M1/M2 review bindings preserved;
- `approvedAt = lockedAt = createdAt`;
- required success audit: exactly `1`;
- duplicate final-lock attempt: HTTP `409`;
- no duplicate approval or duplicate success audit.

The architecture remains unchanged:

1. **Summative Chairman approval/final lock**
   produces the authoritative locked Summative contribution `/60`.

2. **Complete course-result Chairman finalisation**
   is a separate future boundary after authoritative locked Formative `/40` and
   Chairman-approved locked Summative `/60` are combined and the server derives
   total, separate component-pass state, grade and grade point.

3. **Controller of Examinations publication**
   remains a later and distinct official publication authority boundary.

The runtime-verified `46/60` Summative final lock is therefore not a complete
course result, not a published result and not yet student-facing published
academic evidence.

Published-result consumers must continue to depend only on the future
authoritative published-result layer, preserving the replaceable provider
boundary for `LEXORA_INTERNAL` and future `CU_CENTRAL` sources.


<!-- result-architecture-final-formative-source-clarification-20260926 -->

## Final Formative Source Clarification — 2026-09-26

The authoritative Final Formative `/40` is automatically materialised by the
Formative domain when the exact three required final component sources exist for
the same student/course:

- finalised Activities `/30`;
- generated and frozen Attendance `/5`;
- Chairman-finalised Comprehensive `/5`.

No additional human `Finalise Formative /40`, `VERIFIED`, `APPROVED` or
`FINALISED` action is required at the aggregate `/40` boundary.

The aggregate must preserve exact component source identities/versions and
academic provenance.

Result Processing must consume that exact immutable authoritative `/40`.

It must not reconstruct the Formative total from raw Activities, Attendance or
Comprehensive records.

This clarification does not change the later confirmed result architecture:

- authoritative Formative `/40`;
- Chairman-approved locked Summative `/60`;
- server-derived `/100`;
- separate component pass checks;
- Examination Committee Chairman complete-result finalisation;
- official result documents;
- Controller publication;
- published-result registry;
- downstream GPA/CGPA/transcript/result consumption;
- replaceable result-provider boundary.


<!-- final-formative-runtime-architecture-supersession-20261007 -->

## Runtime Evidence Supersession — authoritative Final Formative `/40` — 2026-10-07

This note updates runtime evidence classification only. It does not change the confirmed
result-finalisation/publication architecture.

Automatic authoritative Final Formative `/40` is now implemented, committed, pushed,
ordinary-database deployed, PM2 activated, and targeted authenticated canonical-server
runtime verified for the tested Comprehensive idempotent terminal-owner path at:

`9c407ef4da4eaeb777a72e8cc7ec056f557fcb80`

The canonical runtime produced:

`24.00 / 30 + 3.50 / 5 + 4.00 / 5 = 31.50 / 40`

under:

`FINAL_FORMATIVE_40_SUM_V1`

The aggregate retained exact immutable component provenance, created exactly one
protected `SERVICE` success audit, remained idempotent under authenticated repeat,
preserved principal-derived department scope despite a forged department header, and
rejected ordinary aggregate/audit UPDATE and DELETE attempts.

This does not change the architectural separation between result processing and
published-result consumption.

The next result-processing boundary remains:

**authoritative immutable Final Formative `/40` + Chairman-approved/final-locked
Summative `/60` integration**

The final-result layer must consume these existing authoritative component boundaries.
It must not independently reconstruct Formative or Summative values from lower-level
raw marking evidence.

The confirmed separate pass thresholds remain:

- Formative: `16/40`;
- Summative: `24/60`.

The current runtime-verified Final Formative `/40` is not itself:

- a complete course result;
- a complete-result Chairman finalisation;
- an official publication;
- a published-result registry entry;
- student-facing published result evidence.

Complete course-result Chairman finalisation, official documents, Controller of
Examinations publication, immutable/versioned published-result registration and
downstream GPA/CGPA/transcript consumption remain later distinct authority boundaries.

The runtime classification is targeted. The canonical campaign observed automatic
materialisation through an existing Comprehensive-finalisation idempotent terminal-owner
path; it did not separately force a brand-new first-time Comprehensive finalisation.
This limitation does not alter the confirmed architecture and must not be inflated into
a broader production-readiness claim.
