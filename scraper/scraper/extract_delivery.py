"""Stage 2b - Extractor for delivery-platform pages (GrabFood, Foodpanda).

These apps load menus through background JSON calls. We open a restaurant page in a
headless browser, capture network JSON responses, and walk them to extract structured
menu items (category, name, price, description) and restaurant metadata.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

from .browser import capture


NAME_KEYS = ("name", "title", "itemName", "item_name", "productName", "dishName")
DESC_KEYS = ("description", "desc", "itemDescription", "item_description", "summary")
PRICE_KEYS: Tuple[Tuple[str, float], ...] = (
    ("discountedPrice", 1),
    ("discount_price", 1),
    ("priceInMinorUnit", 100),
    ("price_in_minor_unit", 100),
    ("price", 1),
    ("displayPrice", 1),
    ("unitPrice", 1),
    ("unit_price", 1),
    ("amount", 1),
)
CHILD_KEYS = ("items", "dishes", "products", "menuItems", "menu_items", "foods", "subCategories", "sections", "categories")
VARIATION_KEYS = ("variations", "variants", "productVariations", "product_variations", "options")


def _to_price(d: Dict[str, Any]) -> Optional[float]:
    """Extract and normalize numerical price from a dictionary or its variations."""
    for key, div in PRICE_KEYS:
        v = d.get(key)
        if isinstance(v, dict):
            v = v.get("amount") or v.get("value") or v.get("price")
        if isinstance(v, str):
            v = "".join(c for c in v if c.isdigit() or c == ".") or None
        try:
            f = float(v) / div
            if 0 < f < 2000:
                return round(f, 2)
        except (TypeError, ValueError):
            continue

    # Fallback: check nested product variations (common in Foodpanda & modern delivery APIs)
    for var_key in VARIATION_KEYS:
        vars_list = d.get(var_key)
        if isinstance(vars_list, list) and vars_list:
            for item in vars_list:
                if isinstance(item, dict):
                    price = _to_price(item)
                    if price is not None:
                        return price
    return None


def _name(d: Dict[str, Any]) -> Optional[str]:
    """Extract a valid item or category name string."""
    for k in NAME_KEYS:
        val = d.get(k)
        if isinstance(val, str) and 1 < len(val.strip()) < 120:
            return val.strip()
    return None


def _walk(node: Any, category: Optional[str], out: List[Dict[str, Any]]) -> None:
    """Recursively walk payload JSON nodes to collect category menu items."""
    if isinstance(node, list):
        for n in node:
            _walk(n, category, out)
    elif isinstance(node, dict):
        children = next((node[k] for k in CHILD_KEYS if isinstance(node.get(k), list)), None)
        if children is not None:
            # Category container node
            cat_name = _name(node)
            current_cat = cat_name if cat_name and cat_name.lower() not in ("menu", "categories") else category
            for c in children:
                _walk(c, current_cat, out)
            for k, v in node.items():
                if k not in CHILD_KEYS and isinstance(v, (dict, list)):
                    _walk(v, current_cat, out)
        else:
            name, price = _name(node), _to_price(node)
            if name and price is not None:
                desc = next(
                    (str(node[k]).strip() for k in DESC_KEYS if isinstance(node.get(k), str) and node[k].strip()),
                    None,
                )
                out.append({
                    "category": category or "General",
                    "name": name,
                    "description": desc,
                    "price": price,
                    "currency": "MYR",
                })
            else:
                for v in node.values():
                    if isinstance(v, (dict, list)):
                        _walk(v, category, out)


def _extract_meta_from_jsonld(html: str) -> Dict[str, Any]:
    """Parse JSON-LD restaurant metadata from HTML if available."""
    meta: Dict[str, Any] = {}
    if not html:
        return meta

    try:
        soup = BeautifulSoup(html, "html.parser")
        for s in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(s.string or "{}")
                nodes = data if isinstance(data, list) else [data]
                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    types = node.get("@type", "")
                    types_list = [str(t).lower() for t in (types if isinstance(types, list) else [types])]
                    if any(t in types_list for t in ("restaurant", "foodestablishment", "localbusiness", "cafe", "fastfoodrestaurant")):
                        if node.get("name") and not meta.get("name"):
                            meta["name"] = str(node["name"]).strip()
                        if node.get("aggregateRating") and meta.get("rating") is None:
                            ar = node["aggregateRating"]
                            val = ar.get("ratingValue") if isinstance(ar, dict) else ar
                            if val is not None:
                                try:
                                    meta["rating"] = round(float(val), 1)
                                except (TypeError, ValueError):
                                    pass
                        if node.get("servesCuisine") and not meta.get("cuisine"):
                            c = node["servesCuisine"]
                            meta["cuisine"] = ", ".join(c) if isinstance(c, list) else str(c).strip()
                        if node.get("address") and not meta.get("address"):
                            addr = node["address"]
                            if isinstance(addr, dict):
                                parts = [addr.get("streetAddress"), addr.get("addressLocality"), addr.get("postalCode")]
                                meta["address"] = ", ".join(str(p).strip() for p in parts if p)
                            elif isinstance(addr, str):
                                meta["address"] = addr.strip()
                        if node.get("geo") and (meta.get("lat") is None or meta.get("lon") is None):
                            geo = node["geo"]
                            if isinstance(geo, dict):
                                try:
                                    meta["lat"] = round(float(geo.get("latitude")), 6)
                                    meta["lon"] = round(float(geo.get("longitude")), 6)
                                except (TypeError, ValueError):
                                    pass
                        if node.get("openingHoursSpecification") and not meta.get("opening_hours"):
                            specs = node["openingHoursSpecification"]
                            if isinstance(specs, list) and specs:
                                spec = specs[0]
                                if isinstance(spec, dict) and "opens" in spec and "closes" in spec:
                                    meta["opening_hours"] = f"{spec['opens']} - {spec['closes']}"
            except Exception:
                continue
    except Exception:
        pass

    return meta


def extract_metadata_from_payloads(payloads: list, html: str = "") -> dict:
    """Extract restaurant metadata (rating, cuisine, hours, address, coordinates, name)."""
    meta: Dict[str, Any] = {
        "rating": None,
        "cuisine": None,
        "opening_hours": None,
        "address": None,
        "lat": None,
        "lon": None,
        "name": None,
    }

    # 1. Primary: Extract structured JSON-LD from HTML
    jsonld_meta = _extract_meta_from_jsonld(html)
    for k, v in jsonld_meta.items():
        if v is not None and meta.get(k) is None:
            meta[k] = v

    # 2. Walk payloads for missing metadata
    def _walk_meta(node: Any) -> None:
        if not isinstance(node, (dict, list)):
            return
        if isinstance(node, list):
            for item in node:
                _walk_meta(item)
            return

        # Name
        if meta["name"] is None:
            for container in ("vendorData", "merchant", "store", "restaurant", "vendor"):
                if container in node and isinstance(node[container], dict):
                    c_name = node[container].get("name")
                    if isinstance(c_name, str) and 2 < len(c_name.strip()) < 100:
                        meta["name"] = c_name.strip()
                        break
            if meta["name"] is None:
                for k in ("merchantName", "storeName", "restaurantName", "vendorName", "vendor_name"):
                    val = node.get(k)
                    if isinstance(val, str) and 2 < len(val.strip()) < 100:
                        meta["name"] = val.strip()
                        break

        # Rating (e.g. GrabFood ratingScore, Foodpanda vendorRating.value)
        if meta["rating"] is None:
            for k in ("ratingScore", "rating_score", "star_rating", "rating", "vote_average", "score", "vendorRating"):
                val = node.get(k)
                if isinstance(val, (int, float)) and 1.0 <= val <= 5.0:
                    meta["rating"] = round(float(val), 1)
                    break
                elif isinstance(val, dict):
                    score = val.get("value") or val.get("score") or val.get("rating")
                    if isinstance(score, (int, float)) and 1.0 <= score <= 5.0:
                        meta["rating"] = round(float(score), 1)
                        break

        # Cuisine
        if meta["cuisine"] is None:
            for k in ("cuisine", "cuisines", "cuisineTags", "cuisine_tags", "foodTypes", "servesCuisine"):
                val = node.get(k)
                if isinstance(val, list) and val:
                    clean_tags = []
                    for x in val:
                        tag_str = str(x.get("name") if isinstance(x, dict) else x).strip()
                        if 1 < len(tag_str) < 40 and tag_str.lower() not in ("cuisine", "cuisines") and tag_str not in clean_tags:
                            clean_tags.append(tag_str)
                    if clean_tags:
                        meta["cuisine"] = ", ".join(clean_tags[:6])
                        break
                elif isinstance(val, str) and 2 < len(val.strip()) < 100 and val.strip().lower() not in ("cuisine", "cuisines"):
                    meta["cuisine"] = val.strip()
                    break

        # Opening Hours
        if meta["opening_hours"] is None:
            for k in ("openingHours", "opening_hours", "businessHours", "operatingHours", "displayedHours"):
                val = node.get(k)
                if isinstance(val, str) and 3 < len(val.strip()) < 120 and val.strip().lower() not in ("opening hours", "business hours", "hours"):
                    meta["opening_hours"] = val.strip()
                    break
                elif isinstance(val, dict):
                    disp = val.get("displayedHours") or val.get("displayHours") or val.get("hours")
                    if isinstance(disp, str) and disp.strip().lower() not in ("opening hours", "business hours", "hours"):
                        meta["opening_hours"] = disp.strip()
                        break
            # Check Foodpanda schedules structure
            if meta["opening_hours"] is None and "schedules" in node and isinstance(node["schedules"], dict):
                try:
                    weekly = node["schedules"].get("weekly", {})
                    for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
                        day_sched = weekly.get(day, {}).get("delivery", [])
                        if day_sched and isinstance(day_sched, list):
                            tod = day_sched[0].get("timeOfDayRange", {})
                            from_t, to_t = tod.get("from"), tod.get("to")
                            if from_t and to_t:
                                meta["opening_hours"] = f"{from_t} - {to_t}"
                                break
                except Exception:
                    pass

        # Coordinates & Address from vendor-specific location objects first
        if "location" in node and isinstance(node["location"], dict):
            loc = node["location"]
            if meta["lat"] is None and "latitude" in loc and "longitude" in loc:
                try:
                    meta["lat"] = round(float(loc["latitude"]), 6)
                    meta["lon"] = round(float(loc["longitude"]), 6)
                except (TypeError, ValueError):
                    pass
            if meta["address"] is None and "addressLine1" in loc:
                parts = [loc.get("addressLine1"), loc.get("addressLine2"), loc.get("postcode")]
                city = loc.get("city", {})
                if isinstance(city, dict) and city.get("name"):
                    parts.append(city.get("name"))
                clean_addr = ", ".join(str(p).strip() for p in parts if p and str(p).strip())
                if clean_addr:
                    meta["address"] = clean_addr

        # Generic Address
        if meta["address"] is None:
            for k in ("combinedAddress", "displayAddress", "address", "streetAddress", "formattedAddress"):
                val = node.get(k)
                if isinstance(val, str) and 5 < len(val.strip()) < 250 and not val.startswith("http"):
                    meta["address"] = val.strip()
                    break
                elif isinstance(val, dict):
                    c = (
                        val.get("combinedAddress") or val.get("address") or val.get("street") or
                        val.get("address1") or val.get("line1") or val.get("formattedAddress") or
                        val.get("streetAddress")
                    )
                    if isinstance(c, str) and 3 < len(c.strip()) < 250:
                        meta["address"] = c.strip()
                        break

        # Coordinates fallback
        if meta["lat"] is None or meta["lon"] is None:
            if "latlng" in node and isinstance(node["latlng"], dict):
                ll = node["latlng"]
                if "latitude" in ll and "longitude" in ll:
                    try:
                        meta["lat"] = round(float(ll["latitude"]), 6)
                        meta["lon"] = round(float(ll["longitude"]), 6)
                    except (TypeError, ValueError):
                        pass

        for v in node.values():
            if isinstance(v, (dict, list)):
                _walk_meta(v)

    for p in payloads:
        _walk_meta(p)

    # 3. HTML text regex fallbacks
    if html:
        if meta["rating"] is None:
            m = re.search(r'([1-5]\.[0-9])\s*(?:★|stars?|out of 5)', html, re.I)
            if m:
                try:
                    meta["rating"] = round(float(m.group(1)), 1)
                except ValueError:
                    pass
        if meta["opening_hours"] is None:
            m = re.search(
                r'(?:opening\s*hours|open\s*until|business\s*hours)[:\s]*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?\s*[-–]\s*[0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?)',
                html,
                re.I,
            )
            if m:
                meta["opening_hours"] = m.group(1).strip()

    return meta


def extract_from_payloads(payloads: list) -> list:
    """Walk payloads to extract all menu items."""
    out: List[Dict[str, Any]] = []
    for p in payloads:
        _walk(p, None, out)
    return out


def scrape_delivery(url: str, return_meta: bool = False):
    """Scrape menu items and optional metadata from a delivery platform URL."""
    html, payloads = capture(url, wait_ms=5000)

    # Check for embedded Next.js or JSON state in HTML
    if html:
        try:
            soup = BeautifulSoup(html, "html.parser")
            next_tag = soup.find("script", id="__NEXT_DATA__")
            if next_tag and next_tag.string:
                payloads = list(payloads) + [json.loads(next_tag.string)]
        except Exception:
            pass

    items = extract_from_payloads(payloads)
    if return_meta:
        meta = extract_metadata_from_payloads(payloads, html)
        return items, meta
    return items
