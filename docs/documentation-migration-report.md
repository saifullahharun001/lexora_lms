# Documentation consolidation and deletion-safety report

Phase 2 review: 2026-10-08. Recorded source/runtime baseline remains 2026-10-07. Eight redundant active originals were removed after the checks below; six unique original documents remain labeled historical references. All 13 canonical documents remain active. No academic decision or implementation status is inferred from deletion.

Phase 2 started with the unstaged Phase-1 changes: five modified tracked documentation files and 14 untracked documentation files. No unrelated source, configuration or application changes, and no staged changes, were present. The canonical set, original sources, full runtime ledger, exact product copy and all legacy snapshots were inspected before deletion. No runtime/database operations or application tests were performed.

## Phase-1 provenance (historical preflight and additions)

The working tree was clean at preflight. Inventory covered all 24 tracked Markdown/PDF documents: 21 under docs (including two academic PDFs), root README and two ops READMEs. No applicable repository AGENTS.md was found. No unrelated changes existed to preserve.

All 13 requested canonical paths now exist. **Created:** docs/README.md, product-specification.md, architecture-security.md, academic-core.md, formative-assessment.md, result-domain.md, notification.md and security-and-production-hardening-backlog.md.

**Updated:** assessment-core.md, summative-examination.md, transcript-verification.md, project-status-and-roadmap.md and runtime-test-checklist.md. Four replacement current-state documents have byte-preserved original snapshots under docs/legacy/phase-1; the runtime checklist only gained an introductory index.

**Supporting additions:** this report, legacy/phase-1/README.md and four source snapshots. During Phase 1, original foundation/API/design/specification/implementation-review/PDF files remained untouched. No source document was deleted. No application code, schema, migrations, tests or runtime/deployment configuration was changed. No staging, commit or push occurred.

## Final old-to-new migration matrix

Each final state below applies to the original document or content identified in the first column. For four originals sharing canonical filenames, only their historical content is now legacy-snapshot-only; the current canonical file at that path is retained. The runtime ledger remains canonical proof, even though its retention state uses the required “active reference” vocabulary.

Deletion requires all eight conditions: current durable content consolidated; unique runtime evidence retained; unique security/architecture/authority decisions preserved; unresolved information explicit; no current links depend on the old path; no canonical source-of-truth dependency remains; historical content recoverable; and the Phase-1 conditional assessment satisfied. The source-to-contract checks and Git inventory below document those conditions.

