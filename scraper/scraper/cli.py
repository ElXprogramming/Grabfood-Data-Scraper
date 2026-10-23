"""Command line interface:  python -m scraper <command>"""
import argparse
import sys

from . import config, db, discovery
from .extract_website import scrape_website
from .http_client import PoliteClient


def cmd_discover(a, conn):
    if a.source in ("osm", "all"):
        print(f"OSM: {discovery.discover_osm(conn, a.radius)} places seen")
    if a.source in ("google", "all"):
        try:
            print(f"Google: {discovery.discover_google(conn, a.radius)} places seen")
        except RuntimeError as e:
            print(f"Google skipped: {e}")
    print(f"Restaurants in DB (after de-duplication): "
          f"{conn.execute('SELECT COUNT(*) FROM restaurants').fetchone()[0]}")


def _targets(conn, a, column):
    q = f"SELECT * FROM restaurants WHERE {column} IS NOT NULL AND {column}!=''"
    args = []
    if a.only:
        q += " AND name LIKE ?"
        args.append(f"%{a.only}%")
    q += " ORDER BY name" + (f" LIMIT {int(a.limit)}" if a.limit else "")
    return conn.execute(q, args).fetchall()


def cmd_scrape(a, conn):
    client = PoliteClient()
    for r in _targets(conn, a, "website"):
        print(f"[{r['id']}] {r['name']}  {r['website']}")
        items, source, assets, socials = scrape_website(client, r["website"], render=a.render)
        db.set_fields(conn, r["id"], **{k: v for k, v in socials.items() if not r[k]})
        for url, kind in assets:
            db.add_asset(conn, r["id"], url, kind)
        if items:
            n = db.replace_menu_items(conn, r["id"], source, r["website"], items)
            db.log(conn, r["id"], source, "ok", f"{n} items")
            print(f"    -> {n} items ({source})")
        else:
            status = "image_only" if assets else "no_menu_found"
            db.log(conn, r["id"], "website", status)
            print(f"    -> nothing parsed ({status}; {len(assets)} menu images/PDFs saved)")


def cmd_delivery(a, conn):
    from .extract_delivery import scrape_delivery
    for col, label in (("grab_url", "grabfood"), ("foodpanda_url", "foodpanda")):
        for r in _targets(conn, a, col):
            print(f"[{r['id']}] {r['name']}  ({label})")
            try:
                items = scrape_delivery(r[col])
            except Exception as e:  # blocked, timeout, browser missing...
                db.log(conn, r["id"], label, "error", str(e))
                print(f"    -> failed: {e}")
                continue
            n = db.replace_menu_items(conn, r["id"], label, r[col], items) if items else 0
            db.log(conn, r["id"], label, "ok" if n else "empty", f"{n} items")
            print(f"    -> {n} items")


def cmd_add_link(a, conn):
    col = ("grab_url" if "grab.com" in a.url else "foodpanda_url" if "foodpanda" in a.url
           else "website")
    rows = conn.execute("SELECT id,name FROM restaurants WHERE name LIKE ?", (f"%{a.name}%",)).fetchall()
    if len(rows) > 1:
        sys.exit(f"Multiple restaurants match '{a.name}': {[r['name'] for r in rows]}")
    if len(rows) == 0:
        area = ("alamesra" if "alamesra" in a.name.lower() or "alamesra" in a.url.lower()
                else "1borneo" if "borneo" in a.name.lower() or "borneo" in a.url.lower()
                else None)
        rid = db.upsert_restaurant(conn, {"name": a.name, col: a.url, "area": area})
        print(f"Created new restaurant '{a.name}' (ID {rid}) and set {col}")
    else:
        conn.execute(f"UPDATE restaurants SET {col}=? WHERE id=?", (a.url, rows[0]["id"]))
        conn.commit()
        print(f"Set {col} for '{rows[0]['name']}'")


def cmd_export(a, conn):
    print(db.export(conn, config.EXPORT_DIR), "->", config.EXPORT_DIR)


def cmd_stats(a, conn):
    q = lambda s: conn.execute(s).fetchone()[0]
    print(f"restaurants:        {q('SELECT COUNT(*) FROM restaurants')}")
    print(f"  with website:     {q('SELECT COUNT(*) FROM restaurants WHERE website IS NOT NULL')}")
    print(f"  with menu items:  {q('SELECT COUNT(DISTINCT restaurant_id) FROM menu_items')}")
    print(f"  image/PDF only:   {q('SELECT COUNT(DISTINCT restaurant_id) FROM menu_assets WHERE restaurant_id NOT IN (SELECT restaurant_id FROM menu_items)')}")
    print(f"menu items:         {q('SELECT COUNT(*) FROM menu_items')}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="scraper", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="find restaurants around 1Borneo / Alamesra")
    d.add_argument("--source", choices=["osm", "google", "all"], default="all")
    d.add_argument("--radius", type=int, default=config.DEFAULT_RADIUS_M, help="metres")
    d.set_defaults(fn=cmd_discover)

    for name, fn, helptext in (("scrape", cmd_scrape, "scrape menus from restaurant websites"),
                               ("delivery", cmd_delivery, "EXPERIMENTAL: GrabFood/foodpanda pages")):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("--only", help="restaurant name contains...")
        s.add_argument("--limit", type=int)
        if name == "scrape":
            s.add_argument("--render", action="store_true", help="use headless browser (JS-heavy sites)")
        s.set_defaults(fn=fn)

    l = sub.add_parser("add-link", help="attach a website/GrabFood/foodpanda URL to a restaurant")
    l.add_argument("name")
    l.add_argument("url")
    l.set_defaults(fn=cmd_add_link)

    sub.add_parser("export", help="write CSV + JSON to exports/").set_defaults(fn=cmd_export)
    sub.add_parser("stats", help="coverage summary").set_defaults(fn=cmd_stats)

    a = p.parse_args(argv)
    conn = db.connect(config.DB_PATH)
    a.fn(a, conn)


if __name__ == "__main__":
    main()
