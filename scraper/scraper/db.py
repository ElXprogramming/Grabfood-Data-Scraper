"""SQLite storage, fuzzy de-duplication of restaurants, and CSV/JSON export."""
import csv
import json
import math
import re
import sqlite3
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL, lon REAL,
    address TEXT, cuisine TEXT, phone TEXT, opening_hours TEXT, rating REAL,
    website TEXT, facebook TEXT, instagram TEXT,
    grab_url TEXT, foodpanda_url TEXT,
    area TEXT,
    osm_id TEXT UNIQUE, google_place_id TEXT UNIQUE,
    created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    source TEXT NOT NULL,          -- website | pdf | grabfood | foodpanda
    source_url TEXT,
    category TEXT, name TEXT NOT NULL, description TEXT,
    price REAL, currency TEXT DEFAULT 'MYR',
    scraped_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_rest ON menu_items(restaurant_id, source);
-- Menus published only as images/PDFs we could not parse: candidates for OCR.
CREATE TABLE IF NOT EXISTS menu_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    url TEXT NOT NULL, kind TEXT, found_at TEXT,
    UNIQUE(restaurant_id, url)
);
CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER, source TEXT, status TEXT, detail TEXT, at TEXT
);
"""

RESTAURANT_FIELDS = [
    "name", "lat", "lon", "address", "cuisine", "phone", "opening_hours", "rating",
    "website", "facebook", "instagram", "grab_url", "foodpanda_url", "area",
    "osm_id", "google_place_id",
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path) -> sqlite3.Connection:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def _norm(name: str) -> str:
    name = name.lower()
    name = re.sub(r"\b(restaurant|restoran|cafe|café|kafe|sdn bhd|the)\b", " ", name)
    return re.sub(r"[^a-z0-9]", "", name)


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _clean_url(u: str | None) -> str:
    if not u:
        return ""
    u = u.strip().split("?")[0].rstrip("/").lower()
    return re.sub(r"^https?://(www\.)?", "", u)


def _find_match(conn, rec: dict) -> sqlite3.Row | None:
    # 1. Check unique identifiers
    for key in ("osm_id", "google_place_id"):
        if rec.get(key):
            row = conn.execute(f"SELECT * FROM restaurants WHERE {key}=?", (rec[key],)).fetchone()
            if row:
                return row

    # 2. Check canonical URL matches (GrabFood, Foodpanda, Website)
    for col in ("grab_url", "foodpanda_url", "website"):
        val = rec.get(col)
        if val:
            clean_val = _clean_url(val)
            for row in conn.execute(f"SELECT * FROM restaurants WHERE {col} IS NOT NULL AND {col} != ''"):
                c_row = _clean_url(row[col])
                if c_row and (c_row == clean_val or clean_val in c_row or c_row in clean_val):
                    return row

    name = rec.get("name")
    if not name:
        return None
    n = _norm(name)
    if not n:
        return None

    all_rows = conn.execute("SELECT * FROM restaurants").fetchall()

    # 3. Exact normalized name match
    for row in all_rows:
        m = _norm(row["name"])
        if n == m:
            if rec.get("lat") and row["lat"]:
                if haversine_m(rec["lat"], rec["lon"], row["lat"], row["lon"]) < 3000:
                    return row
            else:
                return row

    # 4. Geographical coordinates proximity + name similarity
    if rec.get("lat") is not None and rec.get("lon") is not None:
        for row in all_rows:
            if row["lat"] is not None and row["lon"] is not None:
                dist = haversine_m(rec["lat"], rec["lon"], row["lat"], row["lon"])
                m = _norm(row["name"])
                ratio = SequenceMatcher(None, n, m).ratio()
                if dist <= 150 and (n in m or m in n or ratio >= 0.72):
                    return row

    # 5. Same Area + high fuzzy name similarity or containment
    rec_area = (rec.get("area") or "").lower()
    for row in all_rows:
        m = _norm(row["name"])
        row_area = (row["area"] or "").lower()
        same_area = (not rec_area or not row_area or rec_area == row_area)
        ratio = SequenceMatcher(None, n, m).ratio()
        if same_area and (ratio >= 0.82 or (len(n) >= 5 and (n in m or m in n))):
            return row

    # 6. Phone number match
    if rec.get("phone"):
        rec_phone = re.sub(r"\D", "", str(rec["phone"]))
        if len(rec_phone) >= 7:
            for row in all_rows:
                if row["phone"]:
                    row_phone = re.sub(r"\D", "", str(row["phone"]))
                    if rec_phone in row_phone or row_phone in rec_phone:
                        return row

    return None


def upsert_restaurant(conn, rec: dict) -> int:
    """Insert or merge a restaurant considering all parameters to avoid duplicates.
    Enriches existing records with rating, cuisine, open hours, location, and links."""
    row = _find_match(conn, rec)
    if row is None:
        cols = [f for f in RESTAURANT_FIELDS if rec.get(f) not in (None, "")]
        cur = conn.execute(
            f"INSERT INTO restaurants ({','.join(cols)},created_at,updated_at) "
            f"VALUES ({','.join('?' * len(cols))},?,?)",
            [rec[c] for c in cols] + [now(), now()],
        )
        conn.commit()
        return cur.lastrowid

    # Merge/enrich: new non-empty values update empty or outdated fields
    updates = {}
    for f in RESTAURANT_FIELDS:
        new_val = rec.get(f)
        if new_val not in (None, ""):
            if row[f] in (None, ""):
                updates[f] = new_val
            elif f in ("rating", "cuisine", "opening_hours", "address", "lat", "lon", "area", "grab_url", "foodpanda_url", "website") and new_val != row[f]:
                updates[f] = new_val

    if updates:
        sets = ",".join(f"{k}=?" for k in updates)
        conn.execute(f"UPDATE restaurants SET {sets}, updated_at=? WHERE id=?",
                     list(updates.values()) + [now(), row["id"]])
        conn.commit()
    return row["id"]


def replace_menu_items(conn, restaurant_id: int, source: str, source_url: str, items: list[dict]) -> int:
    """Replace this restaurant's items for one source, so re-runs refresh instead of duplicate."""
    conn.execute("DELETE FROM menu_items WHERE restaurant_id=? AND source=?", (restaurant_id, source))
    seen, rows = set(), []
    for it in items:
        key = (it.get("category"), it["name"].lower(), it.get("price"))
        if key in seen:
            continue
        seen.add(key)
        rows.append((restaurant_id, source, source_url, it.get("category"), it["name"],
                     it.get("description"), it.get("price"), it.get("currency", "MYR"), now()))
    conn.executemany(
        "INSERT INTO menu_items (restaurant_id,source,source_url,category,name,description,"
        "price,currency,scraped_at) VALUES (?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    return len(rows)


def add_asset(conn, restaurant_id: int, url: str, kind: str):
    conn.execute("INSERT OR IGNORE INTO menu_assets (restaurant_id,url,kind,found_at) VALUES (?,?,?,?)",
                 (restaurant_id, url, kind, now()))
    conn.commit()


def log(conn, restaurant_id, source, status, detail=""):
    conn.execute("INSERT INTO scrape_log (restaurant_id,source,status,detail,at) VALUES (?,?,?,?,?)",
                 (restaurant_id, source, status, detail[:500], now()))
    conn.commit()


def set_fields(conn, restaurant_id: int, **fields):
    fields = {k: v for k, v in fields.items() if v not in (None, "")}
    if not fields:
        return
    sets = ",".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE restaurants SET {sets}, updated_at=? WHERE id=?",
                 list(fields.values()) + [now(), restaurant_id])
    conn.commit()


