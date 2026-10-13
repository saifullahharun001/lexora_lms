# Fresh CRC PostgreSQL runtime campaign

This is a **synthetic current-schema functional environment**, independent of the
production-shaped migration/baseline harness. It never restores backups, resolves
migrations, writes a migration ledger or approves a baseline.

## Run

Use a checkout with installed workspace dependencies, Node >=22, pnpm and a local
Docker Desktop/Linux daemon. No database URL, production credentials, PostgreSQL
client, SSH tunnel or historical archive is required.

From the repository root:

~~~powershell
docker pull postgres:18.6
pnpm --filter @lexora/api test:crc-fresh
~~~

The package command generates Prisma Client, runs fresh-harness static tests,
typechecks and builds the API, then invokes the runner with explicit --apply.
The runner refuses remote Docker contexts and clears inherited database,
PostgreSQL, Docker override, Lexora and Node preload environment variables.
It does not load an environment file. Image absence or any version other than
server_version_num=180006 fails; there is no latest/18 fallback.

Expected completion markers:

~~~text
CRC_FRESH_ORDER=formative-first:PASS
CRC_FRESH_ORDER=summative-first:PASS
CRC_FRESH_RUNTIME_AND_CLEANUP=PASS
BASELINE_APPROVED=NO
~~~

A nonzero exit or missing final marker is **not acceptance**. Read the new
.crc-runtime/<random-run-id>/evidence.json, per-order logs and commands.log.
Every invocation has a new evidence directory. Existing evidence is preserved.

## Isolation and foundation

