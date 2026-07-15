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
# fetches same-origin and Next.js proxies /api,/auth,/launch,… to COORD_BACKEND_URL at runtime.
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

USER node

EXPOSE 3000
# Set COORD_BACKEND_URL at runtime (e.g. http://coordd:8080) — the image bakes no backend URL.
CMD ["node", "server.js"]