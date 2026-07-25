#!/usr/bin/env bash

set -euo pipefail

ses_region="${AWS_REGION:-ap-northeast-2}"
if ! production_access="$(aws sesv2 get-account \
  --region "${ses_region}" \
  --query 'ProductionAccessEnabled' \
  --output text)"; then
  echo "Unable to verify SES production access in ${ses_region}." >&2
  exit 1
fi

if [[ "${production_access}" != 'True' && "${production_access}" != 'true' ]]; then
  echo "SES production access is required in ${ses_region}; refusing backend stack deployment." >&2
  exit 1
fi

echo "SES production access is enabled in ${ses_region}."
