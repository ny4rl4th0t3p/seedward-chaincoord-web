#!/usr/bin/env bash
# Vendor the pinned gentxvalidate WASM validator (built in seedward-libs) into public/wasm/.
#
# Networked — run locally or in CI, never in a no-network sandbox. The pin MUST track the
# seedward-libs version coordd depends on, or the advisory client can disagree with the
# authoritative server. Override with SEEDWARD_LIBS_VERSION.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Single source of truth for the pin (scripts/wasm-version.txt); the drift gate reads the same file.
VERSION="${SEEDWARD_LIBS_VERSION:-$(tr -d '[:space:]' < "${HERE}/wasm-version.txt")}"
REPO="ny4rl4th0t3p/seedward-libs"
BASE="https://github.com/${REPO}/releases/download/${VERSION}"
OUT="public/wasm"
# Vendor the PRE-GZIPPED blob (archives.formats: gz → gentxvalidate_<version>.wasm.gz), i.e. the exact
# artifact CI size-budgets (~2 MB). The hook decompresses it in-browser via DecompressionStream, so the
# wire transfer is that gzipped size regardless of any server/CDN compression. wasm_exec.js is the
# Go-toolchain-coupled glue (release.extra_files) — always take the matching pair.
ASSET="gentxvalidate_${VERSION#v}.wasm.gz"

mkdir -p "$OUT"
echo "Fetching gentxvalidate WASM ${VERSION} from ${REPO}…"
curl -fsSL "${BASE}/${ASSET}"     -o "${OUT}/gentxvalidate.wasm.gz"
curl -fsSL "${BASE}/wasm_exec.js" -o "${OUT}/wasm_exec.js"

# Integrity: verify the gzipped blob against the release checksums.txt.
if curl -fsSL "${BASE}/checksums.txt" -o "${OUT}/checksums.txt.tmp"; then
  want=$(awk -v a="${ASSET}" '$2 == a {print $1}' "${OUT}/checksums.txt.tmp")
  got=$(sha256sum "${OUT}/gentxvalidate.wasm.gz" | awk '{print $1}')
  rm -f "${OUT}/checksums.txt.tmp"
  if [ -z "$want" ]; then
    echo "WARN: ${ASSET} not in checksums.txt — skipping verification"
  elif [ "$want" != "$got" ]; then
    echo "FAIL: checksum mismatch for gentxvalidate.wasm.gz (want ${want}, got ${got})" >&2
    exit 1
  else
    echo "checksum OK (${got})"
  fi
fi

printf '%s\n' "$VERSION" > "${OUT}/VERSION"
echo "Vendored ${VERSION} → ${OUT}/ (gentxvalidate.wasm.gz, wasm_exec.js, VERSION)"