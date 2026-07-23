#!/bin/sh
set -eu
umask 077

secret_value() {
  secret_path="/run/secrets/$1"
  test -r "$secret_path" || {
    echo "Required secret file is unavailable" >&2
    exit 1
  }
  test -s "$secret_path" || {
    echo "Required secret file is empty" >&2
    exit 1
  }

  if LC_ALL=C grep -q '[[:cntrl:]]' "$secret_path"; then
    echo "Required secret file contains invalid control characters" >&2
    exit 1
  fi

  line_count="$(awk 'END { print NR }' "$secret_path")"
  test "$line_count" -eq 1 || {
    echo "Required secret file must contain exactly one logical line" >&2
    exit 1
  }

  value="$(cat "$secret_path")"
  case "$value" in
    ""|[[:space:]]*|*[[:space:]])
      echo "Required secret file contains surrounding whitespace" >&2
      exit 1
      ;;
  esac

  printf '%s' "$value"
}

validate_identifier() {
  identifier="$1"
  identifier_length="$(printf '%s' "$identifier" | awk '{ print length }')"

  case "$identifier" in
    ""|[!a-zA-Z0-9]*|*[!a-zA-Z0-9_-]*)
      echo "Credential identifier is invalid" >&2
      exit 1
      ;;
  esac

  if test "$identifier_length" -lt 3 || test "$identifier_length" -gt 64; then
    echo "Credential identifier length is invalid" >&2
    exit 1
  fi
}

case "${LEXORA_S3_BUCKET:-}" in
  ""|*[!a-z0-9.-]*)
    echo "LEXORA_S3_BUCKET is invalid" >&2
    exit 1
    ;;
esac

case "${LEXORA_S3_POLICY_NAME:-}" in
  ""|*[!a-zA-Z0-9_-]*)
    echo "LEXORA_S3_POLICY_NAME is invalid" >&2
    exit 1
    ;;
esac

root_user="$(secret_value minio_root_user)"
root_password="$(secret_value minio_root_password)"
app_access_key="$(secret_value lexora_s3_access_key)"
app_secret_key="$(secret_value lexora_s3_secret_key)"

validate_identifier "$root_user"
validate_identifier "$app_access_key"

test "$root_user" != "$app_access_key" || {
  echo "Root and application identities must be distinct" >&2
  exit 1
}

test "$root_password" != "$app_secret_key" || {
  echo "Root and application secrets must be distinct" >&2
  exit 1
}

mc alias set bootstrap http://minio:9000 "$root_user" "$root_password" >/dev/null
mc ready bootstrap >/dev/null

user_state_file="/tmp/lexora-user-state.json"
if mc --json admin user info bootstrap "$app_access_key" \
  >"$user_state_file" 2>/dev/null; then
  jq -e --arg access_key "$app_access_key" '
    .status == "success" and
    .accessKey == $access_key and
    ((.policyName // "") | type == "string") and
    ((.memberOf // []) | type == "array")
  ' "$user_state_file" >/dev/null ||
    {
      echo "Existing application identity state is invalid" >&2
      exit 1
    }

  jq -e --arg expected_policy "$LEXORA_S3_POLICY_NAME" '
    ((.policyName // "") == "" or
      (.policyName // "") == $expected_policy) and
    ((.memberOf // []) | length == 0)
  ' "$user_state_file" >/dev/null ||
    {
      echo "Existing application identity has unexpected policy or group state" >&2
      exit 1
    }
else
  if ! jq -e '
    .status == "error" and
    .error.cause.error.Code == "XMinioAdminNoSuchUser"
  ' "$user_state_file" >/dev/null 2>&1; then
    echo "Unable to determine application identity state" >&2
    exit 1
  fi
fi

mc mb --ignore-existing "bootstrap/${LEXORA_S3_BUCKET}" >/dev/null
mc anonymous set private "bootstrap/${LEXORA_S3_BUCKET}" >/dev/null

policy_file="/tmp/lexora-s3-policy.json"
cat >"$policy_file" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation"],
      "Resource": ["arn:aws:s3:::${LEXORA_S3_BUCKET}"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${LEXORA_S3_BUCKET}"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["quarantine/*", "available/*"]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::${LEXORA_S3_BUCKET}/quarantine/*",
        "arn:aws:s3:::${LEXORA_S3_BUCKET}/available/*"
      ]
    }
  ]
}
EOF

mc admin policy create bootstrap "$LEXORA_S3_POLICY_NAME" "$policy_file" >/dev/null
mc admin user add bootstrap "$app_access_key" "$app_secret_key" >/dev/null
mc admin policy attach bootstrap "$LEXORA_S3_POLICY_NAME" --user "$app_access_key" >/dev/null
mc admin policy info bootstrap "$LEXORA_S3_POLICY_NAME" >/dev/null

mc --json admin user info bootstrap "$app_access_key" \
  >"$user_state_file" 2>/dev/null ||
  {
    echo "Unable to verify final application identity state" >&2
    exit 1
  }

jq -e \
  --arg access_key "$app_access_key" \
  --arg expected_policy "$LEXORA_S3_POLICY_NAME" '
    .status == "success" and
    .accessKey == $access_key and
    .userStatus == "enabled" and
    .policyName == $expected_policy and
    ((.memberOf // []) | type == "array" and length == 0)
  ' "$user_state_file" >/dev/null ||
  {
    echo "Final application identity is not least privilege" >&2
    exit 1
  }

mc stat "bootstrap/${LEXORA_S3_BUCKET}" >/dev/null

rm -f "$user_state_file" "$policy_file"
unset root_user root_password app_access_key app_secret_key
echo "MinIO evaluation bootstrap completed"
