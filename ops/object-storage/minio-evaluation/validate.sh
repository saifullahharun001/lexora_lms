#!/bin/sh
set -eu

base_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
compose_file="$base_dir/compose.yml"
dockerfile="$base_dir/Dockerfile.minio"
bootstrap_file="$base_dir/bootstrap.sh"
root_compose_file="$base_dir/../../../docker-compose.yml"
evaluation_readme="$base_dir/README.md"
attributes_file="$base_dir/../../../.gitattributes"
env_example="$base_dir/../../../.env.example"

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

test "$(grep -Fc 'group_add:' "$compose_file")" -eq 2 ||
  fail "both services must receive a supplementary secret-reader group"
test "$(grep -Fc '${LEXORA_MINIO_SECRET_GID:?LEXORA_MINIO_SECRET_GID is required}' "$compose_file")" -eq 2 ||
  fail "both services must require the same secret-reader GID"
grep -Fq 'LEXORA_MINIO_SECRET_GID=' "$env_example" ||
  fail "secret-reader GID must be documented as non-secret configuration"
grep -Fq 'LEXORA_MINIO_SUBNET=' "$env_example" ||
  fail "evaluation subnet configuration is missing"
grep -Fq 'LEXORA_MINIO_GATEWAY=' "$env_example" ||
  fail "evaluation gateway configuration is missing"
grep -Fq 'LEXORA_MINIO_IPV4=' "$env_example" ||
  fail "evaluation static IPv4 configuration is missing"
awk '
  /^  minio:$/ { service="minio" }
  /^  minio-init:$/ { service="minio-init" }
  /^    group_add:$/ && service != "" { group_add[service]=1 }
  END { exit !(group_add["minio"] && group_add["minio-init"]) }
' "$compose_file" ||
  fail "each evaluation service must declare group_add"
grep -Fq 'USER 10001:10001' "$dockerfile" ||
  fail "MinIO image must retain its non-root primary identity"
grep -Fq 'USER 10002:10002' "$dockerfile" ||
  fail "bootstrap image must retain its non-root primary identity"
if grep -Eq '^[[:space:]]+user:' "$compose_file"; then
  fail "compose must not override image primary identities"
fi

test "$(grep -Ec '^[[:space:]]+file: .*LEXORA_MINIO_SECRET_DIR' "$compose_file")" -eq 4 ||
  fail "all four secrets must remain separate file-backed sources"
if grep -Eq '^[[:space:]]+(uid|gid|mode):' "$compose_file"; then
  fail "file-backed secrets must not rely on uid, gid, or mode remapping"
fi

mc_build_stage="$(
  awk '
    /^FROM .* AS mc-build$/ { in_mc_build=1 }
    in_mc_build && /^FROM .* AS / && $0 !~ / AS mc-build$/ { exit }
    in_mc_build { print }
  ' "$dockerfile"
)"
test -n "$mc_build_stage" ||
  fail "mc source build stage is missing"
printf '%s\n' "$mc_build_stage" |
  grep -Fq 'buildscripts/gen-ldflags.go' ||
  fail "mc build must generate upstream version metadata"
printf '%s\n' "$mc_build_stage" |
  grep -Fq -e '-tags kqueue' ||
  fail "mc build must retain the upstream kqueue build tag"
printf '%s\n' "$mc_build_stage" |
  grep -Fq -e '-ldflags "$(go run buildscripts/gen-ldflags.go)"' ||
  fail "mc build must pass generated ldflags as one argument"
printf '%s\n' "$mc_build_stage" |
  grep -Fq 'test "$(git rev-parse HEAD)" = "${MC_COMMIT}"' ||
  fail "mc build must verify the exact checked-out commit"
printf '%s\n' "$mc_build_stage" |
  grep -Fq -e '-o /out/mc' ||
  fail "mc build output path is invalid"

test "$(grep -Fc 'RUN mkdir -p /out \' "$dockerfile")" -eq 2 ||
  fail "both source build stages must create /out"
grep -Fq 'apk add --no-cache jq' "$dockerfile" ||
  fail "bootstrap image must include a structured JSON parser"
if grep -Eq '^[[:space:]]+ports:' "$compose_file"; then
  fail "evaluation services must not publish host ports"
fi
if grep -Eq '9000:9000|9001:9001' "$compose_file"; then
  fail "MinIO API and console host mappings must be absent"
fi
grep -Fq 'expose: ["9001"]' "$compose_file" ||
  fail "console must remain internal-only"
grep -Fq 'internal: true' "$compose_file" ||
  fail "evaluation network must be internal"
grep -Fq 'subnet: ${LEXORA_MINIO_SUBNET:?LEXORA_MINIO_SUBNET is required}' "$compose_file" ||
  fail "evaluation network must require a configured subnet"