from .security import sanitize_csv_cell


def export(conn, out_dir: Path) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_rows = [dict(r) for r in conn.execute(
        "SELECT r.name AS restaurant, r.area, r.cuisine, r.rating, r.opening_hours, r.address, r.lat, r.lon, r.website,"
        " m.category, m.name AS item, m.description, m.price, m.currency, m.source, m.source_url, m.scraped_at"
        " FROM menu_items m JOIN restaurants r ON r.id=m.restaurant_id ORDER BY r.name, m.category, m.name")]
    
    # Sanitize each field against CSV Formula Injection (=, +, -, @)
    sanitized_rows = []
    for r in raw_rows:
        sanitized_rows.append({k: sanitize_csv_cell(v) if isinstance(v, str) else v for k, v in r.items()})

    with open(out_dir / "menu_items.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(raw_rows[0].keys()) if raw_rows else ["restaurant"])
        w.writeheader()
        w.writerows(sanitized_rows)
    rests = [dict(r) for r in conn.execute("SELECT * FROM restaurants ORDER BY name")]
    for r in rests:
        r["menu"] = [dict(i) for i in conn.execute(
            "SELECT category,name,description,price,currency,source FROM menu_items WHERE restaurant_id=?",
            (r["id"],))]
    (out_dir / "restaurants.json").write_text(json.dumps(rests, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"menu_items": len(rows), "restaurants": len(rests)}

