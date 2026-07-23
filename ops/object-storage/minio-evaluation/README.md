# MinIO S3 Adapter Evaluation Runtime

This directory defines an isolated runtime for controlled Lexora S3-adapter
evaluation. It is not a production object-storage deployment. The upstream
MinIO community repository was archived on 2026-04-25, and Lexora has not yet
selected its maintained long-term object-storage provider.

No Lexora upload route is enabled here. Real object operations, persistence
across recreation and server restart, and external signed URL delivery still
require runtime verification. URLs containing 127.0.0.1 work only for software
running on the server.

## Pinned source builds

- MinIO tag: RELEASE.2025-10-15T17-29-55Z
- MinIO commit: 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
- MinIO Client tag: RELEASE.2025-08-13T08-35-41Z
- MinIO Client commit: 7394ce0dd2a80935aded936b09fa12cbb3cb8096

Dockerfile.minio clones the official archived repositories, checks out these
detached commits, verifies HEAD, builds static binaries in Go builder stages,
and copies only binaries and CA certificates into minimal Alpine stages. No
unofficial MinIO server image is used.

## Isolation and persistence

The Compose project contains only minio and minio-init. The S3 API is published
only on 127.0.0.1 port 9000. The console is available only inside the dedicated
internal Compose network and is not published to the host. No Nginx route is
added.

Object data uses the named volume lexora_minio_evaluation_data. Ordinary
shutdown must omit the volume-removal option. Removing Compose volumes destroys
evaluation data and must not be done casually. Persistence across container
recreation and a server restart remains a required runtime test.

## Secrets and identities

LEXORA_MINIO_SECRET_DIR must point to an absolute, owner-only directory outside
the repository containing four separately managed, non-empty files:

- minio_root_user
- minio_root_password
- lexora_s3_access_key
- lexora_s3_secret_key

Create empty files with restrictive permissions, then populate them through the
approved secret-management process without placing values in shell history:

    install -d -m 700 /secure/external/minio-evaluation
    install -m 600 /dev/null /secure/external/minio-evaluation/minio_root_user
    install -m 600 /dev/null /secure/external/minio-evaluation/minio_root_password
    install -m 600 /dev/null /secure/external/minio-evaluation/lexora_s3_access_key
    install -m 600 /dev/null /secure/external/minio-evaluation/lexora_s3_secret_key

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
