#!/usr/bin/env bash
set -euo pipefail

output_directory="${1:-release-output}"
staging_directory="$(mktemp -d)"
trap 'rm -rf "${staging_directory}"' EXIT

mkdir -p "${output_directory}"
output_directory="$(cd "${output_directory}" && pwd)"

./node_modules/.bin/esbuild infra/lambda/notification-web-push.ts \
  --bundle \
  --format=cjs \
  --minify \
  --platform=node \
  --sourcemap \
  --target=node22 \
  --outfile="${staging_directory}/index.js"

rm -f "${output_directory}/notification-web-push.zip"
(
  cd "${staging_directory}"
  zip -q "${output_directory}/notification-web-push.zip" index.js index.js.map
)
