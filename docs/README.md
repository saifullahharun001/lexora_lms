# Lexora LMS documentation

This map defines the active documentation as of the recorded 2026-10-07 baseline. A module being wired, a target requirement, or a successful static check does not prove runtime completion.

| Canonical document | Responsibility |
| --- | --- |
| [Runtime test checklist](runtime-test-checklist.md#current-verified-baseline-index) | Current implementation/runtime proof; complete historical evidence ledger |
| [Project status and roadmap](project-status-and-roadmap.md) | Current snapshot, remaining boundaries, and next work |
| [Product specification](product-specification.md) | Authoritative target functional requirements and academic authority |
| [Architecture and security](architecture-security.md) | Cross-cutting architecture/security invariants; identity implementation and limitations |
| [Security and production hardening backlog](security-and-production-hardening-backlog.md) | Risks, required improvements, priorities, unresolved hardening |
| [Academic Core](academic-core.md) | Academic structure, curriculum/teaching context, enrollment, sessions, attendance and eligibility contracts |
| [Assessment Core](assessment-core.md) | Generic assignment, quiz, submission, attempt and grading contracts |
| [Formative Assessment](formative-assessment.md) | Authoritative Activities /30, Attendance /5, Comprehensive /5 and automatic Final Formative /40 |
| [Summative Examination](summative-examination.md) | Offline Examiner workflow, blind marking, Committee review and Summative /60 final lock |
| [Result Domain](result-domain.md) | Generic foundation versus authoritative complete-result finalisation, publication and consumption |
| [Transcript and Verification](transcript-verification.md) | Immutable snapshots, issuance, revocation and minimal public verification |
| [Notification](notification.md) | Department-scoped event, notification, preference and delivery contracts |

## Conflict resolution and evidence labels

Latest applicable runtime evidence supersedes older implementation-status wording. Target specification does not prove implementation. Status summaries must not override runtime evidence. Module documents own durable contracts/design and explain current implementation within the verified boundary; cross-cutting security rules still apply.

Academic authority remains: applicable LL.B. Ordinance, formally approved institutional decisions, approved curriculum, consolidated teacher/assessment specification, general site specification, then implementation defaults. Preserve conflicting historical wording while applying the higher authority: the current Examination Committee has four seats despite older three-member specification text.

Use explicit classifications: **implemented**, **locally/static verified**, **database verified**, **server/runtime verified**, **targeted runtime verified**, **partial/foundation only**, **pending**, or **future hardening**. A targeted campaign proves only its tested path/matrix. No document claims production readiness.

Use historical Git history instead of accumulating endless status supersession sections in current-state documents. The runtime checklist is the deliberate evidence-ledger exception: retain historical test IDs, findings, negative tests, bugs, limitations and supersession evidence.

## Migration, legacy and retained references

Phase 2 removed eight redundant original/API documents after content, evidence and link checks. Their original versions remain retrievable from the exact Git commit/blob inventory in the [migration report](documentation-migration-report.md). The canonical product specification preserves the complete original requirements unchanged.

The [Phase-1 snapshots](legacy/phase-1/README.md), including their README, remain unchanged. They are rollback/reference artifacts and never override current canonical status.

The following files are retained **historical references**, each labeled at its entry point. They remain because the deletion conditions for unique content are not yet satisfied:

| Retained reference | Reason |
| --- | --- |
| [academic-core-foundation.md](academic-core-foundation.md) | Exact public-contract, policy and audit-event catalogs plus the original schema/scaffold design remain unique reference material. |
| [identity-access-design.md](identity-access-design.md) | Original flow diagrams, proposed identity schema metadata and target design context remain useful; target 2FA/step-up requirements are not runtime proof. |
| [final-formative-materialisation-implementation.md](final-formative-materialisation-implementation.md) | Detailed implementation review, diagnosis, source-owner campaigns, checksum/recovery evidence and operational reconciliation safeguards remain retained evidence. |
| [result-processing.md](result-processing.md) | Exact foundation schema/contract/policy/audit catalogs and generic computation design remain reference material; they do not define the newer Chairman/Controller publication authority. |
| [result-processing-publication-architecture.md](result-processing-publication-architecture.md) | Academic authority decisions, decision dates, source versions and historical supersession evidence remain reference material. |
| [notification-foundation.md](notification-foundation.md) | Exact foundation schema, public-contract, policy and audit-event catalogs remain unique reference material. |

Primary academic sources remain [the LL.B. Ordinance](academic-sources/llb/Academic_Ordinance_LLB.pdf) and [approved OBE curriculum](academic-sources/llb/Outcome-Based_Education_Curriculum_LLB.pdf). The [root README](../README.md) owns developer setup; the [MinIO](../ops/object-storage/minio-evaluation/README.md) and [ClamAV](../ops/malware-scanning/clamav-evaluation/README.md) READMEs own isolated operational evaluation instructions. Operational/AI project instructions are not product architecture or academic authority.

The migration report records every retained/deleted/missing source, preservation location, unresolved issue and validation result. Deletion does not resolve transcript AMENDED eligibility, historical Committee wording, permanent Course Outline authority or absent requested sources. No staging, commit, push, application/configuration change or database operation is part of this cleanup.
