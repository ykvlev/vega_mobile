#!/usr/bin/env bash
# Run from the repository root. Scans committed history, not only the last diff.
set -euo pipefail

readonly gitleaks_version='8.24.3'
readonly release_url="https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}"

if [[ "$(uname -s)" != 'Linux' || "$(uname -m)" != 'x86_64' ]]; then
  echo 'scan-secrets.sh requires Linux x86_64; use the pinned CI runner.' >&2
  exit 1
fi

git rev-parse --verify HEAD >/dev/null
readonly scan_tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$scan_tmp_dir"' EXIT
readonly archive="gitleaks_${gitleaks_version}_linux_x64.tar.gz"
readonly checksums="gitleaks_${gitleaks_version}_checksums.txt"

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 2 --connect-timeout 15 --max-time 180 \
  "${release_url}/${archive}" --output "${scan_tmp_dir}/${archive}"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 2 --connect-timeout 15 --max-time 180 \
  "${release_url}/${checksums}" --output "${scan_tmp_dir}/${checksums}"

# Verify the selected artifact against the publisher's release checksums.
awk -v name="$archive" '$2 == name {print; found=1} END {if (!found) exit 1}' \
  "${scan_tmp_dir}/${checksums}" > "${scan_tmp_dir}/selected.sha256"
(cd "$scan_tmp_dir" && sha256sum --check selected.sha256)
tar -xzf "${scan_tmp_dir}/${archive}" -C "$scan_tmp_dir" gitleaks
"${scan_tmp_dir}/gitleaks" git --redact --no-banner --exit-code 1 .