| Existing source at preflight | Canonical destination | Unique/durable content migrated | Duplicate/stale material omitted from current-state text | Information retained only in reference / no safe destination yet | Final Phase-2 state |
| --- | --- | --- | --- | --- | --- |
| [docs/academic-core-foundation.md](academic-core-foundation.md) | [academic-core.md](academic-core.md) | Domain, lifecycles, tenant/parent alignment, assignment/self-resource, attendance/eligibility and audit contracts | Repeated schema relations, scaffold listings and stale future-only workflow language | Exact public-contract/policy/audit-event catalogs and scaffold inventory remain here; retain until needed catalogs are migrated | RETAINED — UNIQUE CONTENT / UNRESOLVED ISSUE |
| `docs/academic-core-api.md` | [academic-core.md](academic-core.md) | Program/course/offering/enrollment routes, policies, principal scope, uniqueness and audit; canonical table additionally checked against current controllers | Duplicate HTTP/JSON examples and guard snippet | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| `docs/architecture-rules.md` | [architecture-security.md](architecture-security.md) | Monolith/module boundaries, service/domain rules, public cross-module contracts, department/no-bypass, audit/storage/integration/frontend invariants | Foundation-only repository claim and prohibitions against implementing business workflows | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| `docs/authorization.md` | [architecture-security.md](architecture-security.md) | AuthGuard/PolicyGuard/RequirePolicy, policy matching/fallbacks, 401/403, scope, no-metadata caveat, cache hooks/limitations | Duplicate example and obsolete universal ownership-placeholder claim | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| [docs/identity-access-design.md](identity-access-design.md) | [architecture-security.md](architecture-security.md) | Role/permission matrix and policy catalog, no super-admin, scope/ownership/audit, target 2FA/session/token/risk rules | Duplicate flow diagrams and schema-addition proposals not presented as current implementation | Original decorator/flow diagrams and proposed identity schema metadata retained; implementation-vs-design distinction recorded | RETAINED — UNIQUE CONTENT / UNRESOLVED ISSUE |
| `docs/identity-access-implementation.md` | [architecture-security.md](architecture-security.md) | Identity endpoints, states, refresh hashing/cookies, raw-token environment limit, auth throttling, limitations and hardening | Historical identity-only scope mistaken for whole-repository limitation | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| [Original docs/assessment-core.md](legacy/phase-1/assessment-core.md) | [assessment-core.md](assessment-core.md) | Generic domain, lifecycles, timing/limits, own-resource/assignment rules, file/grading boundaries and audit | Schema repetition, scaffold tree, future-only blanket workflow wording | Original is byte-preserved at legacy/phase-1/assessment-core.md; exact scaffold policy/audit-event catalogs remain there | RETAINED IN LEGACY SNAPSHOT ONLY |
| `docs/assessment-api.md` | [assessment-core.md](assessment-core.md) | All generic API endpoints/policies, department/assignment/enrollment, timing/attempt restrictions and limitations | Duplicate security prose | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| [docs/final-formative-materialisation-implementation.md](final-formative-materialisation-implementation.md) | [formative-assessment.md](formative-assessment.md) | Exact immutable parents, Decimal precision, shared projection, owner hooks, transactions/audit/idempotency, current targeted classification and next boundary | Chronological diagnosis/supersession, temporary paths, obsolete migration hashes and repeated campaigns | Detailed failures, migration/checksum chain, CLI safeguards/commands, recovery paths and independent evidence remain here and in runtime ledger | RETAINED — UNIQUE CONTENT / UNRESOLVED ISSUE |
| [Original docs/summative-examination.md](legacy/phase-1/summative-examination.md) | [summative-examination.md](summative-examination.md) | Authority hierarchy/four seats, offline model, assignments/blind marking, variance/Third/nearest-pair, Member/Chairman lock, security and current runtime limits | Supersession sequence, deployment walkthroughs, stale runtime-pending summaries | Original byte-preserved at legacy/phase-1/summative-examination.md; commits/migrations, interrupted setup and cleanup identities remain there/runtime | RETAINED IN LEGACY SNAPSHOT ONLY |
| [docs/result-processing.md](result-processing.md) | [result-domain.md](result-domain.md) | Generic models/lifecycles, weighting/GPA/CGPA, gates, locks/amendments/audit; clearly separated from newer authority | Repeated schema snippets, duplicate scaffold catalog and generic authority presented as future Law publication | Exact schema/contract/policy/audit catalogs retained; target-vs-implemented gating not universally runtime-certified | RETAINED — UNIQUE CONTENT / UNRESOLVED ISSUE |
| `docs/result-processing-api.md` | [result-domain.md](result-domain.md) | All APIs, pagination, scoped roles/transactions, compute source behavior and foundation limitations | Duplicate exposition | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| [docs/result-processing-publication-architecture.md](result-processing-publication-architecture.md) | [result-domain.md](result-domain.md) | Exact source/pass requirements, two Chairman boundaries, documents, Controller, registry, providers/provenance, idempotency/amendment/consumption | Old sequence awaiting Committee runtime and /40; chronological supersession | Decision dates, implementation commits and historical authority/status evolution retained | RETAINED — UNIQUE CONTENT / UNRESOLVED ISSUE |
| [Original docs/transcript-verification.md](legacy/phase-1/transcript-verification.md) | [transcript-verification.md](transcript-verification.md) | Immutable models/lineage, lifecycle, authority/audit, snapshot/downstream requirements and rendering limits | Duplicate schema excerpts, overly broad suggested public response, blanket unimplemented-issuance wording | Original byte-preserved at legacy/phase-1/transcript-verification.md; exact schema/scaffold/audit catalog retained. AMENDED conflict is explicit | RETAINED IN LEGACY SNAPSHOT ONLY |
| `docs/transcript-verification-api.md` | [transcript-verification.md](transcript-verification.md) | All APIs/pagination, role/self restrictions, digest/constant-time semantics, 72h default expiry, revocation/uniform invalid response | Duplicate snapshot lists; future rename/digest-validation notes condensed | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| [docs/notification-foundation.md](notification-foundation.md) | [notification.md](notification.md) | Domain/lifecycle, event mappings, scoped privacy, critical preferences, dedupe/delivery separation, adapters/auth/audit and pending transports | Duplicate Prisma excerpts and scaffold tree | Exact scaffold/contract/policy/audit-event catalogs and representative schema remain here | RETAINED — UNIQUE CONTENT / UNRESOLVED ISSUE |
| [Original docs/project-status-and-roadmap.md](legacy/phase-1/project-status-and-roadmap.md) | [project-status-and-roadmap.md](project-status-and-roadmap.md) | Project identity, architecture, latest per-module runtime state, corrected next boundary, risks and pending scope | Append-only chronology, stale foundation statuses, obsolete next steps and broad production wording | Original byte-preserved at legacy/phase-1/project-status-and-roadmap.md; deployment/debugging/manual backup/version-control handoffs retained as historical operational reference | RETAINED IN LEGACY SNAPSHOT ONLY |
| [docs/runtime-test-checklist.md](runtime-test-checklist.md) | [runtime-test-checklist.md](runtime-test-checklist.md) | All evidence retained in place; added Current Verified Baseline Index | Nothing deleted or truncated; older evidence interpreted by later applicable checkpoints | No orphaned evidence: every historical test/bug/ID/commit/negative/security finding/limitation remains in the canonical ledger | RETAINED AS ACTIVE REFERENCE |
| `docs/lexora-lms-consolidated-updated-site-specification.md` | [product-specification.md](product-specification.md) | Complete source copied byte-for-byte, including target status, academic authority and all requirements | Nothing omitted or silently corrected | Complete original, examples and historical wording: existing Git commit/blob inventory below. No unique runtime campaign exists solely here; evidence stays in the preserved historical runtime ledger. | DELETED FROM ACTIVE TREE — CONTENT CONSOLIDATED |
| [docs/academic-sources/llb/Academic_Ordinance_LLB.pdf](academic-sources/llb/Academic_Ordinance_LLB.pdf) | [product-specification.md](product-specification.md); [summative-examination.md](summative-examination.md) | Authority relationship referenced; PDF not transcribed or edited | No omission from PDF; content remains in original | Primary academic authority stays a separate source artifact; no safe replacement in module prose | RETAINED AS ACTIVE REFERENCE |
| [docs/academic-sources/llb/Outcome-Based_Education_Curriculum_LLB.pdf](academic-sources/llb/Outcome-Based_Education_Curriculum_LLB.pdf) | [product-specification.md](product-specification.md); [academic-core.md](academic-core.md) | Approved-curriculum authority/reference relationship retained; PDF not transcribed or edited | No omission from PDF | Primary approved curriculum stays separate; no safe replacement in a summary | RETAINED AS ACTIVE REFERENCE |
| [README.md](../README.md) | [docs/README.md (documentation map only)](README.md) | Canonical entrypoint under docs; root navigation and obsolete foundation-only introduction corrected | Root setup instructions intentionally not recopied | Repository bootstrap/developer instructions belong in root README; documentation map does not replace them | RETAINED AS ACTIVE REFERENCE |
| [ops/object-storage/minio-evaluation/README.md](../ops/object-storage/minio-evaluation/README.md) | [security-and-production-hardening-backlog.md (reference only)](security-and-production-hardening-backlog.md) | Evaluation/production boundary and remaining delivery risks linked | Operational commands/configuration instructions not copied | Unique isolated MinIO operational runbook remains in ops; no safe replacement among target module documents | RETAINED AS ACTIVE REFERENCE |
| [ops/malware-scanning/clamav-evaluation/README.md](../ops/malware-scanning/clamav-evaluation/README.md) | [security-and-production-hardening-backlog.md (reference only)](security-and-production-hardening-backlog.md) | Evaluation/scanning/worker boundary and remaining risks linked | Operational commands/provisioning procedures not copied | Unique isolated ClamAV operational runbook remains in ops; no safe replacement among target module documents | RETAINED AS ACTIVE REFERENCE |

