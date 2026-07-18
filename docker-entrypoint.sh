#!/bin/sh
set -eu

# Patch the build-time backend placeholder to the runtime COORD_BACKEND_URL.
#
# `output: 'standalone'` evaluates next.config.js ONCE at build time and freezes the rewrite
# destinations into the serialized server files — a runtime env var is read by nothing. So the
# image is built with a distinctive placeholder URL and this entrypoint substitutes the real
# backend URL at container start, keeping one image usable in any deployment.
#
# Note: sed uses `|` as delimiter, so COORD_BACKEND_URL must not contain `|` (no legal URL does).

PLACEHOLDER="http://coord-backend-placeholder:8080"
BACKEND="${COORD_BACKEND_URL:-http://localhost:8080}"

for f in server.js .next/routes-manifest.json .next/required-server-files.json; do
  if [ -f "$f" ]; then
    sed -i "s|$PLACEHOLDER|$BACKEND|g" "$f"
  fi
done

exec "$@"