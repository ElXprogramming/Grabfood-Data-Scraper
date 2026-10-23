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
| delivery | GrabFood / foodpanda page you supply | experimental | may be blocked; check ToS |
| (manual) | menus that are only photos | n/a | stored in `menu_assets`, run OCR or enter by hand |

Facebook and Instagram are deliberately **not** scraped (login wall, ToS). Their links are saved for manual review.

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
pytest                                           # offline tests
```

Re-running is safe: restaurants are merged (fuzzy name + <120 m) and a source's menu items are replaced, not duplicated.

## Responsible scraping

robots.txt is respected, requests are rate-limited (2 s per host) and the client identifies itself.
Cite data sources in your report and keep the data for academic use. Google Places data has its own terms.
