"""Stage 1 - restaurant discovery from OpenStreetMap (free) and Google Places (optional, API key)."""
import time

import requests

from . import config, db


# ---------- OpenStreetMap / Overpass ----------
def _overpass(query: str) -> dict:
    last = None
    for attempt in range(3):
        for url in config.OVERPASS_ENDPOINTS:
            try:
                r = requests.post(url, data={"data": query}, headers={"User-Agent": config.USER_AGENT}, timeout=60)
                if r.status_code == 200:
                    return r.json()
                if r.status_code == 406:
                    raise RuntimeError("Overpass rejected the User-Agent (HTTP 406). Set SCRAPER_UA to a "
                                       "descriptive value without placeholder domains such as example.com.")
                last = f"{url}: HTTP {r.status_code}"
            except (requests.RequestException, ValueError) as e:
                last = f"{url}: {e}"
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last}")


def discover_osm(conn, radius_m: int) -> int:
    n = 0
    for area, (lat, lon) in config.AREAS.items():
        q = (f'[out:json][timeout:60];nwr["amenity"~"^({config.OSM_FOOD_AMENITIES})$"]'
             f'(around:{radius_m},{lat},{lon});out center tags;')
        for el in _overpass(q).get("elements", []):
            t = el.get("tags", {})
            if not t.get("name"):
                continue
            c = el.get("center", el)
            db.upsert_restaurant(conn, {
                "name": t["name"], "lat": c.get("lat"), "lon": c.get("lon"),
                "address": ", ".join(filter(None, [t.get("addr:housenumber"), t.get("addr:street"), t.get("addr:city")])) or None,
                "cuisine": t.get("cuisine"),
                "phone": t.get("phone") or t.get("contact:phone"),
                "opening_hours": t.get("opening_hours"),
                "website": t.get("website") or t.get("contact:website"),
                "facebook": t.get("contact:facebook"),
                "instagram": t.get("contact:instagram"),
                "area": area, "osm_id": f"{el['type']}/{el['id']}",
            })
            n += 1
        time.sleep(2)
    return n


# ---------- Google Places API (New) ----------
GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_FIELDS = ("nextPageToken,places.id,places.displayName,places.location,places.formattedAddress,"
                 "places.websiteUri,places.nationalPhoneNumber,places.rating,places.primaryTypeDisplayName,"
                 "places.regularOpeningHours.weekdayDescriptions")
GOOGLE_QUERIES = ["restaurant", "cafe", "fast food", "food court", "coffee shop"]


def discover_google(conn, radius_m: int) -> int:
    if not config.GOOGLE_API_KEY:
        raise RuntimeError("Set GOOGLE_PLACES_API_KEY to use Google discovery.")
    headers = {"X-Goog-Api-Key": config.GOOGLE_API_KEY, "X-Goog-FieldMask": GOOGLE_FIELDS}
    n = 0
    for area, (lat, lon) in config.AREAS.items():
        for query in GOOGLE_QUERIES:
            token = None
            for _page in range(3):  # max 20 results/page, 60 total per query
                body = {"textQuery": f"{query} near {area}", "pageSize": 20,
                        "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lon},
                                                    "radius": float(radius_m)}}}
                if token:
                    body["pageToken"] = token
                r = requests.post(GOOGLE_URL, json=body, headers=headers, timeout=30)
                if r.status_code != 200:
                    raise RuntimeError(f"Google Places error {r.status_code}: {r.text[:300]}")
                data = r.json()
                for p in data.get("places", []):
                    loc = p.get("location", {})
                    if loc and db.haversine_m(lat, lon, loc["latitude"], loc["longitude"]) > radius_m * 1.25:
                        continue  # text search bias is soft; enforce the area ourselves
                    hours = p.get("regularOpeningHours", {}).get("weekdayDescriptions")
                    db.upsert_restaurant(conn, {
                        "name": p["displayName"]["text"], "lat": loc.get("latitude"), "lon": loc.get("longitude"),
                        "address": p.get("formattedAddress"), "phone": p.get("nationalPhoneNumber"),
                        "website": p.get("websiteUri"), "rating": p.get("rating"),
                        "cuisine": p.get("primaryTypeDisplayName", {}).get("text"),
                        "opening_hours": "; ".join(hours) if hours else None,
                        "area": area, "google_place_id": p["id"],
                    })
                    n += 1
                token = data.get("nextPageToken")
                if not token:
                    break
                time.sleep(2)
    return n