## Conflicts, ambiguities and decisions

1. **Missing requested sources:** security-and-production-hardening-backlog.md did not exist, so it was created from current preserved sources without claiming any unknown former items completed. result-processing-publication-architecture(2).md was absent; the existing unsuffixed file supplied the newer architecture. Original Technical Blueprint, project-instructions PDF and old numbered/suffixed module files were not present in this checkout. Their unique content and deletion safety cannot be assessed; retain/review them if found later.
2. **Same source/canonical filenames:** existing Assessment, Summative, Transcript and Roadmap contents were copied unchanged to legacy/phase-1 before canonical rewriting. This reconciles current-state cleanup with the no-loss/no-historical-overwrite requirement. The checklist retains the original body in place.
3. **Specification versus authority:** product-specification.md is an exact copy. Its older three-member Committee wording is not silently removed; its own Ordinance precedence and the documented current four-seat decision govern implementation. The specification remains target requirements, never implementation proof. Broader specification/policy reconciliation requires source-backed governance, not editorial invention.
4. **Attendance governance:** Coordinator verify/finalise/lock/reopen checkpoints remain historical evidence. Current Chairman generation/freeze and earlier reasoned ordinary correction supersede those policies. No ordinary correction/reopen/regeneration after generation is implied.
5. **Generic versus authoritative results:** existing GradingRecord compute/admin-or-exam-office publish APIs remain implemented foundation. New authoritative /40 + /60, separate pass engine, complete-result Chairman finalisation and Controller publication/registry are pending. Older generic authority cannot satisfy those new boundaries.
6. **Transcript source gate:** current service accepts AMENDED along with PUBLISHED/LOCKED; the durable foundation/registry requirement forbids amended-but-unpublished official input. Both facts are explicit in the canonical Transcript document and SEC-15. No behavior change or broad publication safety claim was made.
7. **Authorization design versus runtime:** no-policy metadata currently permits the generic guard. Full step-up/2FA, distributed revocation/cache coherence and old proposed decorator patterns are not represented as implemented. Conversely, older blanket ownership-placeholder wording is superseded for runtime-tested module paths.
8. **Evidence scope:** automatic /40 closure is targeted to the existing Comprehensive idempotent terminal-owner path. Canonical runtime verification did not separately observe first-ever Comprehensive terminal creation or repeat every disposable failure, concurrency and source-order matrix. Summative Committee runtime is targeted. Full production readiness is not claimed.
9. **Course Outline authority:** technically verified approval/activation/archival does not establish permanent institutional authority. Temporary test grants remain temporary.
10. **Source precision and endpoint normalization:** generic foundation rounding is not authoritative Formative rounding; exact six-decimal sources remain intact. Summative Committee paths are documented under the application's /api/v1 prefix, resolving older /v1 shorthand. Academic and Notification tables were checked against current controller declarations; this is static documentation verification, not new HTTP testing.

## Unique information deliberately retained as reference