Each order gets its own random crc_<32 hex>_test database in a uniquely labelled
container. The only published port binds 127.0.0.1 at a dynamically assigned port.
Database files use tmpfs at /var/lib/postgresql, following the
[official PostgreSQL 18 image layout](https://hub.docker.com/_/postgres).
No host data, canonical database, persistent data volume or backup is mounted.

Random temporary administrator and application credentials exist only in process
and container memory/configuration. The runner never writes credentials to its
evidence files. Docker administrators can inspect container configuration.
The application role cannot create databases/roles, bypass RLS, replicate,
own the schema or disable triggers. A separate NOLOGIN role owns schema objects.
Public database connection/schema creation/function execution rights are revoked;
the app receives only the table, sequence and function rights required by services.

An offline Prisma migrate diff from empty emits the **current** schema. The
invariant compiler then installs final SQL-only functions, triggers, checks,
indexes, foreign keys and the attendance revision sequence from checksum-pinned
repository SQL. This is not migration execution or a reconstructed baseline.
No _prisma_migrations table is created. Historical empty-data backfills and
preflights are classified, not replayed. Unknown SQL, changed source checksums or
new migration directories fail preparation and require review.

The two excluded historical directories contain a duplicate enum/column draft
and superseded Formative draft tables, not additional active SQL-only invariants.
These two explicitly reviewed drafts are Git-ignored and may be absent from a
clean checkout; no manual transfer is needed. If present, their pinned checksums
must match, and they are still never executed. All 43 active sources remain
mandatory and checksum-verified; unknown migration directories fail closed.
The inventory records sourcePresent for each excluded draft separately from its
pinned checksum, so absence is not reported as successful checksum verification.
The manifest is independent of PRE_COMPOSITION_MIGRATIONS and does not modify it.
Shared named Prisma foreign keys and indexes must exactly match normalized SQL
definitions. The current supplemental inventory is 99 functions, 105 triggers,
125 checks, 18 indexes, 11 additional named constraints and one sequence.
The three corrected timestamp(3) chronology functions supersede their old bodies.

Before seeding, catalog checks compare every function body, enabled/deferred
trigger state, supplemental constraint validity and all 12 composition FKs.
Function-body name resolution is deferred only while installing mutually
referencing functions; trigger, constraint and transaction enforcement are never
disabled. Any SQL/catalog mismatch aborts and cleans up the owned container.

The foundation export still permits only empty synthetic databases with the
exact fresh marker, server version, nonce/name and restricted application role.
The original historical CLI and production-shaped harness retain their independent
checks; the fresh marker is not an approved-baseline marker.

## What the two campaigns exercise

Both reuse the six existing recipes and real principal loading, scoped permissions,
Committee authorizers and academic owner services. Only ordinary synthetic
identity/academic setup and explicitly reversible authority fault fixtures use
direct fixture writes. Protected source results and successful audits come from
their owners.

- Group 2: forged header denials and valid Member/Chairman positive controls;
  wrong examination/duty, live role revocation, expired/inactive appointments,
  real Member replacement/stale review; foreign principal with real scoped grants
  denied another department's real calculated object. Denials preserve protected
  records and audits, including full-record comparisons on the expanded paths.
- Group 3: all six real Summative locks precede /40 in the reverse campaign.
  Reconciliation must report NOT_READY and leave /100 absent. Real Comprehensive
  finalisation then materialises /40 and /100. Sequential and concurrent replay
  preserves the original rows and audits; provenance and 16/40 and 24/60 remain exact.
- Group 4: database source matcher rejects wrong versions/lineage; deliberately
  corrupted projections after real SQL reads must cause real reconciliation to
  raise ConflictException without changes. These are explicitly injected
  projection faults, not fabricated persisted stale source packages.
  Finalized source mutations/deletions and duplicate Chairman approval are
  rejected. An exact Member review retry with the same appointment, outcome and
  normalized comment returns the existing review ID/version without changing
  protected records or audit evidence, including after final lock. Outcome or
  comment changes are rejected. Real competing Chairman calls require one winner.
  Composition-audit and post-reconciliation interruption faults roll back forward
  owner transactions; a reverse composition-audit fault rolls back Comprehensive,
/40, /100 and their audits, then the ordinary owner succeeds.

Required final counts **per independent order** are 13 Member reviews (including
replacement review version 2), 6 Chairman approvals, 6 Final Formative results,
6 compositions and 12 terminal approval/composition success audits. All six
compositions also undergo exact source, Decimal, threshold and identity checks.

## Evidence boundaries and cleanup

As of 2026-10-12 this new full-schema bootstrap/campaign is **implemented and
static/unit verified; PostgreSQL execution remains blocked in Codex** because
Docker/psql are absent and WSL access is denied. It has not established that every
current-schema/SQL interaction succeeds at runtime. Failures must be investigated
without weakening constraints, chronology, permissions or audits.

Later evidence: the operator confirmed both source orders PASS on disposable
PostgreSQL 18.6 on 2026-10-13, with evidence verification, API typecheck/build and
container cleanup 2/2 PASS. See the preserved
[dated checkpoint](../../../docs/runtime-test-checklist.md#crc-fresh-synthetic-postgresql-owner-service-checkpoint---2026-10-13).
This supersedes the earlier runtime-unverified status for the tested boundary;
it does not establish canonical or authenticated HTTP acceptance.

Evidence-capture limitation: working-tree.diff uses git diff for selected paths;
it omits untracked files and staged changes. Git HEAD, that diff and the SQL
hashes alone cannot reproduce the tested uncommitted source. Preserve the exact
operator checkout and separately retain the relevant source bytes or a complete
source manifest before relying on the archive as reproducible release evidence.

Normal success and failure cleanup checks the exact container ID, random label,
name, image, loopback binding and tmpfs configuration before removing only that
container and its anonymous volumes. Removal is confirmed before overall PASS.
No global prune or database-name-prefix deletion is used. A hard process/machine
termination cannot guarantee finally execution; preserve evidence.json, inspect
its exact container ID and label, and remove only that matching owned container.
Retained evidence contains synthetic data only and is ignored by Git.

HTTP authentication/guards, ordinary/canonical deployment, real-data migration
compatibility and independently approved production-shaped baseline acceptance
remain separate pending boundaries. BASELINE_APPROVED=NO.
