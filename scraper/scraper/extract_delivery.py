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


def extract_from_payloads(payloads: list) -> list:
    out = []
    for p in payloads:
        _walk(p, None, out)
    return out


def scrape_delivery(url: str) -> list:
    _html, payloads = capture(url, wait_ms=6000)
    return extract_from_payloads(payloads)
