import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  RateLimiter,
  ConcurrencyLimiter,
  validateUrlSafety,
  sanitizeCsvCell,
  sanitizeText,
  getClientIp,
  setSecurityHeaders,
} from './vite-security.ts';

const nodeRequire = createRequire(import.meta.url);

interface ScrapeRequest {
  url: string;
  name?: string;
  rating?: number;
  cuisine?: string;
  opening_hours?: string;
  address?: string;
  lat?: number;
  lon?: number;
  area?: string;
  render?: boolean;
}

interface AddLinkRequest {
  name: string;
  url: string;
  address?: string;
  lat?: number;
  lon?: number;
  rating?: number;
  cuisine?: string;
  opening_hours?: string;
}

interface UpdateRestaurantRequest {
  id: number;
  name?: string;
  rating?: number;
  cuisine?: string;
  opening_hours?: string;
  address?: string;
  lat?: number;
  lon?: number;
  area?: string;
}

class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const MAX_BODY_SIZE = 256 * 1024; // 256 KB maximum request body size
const SCRAPER_TIMEOUT_MS = 90_000; // 90 seconds maximum scraper execution time
const ALLOWED_SORT_OPTIONS = new Set([
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
  'rating_desc',
  'newest',
]);

export function apiPlugin(options?: {
  rateLimiter?: RateLimiter;
  concurrencyLimiter?: ConcurrencyLimiter;
}): Plugin {
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, 'scraper/data/menus.db');
  const pythonPath = path.join(rootDir, 'scraper/.venv/bin/python');
  const scraperDir = path.join(rootDir, 'scraper');

  // Shared or injected rate limiter and concurrency limiter
  const rateLimiter = options?.rateLimiter || new RateLimiter();
  const concurrencyLimiter = options?.concurrencyLimiter || new ConcurrencyLimiter(2);

  function getDb() {
    if (!fs.existsSync(dbPath)) {
      throw new ApiError(503, 'Database service is currently unavailable.');
    }
    const sqlite = nodeRequire('node:sqlite');
    return new sqlite.DatabaseSync(dbPath);
  }

  function sendJson(res: ServerResponse, status: number, data: unknown, origin?: string) {
    setSecurityHeaders(res, origin);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  }

  function readBody<T = unknown>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      let receivedBytes = 0;
      let exceeded = false;

      req.on('data', (chunk: Buffer) => {
        try {
          if (exceeded) return;
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_BODY_SIZE) {
            exceeded = true;
            req.resume();
            reject(new ApiError(413, 'Payload Too Large: Maximum allowed body size is 256KB.'));
            return;
          }
          body += chunk.toString();
        } catch (e) {
          reject(e);
        }
      });

      req.on('end', () => {
        if (exceeded) return;
        if (!body.trim()) {
          resolve({} as T);
          return;
        }
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new ApiError(400, 'Invalid JSON syntax in request body.'));
        }
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  return {
    name: 'restaurant-scraper-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;
        const origin = (req.headers.origin as string) || undefined;

        // Handle CORS Preflight
        if (req.method === 'OPTIONS') {
          setSecurityHeaders(res, origin);
          res.statusCode = 204;
          res.end();
          return;
        }

        // Only handle /api/* endpoints
        if (!pathname.startsWith('/api/')) {
          return next();
        }

        // 1. RATE LIMITING MIDDLEWARE
        const clientIp = getClientIp(req);
        let tier = 'read';
        if (pathname === '/api/scrape' || pathname === '/api/firebase/sync') {
          tier = 'scrape';
        } else if (pathname === '/api/add-link' || pathname === '/api/update-restaurant') {
          tier = 'mutation';
        }

        const rate = rateLimiter.check(tier, clientIp);
        res.setHeader('X-RateLimit-Limit', String(rate.limit));
        res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
        res.setHeader('X-RateLimit-Reset', String(rate.resetTime));

        if (!rate.allowed) {
          res.setHeader('Retry-After', String(rate.retryAfter));
          sendJson(
            res,
            429,
            {
              success: false,
              error: `Rate limit exceeded for '${tier}' operations. Please retry in ${rate.retryAfter} seconds.`,
              retryAfter: rate.retryAfter,
            },
            origin
          );
          return;
        }

        try {
          // ------------------------------------------------------------------
          // GET /api/restaurants
          // ------------------------------------------------------------------
          if (pathname === '/api/restaurants' && req.method === 'GET') {
            const db = getDb();
            const rows = db.prepare(`
              SELECT r.id, r.name, r.area, r.website, r.grab_url, r.foodpanda_url,
                     r.cuisine, r.rating, r.opening_hours, r.address, r.lat, r.lon,
                     COUNT(m.id) as item_count,
                     ROUND(AVG(m.price), 2) as avg_price,
                     ROUND(MIN(m.price), 2) as min_price,
                     ROUND(MAX(m.price), 2) as max_price
              FROM restaurants r
              LEFT JOIN menu_items m ON r.id = m.restaurant_id
              GROUP BY r.id
              ORDER BY item_count DESC, r.name ASC
            `).all();

            sendJson(res, 200, { success: true, count: rows.length, restaurants: rows }, origin);
            return;
          }

          // ------------------------------------------------------------------
          // GET /api/items (with strict query validation & clamping)
          // ------------------------------------------------------------------
          if (pathname === '/api/items' && req.method === 'GET') {
            const db = getDb();

            // Validate and sanitize numeric parameters
            const rawLimit = parseInt(urlObj.searchParams.get('limit') || '100', 10);
            const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 250);

            const rawOffset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
            const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

            const rawRestaurantId = urlObj.searchParams.get('restaurant_id');
            const restaurantId = rawRestaurantId ? parseInt(rawRestaurantId, 10) : null;

            const rawMinRating = urlObj.searchParams.get('min_rating');
            const minRating = rawMinRating ? parseFloat(rawMinRating) : null;

            const rawMinPrice = urlObj.searchParams.get('min_price');
            const minPrice = rawMinPrice ? parseFloat(rawMinPrice) : null;

            const rawMaxPrice = urlObj.searchParams.get('max_price');
            const maxPrice = rawMaxPrice ? parseFloat(rawMaxPrice) : null;

            // Sanitize string filters
            const search = sanitizeText(urlObj.searchParams.get('search'), 100);
            const category = sanitizeText(urlObj.searchParams.get('category'), 100);
            const cuisine = sanitizeText(urlObj.searchParams.get('cuisine'), 100);
            const area = sanitizeText(urlObj.searchParams.get('area'), 60);

            // Allowlisted sorting parameter
            const rawSort = urlObj.searchParams.get('sort') || 'price_desc';
            const sort = ALLOWED_SORT_OPTIONS.has(rawSort) ? rawSort : 'price_desc';

            const conditions: string[] = ['1=1'];
            const params: (string | number)[] = [];

            if (restaurantId !== null && Number.isInteger(restaurantId) && restaurantId > 0) {
              conditions.push('m.restaurant_id = ?');
              params.push(restaurantId);
            }
            if (search) {
              conditions.push('(m.name LIKE ? OR m.description LIKE ? OR r.name LIKE ? OR r.cuisine LIKE ?)');
              const term = `%${search}%`;
              params.push(term, term, term, term);
            }
            if (category) {
              conditions.push('m.category = ?');
              params.push(category);
            }
            if (cuisine) {
              conditions.push('r.cuisine LIKE ?');
              params.push(`%${cuisine}%`);
            }
            if (minRating !== null && Number.isFinite(minRating) && minRating >= 0 && minRating <= 5) {
              conditions.push('r.rating >= ?');
              params.push(minRating);
            }
            if (area) {
              conditions.push('r.area = ?');
              params.push(area);
            }
            if (minPrice !== null && Number.isFinite(minPrice) && minPrice >= 0) {
              conditions.push('m.price >= ?');
              params.push(minPrice);
            }
            if (maxPrice !== null && Number.isFinite(maxPrice) && maxPrice >= 0) {
              conditions.push('m.price <= ?');
              params.push(maxPrice);
            }

            let orderBy = 'm.price DESC';
            if (sort === 'price_asc') orderBy = 'm.price ASC';
            if (sort === 'price_desc') orderBy = 'm.price DESC';
            if (sort === 'name_asc') orderBy = 'm.name ASC';
            if (sort === 'name_desc') orderBy = 'm.name DESC';
            if (sort === 'rating_desc') orderBy = 'r.rating DESC, m.price DESC';
            if (sort === 'newest') orderBy = 'm.id DESC';

            const whereClause = conditions.join(' AND ');

            const countRow = db.prepare(`
              SELECT COUNT(*) as total
              FROM menu_items m
              JOIN restaurants r ON m.restaurant_id = r.id
              WHERE ${whereClause}
            `).get(...params) as { total?: number } | undefined;

            const items = db.prepare(`
              SELECT m.id, m.restaurant_id, m.category, m.name, m.description, m.price, m.currency, m.source, m.scraped_at,
                     r.name as restaurant_name, r.area, r.cuisine, r.rating, r.opening_hours, r.address, r.lat, r.lon
              FROM menu_items m
              JOIN restaurants r ON m.restaurant_id = r.id
              WHERE ${whereClause}
              ORDER BY ${orderBy}
              LIMIT ? OFFSET ?
            `).all(...params, limit, offset);

            sendJson(
              res,
              200,
              {
                success: true,
                total: countRow?.total || 0,
                count: items.length,
                limit,
                offset,
                items,
              },
              origin
            );
            return;
          }

          // ------------------------------------------------------------------
          // GET /api/analytics
          // ------------------------------------------------------------------
          if (pathname === '/api/analytics' && req.method === 'GET') {
            const db = getDb();

            const totalRestaurantsRow = db.prepare('SELECT COUNT(*) as c FROM restaurants').get() as { c?: number } | undefined;
            const totalScrapedRestRow = db.prepare('SELECT COUNT(DISTINCT restaurant_id) as c FROM menu_items').get() as { c?: number } | undefined;
            const totalItemsRow = db.prepare('SELECT COUNT(*) as c FROM menu_items').get() as { c?: number } | undefined;

            const priceRows = db.prepare('SELECT price FROM menu_items WHERE price IS NOT NULL ORDER BY price ASC').all() as Array<{ price: number }>;
            const prices = priceRows.map((r) => r.price);

            let minPrice = 0;
            let maxPrice = 0;
            let avgPrice = 0;
            let medianPrice = 0;
            let q1 = 0;
            let q3 = 0;
            let iqr = 0;
            let stdDev = 0;

            if (prices.length > 0) {
              minPrice = prices[0];
              maxPrice = prices[prices.length - 1];
              medianPrice = prices[Math.floor(prices.length / 2)];
              q1 = prices[Math.floor(prices.length * 0.25)];
              q3 = prices[Math.floor(prices.length * 0.75)];
              iqr = parseFloat((q3 - q1).toFixed(2));
              const sum = prices.reduce((a, b) => a + b, 0);
              avgPrice = parseFloat((sum / prices.length).toFixed(2));
              const variance = prices.reduce((acc, p) => acc + Math.pow(p - avgPrice, 2), 0) / prices.length;
              stdDev = parseFloat(Math.sqrt(variance).toFixed(2));
            }

            const bins = [
              { label: '< RM 5', min: 0, max: 5, count: 0 },
              { label: 'RM 5 - 10', min: 5, max: 10, count: 0 },
              { label: 'RM 10 - 15', min: 10, max: 15, count: 0 },
              { label: 'RM 15 - 20', min: 15, max: 20, count: 0 },
              { label: 'RM 20 - 25', min: 20, max: 25, count: 0 },
              { label: 'RM 25 - 30', min: 25, max: 30, count: 0 },
              { label: 'RM 30+', min: 30, max: 9999, count: 0 },
            ];

            for (const p of prices) {
              for (const bin of bins) {
                if (p >= bin.min && (bin.max === 9999 ? p >= 30 : p < bin.max)) {
                  bin.count++;
                  break;
                }
              }
            }

            const lowerBound = Math.max(0, q1 - 1.5 * iqr);
            const upperBound = q3 + 1.5 * iqr;
            const outliers = db.prepare(`
              SELECT m.id, m.name, m.price, m.category, r.name as restaurant_name
              FROM menu_items m
              JOIN restaurants r ON m.restaurant_id = r.id
              WHERE m.price < ? OR m.price > ?
              ORDER BY m.price DESC
              LIMIT 15
            `).all(lowerBound, upperBound);

            const categories = db.prepare(`
              SELECT category, COUNT(*) as count, ROUND(AVG(price), 2) as avg_price,
                     ROUND(MIN(price), 2) as min_price, ROUND(MAX(price), 2) as max_price
              FROM menu_items
              GROUP BY category
              ORDER BY count DESC
              LIMIT 12
            `).all();

            const restaurantBreakdown = db.prepare(`
              SELECT r.id, r.name, r.area, r.cuisine, r.rating, r.opening_hours, r.address, r.lat, r.lon,
                     COUNT(m.id) as item_count,
                     ROUND(AVG(m.price), 2) as avg_price,
                     ROUND(MIN(m.price), 2) as min_price,
                     ROUND(MAX(m.price), 2) as max_price
              FROM restaurants r
              JOIN menu_items m ON r.id = m.restaurant_id
              GROUP BY r.id
              ORDER BY item_count DESC
            `).all();

            const itemNames = db.prepare('SELECT name FROM menu_items').all() as Array<{ name?: string }>;
            const stopwords = new Set([
              'set', 'and', 'with', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'on', 'or',
              '+', '-', '&', 'per', 'serving', '1pcs', 'large', 'small', 'medium', 'ala', 'carte'
            ]);
            const wordCounts: Record<string, number> = {};
            for (const row of itemNames) {
              const words = (row.name || '')
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w: string) => w.length > 2 && !stopwords.has(w));
              for (const w of words) {
                wordCounts[w] = (wordCounts[w] || 0) + 1;
              }
            }
            const keywords = Object.entries(wordCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 24)
              .map(([word, frequency]) => ({ word, frequency }));

            sendJson(
              res,
              200,
              {
                success: true,
                kpi: {
                  totalRestaurants: totalRestaurantsRow?.c || 0,
                  scrapedRestaurants: totalScrapedRestRow?.c || 0,
                  totalItems: totalItemsRow?.c || 0,
                  avgPrice,
                  medianPrice,
                  minPrice,
                  maxPrice,
                  stdDev,
                  q1,
                  q3,
                  iqr,
                  lowerBound: parseFloat(lowerBound.toFixed(2)),
                  upperBound: parseFloat(upperBound.toFixed(2)),
                },
                bins,
                categories,
                restaurantBreakdown,
                keywords,
                outliers,
              },
              origin
            );
            return;
          }

          // ------------------------------------------------------------------
          // POST /api/scrape (Heavy Process Execution with Concurrency Cap & SSRF Protection)
          // ------------------------------------------------------------------
          if (pathname === '/api/scrape' && req.method === 'POST') {
            const body = await readBody<ScrapeRequest>(req);
            const targetUrl = (body.url || '').trim();

            if (!targetUrl) {
              sendJson(res, 400, { success: false, error: 'URL parameter is required.' }, origin);
              return;
            }

            // SSRF and protocol validation
            const urlCheck = validateUrlSafety(targetUrl);
            if (!urlCheck.safe) {
              sendJson(res, 400, { success: false, error: `Invalid URL: ${urlCheck.error}` }, origin);
              return;
            }

            // Prevent CLI argument injection
            if (targetUrl.startsWith('-')) {
              sendJson(res, 400, { success: false, error: 'Malformed URL: Leading hyphens disallowed.' }, origin);
              return;
            }

            if (!fs.existsSync(pythonPath)) {
              sendJson(res, 503, { success: false, error: 'Scraper execution runtime is currently unavailable.' }, origin);
              return;
            }

            // Concurrency Semaphore Check
            if (!concurrencyLimiter.acquire()) {
              sendJson(
                res,
                429,
                {
                  success: false,
                  error: 'Server is currently executing maximum concurrent scraping tasks. Please try again shortly.',
                },
                origin
              );
              return;
            }

            const args = ['-m', 'scraper.runner', '--url', targetUrl];

            const safeName = sanitizeText(body.name, 150);
            if (safeName) args.push('--name', safeName);

            if (body.rating != null && Number.isFinite(body.rating) && body.rating >= 0 && body.rating <= 5) {
              args.push('--rating', String(roundTo(body.rating, 1)));
            }

            const safeCuisine = sanitizeText(body.cuisine, 100);
            if (safeCuisine) args.push('--cuisine', safeCuisine);

            const safeHours = sanitizeText(body.opening_hours, 100);
            if (safeHours) args.push('--opening-hours', safeHours);

            const safeAddress = sanitizeText(body.address, 250);
            if (safeAddress) args.push('--address', safeAddress);

            if (body.lat != null && Number.isFinite(body.lat) && body.lat >= -90 && body.lat <= 90) {
              args.push('--lat', String(roundTo(body.lat, 6)));
            }

            if (body.lon != null && Number.isFinite(body.lon) && body.lon >= -180 && body.lon <= 180) {
              args.push('--lon', String(roundTo(body.lon, 6)));
            }

            const safeArea = sanitizeText(body.area, 60);
            if (safeArea) args.push('--area', safeArea);

            if (body.render) {
              args.push('--render');
            }

            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            let finished = false;

            const child = spawn(pythonPath, args, {
              cwd: scraperDir,
              env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: 'scraper' },
            });

            // Process Timeout Guard
            const timeoutTimer = setTimeout(() => {
              if (!finished) {
                finished = true;
                concurrencyLimiter.release();
                try {
                  child.kill('SIGTERM');
                  setTimeout(() => {
                    try { child.kill('SIGKILL'); } catch { /* ignore */ }
                  }, 3000);
                } catch { /* ignore */ }
                sendJson(
                  res,
                  504,
                  { success: false, error: 'Scraper execution timed out after 90 seconds.' },
                  origin
                );
              }
            }, SCRAPER_TIMEOUT_MS);

            child.stdout.on('data', (data) => {
              stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
              stderr += data.toString();
            });

            child.on('error', (err) => {
              clearTimeout(timeoutTimer);
              if (!finished) {
                finished = true;
                concurrencyLimiter.release();
                sendJson(res, 500, { success: false, error: `Process failure: ${err.message}` }, origin);
              }
            });

            child.on('close', (code) => {
              clearTimeout(timeoutTimer);
              if (finished) return;
              finished = true;
              concurrencyLimiter.release();

              const elapsedMs = Date.now() - startTime;
              if (code !== 0 && !stdout.trim()) {
                sendJson(
                  res,
                  500,
                  {
                    success: false,
                    error: stderr || `Scraper process exited with code ${code}`,
                    elapsedMs,
                  },
                  origin
                );
                return;
              }

              try {
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const result = JSON.parse(jsonMatch[0]);
                  sendJson(res, 200, { ...result, elapsedMs }, origin);
                } else {
                  sendJson(
                    res,
                    200,
                    {
                      success: false,
                      error: 'Failed to extract JSON result from scraper output.',
                      elapsedMs,
                    },
                    origin
                  );
                }
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : 'Output parsing error';
                sendJson(res, 500, { success: false, error: `Failed to parse scraper output: ${message}`, elapsedMs }, origin);
              }
            });
            return;
          }

          // ------------------------------------------------------------------
          // POST /api/update-restaurant
          // ------------------------------------------------------------------
          if (pathname === '/api/update-restaurant' && req.method === 'POST') {
            const body = await readBody<UpdateRestaurantRequest>(req);
            const id = parseInt(String(body.id), 10);

            if (!id || !Number.isInteger(id) || id <= 0) {
              sendJson(res, 400, { success: false, error: 'Valid positive restaurant ID is required.' }, origin);
              return;
            }

            const db = getDb();
            const updates: string[] = ["updated_at = datetime('now')"];
            const values: (string | number)[] = [];

            if (body.name != null) {
              const name = sanitizeText(body.name, 150);
              if (name) { updates.push('name = ?'); values.push(name); }
            }
            if (body.rating != null && Number.isFinite(body.rating) && body.rating >= 0 && body.rating <= 5) {
              updates.push('rating = ?');
              values.push(roundTo(body.rating, 1));
            }
            if (body.cuisine != null) {
              updates.push('cuisine = ?');
              values.push(sanitizeText(body.cuisine, 100));
            }
            if (body.opening_hours != null) {
              updates.push('opening_hours = ?');
              values.push(sanitizeText(body.opening_hours, 100));
            }
            if (body.address != null) {
              updates.push('address = ?');
              values.push(sanitizeText(body.address, 250));
            }
            if (body.lat != null && Number.isFinite(body.lat) && body.lat >= -90 && body.lat <= 90) {
              updates.push('lat = ?');
              values.push(roundTo(body.lat, 6));
            }
            if (body.lon != null && Number.isFinite(body.lon) && body.lon >= -180 && body.lon <= 180) {
              updates.push('lon = ?');
              values.push(roundTo(body.lon, 6));
            }
            if (body.area != null) {
              updates.push('area = ?');
              values.push(sanitizeText(body.area, 60));
            }

            values.push(id);
            db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...values);

            sendJson(res, 200, { success: true, message: `Updated restaurant #${id} parameters successfully.` }, origin);
            return;
          }

          // ------------------------------------------------------------------
          // POST /api/add-link
          // ------------------------------------------------------------------
          if (pathname === '/api/add-link' && req.method === 'POST') {
            const body = await readBody<AddLinkRequest>(req);
            const rawName = body.name ? body.name.trim() : '';
            const rawUrl = body.url ? body.url.trim() : '';

            if (!rawName || !rawUrl) {
              sendJson(res, 400, { success: false, error: 'Both name and url are required.' }, origin);
              return;
            }

            const urlCheck = validateUrlSafety(rawUrl);
            if (!urlCheck.safe) {
              sendJson(res, 400, { success: false, error: `Invalid URL: ${urlCheck.error}` }, origin);
              return;
            }

            const name = sanitizeText(rawName, 150);
            const address = sanitizeText(body.address, 250);
            const cuisine = sanitizeText(body.cuisine, 100);
            const opening_hours = sanitizeText(body.opening_hours, 100);
            const rating = body.rating != null && Number.isFinite(body.rating) && body.rating >= 0 && body.rating <= 5
              ? roundTo(body.rating, 1)
              : null;
            const lat = body.lat != null && Number.isFinite(body.lat) && body.lat >= -90 && body.lat <= 90
              ? roundTo(body.lat, 6)
              : null;
            const lon = body.lon != null && Number.isFinite(body.lon) && body.lon >= -180 && body.lon <= 180
              ? roundTo(body.lon, 6)
              : null;

            const db = getDb();
            const col = rawUrl.includes('grab.com')
              ? 'grab_url'
              : rawUrl.includes('foodpanda')
              ? 'foodpanda_url'
              : 'website';

            const cleanUrl = rawUrl.split('?')[0].toLowerCase();
            const rows = db.prepare(`
              SELECT id, name FROM restaurants
              WHERE ${col} LIKE ? OR name LIKE ?
            `).all(`%${cleanUrl}%`, `%${name}%`) as Array<{ id: number; name: string }>;

            if (rows.length === 0) {
              const area = name.toLowerCase().includes('alamesra')
                ? 'alamesra'
                : name.toLowerCase().includes('borneo')
                ? '1borneo'
                : null;
              db.prepare(`
                INSERT INTO restaurants (name, ${col}, address, lat, lon, rating, cuisine, opening_hours, area, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
              `).run(name, rawUrl, address || null, lat || null, lon || null, rating || null, cuisine || null, opening_hours || null, area);
              sendJson(res, 200, { success: true, isMerged: false, message: `Created new restaurant '${name}' with ${col}.` }, origin);
            } else {
              const existingId = rows[0].id;
              db.prepare(`
                UPDATE restaurants
                SET ${col} = ?,
                    address = COALESCE(?, address),
                    lat = COALESCE(?, lat),
                    lon = COALESCE(?, lon),
                    rating = COALESCE(?, rating),
                    cuisine = COALESCE(?, cuisine),
                    opening_hours = COALESCE(?, opening_hours),
                    updated_at = datetime('now')
                WHERE id = ?
              `).run(rawUrl, address || null, lat || null, lon || null, rating || null, cuisine || null, opening_hours || null, existingId);
              sendJson(res, 200, {
                success: true,
                isMerged: true,
                message: `Deduplicated: Attached link and parameters to existing restaurant '${rows[0].name}' (ID #${existingId}).`,
              }, origin);
            }
            return;
          }

          // ------------------------------------------------------------------
          // GET /api/export (with CSV Formula Injection Neutralization)
          // ------------------------------------------------------------------
          if (pathname === '/api/export' && req.method === 'GET') {
            const db = getDb();
            const format = urlObj.searchParams.get('format') || 'csv';

            const items = db.prepare(`
              SELECT r.name as restaurant, r.area, r.cuisine, r.rating, r.opening_hours,
                     r.address, r.lat, r.lon, m.category, m.name as item_name,
                     m.description, m.price, m.currency, m.source, m.source_url, m.scraped_at
              FROM menu_items m
              JOIN restaurants r ON m.restaurant_id = r.id
              ORDER BY r.name, m.category, m.name
            `).all() as Array<Record<string, unknown>>;

            setSecurityHeaders(res, origin);

            if (format === 'json') {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Content-Disposition', 'attachment; filename="restaurant_menu_dataset.json"');
              res.end(JSON.stringify(items, null, 2));
              return;
            }

            // CSV output with Formula Injection Defense
            const headers = [
              'Restaurant',
              'Area',
              'Cuisine',
              'Rating',
              'Opening Hours',
              'Address',
              'Latitude',
              'Longitude',
              'Category',
              'Item Name',
              'Description',
              'Price',
              'Currency',
              'Source',
              'Source URL',
              'Scraped At',
            ];

            const csvRows = [headers.join(',')];
            for (const item of items) {
              const row = [
                sanitizeCsvCell(item.restaurant),
                sanitizeCsvCell(item.area),
                sanitizeCsvCell(item.cuisine),
                item.rating != null ? String(item.rating) : '""',
                sanitizeCsvCell(item.opening_hours),
                sanitizeCsvCell(item.address),
                item.lat != null ? String(item.lat) : '""',
                item.lon != null ? String(item.lon) : '""',
                sanitizeCsvCell(item.category),
                sanitizeCsvCell(item.item_name),
                sanitizeCsvCell(item.description),
                item.price != null ? String(item.price) : '""',
                sanitizeCsvCell(item.currency || 'MYR'),
                sanitizeCsvCell(item.source),
                sanitizeCsvCell(item.source_url),
                sanitizeCsvCell(item.scraped_at),
              ];
              csvRows.push(row.join(','));
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="restaurant_menu_dataset.csv"');
            res.end(csvRows.join('\n'));
            return;
          }

          // ------------------------------------------------------------------
          // GET /api/firebase/status
          // ------------------------------------------------------------------
          if (pathname === '/api/firebase/status' && req.method === 'GET') {
            const keyCandidates = [
              path.resolve(rootDir, 'credentials/serviceAccountKey.json'),
              path.resolve(rootDir, 'serviceAccountKey.json'),
            ];
            const hasKey = keyCandidates.some((p) => fs.existsSync(p)) || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
            sendJson(res, 200, {
              success: true,
              configured: hasKey,
              projectId: 'restaurantdatascraper',
            }, origin);
            return;
          }

          // ------------------------------------------------------------------
          // POST /api/firebase/sync (with Concurrency Cap & Timeout)
          // ------------------------------------------------------------------
          if (pathname === '/api/firebase/sync' && req.method === 'POST') {
            if (!concurrencyLimiter.acquire()) {
              sendJson(
                res,
                429,
                {
                  success: false,
                  error: 'Server is currently executing another sync or scraping task. Please wait and retry.',
                },
                origin
              );
              return;
            }

            let finished = false;
            const child = spawn(pythonPath, ['-m', 'scraper.runner', '--sync-firebase'], {
              cwd: scraperDir,
              env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: 'scraper' },
            });

            const syncTimeout = setTimeout(() => {
              if (!finished) {
                finished = true;
                concurrencyLimiter.release();
                try {
                  child.kill('SIGTERM');
                  setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 3000);
                } catch { /* ignore */ }
                sendJson(res, 504, { success: false, error: 'Firebase sync timed out after 90 seconds.' }, origin);
              }
            }, SCRAPER_TIMEOUT_MS);

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });

            child.on('error', (err) => {
              clearTimeout(syncTimeout);
              if (!finished) {
                finished = true;
                concurrencyLimiter.release();
                sendJson(res, 500, { success: false, error: `Sync process error: ${err.message}` }, origin);
              }
            });

            child.on('close', (code) => {
              clearTimeout(syncTimeout);
              if (finished) return;
              finished = true;
              concurrencyLimiter.release();

              try {
                const match = stdout.match(/\{[\s\S]*\}/);
                if (match) {
                  sendJson(res, 200, JSON.parse(match[0]), origin);
                } else {
                  sendJson(res, 200, { success: code === 0, rawStdout: stdout, rawStderr: stderr }, origin);
                }
              } catch {
                sendJson(res, 500, { success: false, error: stderr || stdout || 'Sync failed.' }, origin);
              }
            });
            return;
          }

          sendJson(res, 404, { success: false, error: 'API route not found' }, origin);
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'statusCode' in err &&
            typeof (err as { statusCode: unknown }).statusCode === 'number'
          ) {
            const apiErr = err as { statusCode: number; message: string };
            sendJson(res, apiErr.statusCode, { success: false, error: apiErr.message }, origin);
            return;
          }
          sendJson(res, 500, { success: false, error: 'Internal server error.' }, origin);
        }
      });
    },
  };
}

function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}
