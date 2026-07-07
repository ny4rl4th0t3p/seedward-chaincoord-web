#!/usr/bin/env bash
# Fail if the vendored gentxvalidate WASM pin drifts from the seedward-libs version coordd depends on.
# The advisory client (RunLight) and the authoritative server (RunAll) must come from the SAME
# seedward-libs version, or the browser could green-light a gentx the server rejects (or vice-versa).
#
# Compares scripts/wasm-version.txt (the pin `yarn sync:wasm` uses) against the seedward-libs require in
# coordd's go.mod AT ITS LATEST RELEASE — NOT main, which may carry an unreleased partial bump coordd
# does not actually ship. Set GITHUB_TOKEN to avoid the low unauthenticated API rate limit (CI passes
# ${{ github.token }}). A mismatch is a hard failure; an inability to determine coordd's version
# (no releases yet, network/API hiccup) is a warning-skip so transient issues don't wedge CI.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_PIN="$(tr -d '[:space:]' < "${HERE}/wasm-version.txt")"

REPO="ny4rl4th0t3p/seedward-chaincoord"
API="${GITHUB_API_URL:-https://api.github.com}"
RAW="${GITHUB_RAW_URL:-https://raw.githubusercontent.com}"

auth=()
[ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer ${GITHUB_TOKEN}")

skip() { echo "::warning::check-wasm-version: $1 — skipping drift check (advisory)"; exit 0; }

# Latest published release (newest first; includes pre-releases like rc), NOT the main branch.
releases="$(curl -fsSL "${auth[@]}" "${API}/repos/${REPO}/releases?per_page=1" 2>/dev/null)" \
  || skip "could not reach the GitHub API"
tag="$(printf '%s\n' "$releases" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
[ -n "$tag" ] || skip "${REPO} has no releases yet"

gomod="$(curl -fsSL "${auth[@]}" "${RAW}/${REPO}/${tag}/go.mod" 2>/dev/null)" \
  || skip "could not fetch go.mod at ${tag}"
coordd_ver="$(printf '%s\n' "$gomod" | awk '$1 == "github.com/ny4rl4th0t3p/seedward-libs" {print $2; exit}')"
[ -n "$coordd_ver" ] || skip "seedward-libs require not found in ${REPO}@${tag}/go.mod"

echo "web WASM pin (scripts/wasm-version.txt): ${WEB_PIN}"
echo "coordd seedward-libs (${REPO}@${tag}):   ${coordd_ver}"
if [ "$WEB_PIN" != "$coordd_ver" ]; then
  echo "::error::WASM validator pin (${WEB_PIN}) != coordd's seedward-libs (${coordd_ver}) at release ${tag}." >&2
  echo "The advisory client would run a different gentxvalidate than the authoritative server." >&2
  echo "Fix: set scripts/wasm-version.txt to ${coordd_ver} and run 'yarn sync:wasm'." >&2
  exit 1
fi
echo "OK: WASM validator pin matches coordd's seedward-libs (${WEB_PIN}) at ${tag}."