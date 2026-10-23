import net from 'net';
export * from './redirect';

/**
 * Checks whether an IP address belongs to private, loopback, or link-local ranges.
 */
function isPrivateOrReservedIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local & Cloud metadata e.g. 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private network)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private network)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 224.0.0.0/4 (Multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (parts[0] >= 240) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Loopback
    if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    // Unspecified
    if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    // Unique local address (fc00::/7)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // Link-local address (fe80::/10)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true;
    }
    // IPv4-mapped IPv6 address (::ffff:127.0.0.1, etc.)
    if (lower.includes('::ffff:')) {
      const v4Part = lower.split('::ffff:')[1];
      if (v4Part && net.isIPv4(v4Part)) {
        return isPrivateOrReservedIp(v4Part);
      }
    }
  }

  return false;
}

/**
 * Validates a target URL against SSRF attacks before sending network requests.
 * Blocks non-http(s) schemes, localhost, loopback, private networks, and cloud metadata endpoints.
 */
export function validateSafeUrl(urlStr: string): { valid: boolean; reason?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, reason: 'URL cannot be empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, reason: `Disallowed protocol: "${parsed.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Strip enclosing brackets for IPv6
  const cleanHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  // Block localhost and common local hostnames
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost === '0.0.0.0' ||
    cleanHost === 'metadata.google.internal' ||
    cleanHost === 'instance-data'
  ) {
    return { valid: false, reason: `Target host "${hostname}" refers to a local or internal metadata address.` };
  }

  // Check if direct IP address is in private / reserved ranges
  if (net.isIP(cleanHost)) {
    if (isPrivateOrReservedIp(cleanHost)) {
      return { valid: false, reason: `Target IP address "${cleanHost}" belongs to a private or reserved network range.` };
    }
  }

  return { valid: true };
}

/**
 * In-memory sliding window rate limiter for brute-force protection.
 */
export class MemoryRateLimiter {
  private windowMs: number;
  private maxAttempts: number;
  private attempts: Map<string, number[]> = new Map();

  constructor(windowMs = 60 * 1000, maxAttempts = 5) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
  }

  public isRateLimited(key: string): boolean {
    const now = Date.now();
    const timestamps = this.attempts.get(key) || [];
    const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);
    this.attempts.set(key, validTimestamps);
    return validTimestamps.length >= this.maxAttempts;
  }

  public recordFailure(key: string): void {
    const now = Date.now();
    const timestamps = this.attempts.get(key) || [];
    timestamps.push(now);
    const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);
    this.attempts.set(key, validTimestamps);
  }

  public recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  public reset(): void {
    this.attempts.clear();
  }
}

// Global rate limiter instance for login endpoints
export const loginRateLimiter = new MemoryRateLimiter(60 * 1000, 5);