The matrix identifies each affected source. In particular, full runtime campaigns and all bugs/negative findings/test IDs remain in the canonical checklist. Final Formative diagnosis, obsolete/current migration identities, temporary/private recovery paths, CLI safeguards and source-owner/harness histories remain in the original implementation review and runtime ledger.

Detailed schema relations, proposed schema additions, public contract/policy/audit-event catalogs, historical handoffs and deployment/debugging notes remain in retained foundation files or four snapshots; examples from removed API sources remain in the verified Git blobs. They are not erased simply because some do not belong in concise current-state prose. Operational MinIO/ClamAV runbooks and primary academic PDFs remain at their original locations; the desired active document set does not replace these artifacts.

## Deletion approval and preservation proof

The eight Phase-1 conditional candidates now satisfy the deletion rule. For the transcript API, “issue reconciliation” means preserving both the implemented AMENDED acceptance and the unresolved official-publication gate in the canonical document and SEC-15; no product/academic decision has been made. The original requirement for no information loss is satisfied without guessing the eventual resolution.

| Removed original under docs/ | Canonical destination | Durable-content check / why safe |
| --- | --- | --- |
| academic-core-api.md | [Academic Core](academic-core.md#current-api-endpoints-and-policies) | Every old route/policy and department/parent/term/uniqueness/audit rule is present; current table includes later routes. Request examples are recoverable in Git. |
| architecture-rules.md | [Architecture/security](architecture-security.md) | Every still-valid architecture/security rule retained; only obsolete foundation-only restrictions excluded from current claims. |
| authorization.md | [Authorization boundary](architecture-security.md#implemented-request-and-authorization-boundary) | Guards, policy metadata, grant matching, scope, HTTP denials, fallback/cache gaps and mandatory object checks retained. Old code example and history recoverable in Git. |
| identity-access-implementation.md | [Identity implementation](architecture-security.md#identity-implementation-and-limitations) | Identity endpoints, token/session/cookie semantics, limitations and hardening retained; no identity-only scope misrepresented as whole-repository status. |
| assessment-api.md | [Assessment Core](assessment-core.md#endpoints) | Complete endpoint/policy table, role scope, approved own enrollment, timing/attempt limits and pending grading retained. |
| result-processing-api.md | [Result Domain](result-domain.md#endpoints) | Complete API, pagination, generic computation/authority, locking/amendments and controlled GPA/CGPA retained; no substitution for future Controller workflow. |
| transcript-verification-api.md | [Transcript](transcript-verification.md#endpoints) | API/pagination, snapshots/printStructureJson, self/role restrictions, hash/expiry/revocation/public response and future rendering retained. AMENDED contradiction remains explicit. |
| lexora-lms-consolidated-updated-site-specification.md | [Product specification](product-specification.md) | Canonical copy is byte-identical; no requirement or historical three-member wording was removed. Higher-authority context remains explicit in README/Summative/report. |

Historical originals are available in existing Git history, without staging, committing or rewriting history. The recorded Git commit is:

`79bc22a97541391e909bf1037ab704e8aff1713b`

Read-only recovery pattern (substitute a filename from the table):

```text
git show 79bc22a97541391e909bf1037ab704e8aff1713b:docs/<original-filename>
```

| Original filename | Verified Git blob |
| --- | --- |
| academic-core-api.md | `c248a673a8f02ad3dca4c7d2c52faa07b301f4ce` |
| architecture-rules.md | `f74e999f81036a9a2862c19f2e55f319273085f2` |
| authorization.md | `f319cbe1da8d09aff8cca971891ef739fb86c6d9` |
| identity-access-implementation.md | `a97591a8f18a8be0ea40c8aff7c24a519dedd575` |
| assessment-api.md | `21937516b5ceb10c66e85df3173c190cb5e369ca` |
| result-processing-api.md | `db09c7cfc534207d29784f8f44424f9f24632bdc` |
| transcript-verification-api.md | `690c1a7646c4e52e0508576f93dda1f27771f6dd` |
| lexora-lms-consolidated-updated-site-specification.md | `00344366b2363c8c8876fbb793e4476eafaff194` |

All eight original working-tree texts matched these existing Git blobs after normal CRLF/LF normalization before removal. No file relies on an uncommitted-only original. Historical runtime evidence remains in the runtime ledger, and the four Phase-1 snapshots are unchanged.

## Missing requested sources

| Requested historical source | Final state | Handling |
| --- | --- | --- |
| Original Technical Blueprint | NOT PRESENT IN CHECKOUT | Cannot assess unique content or deletion; retain/review if supplied. |
| Project-instructions PDF | NOT PRESENT IN CHECKOUT | Cannot assess; any later AI/project-operation instructions remain separate from product architecture. |
| result-processing-publication-architecture(2).md | NOT PRESENT IN CHECKOUT | Existing unsuffixed decision document retained; no invented suffixed source. |
| Other old numbered/suffixed module documents | NOT PRESENT IN CHECKOUT | No matching source discovered; no removal or assumed consolidation. |
| Original pre-Phase-1 hardening-backlog source (2026-05-20) | NOT PRESENT IN CHECKOUT | External to the repository and unavailable during consolidation. The owner subsequently supplied priorities and technical recommendations, reconciled below; the complete original has not been imported or byte-compared. The canonical backlog remains active. |

## Preserved original snapshot manifest

These snapshots were made with byte-for-byte file copies before edits. Git content comparison also verifies unchanged source text; the original Roadmap and runtime ledger contain mixed working-tree line endings, so comparisons to Git's normalized blobs account for CRLF/LF without rewriting the preserved sources.

| Snapshot | Original working-tree bytes | SHA-256 |
| --- | --- | --- |
| [assessment-core.md](legacy/phase-1/assessment-core.md) | 11811 | `dabe66cf64c54db7f1320208463692339a68ae7e05561249de3c5f3a38e3dbc8` |
| [project-status-and-roadmap.md](legacy/phase-1/project-status-and-roadmap.md) | 116075 | `3944ce5cae592ddeacf153a3846c771ea89c0fa98ce6963a49dc5e9537f8da90` |
| [summative-examination.md](legacy/phase-1/summative-examination.md) | 58280 | `c6e2c29169f1bde31bc81451380b7355fdf34f3d50ee2d10d4a86b96797a8377` |
| [transcript-verification.md](legacy/phase-1/transcript-verification.md) | 17804 | `267da8f19557b2cb205c207c9eace0a648342b2bf0ddd4dea729a549fbd66cf4` |

## Phase-1 validation (historical)

Documentation verification checks all canonical paths, source preservation, exact product copy, full runtime historical-body retention, internal links/anchors in authored canonical text, no staged/deleted tracked files, and docs-only changes. Application tests/builds are unnecessary for this documentation-only change and were not run; no database/server operations occurred.

Validation passed: 13 canonical paths, all 24 original documents accounted for, 19 originals unchanged, four original snapshots preserved, exact product copy, all 41,417 original runtime-checklist lines retained in order, 174 authored internal links/anchors resolved, and the required 11 roadmap sections present. `git diff --check` passed. Existing source documents retain historical path spellings and references; their contents were intentionally not rewritten merely to make a new canonical link checker pass.

Phase-1 scope: five modified tracked documentation files and 14 new documentation files (eight canonical documents, this report, the snapshot index and four snapshots). There are no tracked deletions, staged changes or non-documentation changes. The tracked diff is 268 insertions / 5,769 deletions before counting new files; the large removals are current-state replacements whose complete originals remain in the new snapshots. The runtime ledger diff itself is insertion-only: 35 lines added, zero removed. New files are untracked intentionally; no staging was performed.

## Phase-2 domain/security regression review

All 13 canonical documents were inspected against their sources and latest applicable runtime evidence. No later authority was found resolving the four explicitly open issues. Current Formative /40 is targeted canonical runtime verification of the existing Comprehensive idempotent owner path; Summative Committee /60 is targeted authenticated runtime verified; broader matrices and production claims remain bounded. The immediate next backend boundary remains authoritative /40 + Chairman-approved/final-locked /60 integration. The roadmap remains an 11-section current-state document without an appended status chronology.

| Preserved control | Canonical owner |
| --- | --- |
| Modular monolith, principal/request scope, no x-department-id override, AuthGuard, PolicyGuard, @RequirePolicy(), deny-by-default, object checks, safe not-found and sensitive audit/data handling | [Architecture/security](architecture-security.md) |
| Teacher assigned-course, Student own-resource, academic identity/lifecycle, ACTIVE session capture, reasoned attendance/eligibility overrides | [Academic Core](academic-core.md), [Assessment Core](assessment-core.md) |
| Activities /30 + Attendance /5 + Comprehensive /5, automatic immutable /40, FINAL_FORMATIVE_40_SUM_V1, exact provenance, no human /40 approval, protected audit | [Formative](formative-assessment.md) |
| Four-seat authority with historical conflict retained, blind independent Examiners, >=15% variance/Third/nearest-pair, Member review, Chairman /60 lock, separation of duties, pending 2FA | [Summative](summative-examination.md) |
| Exact /40 + /60, separate 16/40 and 24/60 passes, /100 and complete-result Chairman boundary, official documents, Controller publication, versioned registry, LEXORA_INTERNAL/CU_CENTRAL, provenance/idempotency, amendment and controlled GPA/CGPA | [Result Domain](result-domain.md) |
| Immutable snapshots, own-resource and issue/revoke authority, digest/expiry/revocation, minimal public response, APIs/rendering limits and unresolved AMENDED gate | [Transcript](transcript-verification.md) |
| Department/recipient isolation, safe event payloads, critical-lock preferences, dedupe, notification/delivery separation, adapters/audit and pending real transports/workers | [Notification](notification.md) |

Hardening review retained all 24 existing items and their pending requirements. SEC-25 restores the runtime ledger's broader DB/RLS defense-in-depth work while recognizing the specific 2026-08-24 CurriculumCourse constraint fix as verified. Upload/malware, biometric reconciliation, workers/queues, monitoring/logging, backup/restore, HTTPS and production limits remain open as documented. No hardening item was silently completed.

Retained original documents received reference-only labels; their original bodies remain intact. Root README navigation now points to canonical architecture, and its obsolete “foundation code only” introduction was replaced with the bounded current description. Phase-1 legacy files (including README), product specification and runtime checklist were not edited in Phase 2.

## Active canonical set

Exactly 13 current canonical paths remain:

- [docs/README.md](README.md)
- [docs/product-specification.md](product-specification.md)
- [docs/architecture-security.md](architecture-security.md)
- [docs/project-status-and-roadmap.md](project-status-and-roadmap.md)
- [docs/runtime-test-checklist.md](runtime-test-checklist.md)
- [docs/security-and-production-hardening-backlog.md](security-and-production-hardening-backlog.md)
- [docs/academic-core.md](academic-core.md)
- [docs/assessment-core.md](assessment-core.md)
- [docs/formative-assessment.md](formative-assessment.md)
- [docs/summative-examination.md](summative-examination.md)
- [docs/result-domain.md](result-domain.md)
- [docs/transcript-verification.md](transcript-verification.md)
- [docs/notification.md](notification.md)

## Phase-2 validation and repository summary (before final editorial review)

- **Scope/content:** all 13 canonical paths exist with no duplicate active canonical filenames. All eight removed originals matched existing Git blobs before removal. Their durable current contracts, security rules and unresolved information are preserved in canonical documents; no unique runtime campaign was lost.
- **Runtime preservation:** exactly 41,452 lines before and after Phase 2, including all 41,417 original historical lines plus the Phase-1 index. The entire file is byte-identical to the Phase-1 baseline; no index or historical evidence was edited.
- **Product preservation:** byte-identical to the Phase-1 canonical copy, which was verified byte-identical to the original consolidated specification before deletion. Target requirements and historical Committee wording remain unchanged.
- **Legacy integrity:** all four snapshots and their README are byte-identical to Phase-2 preflight and retain the recorded snapshot hashes. No legacy file was deleted or changed.
- **Retained references:** all six original bodies are byte-identical after removing only the newly inserted reference-only note. No unique catalog, historical decision, implementation review or operational evidence was rewritten.
- **Links/Markdown:** 28 repository-owned Markdown files and 227 local links/anchors were checked, including canonical docs, retained sources, frozen snapshots, root README and both ops READMEs. All 225 non-exception links resolve; two pre-existing legacy-only relative links are documented below. No unclosed code fences, malformed table column counts or conflict markers were found. Four pre-existing trailing-whitespace lines remain in the unchanged historical runtime ledger (lines 3292–3295); no new trailing whitespace was introduced.
- **Deleted-name scan:** repository-wide search finds former names only in this migration/preservation record and seven historical plain-text mentions in the frozen Phase-1 roadmap. None is an active navigation dependency. No code/configuration file requires an edit to follow the new canonical paths.
- **Numbered-name scan:** the absent suffixed result-architecture filename occurs only in the report's missing-source record; no stale numbered/suffixed navigation remains.
- **Git checks:** `git diff --check` passes. HEAD and index remain unchanged; no staging, commit, push or history rewrite occurred. Hash comparison found no application, Prisma, migration, test, package, runtime/deployment configuration or database-related file changes.
- **Status/diff:** both uncommitted phases together contain 12 modified tracked documentation files, eight deleted redundant documentation files and 14 untracked documentation files. `git diff --stat` reports 20 tracked files changed, 298 insertions and 9,653 deletions; it excludes the 14 untracked Phase-1 additions. Large deleted counts include exact specification relocation and historical source replacement already preserved in the canonical copy/snapshots.
- **Review readiness:** ready for human review of a documentation-only commit, with the four unresolved authority/product/source issues and the protected historical-formatting exceptions visible. This is not production-readiness certification. Application builds/tests and runtime/database operations were not performed.

| Preserved artifact | SHA-256 before and after Phase 2 |
| --- | --- |
| runtime-test-checklist.md | `27833169392da9d4ef1da05852661200c30981aecfa4aa3d00322841f059a2f1` |
| product-specification.md | `81c4c5e4a3bf1f0f85c236b34cc5d3ff954583024ecc32bdcfa92a928194d16b` |

### Protected legacy link exceptions

The copied historical roadmap retains paths relative to its original location under docs. These two links were already invalid relative to docs/legacy/phase-1 before Phase 2. They do not reference a deleted file, and the snapshot README already documents original-context path semantics. Keeping the snapshot byte-identical preserves the rollback/reference boundary.

| Link retained inside frozen snapshot | Current working destination |
| --- | --- |
| runtime-test-checklist.md with the Candidate Registration / Regular Comprehensive checkpoint anchor | [Original checkpoint in canonical evidence ledger](runtime-test-checklist.md#examination-candidate-registration--regular-comprehensive-examination-5--local--disposable-postgresql-verification-checkpoint--2026-09-23) |
| runtime-test-checklist.md | [Canonical runtime ledger](runtime-test-checklist.md) |

The four intentionally unresolved issues remain: transcript AMENDED publication eligibility; historical three-member Committee wording versus the documented current authoritative model; permanent Course Outline authority; and requested historical sources absent from this checkout. No resolution was invented.

## Final editorial verification (2026-10-08)

This focused pass corrected section spacing, sentence wrapping and compressed punctuation in seven canonical documents, plus this report. Only the Current Verified Baseline Index changed in the runtime checklist. No implementation classification, academic authority, security rule, migration decision or unresolved issue changed. The Phase-2 results and hashes above describe the completed cleanup before this editorial pass; the current verification records follow.

**Exact files changed in this pass:** docs/architecture-security.md, docs/assessment-core.md, docs/formative-assessment.md, docs/notification.md, docs/result-domain.md, docs/runtime-test-checklist.md, docs/summative-examination.md and docs/documentation-migration-report.md.

**Preservation:** the runtime checklist still has 41,452 lines. Removing only the introductory index insertion reproduces all 41,417 original lines from the recorded Git source after accounting for Git line-ending normalization. The historical body from `## Test Environment` onward is byte-identical to the pre-review working copy, as is the original title prefix. Product specification, all four Phase-1 snapshots and their README, and all retained source documents are byte-identical to the pre-review copies. All eight deleted originals were read successfully with `git cat-file blob`, and each recorded blob ID matches its path at the recorded commit.

**Navigation and Markdown:** all 13 canonical paths remain present, without duplicate active canonical filenames. The check covered 28 repository-owned Markdown files and 227 local links/anchors: 225 resolve; the two protected snapshot-relative exceptions remain documented above. No unclosed fences, malformed table column counts or conflict markers were found. A repository-wide deleted-name scan still finds only 24 migration-report lines and seven historical snapshot mentions, with no active navigation dependency. The four original runtime trailing-whitespace lines (3292–3295) remain untouched.

**Untracked coverage:** all 14 untracked documents were checked in full for links, anchors, Markdown structure and whitespace, independently of ordinary `git diff --check`. Each was also compared with an empty file using `git diff --no-index --check`, accepting preserved CRLF endings (`core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol`; command-local `core.autocrlf=false`). Exit 1 denotes file differences, not a whitespace failure. The only formatting diagnostic is the unchanged final blank line at line 429 in the frozen Assessment snapshot; its recorded hash remains exact. No protected snapshot was reformatted.

| Untracked document | Explicit whitespace result |
| --- | --- |
| docs/README.md | pass |
| docs/academic-core.md | pass |
| docs/architecture-security.md | pass |
| docs/documentation-migration-report.md | pass |
| docs/formative-assessment.md | pass |
| docs/legacy/phase-1/README.md | pass |
| docs/legacy/phase-1/assessment-core.md | protected original EOF blank line |
| docs/legacy/phase-1/project-status-and-roadmap.md | pass |
| docs/legacy/phase-1/summative-examination.md | pass |
| docs/legacy/phase-1/transcript-verification.md | pass |
| docs/notification.md | pass |
| docs/product-specification.md | pass |
| docs/result-domain.md | pass |
| docs/security-and-production-hardening-backlog.md | pass |

**Final repository state:** 12 modified tracked documentation files, eight previously deleted originals and 14 untracked documentation files. The tracked diff totals 20 files, 301 insertions and 9,657 deletions; untracked additions are excluded from that statistic. `git diff --check` passes. HEAD and the index remain unchanged. No application, test, Prisma, migration, package, runtime/deployment configuration or other non-documentation file changed during this pass. No staging, commit, push or database operation occurred. Ready for human review of a documentation-only commit, with the four unresolved issues and protected historical exceptions retained.

### Current SHA-256 verification records

These are hashes of the current working-copy bytes. Changed canonical files are listed along with the unchanged product and historical runtime body; this report is excluded to avoid a self-referential checksum.

| Artifact | SHA-256 after editorial review |
| --- | --- |
| docs/architecture-security.md | `362e4d30692f84396db08744c64b92b479318586c3108e03f4fbd64aa42727ee` |
| docs/assessment-core.md | `36d558e2cb1d46ab70ad1b9cfd82d73c09a00d047a4c83b2ba2ca4101316a844` |
| docs/formative-assessment.md | `0e2ae33afb11291a4cb085f20d91de54a433da48dd7ecc203b653068573c9c3c` |
| docs/notification.md | `851483b33e1346c437d0754c5530c028212fe861d360f25cd406f5a7e90251d3` |
| docs/result-domain.md | `077d51bbad4cdf1778ad8f425657bfc8a8cd6c16453193d03b95e17202ace1f5` |
| docs/runtime-test-checklist.md | `c27fd2bbba9367fa1668ac95b7e4c184757cfc7290c68edbbafa575a0f9b3e63` |
| docs/summative-examination.md | `30c3c47406075cadf3e803cfb1969816097ac70c13c02ba9b48fccd409ceb130` |
| docs/product-specification.md (unchanged) | `81c4c5e4a3bf1f0f85c236b34cc5d3ff954583024ecc32bdcfa92a928194d16b` |
| Runtime historical body, from `## Test Environment` through EOF (unchanged) | `225d28a284d04c5968a55bca82e386064c022b9b34ab6a2d3f6b200ace876c61` |

## External hardening-backlog reconciliation (2026-10-08)

**Source and scope:** the historical Security & Production Hardening Backlog dated 2026-05-20 was external to the repository checkout and unavailable during consolidation. This correction uses the priorities and technical recommendations supplied by the project owner in the current review request. The complete original document was not supplied as a repository artifact, imported, hashed or byte-compared; no claim of exhaustive recovery of its unknown contents is made. The earlier missing-source finding remains accurate for the complete original.

Only docs/security-and-production-hardening-backlog.md and this report changed. All SEC-01 through SEC-25 controls remain; unrelated entries were not rewritten. The canonical backlog now records the [priority decisions and their status](security-and-production-hardening-backlog.md#historical-priority-reconciliation), followed by supporting proposed requirements rather than another copy of the checklist.

| Restored area | Canonical treatment |
| --- | --- |
| Biometric imports / SEC-18 | Restored the mandatory historical P0 gate against trusting biometric-sourced attendance for automated examination eligibility before production reconciliation verification. P1 is proposed implementation sequencing only. Restored transactional batch/row ledgers, proposed states, source/count/failure/timestamp fields, identity mappings, deduplication/idempotency inputs, partial/retry/unmatched/timezone handling, scoped reasoned administrator reconciliation, accepted-record eligibility consumption, privacy/retention and the prohibition on fingerprint-template storage. |
| Database isolation / SEC-25 | Restored historical P2; the unsubstantiated canonical P1 promotion is withdrawn because no later approved risk prioritization was found. Preserved gradual high-risk-table RLS evaluation, application guards/object scope, safe denials, session/transaction context, Prisma/pooling compatibility, LAW/BUS negative tests and isolated public verification. The verified CurriculumCourse constraint fix remains narrowly classified. |
| Secure files / SEC-16/17 | Restored the full authorization-to-authorized-download pipeline, private storage, signed URLs/proxy access, per-user/course limits, archive and preview safety, video storage/streaming concerns, failure quarantine, restrictions and audit. P0 production activation remains mandatory despite proposed P1 worker sequencing and bounded MinIO/ClamAV evidence. |
| Notifications / SEC-19 | Restored asynchronous recipient expansion, template rendering, retries/attempt tracking, deduplication, critical preferences, tenant/recipient isolation and audit. BullMQ/Redis and RabbitMQ remain options; real EMAIL/PUSH delivery is not claimed. |
| Operations / SEC-20/21/22 | Restored reproducible packaging, HTTPS/domain/proxy and secrets, automated backups/restore testing, sanitized JSON logs, centralized errors, uptime/resource/queue/auth-security monitoring, incident response/rollback, PostgreSQL connection budgets and Prisma/RLS pooling-mode tests. Existing P0 public-exposure and P1 production-acceptance requirements remain; Docker/Compose, PgBouncer or managed pooling, and expanded APM/metrics are optional P2 choices requiring justification. |

**Decision status and remaining uncertainties:** restoring the biometric gate and historical RLS P2 baseline follows the owner's explicit instruction; it does not approve a delivery schedule, RLS rollout or technology selection. P1 biometric sequencing is proposed. The existing stricter SEC-20 P0 public-exposure gate is retained and explained, without inventing a prior approval. Proposed historical biometric states differ from the current Academic Core lifecycle, so their mapping, the final deduplication key, source-data retention limits, accepted-record criteria and verification matrix require implementation design. RLS candidate tables/context, queue technology, packaging, pooling mode, connection budgets and operational thresholds remain review decisions. The complete external source remains unavailable for exhaustive comparison.

**Academic and evidence preservation:** the owner confirms the canonical Attendance `/5` rubric is current and the printed older Ordinance rubric is outdated for this purpose. No rubric value, academic calculation or authority boundary was changed. Frozen authoritative Attendance `/5` evidence must not be reopened or mutated. All four earlier unresolved issues remain explicit: transcript AMENDED publication eligibility, historical Committee wording, permanent Course Outline authority and complete historical sources absent from the checkout. This correction neither closes a production-hardening item nor broadens runtime claims.

**Correction verification:** all 13 canonical paths remain. Only the two named documentation files changed against this task's preflight; the other 812 present repository files are byte-identical, including the entire 41,452-line runtime checklist (all 41,417 original historical lines), product specification and all Phase-1 snapshots. All 25 SEC entries remain; 23 unrelated rows and every non-negotiable rule are unchanged. The check covered 28 Markdown files and 229 local links/anchors: 227 resolve, with only the same two frozen-roadmap relative-link exceptions. All 14 untracked documentation files received explicit whitespace checks; the frozen Assessment snapshot's final blank line and the four original runtime whitespace lines remain protected. No new formatting errors, malformed tables, unclosed fences or conflict markers were found. `git diff --check` passes. HEAD and index are unchanged; no application tests, runtime/database operations, staging, commit or push occurred.

Current backlog SHA-256 after reconciliation: `46b49e5619d8bdfbe3a2ce06b0708933f6a8164dcd78da01c1635c02e55f9958`. Earlier artifact hashes remain valid. Git status remains 12 modified tracked documentation files, eight previously deleted originals and 14 untracked documentation files; the tracked diff remains 20 files, 301 insertions and 9,657 deletions. This correction changes two untracked documents and is therefore not included in that tracked diff statistic.
