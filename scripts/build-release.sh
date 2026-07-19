#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != 'Linux' ]] \
  || [[ "$(uname -m)" != 'aarch64' && "$(uname -m)" != 'arm64' ]]; then
  echo 'Release bundles must be built on a Linux ARM64 runner.' >&2
  exit 1
fi

output_directory="${1:-release-output}"
staging_directory="$(mktemp -d)"
trap 'rm -rf "${staging_directory}"' EXIT

npm ci
npm run prisma:generate
npm run build
npm prune --omit=dev

mkdir -p "${output_directory}" "${staging_directory}/bin"
chmod 0755 "${staging_directory}"
cp "$(command -v node)" "${staging_directory}/bin/node"
cp -R dist node_modules prisma scripts/ensure-database.cjs package.json package-lock.json \
  "${staging_directory}/"

tar -C "${staging_directory}" -czf "${output_directory}/release.tar.gz" .
(
  cd "${output_directory}"
  sha256sum release.tar.gz > release.tar.gz.sha256
)
