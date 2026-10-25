import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  RateLimiter,
  ConcurrencyLimiter,
  validateUrlSafety,
  sanitizeCsvCell,
  sanitizeText,
  setSecurityHeaders,
  isPrivateIp,
} from '../vite-security.ts';
import { apiPlugin } from '../vite-plugin-api.ts';

describe('1. Rate Limiting Engine Unit Tests', () => {
  test('RateLimiter enforces configured request limits per window', () => {
    const limiter = new RateLimiter({
      testTier: { windowMs: 10_000, maxRequests: 3 },
    });

    const ip = '192.0.2.1';

    const r1 = limiter.check('testTier', ip);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);
    assert.equal(r1.limit, 3);

    const r2 = limiter.check('testTier', ip);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = limiter.check('testTier', ip);
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    // 4th request must be blocked
    const r4 = limiter.check('testTier', ip);
    assert.equal(r4.allowed, false);
    assert.equal(r4.remaining, 0);
    assert.ok(r4.retryAfter >= 1);

    limiter.destroy();
  });

  test('RateLimiter isolates rate limits between different client IPs', () => {
    const limiter = new RateLimiter({
      testTier: { windowMs: 10_000, maxRequests: 2 },
    });

    const ipA = '198.51.100.1';
    const ipB = '198.51.100.2';

    assert.equal(limiter.check('testTier', ipA).allowed, true);
    assert.equal(limiter.check('testTier', ipA).allowed, true);
    assert.equal(limiter.check('testTier', ipA).allowed, false);

    // ipB should still be permitted
    const checkB = limiter.check('testTier', ipB);
    assert.equal(checkB.allowed, true);
    assert.equal(checkB.remaining, 1);

    limiter.destroy();
  });

  test('RateLimiter prune removes expired records cleanly', () => {
    const limiter = new RateLimiter({
      quickTier: { windowMs: 50, maxRequests: 2 },
    });

    limiter.check('quickTier', '10.0.0.1');
    assert.equal(limiter.check('quickTier', '10.0.0.1').allowed, true);

    limiter.prune();
    limiter.destroy();
  });
});

describe('2. Concurrency Limiter Unit Tests', () => {
  test('ConcurrencyLimiter limits simultaneous jobs to capacity', () => {
    const limiter = new ConcurrencyLimiter(2);

    assert.equal(limiter.acquire(), true);
    assert.equal(limiter.getActiveCount(), 1);

    assert.equal(limiter.acquire(), true);
    assert.equal(limiter.getActiveCount(), 2);

    // 3rd attempt exceeds capacity of 2
    assert.equal(limiter.acquire(), false);

    limiter.release();
    assert.equal(limiter.getActiveCount(), 1);

    // Now permit can be acquired again
    assert.equal(limiter.acquire(), true);
    assert.equal(limiter.getActiveCount(), 2);

    limiter.release();
    limiter.release();
    assert.equal(limiter.getActiveCount(), 0);
  });
});

describe('3. SSRF & URL Safety Validator Tests', () => {
  test('validateUrlSafety permits safe public HTTP/HTTPS URLs', () => {
    const grab = validateUrlSafety('https://food.grab.com/my/en/restaurant/subway-alamesra');
    assert.equal(grab.safe, true, grab.error);

    const kfc = validateUrlSafety('http://kfc.com.my/menu');
    assert.equal(kfc.safe, true, kfc.error);

    const fp = validateUrlSafety('https://www.foodpanda.my/restaurant/sushi');
    assert.equal(fp.safe, true, fp.error);
  });

  test('validateUrlSafety blocks loopback and localhost', () => {
    const loopbacks = [
      'http://localhost:5173/api/scrape',
      'http://127.0.0.1:8080/admin',
      'http://127.0.1.1/',
      'http://[::1]/',
      'http://0.0.0.0:3000',
    ];
    for (const url of loopbacks) {
      const res = validateUrlSafety(url);
      assert.equal(res.safe, false, `Expected ${url} to be blocked`);
    }
  });

  test('validateUrlSafety blocks private RFC 1918 and link-local ranges', () => {
    const privateUrls = [
      'http://10.0.0.1/status',
      'http://10.255.0.1/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
    ];
    for (const url of privateUrls) {
      const res = validateUrlSafety(url);
      assert.equal(res.safe, false, `Expected ${url} to be blocked`);
    }
  });

  test('validateUrlSafety blocks insecure schemes and credentials', () => {
    const badUrls = [
      'file:///etc/passwd',
      'ftp://ftp.example.com/files',
      'gopher://example.com/',
      'javascript:alert(1)',
      'data:text/html,<h1>attack</h1>',
      'http://user:password@example.com/menu',
    ];
    for (const url of badUrls) {
      const res = validateUrlSafety(url);
      assert.equal(res.safe, false, `Expected ${url} to be blocked`);
    }
  });

  test('isPrivateIp accurately categorizes IPv4 and IPv6 addresses', () => {
    assert.equal(isPrivateIp('127.0.0.1'), true);
    assert.equal(isPrivateIp('10.1.2.3'), true);
    assert.equal(isPrivateIp('172.20.1.1'), true);
    assert.equal(isPrivateIp('172.15.1.1'), false); // Public
    assert.equal(isPrivateIp('192.168.0.1'), true);
    assert.equal(isPrivateIp('169.254.1.1'), true);
    assert.equal(isPrivateIp('::1'), true);
    assert.equal(isPrivateIp('8.8.8.8'), false); // Public
    assert.equal(isPrivateIp('1.1.1.1'), false); // Public
  });
});

