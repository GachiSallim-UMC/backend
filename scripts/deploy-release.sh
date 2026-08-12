#!/usr/bin/env bash
set -euo pipefail

environment_name="${1:-}"
commit_sha="${2:-}"

if [[ "${environment_name}" != 'main' && "${environment_name}" != 'develop' ]]; then
  echo 'Environment must be main or develop.' >&2
  exit 1
fi
if [[ ! "${commit_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Commit SHA must contain 40 lowercase hexadecimal characters.' >&2
  exit 1
fi

source "/etc/gachisallim/${environment_name}.config"

release_root="/opt/gachisallim/releases/${environment_name}"
release_directory="${release_root}/${commit_sha}"
current_link="/opt/gachisallim/current/${environment_name}"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

artifact_prefix="s3://${ARTIFACT_BUCKET}/releases/${environment_name}/${commit_sha}"
aws s3 cp "${artifact_prefix}.tar.gz" "${temporary_directory}/release.tar.gz"
aws s3 cp "${artifact_prefix}.tar.gz.sha256" "${temporary_directory}/release.tar.gz.sha256"
(
  cd "${temporary_directory}"
  sha256sum --check release.tar.gz.sha256
)

mkdir -p "${release_directory}" "$(dirname "${current_link}")"
tar -C "${release_directory}" -xzf "${temporary_directory}/release.tar.gz"
chown -R root:root "${release_directory}"
chmod -R a+rX "${release_directory}"
chmod 0755 "${release_directory}/bin/node"

secret_json="$(aws secretsmanager get-secret-value \
  --secret-id "${DATABASE_SECRET_ARN}" \
  --query SecretString \
  --output text)"
database_url="$(SECRET_JSON="${secret_json}" DATABASE_NAME="${DATABASE_NAME}" python3 - <<'PY'
import json
import os
from urllib.parse import quote

secret = json.loads(os.environ['SECRET_JSON'])
username = quote(secret['username'], safe='')
password = quote(secret['password'], safe='')
host = secret['host']
port = secret.get('port', 5432)
database = os.environ['DATABASE_NAME']
print(f'postgresql://{username}:{password}@{host}:{port}/{database}?schema=public&sslmode=require')
PY
)"

webhook_secret="$(aws secretsmanager get-secret-value \
  --secret-id "${WEBHOOK_SECRET_ARN}" \
  --query SecretString \
  --output text)"

environment_file="/etc/gachisallim/${environment_name}.env"
umask 077
cat > "${environment_file}" <<EOF
NODE_ENV=${NODE_ENV}
PORT=${PORT}
APP_NAME=${APP_NAME}
APP_VERSION=${APP_VERSION}
CORS_ORIGIN=${CORS_ORIGIN}
DATABASE_URL=${database_url}
WEBHOOK_SECRET=${webhook_secret}
AWS_REGION=${AWS_REGION}
COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
PROFILE_IMAGE_BUCKET=${PROFILE_IMAGE_BUCKET}
PROFILE_IMAGE_OBJECT_PREFIX=${PROFILE_IMAGE_OBJECT_PREFIX}
PROFILE_IMAGE_PUBLIC_BASE_URL=${PROFILE_IMAGE_PUBLIC_BASE_URL}
RECEIPT_IMAGE_BUCKET=${RECEIPT_IMAGE_BUCKET}
RECEIPT_IMAGE_OBJECT_PREFIX=${RECEIPT_IMAGE_OBJECT_PREFIX}
NOTIFICATION_PUSH_QUEUE_URL=${NOTIFICATION_PUSH_QUEUE_URL}
NOTIFICATION_PUSH_RESULT_QUEUE_URL=${NOTIFICATION_PUSH_RESULT_QUEUE_URL}
NOTIFICATION_VAPID_PUBLIC_KEY=${NOTIFICATION_VAPID_PUBLIC_KEY}
NOTIFICATION_COMMAND_QUEUE_URL=${NOTIFICATION_COMMAND_QUEUE_URL}
NOTIFICATION_COMMAND_QUEUE_ARN=${NOTIFICATION_COMMAND_QUEUE_ARN}
NOTIFICATION_COMMAND_DLQ_ARN=${NOTIFICATION_COMMAND_DLQ_ARN}
CHORE_DUE_SCHEDULE_GROUP=${CHORE_DUE_SCHEDULE_GROUP}
CHORE_DUE_SCHEDULE_ROLE_ARN=${CHORE_DUE_SCHEDULE_ROLE_ARN}
CHORE_DUE_SCHEDULE_PREFIX=${CHORE_DUE_SCHEDULE_PREFIX}
CHAT_CONNECTIONS_TABLE_NAME=${CHAT_CONNECTIONS_TABLE_NAME}
CHAT_WEBSOCKET_CALLBACK_URL=${CHAT_WEBSOCKET_CALLBACK_URL}
EOF

export DATABASE_URL="${database_url}"
"${release_directory}/bin/node" "${release_directory}/ensure-database.cjs" "${DATABASE_NAME}"
# Automatic rollback restores only the application release. Migrations must remain
# compatible with the immediately previous release and follow expand/contract ordering.
PATH="${release_directory}/bin:${PATH}" \
  "${release_directory}/node_modules/.bin/prisma" migrate deploy \
  --schema "${release_directory}/prisma/schema.prisma"

previous_release="$(readlink -f "${current_link}" 2>/dev/null || true)"
ln -sfnT "${release_directory}" "${current_link}"
systemctl daemon-reload
systemctl enable "gachisallim@${environment_name}.service"
systemctl restart "gachisallim@${environment_name}.service"

healthy=false
for _ in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "${healthy}" != true ]]; then
  if [[ -n "${previous_release}" \
    && "${previous_release}" != "${release_directory}" \
    && -d "${previous_release}" ]]; then
    ln -sfnT "${previous_release}" "${current_link}"
    systemctl restart "gachisallim@${environment_name}.service"
  else
    rm -f "${current_link}"
    systemctl stop "gachisallim@${environment_name}.service"
  fi
  echo 'Health check failed; application deployment was rolled back.' >&2
  exit 1
fi

find "${release_root}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn \
  | tail -n +4 \
  | cut -d' ' -f2- \
  | xargs --no-run-if-empty rm -rf
