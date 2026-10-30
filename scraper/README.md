# 1Borneo / Alamesra Menu Scraper

FYP tool that builds a menu dataset for restaurants around 1Borneo Hypermall and Alamesra (Kota Kinabalu).

## Pipeline

```
discover  ->  scrape / delivery  ->  export
(OSM, Google)  (websites, PDFs, delivery pages)  (SQLite -> CSV/JSON)
```

| Stage | Source | Reliability | Notes |
|---|---|---|---|
| discover | OpenStreetMap Overpass | good, patchy coverage | free, no key |
| discover | Google Places API (New) | best coverage | needs `GOOGLE_PLACES_API_KEY` |
| scrape | restaurant website (JSON-LD, then text heuristics, then text PDFs) | medium | most local places have no site |
| scrape `--render` | same, via headless Chromium | medium | for JS-heavy sites |
| delivery | GrabFood / foodpanda page you supply | high | Headless Playwright Chromium sniffing JSON calls |
| (manual) | menus that are only photos | n/a | stored in `menu_assets`, run OCR or enter by hand |

Facebook and Instagram are deliberately **not** scraped (login wall, ToS). Their links are saved for manual review.

## GrabFood Headless Extraction Engine

GrabFood uses dynamic Next.js rendering and loads menu items via internal asynchronous JSON APIs. Traditional HTML crawlers return empty shells.

This repository implements a **passive network sniffer** via Playwright Chromium:
1. **`scraper/browser.py`**: Launches headless Chromium with Kota Kinabalu geolocation (`6.0360, 116.1297`) and `en-MY` locale to bypass Grab's regional delivery locks. Intercepts all background JSON responses using `page.on("response")`.
2. **`scraper/extract_delivery.py`**:
   - Recursively walks JSON catalog structures (`_walk()`) across nested categories, sections, and variation trees.
   - Normalizes pricing: converts `priceInMinorUnit / 100` into float Ringgit (MYR), handling discount variations.
   - Extracts merchant metadata (ratings, cuisines, operating hours, address, coordinates).
   - Fallback extraction of `<script id="__NEXT_DATA__">` JSON state from rendered HTML.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium        # only for --render / delivery
export GOOGLE_PLACES_API_KEY=...   # optional
```

Optionally identify yourself: `export SCRAPER_UA="UniversityFYP-MenuScraper/0.1 (+you@your-university.edu.my)"`.
Avoid placeholder domains such as `example.com` - Overpass rejects those with HTTP 406.

## Usage

```bash
python -m scraper discover --source osm          # or google / all
python -m scraper scrape                         # all restaurants that have a website
python -m scraper scrape --only "Sushi" --render
python -m scraper add-link "Sushi King" https://food.grab.com/my/en/restaurant/...
python -m scraper delivery --only "Sushi"
python -m scraper stats
python -m scraper export                         # exports/menu_items.csv + restaurants.json
PYTHONPATH=. pytest tests                        # run offline pytest suite (or: npm run test:python)
```

Re-running is safe: restaurants are merged (fuzzy name + <120 m) and a source's menu items are replaced, not duplicated. Scrapers can also be triggered interactively from the web UI (`npm run dev`).

## Responsible scraping

robots.txt is respected, requests are rate-limited (2 s per host) and the client identifies itself.
Cite data sources in your report and keep the data for academic use. Google Places data has its own terms.
