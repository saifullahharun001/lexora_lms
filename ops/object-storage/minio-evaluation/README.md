# MinIO S3 Adapter Evaluation Runtime

This directory defines an isolated runtime for controlled Lexora S3-adapter
evaluation. It is not a production object-storage deployment. The upstream
MinIO community repository was archived on 2026-04-25, and Lexora has not yet
selected its maintained long-term object-storage provider.

No Lexora upload route is enabled here. Real object operations, persistence
across recreation and server restart, and external signed URL delivery still
require runtime verification.

## Pinned source builds

- MinIO tag: RELEASE.2025-10-15T17-29-55Z
- MinIO commit: 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
- MinIO Client tag: RELEASE.2025-08-13T08-35-41Z
- MinIO Client commit: 7394ce0dd2a80935aded936b09fa12cbb3cb8096

Dockerfile.minio clones the official archived repositories, checks out these
detached commits, verifies HEAD, builds static binaries in Go builder stages,
and copies only binaries and CA certificates into minimal Alpine stages. No
unofficial MinIO server image is used.

These source-built MinIO and mc binaries may report a
`DEVELOPMENT.<timestamp>` version. The commit-derived timestamp and
exact embedded Git commit are the audit evidence; `DEVELOPMENT.GOGET`
is not acceptable for the evaluated image. Compose image tags are internal
evaluation labels and are not evidence of official upstream release packaging.

## Isolation and persistence

The Compose project contains only minio and minio-init. No MinIO port is
published to the Docker host. The host-resident Lexora API reaches MinIO at its
configured static internal bridge IPv4 address on port 9000. This address is
only for host-local evaluation traffic; it is not a public or LAN endpoint.
The console is available only inside the dedicated internal Compose network and
is not published to the host. No Nginx route is added.

LEXORA_MINIO_SUBNET, LEXORA_MINIO_GATEWAY, and LEXORA_MINIO_IPV4 are
environment-specific, non-secret configuration. Select them only after checking
host routes and existing Docker networks, and reject any overlapping subnet or
address. The dynamically observed runtime address is not durable
configuration. The internal network must not be removed merely to make host
port publication work.

Client-facing signed URLs or controlled backend delivery remain pending.

Object data uses the named volume lexora_minio_evaluation_data. Ordinary
shutdown must omit the volume-removal option. Removing Compose volumes destroys
evaluation data and must not be done casually. Persistence across container
recreation and a server restart remains a required runtime test.

## Secrets and identities

LEXORA_MINIO_SECRET_DIR must point to an absolute directory outside the
repository containing four separately managed, non-empty files:

- minio_root_user
- minio_root_password
- lexora_s3_access_key
- lexora_s3_secret_key

File-backed Compose secrets are bind-mounted with their host ownership and
mode. Secret-level uid, gid, or mode remapping must not be relied upon for
file-backed sources. LEXORA_MINIO_SECRET_GID must be the numeric GID of a
dedicated host group used only for this evaluation runtime. Both non-root
containers receive that GID only as a supplementary group; their primary
identities remain unchanged.

Recommended host metadata is:

- Secret directory: `root:root`, mode `0700`.
- Each secret file: `root:<dedicated-secret-group>`, mode
  `0640`.

Secret files must never be world-readable. Populate them through the approved
secret-management process without printing values or placing values in shell
history.

Access keys must be 3–20 bytes and contain only ASCII letters, digits,
underscore, or hyphen. Secret keys must be 8–40 bytes and use the same
controlled, unpadded base64url-compatible character set. Existing incompatible
credentials require controlled rotation before another startup attempt.

Root credentials are mounted only for MinIO startup and bootstrap
administration. Lexora API configuration must use the separate application
credentials. Bootstrap creates or updates the dedicated application user and
attaches only the bucket-scoped lexora-s3-evaluation policy. Bootstrap fails
closed before updating an existing application user that has unexpected direct
policies or any group membership, and it rejects root/application identifier or
secret collisions.

The application policy permits s3:GetBucketLocation on the configured bucket
and s3:GetObject, s3:PutObject, and s3:DeleteObject only under
`quarantine/*` and `available/*`. It also permits
s3:ListBucket solely so missing-object checks can distinguish absent keys from
access-denied failures. That bucket-level action has an s3:prefix condition
restricted to `quarantine/*` and `available/*`; it does not
permit global bucket browsing or listing any unrelated prefix or bucket.
The policy grants no admin wildcard, global S3 wildcard, console
administration, all-bucket listing, anonymous access, or unrelated-bucket
access.

LEXORA_S3_BUCKET is a required non-secret Compose variable. API S3 credentials
must match the external application secret files, never the root files.

### Source-only credential rotation plan

Before changing credentials, stop and remove only the evaluation containers.
Confirm that the preserved evaluation volume is empty, or understand how
credential state in a non-empty volume affects recovery. Through the approved
secret-management process:

1. Generate two distinct 20-character access keys and two distinct 40-character
   secret keys without printing them.
2. Write each value directly to its designated external secret file.
3. Assign every secret file to
   `root:<dedicated-secret-group>` and mode `0640`.
4. Update only the application S3 credentials in untracked API environment
   files so they match the rotated application files.
5. Never place either root credential in API configuration.
6. Validate credential lengths, ownership, permissions, and root/application
   distinctness before startup.
7. Keep production upload disabled.

## Bootstrap and readiness

MinIO has a native readiness endpoint healthcheck. Compose starts minio-init
only after the server is healthy. Bootstrap authenticates with root secret
files, creates the bucket if absent, explicitly sets it private, creates or
updates the policy and application user, attaches the policy, and verifies the
result without printing credentials.

The script uses fail-fast shell settings, performs no destructive cleanup, uses
no fixed sleep as its readiness mechanism, and exits non-zero on partial
failure.

## Container hardening

Both containers run as dedicated non-root users with all Linux capabilities
dropped, no-new-privileges, read-only root filesystems, bounded writable tmpfs,
PID/CPU/memory limits, init handling, and rotated JSON logs. MinIO alone has a
restart policy. The console remains unpublished.

Custom seccomp/AppArmor profiles and a digest-pinned base-image mirror are
deferred until the evaluation host and maintained provider strategy are
selected.

## Static validation

These source-only checks do not require Docker:

    sh ops/object-storage/minio-evaluation/validate.sh
    sh -n ops/object-storage/minio-evaluation/bootstrap.sh
    sh -n ops/object-storage/minio-evaluation/validate.sh

Building or starting containers requires separate approval and is outside this
task. Production upload remains disabled. This evaluation must not be presented
as a maintained production solution.
