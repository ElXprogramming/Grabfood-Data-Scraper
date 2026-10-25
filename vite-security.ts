import type { IncomingMessage, ServerResponse } from 'node:http';

// ============================================================================
// RATE LIMITER & CONCURRENCY CONTROLLER
// ============================================================================

export interface RateLimitTierConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds until reset
}

interface RequestRecord {
  timestamps: number[];
}

export class RateLimiter {
  private store: Map<string, RequestRecord> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private tiers: Record<string, RateLimitTierConfig>;

  constructor(
    tiers: Record<string, RateLimitTierConfig> = {
      scrape: { windowMs: 60_000, maxRequests: 10 },
      mutation: { windowMs: 60_000, maxRequests: 30 },
      read: { windowMs: 60_000, maxRequests: 120 },
    }
  ) {
    this.tiers = tiers;
    // Periodic garbage collection to remove expired rate limit records
    this.cleanupTimer = setInterval(() => this.prune(), 60_000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public check(tierName: string, clientIp: string): RateLimitResult {
    const tier = this.tiers[tierName] || this.tiers.read;
    const key = `${tierName}:${clientIp}`;
    const now = Date.now();
    const windowStart = now - tier.windowMs;

    let record = this.store.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(key, record);
    }

    // Filter timestamps within the current sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    const resetTime = Math.ceil((now + tier.windowMs) / 1000);
    const oldestTimestamp = record.timestamps[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldestTimestamp + tier.windowMs - now) / 1000));

    if (record.timestamps.length >= tier.maxRequests) {
      return {
        allowed: false,
        limit: tier.maxRequests,
        remaining: 0,
        resetTime,
        retryAfter,
      };
    }

    record.timestamps.push(now);
    const remaining = tier.maxRequests - record.timestamps.length;

    return {
      allowed: true,
      limit: tier.maxRequests,
      remaining,
      resetTime,
      retryAfter: 0,
    };
  }

  public prune(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      const tierName = key.split(':')[0];
      const tier = this.tiers[tierName] || this.tiers.read;
      const windowStart = now - tier.windowMs;
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  public reset(): void {
    this.store.clear();
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export class ConcurrencyLimiter {
  private activeCount: number = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  public acquire(): boolean {
    if (this.activeCount >= this.maxConcurrent) {
      return false;
    }
    this.activeCount++;
    return true;
  }

  public release(): void {
    if (this.activeCount > 0) {
      this.activeCount--;
    }
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getMaxConcurrent(): number {
    return this.maxConcurrent;
  }
}

// ============================================================================
// SSRF & URL VALIDATION
// ============================================================================

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  '169.254.169.254',
  '0.0.0.0',
]);

export interface UrlValidationResult {
  safe: boolean;
  error?: string;
  url?: URL;
}

export function isPrivateIp(ip: string): boolean {
  // Normalize IPv6 mapped IPv4
  const cleanIp = ip.replace(/^::ffff:/i, '');

  // IPv4 Loopback (127.0.0.0/8)
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) return true;

  // RFC 1918 Private ranges
  // 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) return true;
  // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
  const match172 = cleanIp.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  // 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) return true;

  // RFC 3927 Link-local / Cloud Metadata (169.254.0.0/16)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) return true;

  // 0.0.0.0 or 255.255.255.255
  if (cleanIp === '0.0.0.0' || cleanIp === '255.255.255.255') return true;

  // IPv6 loopback / unique local / link-local
  const cleanIpv6 = ip.toLowerCase();
  if (cleanIpv6 === '::1' || cleanIpv6 === '::' || cleanIpv6.startsWith('fc') || cleanIpv6.startsWith('fd') || cleanIpv6.startsWith('fe80')) {
    return true;
  }

  return false;
}

export function validateUrlSafety(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, error: 'URL must be a non-empty string.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { safe: false, error: 'URL exceeds maximum length of 2048 characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, error: 'Malformed URL format.' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { safe: false, error: `Insecure protocol '${protocol}'. Only HTTP and HTTPS are permitted.` };
  }

  // Reject embedded credentials
  if (parsed.username || parsed.password) {
    return { safe: false, error: 'Embedded authentication credentials in URL are disallowed.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (!hostname) {
    return { safe: false, error: 'URL missing valid hostname.' };
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, error: `Access to restricted host '${hostname}' is blocked.` };
  }

  if (isPrivateIp(hostname)) {
    return { safe: false, error: `Access to private or loopback IP '${hostname}' is blocked.` };
  }

  // Reject single-label internal domains without dots (e.g. 'intranet', 'internal')
  if (!hostname.includes('.')) {
    return { safe: false, error: `Access to internal single-label domain '${hostname}' is blocked.` };
  }

  return { safe: true, url: parsed };
}

// ============================================================================
// INPUT SANITIZATION & CSV FORMULA DEFENSE
// ============================================================================

const FORMULA_PREFIX_REGEX = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: unknown): string {
  if (value == null) {
    return '""';
  }
  let s = String(value);

  // Deactivate spreadsheet formula injection (=, +, -, @, \t, \r)
  if (FORMULA_PREFIX_REGEX.test(s)) {
    s = `'${s}`;
  }

  // Escape double quotes as per RFC 4180
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function sanitizeText(value: unknown, maxLength: number = 250): string {
  if (value == null) return '';
  let s = String(value);
  // Strip null bytes and non-printable control characters
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
  // Strip leading hyphens if any to prevent CLI argument injection
  s = s.replace(/^-+/, '').trim();
  return s.slice(0, maxLength);
}

// ============================================================================
// HTTP SECURITY HEADERS & CLIENT IP
// ============================================================================

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    if (first) {
      return first.trim().replace(/^::ffff:/i, '');
    }
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ipStr = Array.isArray(realIp) ? realIp[0] : realIp;
    if (ipStr) {
      return ipStr.trim().replace(/^::ffff:/i, '');
    }
  }

  const socketIp = req.socket?.remoteAddress;
  if (socketIp) {
    return socketIp.replace(/^::ffff:/i, '');
  }

  return '127.0.0.1';
}

export function setSecurityHeaders(res: ServerResponse, origin?: string): void {
  // Defensive Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  // Restrictive CORS
  const isLocalOrigin = origin && (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('https://localhost:')
  );

  res.setHeader('Access-Control-Allow-Origin', isLocalOrigin ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}
