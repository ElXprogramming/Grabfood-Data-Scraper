"""Stage 2a - extract menus from a restaurant's own website.

Strategy, in order of reliability:
  1. schema.org JSON-LD (Menu / MenuSection / MenuItem)
  2. Heuristic text parsing of "item ... RM 12.90" lines (HTML, and text PDFs via pypdf)
Menus that are only images/scanned PDFs are recorded in `menu_assets` for later OCR.
"""
import io
import json
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from . import config

PRICE_RE = re.compile(r"(?:RM|MYR)\s*(\d{1,4}(?:[.,]\d{1,2})?)(?!\d)", re.I)
TRAILING_PRICE_RE = re.compile(r"(?<![\d.])(\d{1,3}\.\d{2})\s*$")
STRIP_CHARS = " \t.-–—:|…*·•_/\\"
NOISE = re.compile(r"delivery|min(imum)? order|service charge|\bsst\b|\btax\b|\bfree\b|deposit|"
                   r"copyright|whatsapp|call us|reservation|opening hours|open daily|"
                   r"voucher|promo|discount", re.I)
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif")
SOCIAL = {"facebook": "facebook.com", "instagram": "instagram.com",
          "grab_url": "food.grab.com", "foodpanda_url": "foodpanda."}


@dataclass
class PageResult:
    items: list = field(default_factory=list)
    menu_pages: list = field(default_factory=list)
    assets: list = field(default_factory=list)   # (url, kind)
    socials: dict = field(default_factory=dict)


def _price(txt) -> float | None:
    try:
        return round(float(str(txt).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None


# ---------- JSON-LD ----------
def _walk_ld(node, category, out):
    if isinstance(node, list):
        for n in node:
            _walk_ld(n, category, out)
    elif isinstance(node, dict):
        types = node.get("@type")
        types = types if isinstance(types, list) else [types]
        if "MenuSection" in types:
            category = node.get("name") or category
        if "MenuItem" in types and node.get("name"):
            offers = node.get("offers") or {}
            offers = offers[0] if isinstance(offers, list) and offers else offers
            out.append({"category": category, "name": str(node["name"]).strip(),
                        "description": node.get("description"),
                        "price": _price(offers.get("price")) if isinstance(offers, dict) else None,
                        "currency": (offers.get("priceCurrency") if isinstance(offers, dict) else None) or "MYR"})
        for v in node.values():
            if isinstance(v, (dict, list)):
                _walk_ld(v, category, out)


def parse_jsonld(soup) -> list:
    out = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            _walk_ld(json.loads(tag.string or ""), None, out)
        except (ValueError, TypeError):
            continue
    return out


# ---------- text heuristics ----------
def parse_lines(lines: list[str]) -> list:
    """Turn a flat list of text lines into menu items. Lines starting '##H## ' are headings."""
    items, category, prev = [], None, None
    for raw in lines:
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        if line.startswith("##H##"):
            category = line[5:].strip()[:60] or category
            prev = None
            continue
        m = PRICE_RE.search(line)
        price = _price(m.group(1)) if m else None
        name = PRICE_RE.sub("", line).strip(STRIP_CHARS) if m else None
        if not m:
            t = TRAILING_PRICE_RE.search(line)
            if t and len(line) > 6:
                price, name = _price(t.group(1)), line[:t.start()].strip(STRIP_CHARS)
        if price is None:
            prev = line if len(line) <= 80 else None
            continue
        if len(name) < 2 and prev:          # price on its own line -> name was the previous line
            name = prev
        if len(name) < 2 or len(name) > 80 or NOISE.search(name) or price <= 0 or price > 1000:
            prev = None
            continue
        items.append({"category": category, "name": name, "price": price, "currency": "MYR"})
        prev = None
    return items


def parse_html_text(soup) -> list:
    soup = BeautifulSoup(str(soup), "html.parser")  # work on a copy
    for t in soup(["script", "style", "noscript", "nav", "footer", "header", "form"]):
        t.decompose()
    for h in soup.find_all(["h1", "h2", "h3", "h4"]):
        h.string = "##H## " + h.get_text(" ", strip=True)
    return parse_lines(soup.get_text("\n").splitlines())


def parse_pdf(data: bytes) -> list:
    try:
        from pypdf import PdfReader
        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)
    except Exception:
        return []
    return parse_lines(text.splitlines())


# ---------- page analysis ----------
def analyse_page(html: str, base_url: str) -> PageResult:
    soup = BeautifulSoup(html, "html.parser")
    res = PageResult()
    base_host = urlparse(base_url).netloc.removeprefix("www.")
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"].strip())
        low = href.lower()
        if not low.startswith("http"):
            continue
        for key, dom in SOCIAL.items():
            if dom in urlparse(low).netloc and key not in res.socials:
                res.socials[key] = href
        label = (a.get_text(" ", strip=True) + " " + low).lower()
        if "menu" not in label:
            continue
        path = urlparse(low).path
        if path.endswith(".pdf"):
            res.assets.append((href, "pdf"))
        elif path.endswith(IMG_EXT):
            res.assets.append((href, "image"))
        elif urlparse(low).netloc.removeprefix("www.") == base_host and href not in res.menu_pages:
            res.menu_pages.append(href)
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if "menu" in (src + " " + (img.get("alt") or "")).lower():
            res.assets.append((urljoin(base_url, src), "image"))
    res.items = parse_jsonld(soup) or parse_html_text(soup)
    return res


def scrape_website(client, url: str, render: bool = False):
    """Returns (items, source_label, assets, socials)."""
    def fetch(u):
        if render:
            from .browser import capture
            return capture(u)[0]
        r = client.get(u)
        return r.text if r is not None else None

    html = fetch(url)
    if not html:
        return [], "website", [], {}
    home = analyse_page(html, url)
    items, assets, socials = list(home.items), list(home.assets), dict(home.socials)
    visited = {url}
    for page in home.menu_pages[:config.MAX_MENU_PAGES_PER_SITE]:
        if page in visited:
            continue
        visited.add(page)
        h = fetch(page)
        if h:
            sub = analyse_page(h, page)
            items += sub.items
            assets += sub.assets
    source = "website"
    if not items:                       # try text-based PDFs before giving up
        for u, kind in dict.fromkeys(assets):
            if kind != "pdf":
                continue
            r = client.get(u, stream=False)
            if r is not None and len(r.content) <= config.MAX_PDF_BYTES:
                items += parse_pdf(r.content)
                if items:
                    source = "pdf"
                    break
    return items, source, list(dict.fromkeys(assets)), socials
