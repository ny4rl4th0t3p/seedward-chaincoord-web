#!/usr/bin/env bash
# Fail if the vendored gentxvalidate WASM pin drifts from the seedward-libs version coordd depends on.
# The advisory client (RunLight) and the authoritative server (RunAll) must come from the SAME
# seedward-libs version, or the browser could green-light a gentx the server rejects (or vice-versa).
#
# Compares scripts/wasm-version.txt (the pin `yarn sync:wasm` uses) against the seedward-libs require in
# coordd's go.mod AT ITS LATEST RELEASE TAG — NOT main, which may carry an unreleased partial bump.
# Uses `git ls-remote` (public repo → no API, no token, no rate limit) to find the tag. A mismatch is a
# hard failure; an inability to determine coordd's version (unreachable / no tags) is a warning-skip so
# transient issues don't wedge CI.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIN_FILE="${HERE}/wasm-version.txt"
REPO_URL="https://github.com/ny4rl4th0t3p/seedward-chaincoord"
RAW="${GITHUB_RAW_URL:-https://raw.githubusercontent.com}/ny4rl4th0t3p/seedward-chaincoord"

skip() { echo "::warning::check-wasm-version: $1 — skipping drift check (advisory)"; exit 0; }
die()  { echo "::error::check-wasm-version: $1"; exit 1; }

[ -f "$PIN_FILE" ] || die "pin file not found: ${PIN_FILE} (is scripts/wasm-version.txt committed?)"
web_pin="$(tr -d '[:space:]' < "$PIN_FILE")"
[ -n "$web_pin" ] || die "pin file is empty: ${PIN_FILE}"
echo "web WASM pin (scripts/wasm-version.txt): ${web_pin}"

# Latest coordd release = latest semver tag (Go module versions ARE tags — no GitHub "Release" needed).
# NOTE: sort -V ranks a prerelease (v1.0.0-rc1) above its final (v1.0.0); harmless while coordd has no
# ambiguous rc+final pair for the same version — revisit if that changes.
echo "Resolving latest tag of ${REPO_URL} …"
tags="$(git ls-remote --tags --refs "${REPO_URL}" 2>/dev/null)" \
  || skip "could not reach ${REPO_URL} (git ls-remote failed)"
latest_tag="$(printf '%s\n' "$tags" \
  | sed -E 's#.*refs/tags/##' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+' \
  | sort -V | tail -n1 || true)"
[ -n "$latest_tag" ] || skip "no semver tags found on ${REPO_URL}"
echo "coordd latest tag: ${latest_tag}"

echo "Fetching go.mod at ${latest_tag} …"
gomod="$(curl -fsSL "${RAW}/${latest_tag}/go.mod" 2>/dev/null || true)"
[ -n "$gomod" ] || skip "could not fetch go.mod at ${latest_tag}"

coordd_ver="$(printf '%s\n' "$gomod" | awk '$1 == "github.com/ny4rl4th0t3p/seedward-libs" {print $2; exit}')"
[ -n "$coordd_ver" ] || skip "seedward-libs require not found in go.mod at ${latest_tag}"
echo "coordd seedward-libs (@ ${latest_tag}):  ${coordd_ver}"

if [ "$web_pin" != "$coordd_ver" ]; then
  die "WASM validator pin (${web_pin}) != coordd's seedward-libs (${coordd_ver}) at ${latest_tag}. Set scripts/wasm-version.txt to ${coordd_ver} and run 'yarn sync:wasm'."
fi
echo "OK: WASM validator pin matches coordd's seedward-libs (${web_pin}) at ${latest_tag}."