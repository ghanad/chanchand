/**
 * Validates and sanitizes a redirect target to ensure it is strictly an internal, relative path.
 * Protects against Open Redirect vulnerabilities and javascript: / data: pseudo-protocols.
 * Fully compatible with both server-side and browser/client-side environments.
 */
export function sanitizeInternalRedirect(
  target: string | null | undefined,
  fallback = '/'
): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();
  // Must start with a single slash, not double slash (//evil.com) or backslash (/\evil.com)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject URLs containing control characters or embedded schemes
  if (/[\r\n\t]/.test(trimmed)) {
    return fallback;
  }

  // Ensure parsing as relative doesn't resolve to a different origin
  try {
    const dummyBase = 'http://localhost';
    const parsed = new URL(trimmed, dummyBase);
    if (parsed.origin !== dummyBase) {
      return fallback;
    }
    // Return the clean relative pathname + search + hash
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}
