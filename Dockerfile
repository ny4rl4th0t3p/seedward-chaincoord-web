# syntax=docker/dockerfile:1

# --- Build: install deps, vendor the WASM validator, produce the standalone build ---
FROM node:24-bookworm AS build
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
# public/wasm/ is gitignored — fetch the pinned gentxvalidate WASM (needs curl + network).
RUN yarn sync:wasm
# The API client (api/generated) + vendored spec (openapi/swagger.yaml) are committed,
# so no gen:api/sync:spec is needed here. NEXT_PUBLIC_API_URL is left unset: the client
# defaults to the same-origin /api/v1 prefix (see next.config.js) and Next.js proxies
# it to the backend — coordd's versioned mount can't collide with page routes.
# `output: 'standalone'` freezes the next.config.js rewrite destinations at BUILD time, so bake
# a placeholder URL here; docker-entrypoint.sh substitutes the runtime COORD_BACKEND_URL into
# the serialized server files at container start. The placeholder never serves traffic.
ENV COORD_BACKEND_URL=http://coord-backend-placeholder:8080
# NEXT_PUBLIC_APP_VERSION is inlined by Next at build time, so the running app self-reports its version
# (footer). The publish workflow passes the release tag; a plain `docker build` leaves it "dev".
ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
RUN yarn build

# --- Runtime: Next.js standalone server ---
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output = server.js + traced node_modules; static assets + public are separate.
# Copy as the base image's non-root `node` user (uid 1000) so the runtime can write Next.js's cache.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chmod=755 docker-entrypoint.sh ./
# WORKDIR created /app root-owned; the entrypoint's `sed -i` needs dir write access for its temp file.
RUN chown node:node /app

USER node

EXPOSE 3000

# Liveness: the Next server is serving. No /healthz — this is a stateless frontend, and /api/* is proxied
# to coordd, so probe the index page (client-rendered → returns 200 without touching the backend, keeping
# web health independent of coordd). node-slim has no wget/curl, but node is present.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# Set COORD_BACKEND_URL at runtime (e.g. http://coordd:8080); defaults to http://localhost:8080.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]