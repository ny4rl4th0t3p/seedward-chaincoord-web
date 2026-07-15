/**
 * Uniform, deliberately non-verbose prompt shown wherever an **unauthenticated** caller hits a gated
 * section. It reveals nothing — no existence, no access model, no per-resource detail — so it's
 * identical whether the target exists or not (coordd returns a uniform 404 to non-members). Reuse it
 * for every such spot so the "off-limits" surface is consistent and leak-free.
 */
export const AUTH_REQUIRED_MESSAGE = 'You need to be signed in to view this section.';
