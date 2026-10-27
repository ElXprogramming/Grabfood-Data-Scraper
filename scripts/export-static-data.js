import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sqlite = require('node:sqlite');

const rootDir = process.cwd();
const dbPath = path.join(rootDir, 'scraper/data/menus.db');
const outDir = path.join(rootDir, 'public/data');

if (!fs.existsSync(dbPath)) {
  console.error('menus.db not found at', dbPath);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const db = new sqlite.DatabaseSync(dbPath);

console.log('Exporting static data from menus.db...');

// 1. Restaurants
const restaurants = db.prepare(`
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

fs.writeFileSync(
  path.join(outDir, 'restaurants.json'),
  JSON.stringify({ success: true, count: restaurants.length, restaurants }, null, 2)
);
console.log(`Saved ${restaurants.length} restaurants to restaurants.json`);

// 2. All Menu Items
const allItems = db.prepare(`
  SELECT m.id, m.restaurant_id, m.category, m.name, m.description, m.price, m.currency, m.source, m.scraped_at,
         r.name as restaurant_name, r.area, r.cuisine, r.rating, r.opening_hours, r.address, r.lat, r.lon
  FROM menu_items m
  JOIN restaurants r ON m.restaurant_id = r.id
  ORDER BY m.price DESC
`).all();

fs.writeFileSync(
  path.join(outDir, 'items.json'),
  JSON.stringify(allItems)
);
console.log(`Saved ${allItems.length} items to items.json`);

// 3. Analytics
const totalRestaurantsRow = db.prepare('SELECT COUNT(*) as c FROM restaurants').get();
const totalScrapedRestRow = db.prepare('SELECT COUNT(DISTINCT restaurant_id) as c FROM menu_items').get();
const totalItemsRow = db.prepare('SELECT COUNT(*) as c FROM menu_items').get();
const priceRows = db.prepare('SELECT price FROM menu_items WHERE price IS NOT NULL ORDER BY price ASC').all();
const prices = priceRows.map((r) => r.price);

let minPrice = 0, maxPrice = 0, avgPrice = 0, medianPrice = 0, q1 = 0, q3 = 0, iqr = 0, stdDev = 0;
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

const itemNames = db.prepare('SELECT name FROM menu_items').all();
const stopwords = new Set([
  'set', 'and', 'with', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'on', 'or',
  '+', '-', '&', 'per', 'serving', '1pcs', 'large', 'small', 'medium', 'ala', 'carte'
]);
const wordCounts = {};
for (const row of itemNames) {
  const words = (row.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
  for (const w of words) {
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  }
}
const keywords = Object.entries(wordCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 24)
  .map(([word, frequency]) => ({ word, frequency }));

const analyticsData = {
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
};

fs.writeFileSync(
  path.join(outDir, 'analytics.json'),
  JSON.stringify(analyticsData, null, 2)
);
console.log('Saved analytics data to analytics.json');

// 4. Dataset exports (CSV & JSON)
const exportItems = db.prepare(`
  SELECT r.name as restaurant, r.area, r.cuisine, r.rating, r.opening_hours,
         r.address, r.lat, r.lon, m.category, m.name as item_name,
         m.description, m.price, m.currency, m.source, m.source_url, m.scraped_at
  FROM menu_items m
  JOIN restaurants r ON m.restaurant_id = r.id
  ORDER BY r.name, m.category, m.name
`).all();

fs.writeFileSync(
  path.join(outDir, 'restaurant_menu_dataset.json'),
  JSON.stringify(exportItems, null, 2)
);

function sanitizeCsv(val) {
  if (val == null) return '""';
  let s = String(val);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const headers = [
  'Restaurant', 'Area', 'Cuisine', 'Rating', 'Opening Hours', 'Address',
  'Latitude', 'Longitude', 'Category', 'Item Name', 'Description', 'Price',
  'Currency', 'Source', 'Source URL', 'Scraped At'
];
const csvLines = [headers.join(',')];
for (const item of exportItems) {
  csvLines.push([
    sanitizeCsv(item.restaurant),
    sanitizeCsv(item.area),
    sanitizeCsv(item.cuisine),
    sanitizeCsv(item.rating),
    sanitizeCsv(item.opening_hours),
    sanitizeCsv(item.address),
    sanitizeCsv(item.lat),
    sanitizeCsv(item.lon),
    sanitizeCsv(item.category),
    sanitizeCsv(item.item_name),
    sanitizeCsv(item.description),
    sanitizeCsv(item.price),
    sanitizeCsv(item.currency),
    sanitizeCsv(item.source),
    sanitizeCsv(item.source_url),
    sanitizeCsv(item.scraped_at),
  ].join(','));
}

fs.writeFileSync(path.join(outDir, 'menu_items.csv'), csvLines.join('\n'));
console.log(`Saved ${exportItems.length} records to menu_items.csv`);
console.log('Static export complete!');

