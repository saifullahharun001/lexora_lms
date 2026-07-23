#!/bin/sh
set -eu

base_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
compose_file="$base_dir/compose.yml"
dockerfile="$base_dir/Dockerfile.minio"
bootstrap_file="$base_dir/bootstrap.sh"
root_compose_file="$base_dir/../../../docker-compose.yml"
evaluation_readme="$base_dir/README.md"
attributes_file="$base_dir/../../../.gitattributes"

fail() {
  echo "MinIO evaluation validation failed: $1" >&2
  exit 1
}

services="$(
  awk '
    /^services:/ { in_services=1; next }
    in_services && /^[^[:space:]]/ { in_services=0 }
    in_services && /^  [a-zA-Z0-9_-]+:$/ {
      name=$1
      sub(/:$/, "", name)
      printf "%s ", name
    }
  ' "$compose_file"
)"
test "$services" = "minio minio-init " ||
  fail "compose must define only minio and minio-init"

test "$(grep -Fc 'RUN mkdir -p /out \' "$dockerfile")" -eq 2 ||
  fail "both source build stages must create /out"
grep -Fq 'apk add --no-cache jq' "$dockerfile" ||
  fail "bootstrap image must include a structured JSON parser"
grep -Fq '"127.0.0.1:9000:9000"' "$compose_file" ||
  fail "S3 API must bind to loopback"
grep -Fq 'expose: ["9001"]' "$compose_file" ||
  fail "console must remain internal-only"
grep -Fq 'internal: true' "$compose_file" ||
  fail "evaluation network must be internal"
test "$(grep -Fc 'LEXORA_MINIO_SECRET_DIR:?' "$compose_file")" -eq 4 ||
  fail "external secret directory must be required"
grep -Fq '9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a' "$dockerfile" ||
  fail "MinIO source commit must be pinned"
grep -Fq 'RELEASE.2025-10-15T17-29-55Z' "$compose_file" ||
  fail "MinIO security release tag must be recorded"
grep -Fq 'arn:aws:s3:::${LEXORA_S3_BUCKET}/quarantine/*' "$bootstrap_file" ||
  fail "quarantine policy resource is missing"
grep -Fq 'arn:aws:s3:::${LEXORA_S3_BUCKET}/available/*' "$bootstrap_file" ||
  fail "available policy resource is missing"
grep -Fq 'mc anonymous set private' "$bootstrap_file" ||
  fail "anonymous access must be explicitly disabled"
grep -Fq '"Action": ["s3:GetBucketLocation"]' "$bootstrap_file" ||
  fail "bucket-location action is missing"
test "$(grep -Fc '"Action": ["s3:ListBucket"]' "$bootstrap_file")" -eq 1 ||
  fail "exactly one scoped ListBucket action is required"
awk '
  /"Action": \["s3:ListBucket"\]/ { list_bucket_line=NR }
  list_bucket_line && NR == list_bucket_line + 1 &&
    /"Resource": \["arn:aws:s3:::\$\{LEXORA_S3_BUCKET\}"\]/ {
      bucket_resource=1
    }
  list_bucket_line && NR == list_bucket_line + 2 && /"Condition":/ {
    condition=1
  }
  list_bucket_line && NR == list_bucket_line + 3 && /"StringLike":/ {
    string_like=1
  }
  list_bucket_line && NR == list_bucket_line + 4 &&
    /"s3:prefix": \["quarantine\/[*]", "available\/[*]"\]/ {
      controlled_prefixes=1
    }
  END {
    exit !(list_bucket_line && bucket_resource && condition &&
      string_like && controlled_prefixes)
  }
' "$bootstrap_file" ||
  fail "ListBucket must be bucket-level and restricted to controlled prefixes"
grep -Fq '"Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]' "$bootstrap_file" ||
  fail "object actions are not the expected least-privilege set"

if grep -Eq '^  minio(-init)?:|minio/minio:|minio/mc:|RELEASE[.]2025-04-(22T22-12-26Z|16T18-13-26Z)|MINIO_ROOT_(USER|PASSWORD)|9000:9000|9001:9001|lexora-local-secret' "$root_compose_file"; then
  fail "root compose contains legacy MinIO configuration"
fi
if grep -ERq '0[.]0[.]0[.]0:900[01]|MINIO_ROOT_(USER|PASSWORD)=|lexora-local-secret|minioadmin' "$compose_file" "$dockerfile" "$bootstrap_file" "$base_dir/README.md"; then
  fail "unsafe exposure or credential literal detected"
fi
if grep -Eq '^[[:space:]]+- "900[01]:900[01]"' "$compose_file"; then
  fail "host-wide MinIO port mapping detected"
fi
if grep -Eq '^[[:space:]]+- ".*:9001"' "$compose_file"; then
  fail "MinIO console must not be published"
fi
if grep -Fq 'RELEASE.2025-04-22T22-12-26Z' "$compose_file" "$dockerfile"; then
  fail "obsolete MinIO release detected"
fi
if grep -Eq '"(admin:|s3:)[*]"|s3:ListAllMyBuckets|mc anonymous set (public|download|upload)' "$bootstrap_file"; then
  fail "wildcard permission or anonymous access detected"
fi

grep -Fq 'test "$root_user" != "$app_access_key"' "$bootstrap_file" ||
  fail "root and application identifiers must be compared"
grep -Fq 'test "$root_password" != "$app_secret_key"' "$bootstrap_file" ||
  fail "root and application secrets must be compared"
grep -Fq 'XMinioAdminNoSuchUser' "$bootstrap_file" ||
  fail "only confirmed user absence may permit user creation"
test "$(grep -Fc 'mc --json admin user info' "$bootstrap_file")" -eq 2 ||
  fail "preflight and final user state must use machine-readable output"
grep -Fq '.policyName == $expected_policy' "$bootstrap_file" ||
  fail "final direct policy must equal the expected policy"
test "$(grep -Fc 'length == 0' "$bootstrap_file")" -ge 2 ||
  fail "preflight and final group membership must be empty"
grep -Fq 'Existing application identity has unexpected policy or group state' "$bootstrap_file" ||
  fail "unexpected existing privilege state must fail closed"
grep -Fq '.userStatus == "enabled"' "$bootstrap_file" ||
  fail "final application user must be enabled"

if grep -Eq 'mc admin policy detach|mc admin user (remove|delete)|mc admin group (remove|delete)' "$bootstrap_file"; then
  fail "bootstrap must not automatically remove unknown privilege state"
fi

grep -Fq 'quarantine/*' "$evaluation_readme" ||
  fail "README must document the literal quarantine wildcard"
grep -Fq 'available/*' "$evaluation_readme" ||
  fail "README must document the literal available wildcard"
if grep -Eq 'quarantine/_|available/_' "$evaluation_readme"; then
  fail "README contains incorrect wildcard notation"
fi

grep -Fxq 'ops/object-storage/minio-evaluation/*.sh text eol=lf' "$attributes_file" ||
  fail "shell scripts must be LF-enforced by Git attributes"
grep -Fxq 'ops/object-storage/minio-evaluation/Dockerfile.minio text eol=lf' "$attributes_file" ||
  fail "evaluation Dockerfile must be LF-enforced by Git attributes"
grep -Fxq 'ops/object-storage/minio-evaluation/*.yml text eol=lf' "$attributes_file" ||
  fail "evaluation YAML must be LF-enforced by Git attributes"

echo "MinIO evaluation static validation passed"
