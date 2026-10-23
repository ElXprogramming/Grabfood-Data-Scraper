import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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

export function apiPlugin(): Plugin {
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, 'scraper/data/menus.db');
  const pythonPath = path.join(rootDir, 'scraper/.venv/bin/python');
  const scraperDir = path.join(rootDir, 'scraper');

  function getDb() {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}`);
    }
    return new DatabaseSync(dbPath);
  }

  function sendJson(res: ServerResponse, status: number, data: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end(JSON.stringify(data));
  }

  function readBody<T = unknown>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : ({} as T));
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  return {
    name: 'restaurant-scraper-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return;
        }

        // Only handle /api/* endpoints
        if (!pathname.startsWith('/api/')) {
          return next();
        }

        try {
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

            sendJson(res, 200, { success: true, count: rows.length, restaurants: rows });
            return;
          }

          if (pathname === '/api/items' && req.method === 'GET') {
            const db = getDb();
            const restaurantId = urlObj.searchParams.get('restaurant_id');
            const search = urlObj.searchParams.get('search');
            const category = urlObj.searchParams.get('category');
            const cuisine = urlObj.searchParams.get('cuisine');
            const minRating = urlObj.searchParams.get('min_rating');
            const area = urlObj.searchParams.get('area');
            const minPrice = urlObj.searchParams.get('min_price');
            const maxPrice = urlObj.searchParams.get('max_price');
            const sort = urlObj.searchParams.get('sort') || 'price_desc';
            const limit = parseInt(urlObj.searchParams.get('limit') || '100', 10);
            const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);

            const conditions: string[] = ['1=1'];
            const params: (string | number)[] = [];

            if (restaurantId) {
              conditions.push('m.restaurant_id = ?');
              params.push(parseInt(restaurantId, 10));
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
            if (minRating) {
              conditions.push('r.rating >= ?');
              params.push(parseFloat(minRating));
            }
            if (area) {
              conditions.push('r.area = ?');
              params.push(area);
            }
            if (minPrice) {
              conditions.push('m.price >= ?');
              params.push(parseFloat(minPrice));
            }
            if (maxPrice) {
              conditions.push('m.price <= ?');
              params.push(parseFloat(maxPrice));
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

            sendJson(res, 200, {
              success: true,
              total: countRow?.total || 0,
              count: items.length,
              limit,
              offset,
              items,
            });
            return;
          }

          if (pathname === '/api/analytics' && req.method === 'GET') {
            const db = getDb();

            // Total restaurants & items
            const totalRestaurantsRow = db.prepare('SELECT COUNT(*) as c FROM restaurants').get() as { c?: number } | undefined;
            const totalScrapedRestRow = db.prepare('SELECT COUNT(DISTINCT restaurant_id) as c FROM menu_items').get() as { c?: number } | undefined;
            const totalItemsRow = db.prepare('SELECT COUNT(*) as c FROM menu_items').get() as { c?: number } | undefined;

            // Price stats
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

            // Price Bins for Histogram
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

            // Outliers (IQR Method: < Q1 - 1.5*IQR or > Q3 + 1.5*IQR)
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

            // Categories
            const categories = db.prepare(`
              SELECT category, COUNT(*) as count, ROUND(AVG(price), 2) as avg_price,
                     ROUND(MIN(price), 2) as min_price, ROUND(MAX(price), 2) as max_price
              FROM menu_items
              GROUP BY category
              ORDER BY count DESC
              LIMIT 12
            `).all();

            // Restaurant comparison
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

            // Keywords analysis (NLP text mining)
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

            sendJson(res, 200, {
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
            });
            return;
          }

          if (pathname === '/api/scrape' && req.method === 'POST') {
            const body = await readBody<ScrapeRequest>(req);
            const targetUrl = (body.url || '').trim();

            if (!targetUrl) {
              sendJson(res, 400, { success: false, error: 'URL parameter is required.' });
              return;
            }

            if (!fs.existsSync(pythonPath)) {
              sendJson(res, 500, {
                success: false,
                error: `Python environment not found at ${pythonPath}. Please verify virtualenv.`,
              });
              return;
            }

            const args = ['-m', 'scraper.runner', '--url', targetUrl];
            if (body.name && body.name.trim()) {
              args.push('--name', body.name.trim());
            }
            if (body.rating != null) {
              args.push('--rating', String(body.rating));
            }
            if (body.cuisine && body.cuisine.trim()) {
              args.push('--cuisine', body.cuisine.trim());
            }
            if (body.opening_hours && body.opening_hours.trim()) {
              args.push('--opening-hours', body.opening_hours.trim());
            }
            if (body.address && body.address.trim()) {
              args.push('--address', body.address.trim());
            }
            if (body.lat != null) {
              args.push('--lat', String(body.lat));
            }
            if (body.lon != null) {
              args.push('--lon', String(body.lon));
            }
            if (body.area && body.area.trim()) {
              args.push('--area', body.area.trim());
            }
            if (body.render) {
              args.push('--render');
            }

            const startTime = Date.now();
            let stdout = '';
            let stderr = '';

            const child = spawn(pythonPath, args, {
              cwd: scraperDir,
              env: { ...process.env, PYTHONUNBUFFERED: '1' },
            });

            child.stdout.on('data', (data) => {
              stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
              stderr += data.toString();
            });

            child.on('close', (code) => {
              const elapsedMs = Date.now() - startTime;
              if (code !== 0 && !stdout.trim()) {
                sendJson(res, 500, {
                  success: false,
                  error: stderr || `Scraper process exited with code ${code}`,
                  elapsedMs,
                });
                return;
              }

              try {
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const result = JSON.parse(jsonMatch[0]);
                  sendJson(res, 200, { ...result, elapsedMs, rawStderr: stderr });
                } else {
                  sendJson(res, 200, {
                    success: false,
                    error: 'Failed to extract JSON result from scraper output.',
                    rawStdout: stdout,
                    rawStderr: stderr,
                    elapsedMs,
                  });
                }
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                sendJson(res, 500, {
                  success: false,
                  error: `Failed to parse scraper output: ${message}`,
                  rawStdout: stdout,
                  elapsedMs,
                });
              }
            });
            return;
          }

          if (pathname === '/api/update-restaurant' && req.method === 'POST') {
            const body = await readBody<UpdateRestaurantRequest>(req);
            if (!body.id) {
              sendJson(res, 400, { success: false, error: 'Restaurant ID is required.' });
              return;
            }

            const db = getDb();
            const updates: string[] = ["updated_at = datetime('now')"];
            const values: (string | number)[] = [];

            if (body.name != null) { updates.push('name = ?'); values.push(body.name); }
            if (body.rating != null) { updates.push('rating = ?'); values.push(body.rating); }
            if (body.cuisine != null) { updates.push('cuisine = ?'); values.push(body.cuisine); }
            if (body.opening_hours != null) { updates.push('opening_hours = ?'); values.push(body.opening_hours); }
            if (body.address != null) { updates.push('address = ?'); values.push(body.address); }
            if (body.lat != null) { updates.push('lat = ?'); values.push(body.lat); }
            if (body.lon != null) { updates.push('lon = ?'); values.push(body.lon); }
            if (body.area != null) { updates.push('area = ?'); values.push(body.area); }

            values.push(body.id);
            db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...values);

            sendJson(res, 200, { success: true, message: `Updated restaurant #${body.id} parameters successfully.` });
            return;
          }

          if (pathname === '/api/add-link' && req.method === 'POST') {
            const body = await readBody<AddLinkRequest>(req);
            const { name, url, address, lat, lon, rating, cuisine, opening_hours } = body;
            if (!name || !url) {
              sendJson(res, 400, { success: false, error: 'Both name and url are required.' });
              return;
            }

            const db = getDb();
            const col = url.includes('grab.com')
              ? 'grab_url'
              : url.includes('foodpanda')
              ? 'foodpanda_url'
              : 'website';

            const cleanUrl = url.split('?')[0].toLowerCase();
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
              `).run(name, url, address || null, lat || null, lon || null, rating || null, cuisine || null, opening_hours || null, area);
              sendJson(res, 200, { success: true, isMerged: false, message: `Created new restaurant '${name}' with ${col}.` });
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
              `).run(url, address || null, lat || null, lon || null, rating || null, cuisine || null, opening_hours || null, existingId);
              sendJson(res, 200, {
                success: true,
                isMerged: true,
                message: `Deduplicated: Attached link and parameters to existing restaurant '${rows[0].name}' (ID #${existingId}).`,
              });
            }
            return;
          }

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

            if (format === 'json') {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Content-Disposition', 'attachment; filename="restaurant_menu_dataset.json"');
              res.end(JSON.stringify(items, null, 2));
              return;
            }

            // CSV output
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
                JSON.stringify(item.restaurant || ''),
                JSON.stringify(item.area || ''),
                JSON.stringify(item.cuisine || ''),
                item.rating != null ? item.rating : '',
                JSON.stringify(item.opening_hours || ''),
                JSON.stringify(item.address || ''),
                item.lat != null ? item.lat : '',
                item.lon != null ? item.lon : '',
                JSON.stringify(item.category || ''),
                JSON.stringify(item.item_name || ''),
                JSON.stringify(item.description || ''),
                item.price != null ? item.price : '',
                JSON.stringify(item.currency || 'MYR'),
                JSON.stringify(item.source || ''),
                JSON.stringify(item.source_url || ''),
                JSON.stringify(item.scraped_at || ''),
              ];
              csvRows.push(row.join(','));
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="restaurant_menu_dataset.csv"');
            res.end(csvRows.join('\n'));
            return;
          }

          sendJson(res, 404, { success: false, error: 'API route not found' });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Internal API Error';
          sendJson(res, 500, { success: false, error: message });
        }
      });
    },
  };
}