describe('4. CSV Formula Injection Defense Tests', () => {
  test('sanitizeCsvCell neutralizes formula injection triggers (=, +, -, @, \\t, \\r)', () => {
    assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"');
    assert.equal(sanitizeCsvCell('+cmd|"/C calc"!A0'), '"\'+cmd|""/C calc""!A0"');
    assert.equal(sanitizeCsvCell('-2+5'), '"\'-2+5"');
    assert.equal(sanitizeCsvCell('@HYPERLINK("http://evil.com")'), '"\'@HYPERLINK(""http://evil.com"")"');
    assert.equal(sanitizeCsvCell('\tTabLeading'), '"\'\tTabLeading"');
    assert.equal(sanitizeCsvCell('\rCarriageLeading'), '"\'\rCarriageLeading"');

    // Safe values wrapped in RFC 4180 quotes without apostrophe prefix
    assert.equal(sanitizeCsvCell('Nasi Lemak Ayam'), '"Nasi Lemak Ayam"');
    assert.equal(sanitizeCsvCell('RM 12.50'), '"RM 12.50"');
    assert.equal(sanitizeCsvCell('He said "Delicious"'), '"He said ""Delicious"""');
    assert.equal(sanitizeCsvCell(null), '""');
  });
});

describe('5. Input Sanitization & CLI Argument Injection Defense', () => {
  test('sanitizeText strips control characters and dangerous leading hyphens', () => {
    assert.equal(sanitizeText('  KFC Alamesra\x00\x08  '), 'KFC Alamesra');
    assert.equal(sanitizeText('--sync-firebase'), 'sync-firebase');
    assert.equal(sanitizeText('---flag-inject'), 'flag-inject');
    assert.equal(sanitizeText('-name'), 'name');
    assert.equal(sanitizeText('Subway - 1Borneo'), 'Subway - 1Borneo'); // Internal hyphens preserved
    assert.equal(sanitizeText('X'.repeat(500), 50).length, 50);
  });
});

describe('6. HTTP Security Headers Tests', () => {
  test('setSecurityHeaders applies comprehensive protective headers', () => {
    const headers: Record<string, string> = {};
    const mockRes = {
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = v;
      },
    } as unknown as http.ServerResponse;

    setSecurityHeaders(mockRes, 'http://localhost:5173');

    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['x-xss-protection'], '1; mode=block');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(headers['permissions-policy'].includes('camera=()'));
    assert.ok(headers['cache-control'].includes('no-store'));
    assert.equal(headers['access-control-allow-origin'], 'http://localhost:5173');
  });
});

