"""Central configuration. Edit AREAS to add or move search centres."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("MENU_DB", ROOT / "data" / "menus.db"))
EXPORT_DIR = ROOT / "exports"

# Search centres (lat, lon). Coordinates come from OpenStreetMap/Nominatim.
AREAS = {
    "1borneo": (6.0360, 116.1297),   # 1Borneo Hypermall, Kota Kinabalu
    "alamesra": (6.0334, 116.1253),  # Alamesra / Alamesra Plaza, Sulaman
}
DEFAULT_RADIUS_M = 1200

# Be an honest, identifiable client. Set SCRAPER_UA to include your real contact, e.g.
#   export SCRAPER_UA="UniversityFYP-MenuScraper/0.1 (+you@siswa.ums.edu.my)"
# Do NOT use placeholder domains like example.com: Overpass answers those with HTTP 406.
USER_AGENT = os.environ.get("SCRAPER_UA", "UniversityFYP-MenuScraper/0.1")
REQUEST_DELAY_S = 2.0          # minimum delay between requests to the same host
REQUEST_TIMEOUT_S = 20
RESPECT_ROBOTS = True
MAX_MENU_PAGES_PER_SITE = 4
MAX_PDF_BYTES = 10 * 1024 * 1024

GOOGLE_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
OSM_FOOD_AMENITIES = "restaurant|fast_food|cafe|food_court|ice_cream"
