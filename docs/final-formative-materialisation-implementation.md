# Automatic authoritative Final Formative /40 — implementation review

<!-- phase2-reference-note -->
> **Retained historical reference — not the current module specification.** Detailed implementation review, diagnosis, source-owner campaigns, checksum/recovery evidence and operational reconciliation safeguards remain retained evidence. Current contracts/status: [formative-assessment.md](formative-assessment.md). Runtime proof: [Current Verified Baseline Index](runtime-test-checklist.md#current-verified-baseline-index). Historical statements below retain their original scope and do not override later canonical evidence.
<!-- /phase2-reference-note -->

Date: 2026-10-06. Working-tree base: `354fd9560a06efd8a3e59440ded0cd9b64cfee06`, branch `main`.

Classification: **IMPLEMENTED + LOCALLY/STATICALLY VERIFIED + REAL DISPOSABLE POSTGRESQL
VERIFICATION PENDING + UNCOMMITTED + UNSTAGED + NOT DEPLOYED**.

**Real disposable PostgreSQL 18.6 rerun: PENDING USER EXECUTION ON THE PROVEN VMSERVER DOCKER ENVIRONMENT.**
This is not deployed, not ordinary-database migrated, not canonical-server runtime verified,
not production ready, and not a complete final-result workflow. No canonical database was
connected to or modified. No commit or push was performed.

## Current PostgreSQL failure correction — source diagnosis and local verification

This section supersedes the earlier environment-unavailable classification. The user has
proved Docker/PostgreSQL 18.6 usable on `vmserver` (`192.168.197.129`, SSH user `sh002`).
The current Codex session cannot use the user's Windows SSH alias/configuration/agent;
the user will execute the prepared disposable campaign through `ssh vmserver` and return
its output. No further direct server access is attempted. Do not use the historical `.130`
address. Server availability is not the remaining blocker; execution evidence is pending.

**Root cause diagnosed from current source: production migration syntax defect, not a
truncated function emitted by the test harness.** The raw PostgreSQL reproduction remains
pending, so this is not yet a claim of a successful real-database correction campaign.

The unchanged `statements()` function emits 29 parent-fixture statements, 13 migration
statements, and 24 ready-fixture statements. All six migration function bodies are preserved
byte-for-byte and have both dollar-quote delimiters. The first relevant migration statement
is number 4, `CREATE FUNCTION final_formative_sources(...)`; it is complete.

Inside that function, two bare SQL `CASE WHEN ... THEN 4 ELSE 1 END` expressions occur in
the Comprehensive source-cardinality `IF` condition (migration lines 192 and 194).
PostgreSQL's PL/pgSQL grammar reads an IF expression through the first `THEN` at parenthesis
depth zero. It therefore ends the condition at the first CASE's internal THEN, passing an
unfinished CASE expression to the SQL parser. This explains SQLSTATE `42601`, `syntax error
at end of input`, during function creation, before individual database assertions run.
Evidence: PostgreSQL 18's `expr_until_then` and `read_sql_construct` implementations in
[the PostgreSQL parser source](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/pl/plpgsql/src/pl_gram.y).

The correction adds parentheses around those two CASE expressions: exactly four inserted
characters. Required source/seat counts, arithmetic, department/academic scope, restrictive
FKs, source provenance, Serializable isolation, immutability and audit coupling are unchanged.
Application code and the SQL splitter are unchanged. No dependency or infrastructure was added.

Two focused regressions were added:

- preserve all six complete function bodies and exclude migration transaction wrappers;
- require both CASE cardinality expressions to be grouped inside the PL/pgSQL IF condition.

The second regression was run against both source versions in memory: it fails against the
preserved original and passes against the correction. This is a static regression, not
PostgreSQL execution evidence.

Only these repository files changed in this correction continuation:

```text
apps/api/prisma/migrations/202610060001_automatic_final_formative/migration.sql
apps/api/prisma/final-formative.database.test.ts
apps/api/prisma/final-formative.schema.test.ts
docs/final-formative-materialisation-implementation.md
```

Additional pre-edit recovery snapshot:
`C:\Users\saifu\AppData\Local\Temp\lexora-ff-postgres-fix-recovery-949yk5g0`.

Independently rerun local results after the correction:

| Check | Result |
| --- | --- |
| Prisma validate | PASS, exit 0 |
| Prisma generate | PASS, Prisma Client 6.19.3, exit 0 |
| `pnpm --filter @lexora/api typecheck` | PASS, exit 0 |
| `pnpm --filter @lexora/api build` | PASS, exit 0 |
| Focused runner | 176 tests: 171 passed, 0 failed, 5 skipped, exit 0 |
| Regression runner | 427 tests: 425 passed, 0 failed, 2 skipped, exit 0 |
| Combined | 596 passed, 0 failed, 7 database suites skipped |
| `git diff --check` | PASS, exit 0; EOL policy warnings only |

### User-run disposable verification handoff

The prepared archive is outside the Git working tree:
`C:\Users\saifu\AppData\Local\Temp\lexora-ff-postgres-campaign-c8myinis.tar.gz`.
Its accompanying directory contains `verify-disposable.sh`, `run-suite.cjs`, local logs,
the exact original migration, source/compiled-test payload and SHA-256 checksums.
The shell script passed `bash -n`; the Node runner passed `node --check`.
This validates script syntax only; the server campaign has not been executed by Codex.

The script uses an already-installed `postgres:18.6` image with `--pull=never`, a random
container name, a random loopback-only port, tmpfs data, a clearly named disposable test
database, exact `180006` version verification and `Asia/Dhaka` timezone. It copies existing
dependencies into a private `/tmp` workspace, rejects dependency links escaping that
workspace, and generates a Linux Prisma client only in that copy. It does not install
software, mutate the canonical checkout, load its `.env`, or connect to `lexora_lms`.
Disposable credentials stay in memory/environment and are redacted before test logs are
written. Non-interactive sudo is required; the script does not request passwords.

The first phase executes the original parents, migration and ready scripts directly with
`psql`, bypassing the TypeScript splitter. It requires reproduction of the original 42601
error, then requires all three corrected raw scripts to pass. An unexpected original pass
stops the campaign for renewed diagnosis. The second phase runs Final Formative, Activities
finalisation and Attendance generation database suites separately, capturing exact TAP
counts and treating skips as incomplete verification. Cleanup removes the container and
private workspace, checks removal, and compares canonical Git state and generated-client
checksums. Sanitized evidence remains in a separately named `/tmp/lexora-ff-evidence.*`
directory. Cleanup and canonical-state checks remain unverified until the user returns output.

No current real-DB passed/failed/skipped counts can be claimed. All three suites and raw SQL
checks are pending this user-run campaign. The user's earlier failing campaign did not
supply complete counts, so none are inferred.

### Remaining evidence boundaries

- **Terminal-source real-DB integration: still a gap.** The aggregate suite calls the real
  materialiser against synthetic authoritative parents. Its six arrival-order cases insert
  those parents directly. Activities and Attendance DB suites inject no-op reconciliation
  collaborators; they do not demonstrate the terminal service producing an aggregate.
  Current source review likewise does not establish real Comprehensive-terminal integration.
  No extra integration implementation is introduced before the aggregate campaign passes.
- **Exact-current snapshot/migration-chain compatibility: pending.** Synthetic fixtures
  are not a restore of the ordinary database or proof of its exact migration history.
- **Canonical deployment and authenticated runtime: pending and outside this correction.**
  No deployment, ordinary migration, publication or production-readiness claim is made.

## Source-of-truth review

Reviewed the current runtime checklist (including its latest Activities runtime closure),
roadmap, consolidated specification, result/publication architecture, Prisma models,
component migrations, terminal services, repository implementations, and focused tests.
Historical evidence and runtime/deployment documentation were left unchanged.
The requested `docs/security-and-production-hardening-backlog.md` does not exist in this
checkout; no matching replacement was found. Current source and later runtime evidence
take precedence over older foundation/current-status wording.

## Persistence and source contract

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
Regular candidate registration/version/course/roster identities, curriculum assignment/version/
course, syllabus, assessment template, and component rules. Composition uses the single rule
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

## Integration, transactions, and database protections

AssessmentModule and AttendanceModule import FinalFormativeModule. The latter imports only
PrismaModule; it does not import either component-owning module.

Reconciliation runs after source package creation and its required audit in:

1. `FormativeActivitiesFinalisationService.finalise`;
2. `AttendanceMarkGenerationService.generate`;
3. `ComprehensiveExaminationService.finalise`, including its existing idempotent-return path.

The injected provider is mandatory. Existing guards, policies, principal-derived department
scope, object authority, and source validations remain intact. Existing source-only database
tests inject an explicit no-op aggregate collaborator because their synthetic schemas test
only their respective historical migrations; they are not aggregate integration evidence.

The service accepts the source owner's existing Serializable TransactionClient. Source,
aggregate, and required audits commit or roll back together. All source owners already take
the Examination mutex first. Reconciliation writes a neutral Examination row version to force
waiting Serializable transactions onto the existing bounded serialization/deadlock retry path.
Contexts are processed in deterministic ExaminationCourse/Enrollment order. Database uniqueness
is the final duplicate barrier. The insert trigger also requires Serializable isolation and
locks the same Examination. No unbounded or generic-error retries were added.

Migration `202610060001_automatic_final_formative` adds:

- one table, a unique context constraint, two indexes, ten restrictive foreign keys;
- exact range/full-mark/sum and rule checks;
- an insert guard and immutable UPDATE/DELETE guard;
- deferred complete-source-package and required-audit validation;
- audit UPDATE/DELETE rejection and duplicate/foreign-transaction audit rejection.

The typed event `formative.final.materialised` uses the existing `SERVICE` actor type, with
no human approval attribution. Metadata includes aggregate/context/source identities,
component snapshots, provenance, composition rule, and authoritative total. A successful
insertion requires exactly one matching success audit from the same transaction. Repeated
exact reconciliation does not insert another success audit.

No historical migration was edited. No academic backfill is included. The new migration has
an explicit `.gitattributes` `-text` entry and a `.gitignore` inclusion. Its reviewed SHA-256 is:

`9893b7f82e0cccef763c4454200dd676a624280021613fce3653fe7796dbf7ec`

The preserved pre-correction migration SHA-256 was
`d4e1b169e503b21548925c17c804f6ee729ccede7bcda1ec92428a3ee75ca62d`.

## Pre-existing ready triples

The application-level operational CLI invokes the same service and validators. It is not an
academic approval action, an application-startup backfill, or a migration calculation.

After separate deployment/migration and operational authorization, the command is:

```text
pnpm --filter @lexora/api formative:reconcile --apply --department <department-id> --examination <examination-id> --expected-database <database-name>
```

It requires the deliberately supplied `LEXORA_FINAL_FORMATIVE_RECONCILE_DATABASE_URL`; it
does not fall back to `DATABASE_URL`. The expected database name must match. It prints only
created/existing/not-ready counts and sanitizes errors. No URL, credentials, or individual
marks are printed. An entire Examination reconciliation is transactional and retryable.
The command was not run against any database during this task.

## Continuation review and recovery snapshot — 2026-10-06

The continuation preserved the interrupted implementation. Initial and final repository
checks confirmed `main` at the base above, with the same `origin/main`, no staged
files and no unrelated working-tree changes. No staging, commit, push, migration,
deployment or canonical database connection was performed.

Before editing, a recovery snapshot was created outside the Git working tree at:

`C:\Users\saifu\AppData\Local\Temp\lexora-final-formative-recovery-c7o4pcge`

It contains a full binary tracked patch, an archive of all 15 modified tracked and 13
untracked implementation files, and a SHA-256 manifest. Archive integrity and each
file digest were verified. Environment files and credentials were not included.

Manual findings before correction:

- **Critical:** none found.
- **High:** real PostgreSQL 18.6 execution remains a release blocker. Static review
  cannot establish migration, native trigger, concurrency or database rollback behavior.
- **Medium:** the disposable harness lacked explicit Attendance-only and
  Comprehensive-only readiness cases and did not verify schema cleanup. Cleanup also
  needed to be conditional on this invocation successfully creating the schema.
- **Low:** 12 tracked implementation files contained mixed LF/CRLF endings. The prior
  environment paragraph attributed the limitation to an unverified user confirmation.
- **Suggestion:** none requiring additional scope.

Continuation corrections are limited to the database harness and this document.
The harness now covers all seven incomplete source combinations (including no sources),
cleans up only a schema successfully created by the invocation, attempts cleanup even
if client disconnection fails, and verifies the schema is absent afterward. These new
database cases remain unexecuted until a safe disposable PostgreSQL environment is available.
No application service, rule, schema, CLI, fixture or migration semantics were changed.

Line-ending cleanup changed CRLF to LF only in the 12 already-modified tracked files
listed below. The complete binary Git diff was byte-identical immediately before and
after normalization, proving that no semantic implementation edit was lost:

```text
.gitattributes
.gitignore
apps/api/package.json
apps/api/prisma/attendance-mark-generation.database.test.ts
apps/api/prisma/formative-activities-finalisation.database.test.ts
apps/api/prisma/schema.prisma
apps/api/src/modules/assessment/application/services/formative-activities-finalisation.service.test.ts
apps/api/src/modules/assessment/application/services/formative-activities-finalisation.service.ts
apps/api/src/modules/assessment/assessment.module.ts
apps/api/src/modules/attendance/application/services/attendance-mark-generation.service.ts
apps/api/src/modules/attendance/attendance.module.ts
apps/api/src/modules/examination-registration/examination-workflow.test-harness.ts
```

Git already normalized these endings in its displayed diff, so the initial diff was
compact rather than a whole-file rewrite. Git's LF-to-CRLF policy warnings may remain;
they do not indicate lost changes. At that earlier checkpoint, migration bytes retained
the pre-correction SHA-256 recorded above.
The latest runtime checklist, roadmap and historical runtime evidence were not edited.

## Previous continuation local verification evidence (historical)

The commands below were independently rerun during this continuation from the current
source; these results are not carried forward from the interrupted report. Prisma
commands used a credential-free offline connection placeholder. Schema-to-schema diff
does not connect to PostgreSQL. Tests ran against the freshly compiled application
with database URL/confirmation variables removed from their child environment.

| Check | Result |
| --- | --- |
| Prisma validation | PASS |
| Prisma generation | PASS, Prisma Client 6.19.3 |
| Prisma schema-to-schema migration diff, no database connection | PASS; table, columns, indexes and restrictive FKs align |
| New aggregate rules/service/schema tests | 26 passed; database suite skipped |
| Aggregate/Attendance/Class Session focused runner | 169 passed, 0 failed, 5 database suites skipped |
| Comprehensive/Activities/candidate/committee/authorization runner | 425 passed, 0 failed, 2 database suites skipped |
| API typecheck | PASS |
| API Nest/CommonJS build | PASS |
| `git diff --check` | PASS |

Raw runner summaries:

```text
node scripts/test-final-formative.cjs
tests 174; pass 169; fail 0; cancelled 0; skipped 5; todo 0; exit 0

node scripts/test-comprehensive.cjs
tests 427; pass 425; fail 0; cancelled 0; skipped 2; todo 0; exit 0

pnpm --filter @lexora/api prisma validate: exit 0, schema is valid
pnpm --filter @lexora/api prisma generate: exit 0, Prisma Client 6.19.3 generated
pnpm --filter @lexora/api typecheck: exit 0
pnpm --filter @lexora/api build: exit 0
git diff --check: exit 0, no whitespace errors (Git EOL policy warnings only)
```

Local runner logs and the offline schema diff are outside the working tree at
`C:\Users\saifu\AppData\Local\Temp\lexora-final-formative-verification-hdv4zjos`.
An initial test launch was interrupted after PowerShell's environment provider failed
to enumerate duplicate environment keys. A names-only check confirmed no database
test opt-in variables were inherited. The successful runs used explicit Node child
environment sanitization. No database connection was attempted. The successful
runners reported approximately 2,709 seconds and 2,705 seconds elapsed respectively;
the prolonged tool execution is not treated as additional verification evidence.

The 26 new aggregate tests are included in the 169 focused-runner passes; they are not an
additional 26 on top. Combined executed groups contain 594 passes and seven skipped database
suites. Of these, 568 passes are source/security regressions and integration checks. Service
test doubles cover transaction propagation and rollback behavior only at the application
contract level; they are not PostgreSQL rollback evidence.

The disposable harness uses a dedicated opt-in connection, loopback-only `*_test` database
validation, an exact 18.6 version check, randomly named schemas, and cleanup in `finally`.
Its synthetic authoritative parent fixtures intentionally allow malformed packages so the
new resolver can be challenged without disabling production triggers. It executes the actual
new migration and actual application service when a suitable disposable database is available.
It does not represent a full historical-migration-chain/server campaign.

The harness covers readiness combinations, all six arrival orders, exact arithmetic and
precision, source identity binding, scope/provenance/state corruption, bounds, idempotency,
conflicting replacement, concurrent Serializable snapshots with a barrier, persisted-source
forgery, restrictive FKs, UPDATE/DELETE protection, and audit/transaction failures.

## Previous environment limitation (historical; superseded above)

The following records the earlier local-session limitation, not the current vmserver state.

The continuation found no Docker, Podman, psql, postgres, initdb or pg_ctl command and
no matching native PostgreSQL/container service or installation in the inspected standard
locations. WSL is installed, but `wsl --list --quiet` failed with
`Wsl/EnumerateDistros/Service/E_ACCESSDENIED`. This does not establish that no WSL
PostgreSQL installation exists; it establishes that no safe isolated instance could be
verified or used from this session. No software was installed, no network exposure changed,
and no database was connected to. The canonical `lexora_lms` database was not used as
a substitute. All database opt-ins were disabled for local verification.

Each of the following is **BLOCKED BY CURRENT ENVIRONMENT / PENDING**:

- fresh PostgreSQL 18.6 instance/version verification;
- migration execution and complete source-migration compatibility;
- native constraints, restrictive foreign keys, and trigger execution;
- database readiness/source-coherence/mark-integrity cases;
- database idempotency and conflicting-source rejection;
- genuine concurrent materialisation and one-package/one-audit convergence;
- ordinary PostgreSQL UPDATE and DELETE rejection;
- required-audit-failure and transaction rollback, including terminal source integration;
- real source-boundary PostgreSQL regressions;
- disposable database cleanup verification (no instance was created here).

## File inventory for manual review

Modified tracked files:

```text
.gitattributes
.gitignore
apps/api/package.json
apps/api/prisma/schema.prisma
apps/api/prisma/attendance-mark-generation.database.test.ts
apps/api/prisma/formative-activities-finalisation.database.test.ts
apps/api/src/modules/assessment/assessment.module.ts
apps/api/src/modules/assessment/application/services/formative-activities-finalisation.service.ts
apps/api/src/modules/assessment/application/services/formative-activities-finalisation.service.test.ts
apps/api/src/modules/assessment/application/services/comprehensive-examination.service.ts
apps/api/src/modules/assessment/application/services/comprehensive-examination.service.test.ts
apps/api/src/modules/attendance/attendance.module.ts
apps/api/src/modules/attendance/application/services/attendance-mark-generation.service.ts
apps/api/src/modules/attendance/application/services/attendance-mark-generation.service.test.ts
apps/api/src/modules/examination-registration/examination-workflow.test-harness.ts
```

New, untracked files:

```text
apps/api/prisma/migrations/202610060001_automatic_final_formative/migration.sql
apps/api/prisma/final-formative.database.test.ts
apps/api/prisma/final-formative.schema.test.ts
apps/api/prisma/fixtures/final-formative.parents.sql
apps/api/prisma/fixtures/final-formative.ready.sql
apps/api/prisma/reconcile-final-formative.cli.ts
apps/api/scripts/test-final-formative.cjs
apps/api/src/modules/final-formative/final-formative.module.ts
apps/api/src/modules/final-formative/final-formative.service.ts
apps/api/src/modules/final-formative/final-formative.service.test.ts
apps/api/src/modules/final-formative/domain/final-formative.rules.ts
apps/api/src/modules/final-formative/domain/final-formative.rules.test.ts
docs/final-formative-materialisation-implementation.md
```

Staged files: none. All implementation changes remain uncommitted for manual review.

<!-- final-formative-verification-supersession-20261007 -->

## Verification supersession — 2026-10-07

This later checkpoint supersedes only earlier current-status wording that described
real disposable PostgreSQL verification, source-boundary PostgreSQL verification or
exact-current migration-chain compatibility as pending or blocked.

Historical local-environment limitations, interrupted attempts and failed verification
evidence remain preserved above. They are not deleted or rewritten.

Working-tree base remains:

`354fd9560a06efd8a3e59440ded0cd9b64cfee06`

Current classification:

**IMPLEMENTED + LOCAL TYPECHECK/BUILD VERIFIED + CORRECTED MIGRATION REAL
POSTGRESQL 18.6 VERIFIED + CORE FINAL-FORMATIVE REAL DB 76/76 PASS +
SOURCE-OWNER REAL DB REGRESSIONS 43/43 PASS + OWNER-HOOK
APPLICATION/HARNESS 117/117 PASS + EXACT-CURRENT ORDINARY-SNAPSHOT /
PRISMA MIGRATION-CHAIN VERIFIED + UNCOMMITTED + NOT ORDINARY-DB
DEPLOYED + NOT CANONICAL AUTHENTICATED-RUNTIME VERIFIED**

No commit or push has been performed for this Final Formative work.

### Corrected migration identity

Target migration:

`202610060001_automatic_final_formative`

Current reviewed migration SHA-256:

`9893b7f82e0cccef763c4454200dd676a624280021613fce3653fe7796dbf7ec`

The earlier PostgreSQL `42601` failure was traced to PL/pgSQL condition syntax in
the migration and corrected without changing the intended academic or authorization
policy.

The corrected migration was subsequently executed successfully against real
PostgreSQL 18.6.

### Core Final Formative real PostgreSQL evidence

The actual Final Formative migration and actual `FinalFormativeService` were exercised
against disposable PostgreSQL 18.6.

Result:

- tests: `76`;
- passed: `76`;
- failed: `0`;
- skipped: `0`.

The real-database suite covered, among other cases:

- no, partial and complete authoritative source combinations;
- all six source-arrival orders;
- exact Decimal arithmetic and six-decimal precision;
- exact source identity binding;
- department, student, enrollment, offering, term and examination scope rejection;
- stale, malformed and non-final source rejection;
- source full-mark bounds;
- immutable existing aggregate/source conflict rejection;
- real simultaneous Serializable attempts converging to one aggregate package/audit;
- aggregate UPDATE/DELETE rejection;
- protected audit UPDATE/DELETE rejection;
- required-audit and transaction rollback cases;
- native checks and restrictive foreign keys;
- forged persisted source IDs, marks and provenance rejection.

The aggregate is therefore backed by real PostgreSQL migration, trigger, constraint,
transaction and concurrency evidence rather than only unit-test doubles.

### Source-owner real PostgreSQL regressions

The existing terminal source domains were rerun against the disposable PostgreSQL
environment after the Final Formative integration changes:

- Activities Chairman finalisation: `17/17 PASS`;
- Attendance Chairman generation: `26/26 PASS`.

Combined source-owner real database regressions:

`43/43 PASS`

These suites verify that the existing authoritative source packages and their
database protections remain valid after the integration changes.

They intentionally stub the Final Formative reconciliation dependency and therefore
are not claimed as a real-PostgreSQL production-owner-to-aggregate integration test.

### Production owner-hook application evidence

Focused production-service application/harness suites passed:

- Activities owner hook: `17/17`;
- Attendance owner hook: `21/21`;
- Comprehensive owner hook/harness: `79/79`.

Combined:

`117/117 PASS`

The hook-focused evidence verifies the production call placement, transaction
propagation and rollback contract, including aggregate failure escaping/rolling back
the owning terminal transaction where applicable.

These suites use a mocked Final Formative dependency. They do not by themselves prove
real PostgreSQL aggregate materialisation.

The combined evidence boundary is therefore intentionally compositional:

1. the production owner-hook suites prove the real application wiring/order and
   transaction/rollback contract;
2. the `76/76` Final Formative PostgreSQL suite proves the actual aggregate service,
   migration, resolver, audit, immutability and concurrency behavior;
3. the `43/43` source-owner PostgreSQL regressions prove the existing terminal source
   packages remain sound.

No single real-PostgreSQL test invoking a production owner service with the actual
`FinalFormativeService` is claimed. The combined evidence was accepted as sufficient
for the current terminal-hook composition boundary without adding another monolithic
integration suite.

### Exact-current ordinary snapshot and migration-chain verification

Before migration-chain verification, a read-only custom-format snapshot of the
current ordinary `lexora_lms` PostgreSQL database was created.

Snapshot evidence:

- PostgreSQL source database: ordinary `lexora_lms`;
- dump size: `2,234,440` bytes;
- TOC entries: `1612`;
- SHA-256:
  `b1f89a571058a23f563d2d50bda670452faf77e0744b73291ccf264747307a02`;
- dump file mode: `0600`;
- private backup directory mode: `0700`.

The snapshot was restored into a fresh loopback-only PostgreSQL 18.6 disposable
database named:

`lexora_ff40_chain_test`

Pre-migration restored state:

- public tables: `132`;
- completed Prisma migrations: `40`;
- incomplete migrations: `0`;
- Final Formative migration-history rows: `0`;
- `formative_final_results`: absent.

The restored database was compared read-only against the ordinary runtime database:

- public table count: exact match;
- completed migration count: exact match;
- migration-history fingerprint:
  `285c97c880ab74fddc473b3981cb0d29` on both;
- selected academic/business row cardinalities: exact match.

The canonical server repository contained exactly the same `40` completed migration
directories as the ordinary database history.

An isolated Prisma workspace was then constructed from:

- those exact `40` canonical migration directories;
- the exact current local `schema.prisma`;
- the exact reviewed Final Formative migration as migration `41`.

Prisma validation passed against the isolated schema.

`prisma migrate deploy` targeted only the disposable restored database and applied
exactly:

`202610060001_automatic_final_formative`

Post-deployment verification established:

- completed migrations: `41`;
- incomplete migrations: `0`;
- exact target migration history: one completed row;
- recorded target checksum:
  `9893b7f82e0cccef763c4454200dd676a624280021613fce3653fe7796dbf7ec`;
- `formative_final_results`: present;
- `final_formative_sources(text,text,text)`: present;
- `final_formative_matches(text,jsonb)`: present;
- Final Formative table application triggers: `3`;
- automatic aggregate backfill rows: `0`;
- selected pre-existing academic/business data: preserved.

A second Prisma migration status/deploy cycle reported:

`Database schema is up to date!`

and:

`No pending migrations to apply.`

The second deployment was therefore a true no-op.

### Ordinary runtime safety

Throughout the snapshot/restore/migration-chain campaign, the ordinary runtime
database remained unmigrated for Final Formative.

Before and after the disposable migration campaign:

- Final Formative ordinary migration-history rows: `0`;
- ordinary `formative_final_results`: absent;
- ordinary migration-history fingerprint remained unchanged.

The canonical Ubuntu repository also remained:

- HEAD:
  `354fd9560a06efd8a3e59440ded0cd9b64cfee06`;
- `origin/main`:
  `354fd9560a06efd8a3e59440ded0cd9b64cfee06`;
- worktree: clean.

After verification:

- disposable PostgreSQL container: removed;
- disposable database credential file: removed;
- loopback port `55432`: free;
- private snapshot and non-secret verification evidence: retained;
- Direct API health: HTTP `200`;
- Nginx API health: HTTP `200`.

No database credential, raw authentication token or other secret is preserved in this
documentation.

### Current non-claims and remaining boundary

This checkpoint does not claim:

- a commit or push of the Final Formative implementation;
- deployment of migration `202610060001_automatic_final_formative` to ordinary
  `lexora_lms`;
- activation of the Final Formative code in the canonical PM2 application;
- canonical authenticated terminal-source-to-aggregate runtime verification;
- locked Formative `/40` plus locked Summative `/60` integration;
- complete course-result Chairman finalisation;
- result-document generation;
- Controller of Examinations publication;
- published-result GPA/CGPA/transcript consumption;
- frontend completion;
- cloud/public production readiness.

The current `/40` implementation has therefore crossed its local/static,
real-PostgreSQL and exact-current pre-deployment migration-compatibility verification
boundaries, while remaining deliberately uncommitted and undeployed pending manual
review.

<!-- final-formative-current-bytes-verification-supersession-20261007 -->

## Current-bytes verification supersession — 2026-10-07

This checkpoint supersedes earlier current-status references to migration SHA-256
`9893b7f82e0cccef763c4454200dd676a624280021613fce3653fe7796dbf7ec`.

That earlier evidence remains preserved as historical evidence for the migration bytes
tested at that checkpoint. It is not deleted or rewritten.

The current reviewed migration is:

`202610060001_automatic_final_formative`

Current SHA-256:

`a504444c4d7197a0a21f5d882e84eca94ee7bec81fa5d8602d7dc6f395283d63`

Current classification:

**IMPLEMENTED + LOCAL TYPECHECK/BUILD VERIFIED + CURRENT-BYTES REAL POSTGRESQL
18.6 MATRIX 371/371 PASS + CURRENT EXACT ORDINARY-SNAPSHOT 40->41 PRISMA
MIGRATION-CHAIN VERIFIED + HARDENED OPERATIONAL RECONCILIATION VERIFIED +
UNCOMMITTED + NOT ORDINARY-DB DEPLOYED + NOT CANONICAL AUTHENTICATED-RUNTIME
VERIFIED**

No Final Formative commit or push has been performed.

### Current-byte real PostgreSQL evidence

The corrected current migration bytes passed the consolidated real PostgreSQL 18.6
matrix:

- tests: `371`;
- passed: `371`;
- failed: `0`;
- skipped: `0`.

This current-byte matrix supersedes earlier migration-byte evidence for current
verification status.

### Exact ordinary-snapshot migration-chain evidence

The retained exact ordinary `lexora_lms` snapshot was restored into an explicitly
disposable PostgreSQL 18.6 database.

Pre-deployment restored state:

`40 completed | 0 incomplete | target absent | formative_final_results absent`

An isolated Prisma workspace was constructed from exactly:

- the 40 migrations recorded completed by the restored ordinary snapshot;
- current migration `202610060001_automatic_final_formative`.

The isolated workspace therefore contained exactly `41` migration directories.

Verified:

- Prisma schema validation: PASS;
- first migrate deploy applied only the target Final Formative migration;
- completed migrations after deploy: `41`;
- incomplete migrations: `0`;
- recorded target checksum:
  `a504444c4d7197a0a21f5d882e84eca94ee7bec81fa5d8602d7dc6f395283d63`;
- second migrate deploy: true no-op;
- selected pre-existing academic data: preserved.

### Restored authoritative source package

The exact retained authoritative sources resolved to:

- Activities: `24.00 / 30`;
- Attendance: `3.50 / 5`;
- Comprehensive Examination: `4.00 / 5`;
- derived Final Formative source total: `31.50 / 40`.

Retained source identities included:

- Activities finalisation:
  `cmuvgcht300072i4dw35tv2ji`;
- Attendance generation:
  `cmuw2ox3r001p2ib6ihwfdtaq`;
- Attendance version:
  `cmuw2ox43001r2ib6kqaetc5q`;
- Comprehensive finalisation:
  `cmuw2yavx00452ib6fqvm9lk8`;
- Comprehensive result:
  `cmuw2yaw100472ib6xw2n450j`.

### Hardened operational reconciliation

The hardened operational CLI was run through the dedicated disposable connection
against expected database:

`lexora_ff40_chain_test`

First reconciliation:

`created=1 | existing=0 | notReady=0`

Independent PostgreSQL read-back verified:

- aggregate count: exactly `1`;
- Activities snapshot: `24.00`;
- Attendance snapshot: `3.50`;
- Comprehensive snapshot: `4.00`;
- Final Formative: `31.50 / 40.00`;
- rule: `FINAL_FORMATIVE_40_SUM_V1`;
- exact authoritative source bindings: PASS;
- protected `SERVICE` success audit: exactly `1`;
- protected audit context: exact match.

Second reconciliation:

`created=0 | existing=1 | notReady=0`

The aggregate remained exactly one row and the protected success-audit cardinality
remained exactly one. Reconciliation is therefore idempotent for the retained exact
source package.

This campaign exercises the actual Final Formative service/CLI against a real restored
PostgreSQL snapshot. It does not claim that a single real-PostgreSQL test invokes a
production Activities, Attendance or Comprehensive terminal-owner service and the
actual FinalFormativeService together in one monolithic test.

### Ordinary database non-mutation proof

The ordinary `lexora_lms` database was read before and after the disposable campaign.

Final Formative state:

`0|ABSENT -> 0|ABSENT`

Migration-history fingerprint:

`17e2ee5d277fe5c806764ac26c061176`
`->`
`17e2ee5d277fe5c806764ac26c061176`

The ordinary database was therefore not migrated or otherwise changed by this
pre-deployment campaign.

### Cleanup and retained evidence

The disposable PostgreSQL container and temporary state directory were removed and
loopback port `55432` was verified free.

The validated private pre-migration snapshot remains retained.

Sanitised verification evidence:

`/home/sh002/.local/state/lexora/ff40-evidence/final-formative-current-predeployment-closure-20261007.txt`

Evidence SHA-256:

`262e72ee6ab656a2823d02c93434f058ee8c5e911aaf67f7ddc6bcedcfa86dfc`

No raw database credential is recorded in that evidence.

Still pending:

- commit/push of the reviewed implementation;
- ordinary `lexora_lms` migration deployment;
- build/activation of the committed implementation on the canonical server;
- canonical authenticated runtime verification of automatic `/40` materialisation;
- later `/40 + locked /60` final-result integration;
- complete-result Chairman finalisation;
- result-document generation;
- Controller publication;
- published-result registry/downstream GPA/CGPA/transcript integration;
- frontend and broader production hardening.

<!-- final-formative-canonical-runtime-supersession-20261007 -->

## Canonical authenticated deployment/runtime supersession — 2026-10-07

This checkpoint supersedes earlier **current-status** wording in this document that
described the Final Formative implementation as uncommitted, not ordinary-database
deployed, not PM2 activated, or not canonical authenticated-runtime verified.

Historical pre-deployment evidence remains valid and preserved above.

Runtime-verified implementation commit:

`9c407ef4da4eaeb777a72e8cc7ec056f557fcb80`

Current migration:

`202610060001_automatic_final_formative`

Current deployed migration SHA-256:

`a504444c4d7197a0a21f5d882e84eca94ee7bec81fa5d8602d7dc6f395283d63`

Current classification:

**IMPLEMENTED + COMMITTED + PUSHED + ORDINARY-DB DEPLOYED + PM2 ACTIVATED +
TARGETED AUTHENTICATED CANONICAL-SERVER RUNTIME VERIFIED FOR THE TESTED
COMPREHENSIVE IDEMPOTENT TERMINAL-OWNER PATH**

### Deployment and activation

The exact committed implementation was promoted to the canonical Ubuntu runtime.

The ordinary `lexora_lms` database received the target migration successfully and the
deployed application was activated under PM2.

Verified runtime posture included:

- repository HEAD/origin:
  `9c407ef4da4eaeb777a72e8cc7ec056f557fcb80`;
- clean/aligned repository;
- PM2 application online;
- Direct API HTTP `200`;
- Nginx API HTTP `200`;
- NestJS listener restricted to `127.0.0.1:4000`;
- no automatic startup materialisation before the controlled terminal-owner action.

### Canonical authenticated materialisation

The successful campaign began with no Final Formative aggregate/audit for the retained
context and with authoritative source values:

`24.00 + 3.50 + 4.00`

The deployed application then verified:

- unauthenticated terminal-owner call: HTTP `401`;
- authenticated Teacher call to Chairman-only finalisation: safe HTTP `404`;
- denied Teacher request created no Final Formative evidence;
- authenticated current Chairman terminal-owner call: HTTP `201`;
- exactly one immutable Final Formative aggregate:
  `31.50 / 40.00`;
- exact composition rule:
  `FINAL_FORMATIVE_40_SUM_V1`;
- exact component source/provenance bindings;
- exactly one protected `SERVICE` success audit;
- existing Comprehensive finalisation/audit remained exactly one.

An authenticated repeated Chairman call with forged
`x-department-id: dept_bus_test` remained bound to the real LAW principal scope:

- aggregate/audit remained `1|1`;
- Comprehensive finalisation/audit remained `1|1`;
- foreign-department aggregate count remained `0`.

The materialised aggregate rejected ordinary `UPDATE` and `DELETE`.
Its protected success audit also rejected ordinary `UPDATE` and `DELETE`.

Temporary authentication state was restored after the campaign:

`2 NULL password hashes | 0 active sessions`

No raw password, hash, token, database credential or other authentication secret was
persisted in documentation.

### Recovery evidence

Validated private pre-runtime backup:

`/home/sh002/lexora-private-backups/lexora_lms-before-ff40-canonical-runtime-20261007T162924Z.dump`

SHA-256:

`614e213470a9853376eb0d298609f2e27bbbe9f9baefc6dfbd5cf144e45812cb`

File mode:

`0600`

The backup passed custom-format archive validation and remains outside Git.

### Runtime evidence boundary

This runtime closure is deliberately narrow.

It directly demonstrates the deployed production Comprehensive terminal-owner
integration invoking automatic Final Formative reconciliation through the tested
**existing-finalisation idempotent path** against the ordinary PostgreSQL database.

It does not separately claim that a newly created first-time Comprehensive finalisation
was observed in the same canonical runtime campaign.

It also does not replace the wider pre-deployment PostgreSQL matrix covering source
arrival order, concurrent materialisation, rollback, malformed/stale/conflicting source
packages, database constraints and audit-coupling failure cases.

Those broader cases remain supported by the separately preserved current-byte
PostgreSQL verification evidence. The canonical campaign supplies the missing deployed,
authenticated HTTP/ordinary-database evidence for the tested path.

### Next boundary

The Final Formative implementation itself is closed within this tested backend/runtime
scope.

The next academic implementation boundary is not another `/40` approval layer.

It is:

**authoritative immutable Final Formative `/40` + Chairman-approved/final-locked
Summative `/60` integration**

The later complete-result engine must consume those two already-authoritative sources,
preserve their exact identities/versions, and enforce the confirmed separate component
pass thresholds:

- Formative: `16/40`;
- Summative: `24/60`.

Complete course-result Chairman finalisation, official documents, Controller publication,
published-result registry, GPA/CGPA/transcript consumption, frontend completion and
broader production hardening remain separate later work.
