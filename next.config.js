const path = require('path');

/** @type {import('next').NextConfig} */

// COORD_BACKEND_URL: server-side only — used by Next.js rewrites to reach the backend
// (set this to the Docker service URL when running in a container).
// Falls back to NEXT_PUBLIC_API_URL, then localhost for local dev.
const API_URL = process.env.COORD_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  // Minimal self-contained server output for the Docker image (see Dockerfile).
  output: 'standalone',
  // Default the client's API base to coordd's versioned mount (ADR-0027), proxied below. A bare ''
  // base would fetch coordd paths at their own URLs, and GET /launch/<uuid> would COLLIDE with the
  // /launch/[id] page route (pages win over fallback rewrites → the fetch gets HTML, not JSON).
  // /api/v1 is itself collision-free — no page and no Next API route lives under it — so it needs
  // no separate web-owned prefix. An explicit NEXT_PUBLIC_API_URL (e.g. e2e's direct coordd URL,
  // already ending in /api/v1) still overrides.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  },
  async rewrites() {
    // fallback: fires only when no page/route matches. Nothing lives under /api/v1, so every
    // same-origin API call falls through to coordd. Generated client paths are resource-relative
    // (/launch/{id}); the /api/v1 base is what makes them land here.
    return {
      fallback: [
        { source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` },
      ],
    };
  },
  webpack: (config) => {
    // Prevent Watchpack from watching ancestor directories (avoids ENOSPC in dev).
    // RegExp matches any path that does NOT start with this project root,
    // so only files inside web/app/ are ever watched.
    const projectRoot = path.resolve(__dirname);
    const escaped = projectRoot.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
    config.watchOptions = {
      ...config.watchOptions,
      ignored: new RegExp(`^(?!${escaped}(?:/|$))`),
    };

    config.module.rules.push({
      test: /\.yaml$/,
      use: 'yaml-loader',
    });

    // Fix: libsodium-wrappers-sumo ESM build has a broken relative import
    // for './libsodium-sumo.mjs'. Force webpack to use the CJS builds instead.
    config.resolve.alias = {
      ...config.resolve.alias,
      'libsodium-wrappers-sumo': path.resolve(
          __dirname,
          'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'
      ),
    };

    return config;
  },
  images: {
    remotePatterns: [
      {
        hostname: 'raw.githubusercontent.com',
      },
      {
        hostname: 'gist.githubusercontent.com',
      },
    ],
  },
};
