"""Headless Scraper Runner
Executes menu scrapers for delivery platforms or restaurant websites,
and outputs structured JSON to stdout for backend orchestration.
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from . import config, db
from .extract_delivery import scrape_delivery
from .extract_website import scrape_website
from .http_client import PoliteClient


def _guess_restaurant_name(url: str) -> str:
    """Infer a human-readable restaurant name from a URL slug."""
    try:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        # GrabFood pattern: /my/en/restaurant/<slug>/...
        if "grab.com" in parsed.netloc:
            parts = path.split("/")
            if "restaurant" in parts:
                idx = parts.index("restaurant")
                if idx + 1 < len(parts):
                    slug = parts[idx + 1]
                    slug = re.sub(r"-delivery$", "", slug, flags=re.I)
                    words = [w.capitalize() for w in slug.split("-") if w]
                    return " ".join(words)
        # Foodpanda pattern: /restaurant/<code-or-slug>/<slug>
        if "foodpanda" in parsed.netloc:
            parts = path.split("/")
            if parts:
                slug = parts[-1]
                words = [w.capitalize() for w in slug.split("-") if w]
                return " ".join(words)
        # Generic domain name
        domain = parsed.netloc.lower().removeprefix("www.")
        parts = domain.split(".")
        if parts:
            return parts[0].capitalize()
    except Exception:
        pass
    return "Scraped Restaurant"


def _is_delivery_url(url: str) -> bool:
    """Return True if URL is a recognized delivery platform (GrabFood, Foodpanda, ShopeeFood, etc.)."""
    u = url.lower()
    return any(p in u for p in ("grab.com", "foodpanda.", "shopeefood."))


def _infer_area(url: str = "", address: str = "", name: str = "") -> str | None:
    comb = f"{url} {address} {name}".lower()
    if "alamesra" in comb:
        return "alamesra"
    if "1borneo" in comb or "borneo" in comb:
        return "1borneo"
    return None


def cmd_scrape(
    url: str,
    name: str | None = None,
    rating: float | None = None,
    cuisine: str | None = None,
    opening_hours: str | None = None,
    address: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    area: str | None = None,
    render: bool = False,
    save_sqlite: bool = True,
) -> dict:
    url = url.strip()
    is_delivery = _is_delivery_url(url)

    source_label = "website"
    items = []
    assets = []
    socials = {}
    extracted_meta = {}

    if is_delivery:
        source_label = "grabfood" if "grab.com" in url.lower() else "foodpanda"
        try:
            items, extracted_meta = scrape_delivery(url, return_meta=True)
        except Exception as e:
            return {
                "success": False,
                "error": f"Delivery scraper failed: {str(e)}",
                "restaurantName": name or _guess_restaurant_name(url),
                "url": url,
                "source": source_label,
            }
    else:
        try:
            client = PoliteClient()
            items, source_label, assets, socials = scrape_website(client, url, render=render)
            extracted_meta = {
                k: socials.get(k)
                for k in ("rating", "cuisine", "opening_hours", "address", "lat", "lon", "phone")
                if socials.get(k) is not None
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Website scraper failed: {str(e)}",
                "restaurantName": name or _guess_restaurant_name(url),
                "url": url,
                "source": source_label,
            }

    # Merge user-supplied parameters with extracted parameters
    final_name = (name or "").strip() or extracted_meta.get("name") or _guess_restaurant_name(url)
    final_rating = rating if rating is not None else extracted_meta.get("rating")
    final_cuisine = (cuisine or "").strip() or extracted_meta.get("cuisine")
    final_hours = (opening_hours or "").strip() or extracted_meta.get("opening_hours")
    final_address = (address or "").strip() or extracted_meta.get("address")
    final_lat = lat if lat is not None else extracted_meta.get("lat")
    final_lon = lon if lon is not None else extracted_meta.get("lon")
    final_area = (area or "").strip() or extracted_meta.get("area") or _infer_area(url, final_address or "", final_name)

    # Normalize items
    sanitized_items = []
    seen = set()
    for item in items:
        iname = (item.get("name") or "").strip()
        price = item.get("price")
        if not iname or price is None or price <= 0 or price > 2000:
            continue
        key = (item.get("category"), iname.lower(), round(float(price), 2))
        if key in seen:
            continue
        seen.add(key)
        sanitized_items.append({
            "name": iname,
            "price": round(float(price), 2),
            "description": (item.get("description") or "").strip(),
            "category": (item.get("category") or "Menu").strip(),
            "currency": item.get("currency", "MYR"),
        })

    rid = None
    is_merged = False

    # Optional SQLite caching with comprehensive deduplication
    if save_sqlite:
        try:
            conn = db.connect(config.DB_PATH)
            col = "grab_url" if "grab.com" in url.lower() else "foodpanda_url" if "foodpanda" in url.lower() else "website"
            
            restaurant_record = {
                "name": final_name,
                col: url,
                "rating": final_rating,
                "cuisine": final_cuisine,
                "opening_hours": final_hours,
                "address": final_address,
                "lat": final_lat,
                "lon": final_lon,
                "area": final_area,
            }
            
            # Check if this restaurant already existed to report deduplication status
            existing_match = db._find_match(conn, restaurant_record)
            is_merged = existing_match is not None

            rid = db.upsert_restaurant(conn, restaurant_record)

            if socials:
                db.set_fields(conn, rid, **{k: v for k, v in socials.items() if k in db.RESTAURANT_FIELDS})
            for a_url, a_kind in assets:
                db.add_asset(conn, rid, a_url, a_kind)
            if sanitized_items:
                db.replace_menu_items(conn, rid, source_label, url, sanitized_items)
                db.log(conn, rid, source_label, "ok", f"{len(sanitized_items)} items")
            else:
                db.log(conn, rid, source_label, "empty", "no items found")
        except Exception:
            pass

    return {
        "success": True,
        "restaurantId": rid,
        "isMerged": is_merged,
        "restaurantName": final_name,
        "rating": final_rating,
        "cuisine": final_cuisine,
        "openingHours": final_hours,
        "address": final_address,
        "lat": final_lat,
        "lon": final_lon,
        "area": final_area,
        "source": source_label,
        "url": url,
        "itemsCount": len(sanitized_items),
        "items": sanitized_items,
        "assetsCount": len(assets),
        "socials": socials,
    }


def cmd_list_discovered() -> dict:
    conn = db.connect(config.DB_PATH)
    rows = conn.execute("""
        SELECT r.id, r.name, r.area, r.website, r.grab_url, r.foodpanda_url,
               r.cuisine, r.rating, r.opening_hours, r.address, r.lat, r.lon,
               COUNT(m.id) as item_count
        FROM restaurants r
        LEFT JOIN menu_items m ON r.id = m.restaurant_id
        GROUP BY r.id
        ORDER BY item_count DESC, r.name ASC
    """).fetchall()

    restaurants = [
        {
            "id": r["id"],
            "name": r["name"],
            "area": r["area"] or "Alamesra / 1Borneo",
            "website": r["website"],
            "grab_url": r["grab_url"],
            "foodpanda_url": r["foodpanda_url"],
            "cuisine": r["cuisine"],
            "rating": r["rating"],
            "openingHours": r["opening_hours"],
            "address": r["address"],
            "lat": r["lat"],
            "lon": r["lon"],
            "itemCount": r["item_count"],
            "hasScrapedData": r["item_count"] > 0,
        }
        for r in rows
    ]
    return {"success": True, "restaurants": restaurants, "total": len(restaurants)}


def cmd_get_discovered_items(restaurant_id: int) -> dict:
    conn = db.connect(config.DB_PATH)
    r = conn.execute("SELECT * FROM restaurants WHERE id = ?", (restaurant_id,)).fetchone()
    if not r:
        return {"success": False, "error": f"Restaurant {restaurant_id} not found"}

    rows = conn.execute("""
        SELECT id, category, name, description, price, currency, source, source_url
        FROM menu_items
        WHERE restaurant_id = ?
        ORDER BY category, name
    """, (restaurant_id,)).fetchall()

    items = [
        {
            "name": row["name"],
            "price": row["price"],
            "category": row["category"] or "General",
            "description": row["description"] or "",
            "currency": row["currency"] or "MYR",
            "source": row["source"],
        }
        for row in rows
    ]

    return {
        "success": True,
        "restaurant": {
            "id": r["id"],
            "name": r["name"],
            "area": r["area"],
            "website": r["website"],
            "grab_url": r["grab_url"],
            "foodpanda_url": r["foodpanda_url"],
        },
        "itemsCount": len(items),
        "items": items,
    }


def cmd_sync_all_discovered() -> dict:
    conn = db.connect(config.DB_PATH)
    rows = conn.execute("""
        SELECT r.id, r.name, r.area, r.website, r.grab_url, r.foodpanda_url
        FROM restaurants r
        WHERE r.id IN (SELECT DISTINCT restaurant_id FROM menu_items)
    """).fetchall()

    result = []
    for r in rows:
        items = conn.execute("""
            SELECT category, name, description, price, currency, source
            FROM menu_items
            WHERE restaurant_id = ?
            ORDER BY category, name
        """, (r["id"],)).fetchall()

        result.append({
            "name": r["name"],
            "area": r["area"] or "Alamesra / 1Borneo",
            "website": r["website"] or r["grab_url"] or r["foodpanda_url"] or "",
            "items": [
                {
                    "name": i["name"],
                    "price": i["price"],
                    "category": i["category"] or "General",
                    "description": i["description"] or "",
                }
                for i in items
            ]
        })

    return {"success": True, "restaurants": result, "totalRestaurants": len(result)}


def main():
    parser = argparse.ArgumentParser(description="Menu Scraper CLI Runner")
    parser.add_argument("--url", help="URL to scrape")
    parser.add_argument("--name", help="Restaurant name")
    parser.add_argument("--rating", type=float, help="Restaurant rating (e.g. 4.5)")
    parser.add_argument("--cuisine", help="Cuisine tags (e.g. Fast Food, Sandwich)")
    parser.add_argument("--opening-hours", help="Operating hours (e.g. 08:00 - 22:00)")
    parser.add_argument("--address", help="Restaurant physical street address")
    parser.add_argument("--lat", type=float, help="Latitude")
    parser.add_argument("--lon", type=float, help="Longitude")
    parser.add_argument("--area", help="District or neighborhood (e.g. 1borneo, alamesra)")
    parser.add_argument("--render", action="store_true", help="Use headless Chromium for website")
    parser.add_argument("--list-discovered", action="store_true", help="List discovered restaurants from SQLite DB")
    parser.add_argument("--get-discovered-items", action="store_true", help="Get menu items for a discovered restaurant")
    parser.add_argument("--restaurant-id", type=int, help="Restaurant ID for --get-discovered-items")
    parser.add_argument("--sync-all-discovered", action="store_true", help="Export all pre-scraped restaurant menus")

    args = parser.parse_args()

    if args.list_discovered:
        res = cmd_list_discovered()
    elif args.get_discovered_items:
        if not args.restaurant_id:
            res = {"success": False, "error": "--restaurant-id is required with --get-discovered-items"}
        else:
            res = cmd_get_discovered_items(args.restaurant_id)
    elif args.sync_all_discovered:
        res = cmd_sync_all_discovered()
    elif args.url:
        res = cmd_scrape(
            args.url,
            name=args.name,
            rating=args.rating,
            cuisine=args.cuisine,
            opening_hours=args.opening_hours,
            address=args.address,
            lat=args.lat,
            lon=args.lon,
            area=args.area,
            render=args.render,
        )
    else:
        res = {"success": False, "error": "No valid action specified. Use --url, --list-discovered, or --sync-all-discovered."}

    print(json.dumps(res))


if __name__ == "__main__":
    main()