grep -Fq 'gateway: ${LEXORA_MINIO_GATEWAY:?LEXORA_MINIO_GATEWAY is required}' "$compose_file" ||
  fail "evaluation network must require a configured gateway"
test "$(grep -Fc 'ipv4_address: ${LEXORA_MINIO_IPV4:?LEXORA_MINIO_IPV4 is required}' "$compose_file")" -eq 1 ||
  fail "MinIO must have exactly one required static IPv4 assignment"
awk '
  /^  minio:$/ { in_minio=1; next }
  in_minio && /^  minio-init:$/ { in_minio=0 }
  in_minio && /ipv4_address: .*LEXORA_MINIO_IPV4/ {
    static_ip_count++
  }
  END { exit !(static_ip_count == 1) }
' "$compose_file" ||
  fail "static IPv4 assignment must belong to the MinIO service"
grep -Fq 'networks: [minio_evaluation]' "$compose_file" ||
  fail "bootstrap must remain on the internal evaluation network"
if grep -Fq 'network_mode: host' "$compose_file"; then
  fail "host networking must not be used"
fi
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
grep -Fq 'export LC_ALL=C' "$bootstrap_file" ||
  fail "credential validation must use byte-oriented locale behavior"
grep -Fq 'test "$access_key_length" -lt 3 || test "$access_key_length" -gt 20' "$bootstrap_file" ||
  fail "access keys must be limited to 3 through 20 bytes"
grep -Fq 'test "$secret_key_length" -lt 8 || test "$secret_key_length" -gt 40' "$bootstrap_file" ||
  fail "secret keys must be limited to 8 through 40 bytes"
test "$(grep -Fc 'validate_access_key "' "$bootstrap_file")" -eq 2 ||
  fail "both root and application access keys must be validated"
test "$(grep -Fc 'validate_secret_key "' "$bootstrap_file")" -eq 2 ||
  fail "both root and application secret keys must be validated"
test "$(grep -Fc '*[!a-zA-Z0-9_-]*' "$bootstrap_file")" -ge 2 ||
  fail "credential allowlists must reject reserved and non-ASCII characters"

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
if grep -Fq '127.0.0.1' "$evaluation_readme"; then
  fail "README must not claim loopback host publication"
fi
grep -Fq 'No MinIO port is' "$evaluation_readme" &&
  grep -Fq 'published to the Docker host' "$evaluation_readme" ||
  fail "README must document that host ports are unpublished"
grep -Fq 'static internal bridge IPv4 address' "$evaluation_readme" ||
  fail "README must document host access through the static internal IP"
grep -Fq 'bind-mounted with their host ownership and' "$evaluation_readme" ||
  fail "README must explain file-secret ownership preservation"
grep -Fq 'remapping must not be relied upon' "$evaluation_readme" ||
  fail "README must reject file-secret uid, gid, and mode remapping"
grep -Fq 'root:<dedicated-secret-group>' "$evaluation_readme" ||
  fail "README must require a dedicated secret-reader group"
grep -Fq '0640' "$evaluation_readme" ||
  fail "README must document group-readable, non-world-readable files"
grep -Fq 'Access keys must be 3–20 bytes' "$evaluation_readme" ||
  fail "README must document access-key bounds"
grep -Fq 'Secret keys must be 8–40 bytes' "$evaluation_readme" ||
  fail "README must document secret-key bounds"
if grep -Eq 'mode .*0?6(44|66)|world-readable secret' "$evaluation_readme"; then
  fail "README must not permit world-readable secret files"
fi

grep -Fxq 'ops/object-storage/minio-evaluation/*.sh text eol=lf' "$attributes_file" ||
  fail "shell scripts must be LF-enforced by Git attributes"
grep -Fxq 'ops/object-storage/minio-evaluation/Dockerfile.minio text eol=lf' "$attributes_file" ||
  fail "evaluation Dockerfile must be LF-enforced by Git attributes"
grep -Fxq 'ops/object-storage/minio-evaluation/*.yml text eol=lf' "$attributes_file" ||
  fail "evaluation YAML must be LF-enforced by Git attributes"

test "$(grep -Fc 'read_only: true' "$compose_file")" -eq 2 ||
  fail "both services must retain read-only root filesystems"
test "$(grep -Fc 'security_opt: ["no-new-privileges:true"]' "$compose_file")" -eq 2 ||
  fail "both services must retain no-new-privileges"
test "$(grep -Fc 'cap_drop: ["ALL"]' "$compose_file")" -eq 2 ||
  fail "both services must retain all-capability drop"
test "$(grep -Fc 'pids_limit:' "$compose_file")" -eq 2 ||
  fail "both services must retain PID limits"

echo "MinIO evaluation static validation passed"