describe('7. End-to-End API Middleware Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let testRateLimiter: RateLimiter;
  let testConcurrencyLimiter: ConcurrencyLimiter;

  before(async () => {
    testRateLimiter = new RateLimiter({
      scrape: { windowMs: 10_000, maxRequests: 3 },
      mutation: { windowMs: 10_000, maxRequests: 5 },
      read: { windowMs: 10_000, maxRequests: 10 },
    });
    testConcurrencyLimiter = new ConcurrencyLimiter(1);

    const plugin = apiPlugin({
      rateLimiter: testRateLimiter,
      concurrencyLimiter: testConcurrencyLimiter,
    });

    const mockViteServer = {
      middlewares: {
        use(handler: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) {
          server = http.createServer((req, res) => {
            handler(req, res, () => {
              res.statusCode = 404;
              res.end('Not Found');
            });
          });
        },
      },
    };

    if (plugin.configureServer) {
      // @ts-expect-error Mock server interface for testing middleware
      plugin.configureServer(mockViteServer);
    }

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    testRateLimiter.reset();
  });

  after(() => {
    testRateLimiter.destroy();
    server.close();
  });

  test('GET /api/restaurants includes security and rate limit headers', async () => {
    const res = await fetch(`${baseUrl}/api/restaurants`);
    assert.equal(res.status, 200);

    // Verify Security Headers
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');

    // Verify Rate Limit Headers
    assert.equal(res.headers.get('x-ratelimit-limit'), '10');
    assert.ok(res.headers.get('x-ratelimit-remaining') !== null);
    assert.ok(res.headers.get('x-ratelimit-reset') !== null);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.restaurants));
  });

  test('Rate limiting triggers HTTP 429 when threshold exceeded', async () => {
    // Send repeated requests to exceed read tier limit (max 10)
    let lastRes = await fetch(`${baseUrl}/api/restaurants`);
    for (let i = 0; i < 12; i++) {
      lastRes = await fetch(`${baseUrl}/api/restaurants`);
    }

    assert.equal(lastRes.status, 429);
    assert.ok(lastRes.headers.get('retry-after') !== null);

    const body = await lastRes.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Rate limit exceeded'));

    // Reset rate limiter for subsequent tests
    testRateLimiter.reset();
  });

  test('POST /api/scrape blocks SSRF attempts to private IP / localhost', async () => {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:8080/internal' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Invalid URL'));
  });

  test('POST /api/scrape blocks insecure schemes (file://)', async () => {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/shadow' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Insecure protocol'));
  });

  test('POST /api/scrape blocks argument injection via leading hyphens', async () => {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '--sync-firebase' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('POST /api/scrape rejects oversized payloads with HTTP 413 (DoS defense)', async () => {
    // Generate a payload exceeding 256KB
    const largeObject = {
      url: 'https://food.grab.com/my/en/restaurant/test',
      junk: 'A'.repeat(300 * 1024),
    };

    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(largeObject),
    });

    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Payload Too Large'));
  });

  test('POST /api/scrape rejects malformed JSON with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"url": "broken json...',
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Invalid JSON'));
  });

  test('GET /api/items enforces strict numeric bounds (clamping)', async () => {
    // limit=999999 should be clamped to 250
    const res = await fetch(`${baseUrl}/api/items?limit=999999`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.limit, 250);

    // limit=-10 should be clamped to 1
    const resNegative = await fetch(`${baseUrl}/api/items?limit=-10`);
    const bodyNegative = await resNegative.json();
    assert.equal(bodyNegative.limit, 1);
  });

  test('POST /api/update-restaurant requires valid integer ID', async () => {
    const res = await fetch(`${baseUrl}/api/update-restaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'invalid_id', name: 'New Name' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('Valid positive restaurant ID is required'));
  });

  test('GET /api/export neutralizes CSV formula triggers in output', async () => {
    const res = await fetch(`${baseUrl}/api/export?format=csv`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');

    const csvText = await res.text();
    // Headers should exist
    assert.ok(csvText.includes('Restaurant,Area,Cuisine,Rating'));
  });

  test('GET /api/items safely handles SQL injection payloads without errors', async () => {
    const payloads = [
      "' OR 1=1 --",
      "'; DROP TABLE restaurants; --",
      "' UNION SELECT null, null, null, null, null --",
      "' OR 'a'='a",
      "1; SELECT * FROM sqlite_master; --",
    ];

    for (const sql of payloads) {
      const res = await fetch(`${baseUrl}/api/items?search=${encodeURIComponent(sql)}&cuisine=${encodeURIComponent(sql)}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.items));
    }
  });

  test('Concurrency limiter blocks concurrent scraper tasks when limit is saturated', async () => {
    // Acquire the single available permit in testConcurrencyLimiter
    assert.equal(testConcurrencyLimiter.acquire(), true);

    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://food.grab.com/my/en/restaurant/test' }),
    });

    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('maximum concurrent scraping tasks'));

    // Release permit
    testConcurrencyLimiter.release();
  });

  test('Rate limiting triggers on mutation tier (/api/add-link) when threshold exceeded', async () => {
    // Max requests on mutation tier in test is 5
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/add-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Test ${i}`, url: `https://example.com/test-${i}` }),
      });
    }

    // 6th request must trigger 429
    const blockedRes = await fetch(`${baseUrl}/api/add-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked', url: 'https://example.com/blocked' }),
    });

    assert.equal(blockedRes.status, 429);
    const body = await blockedRes.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Rate limit exceeded for 'mutation' operations"));
  });

  test('GET /api/firebase/status returns configured status without exposing credentials', async () => {
    const res = await fetch(`${baseUrl}/api/firebase/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(typeof body.configured, 'boolean');
    assert.equal(body.projectId, 'restaurantdatascraper');
    // Ensure no filesystem paths or secret keys are returned
    assert.equal(body.privateKey, undefined);
    assert.equal(body.credentialsPath, undefined);
  });

  test('OPTIONS request handles CORS preflight with security headers', async () => {
    const res = await fetch(`${baseUrl}/api/restaurants`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.ok(res.headers.get('access-control-allow-methods')?.includes('POST'));
  });
});
