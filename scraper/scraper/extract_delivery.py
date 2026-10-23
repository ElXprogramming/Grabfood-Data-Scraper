"""Stage 2b - EXPERIMENTAL extractor for delivery-platform pages (GrabFood, foodpanda).

These apps load menus through background JSON calls. We open a restaurant page you supply in a
headless browser, capture those JSON responses, and walk them looking for objects that look like
menu items (a name plus a price). No private API is called directly and no bot protection is bypassed.
If a platform blocks the page, this returns nothing - that is expected.

Check each platform's Terms of Service before using this data, and cite it in your FYP report.
"""
from .browser import capture

NAME_KEYS = ("name", "title", "itemName", "item_name")
DESC_KEYS = ("description", "desc")
PRICE_KEYS = (("priceInMinorUnit", 100), ("price_in_minor_unit", 100), ("price", 1),
              ("displayPrice", 1), ("unitPrice", 1), ("unit_price", 1))
CHILD_KEYS = ("items", "dishes", "products", "menuItems", "menu_items", "foods")


def _to_price(d: dict):
    for key, div in PRICE_KEYS:
        v = d.get(key)
        if isinstance(v, dict):                      # e.g. {"amount": 12.9} / {"value": ...}
            v = v.get("amount") or v.get("value")
        if isinstance(v, str):
            v = "".join(c for c in v if c.isdigit() or c == ".") or None
        try:
            f = float(v) / div
            if 0 < f < 1000:
                return round(f, 2)
        except (TypeError, ValueError):
            continue
    return None


def _name(d: dict):
    for k in NAME_KEYS:
        if isinstance(d.get(k), str) and 1 < len(d[k]) < 120:
            return d[k].strip()


def _walk(node, category, out):
    if isinstance(node, list):
        for n in node:
            _walk(n, category, out)
    elif isinstance(node, dict):
        children = next((node[k] for k in CHILD_KEYS if isinstance(node.get(k), list)), None)
        if children is not None:                     # a category container
            category = _name(node) or category
        else:
            name, price = _name(node), _to_price(node)
            if name and price is not None:
                desc = next((node[k] for k in DESC_KEYS if isinstance(node.get(k), str)), None)
                out.append({"category": category, "name": name, "description": desc,
                            "price": price, "currency": "MYR"})
        for v in node.values():
            if isinstance(v, (dict, list)):
                _walk(v, category, out)


def extract_metadata_from_payloads(payloads: list, html: str = "") -> dict:
    meta = {
        "rating": None,
        "cuisine": None,
        "opening_hours": None,
        "address": None,
        "lat": None,
        "lon": None,
        "name": None,
    }

    def _walk_meta(node):
        if not isinstance(node, (dict, list)):
            return
        if isinstance(node, list):
            for item in node:
                _walk_meta(item)
            return

        # Rating
        if meta["rating"] is None:
            for k in ("ratingScore", "rating_score", "star_rating", "rating", "vote_average", "score"):
                val = node.get(k)
                if isinstance(val, (int, float)) and 1.0 <= val <= 5.0:
                    meta["rating"] = round(float(val), 1)
                    break
                elif isinstance(val, dict):
                    score = val.get("score") or val.get("value") or val.get("rating")
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
                elif isinstance(val, str) and 2 < len(val) < 100 and val.strip().lower() not in ("cuisine", "cuisines"):
                    meta["cuisine"] = val.strip()
                    break

        # Opening Hours
        if meta["opening_hours"] is None:
            for k in ("openingHours", "opening_hours", "businessHours", "operatingHours", "displayedHours"):
                val = node.get(k)
                if isinstance(val, str) and 3 < len(val) < 120 and val.strip().lower() not in ("opening hours", "business hours", "hours"):
                    meta["opening_hours"] = val.strip()
                    break
                elif isinstance(val, dict):
                    disp = val.get("displayedHours") or val.get("displayHours") or val.get("hours")
                    if isinstance(disp, str) and disp and disp.strip().lower() not in ("opening hours", "business hours", "hours"):
                        meta["opening_hours"] = disp.strip()
                        break

        # Address
        if meta["address"] is None:
            for k in ("combinedAddress", "displayAddress", "address", "streetAddress", "formattedAddress"):
                val = node.get(k)
                if isinstance(val, str) and 5 < len(val) < 250 and not val.startswith("http"):
                    meta["address"] = val.strip()
                    break
                elif isinstance(val, dict):
                    c = (val.get("combinedAddress") or val.get("address") or val.get("street") or
                         val.get("address1") or val.get("line1") or val.get("formattedAddress") or
                         val.get("streetAddress"))
                    if isinstance(c, str) and 3 < len(c) < 250:
                        meta["address"] = c.strip()
                        break

        # Coordinates
        if meta["lat"] is None or meta["lon"] is None:
            lat = node.get("latitude") or node.get("lat")
            lon = node.get("longitude") or node.get("lng") or node.get("lon")
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    meta["lat"] = round(float(lat), 6)
                    meta["lon"] = round(float(lon), 6)
            elif isinstance(node.get("latlng"), dict):
                ll = node["latlng"]
                if "latitude" in ll and "longitude" in ll:
                    meta["lat"] = round(float(ll["latitude"]), 6)
                    meta["lon"] = round(float(ll["longitude"]), 6)

        # Name
        if meta["name"] is None:
            for k in ("merchantName", "storeName", "restaurantName", "vendorName"):
                val = node.get(k)
                if isinstance(val, str) and 2 < len(val) < 100:
                    meta["name"] = val.strip()
                    break

        for v in node.values():
            if isinstance(v, (dict, list)):
                _walk_meta(v)

    for p in payloads:
        _walk_meta(p)

    # HTML Fallbacks
    if html:
        import re
        if meta["rating"] is None:
            m = re.search(r'([1-5]\.[0-9])\s*(?:★|stars?|out of 5)', html, re.I)
            if m:
                try:
                    meta["rating"] = round(float(m.group(1)), 1)
                except ValueError:
                    pass
        if meta["opening_hours"] is None:
            m = re.search(r'(?:opening\s*hours|open\s*until|business\s*hours)[:\s]*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?\s*[-–]\s*[0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?)', html, re.I)
            if m:
                meta["opening_hours"] = m.group(1).strip()

    return meta


def extract_from_payloads(payloads: list) -> list:
    out = []
    for p in payloads:
        _walk(p, None, out)
    return out


def scrape_delivery(url: str, return_meta: bool = False):
    html, payloads = capture(url, wait_ms=6000)
    items = extract_from_payloads(payloads)
    if return_meta:
        meta = extract_metadata_from_payloads(payloads, html)
        return items, meta
    return items

