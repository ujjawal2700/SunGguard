/**
 * Pull the payload out of an API response.
 *
 * Every endpoint answers through `handleResponse`, which wraps the payload as:
 *
 *   { success, error, message, result }
 *
 * Reading `response.data.data` — the shape a lot of APIs use — silently yields
 * `undefined` here, and a screen built on it renders empty with no error to
 * follow. That is exactly how the booking form ended up showing no package
 * types and "Up to undefined kg".
 *
 * Written once so the shape lives in one place instead of being re-guessed at
 * every call site. Falls back through the older shapes so a stray endpoint
 * that answers differently still works.
 */
export function unwrap(response) {
  const body = response?.data ?? response;
  if (body == null) return null;

  if (typeof body === "object") {
    if ("result" in body) return body.result;
    if ("data" in body) return body.data;
  }
  return body;
}

/**
 * Same, for a named collection: `unwrapList(res, "parcels")`.
 * Always returns an array, so callers never have to guard before mapping.
 */
export function unwrapList(response, key) {
  const payload = unwrap(response);
  if (Array.isArray(payload)) return payload;
  const list = key ? payload?.[key] : null;
  return Array.isArray(list) ? list : [];
}

export default unwrap;
