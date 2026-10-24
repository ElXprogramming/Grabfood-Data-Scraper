from scraper import db
from scraper.extract_delivery import extract_from_payloads
from scraper.extract_website import analyse_page, parse_lines

HTML = """
<html><body>
<a href="/our-menu">Our Menu</a> <a href="https://www.facebook.com/kopitiamkk">FB</a>
<a href="/files/menu.pdf">Download menu</a>
<h2>Mains</h2>
<ul><li>Nasi Lemak Ayam RM 12.90</li><li>Mee Goreng ..... RM9.50</li></ul>
<h2>Drinks</h2>
<p>Teh Tarik</p><p>RM 3.00</p>
<p>Delivery fee RM 5.00</p>
</body></html>
"""


def test_html_heuristics():
    r = analyse_page(HTML, "https://example.com/")
    got = {(i["category"], i["name"], i["price"]) for i in r.items}
    assert ("Mains", "Nasi Lemak Ayam", 12.9) in got
    assert ("Mains", "Mee Goreng", 9.5) in got
    assert ("Drinks", "Teh Tarik", 3.0) in got
    assert not any("Delivery" in i["name"] for i in r.items)
    assert r.menu_pages == ["https://example.com/our-menu"]
    assert r.assets == [("https://example.com/files/menu.pdf", "pdf")]
    assert r.socials["facebook"].endswith("kopitiamkk")


def test_jsonld():
    html = """<script type="application/ld+json">{"@type":"Menu","hasMenuSection":[
      {"@type":"MenuSection","name":"Noodles","hasMenuItem":[
        {"@type":"MenuItem","name":"Laksa","offers":{"price":"11.00","priceCurrency":"MYR"}}]}]}</script>"""
    r = analyse_page(html, "https://example.com/")
    assert r.items == [{"category": "Noodles", "name": "Laksa", "description": None,
                        "price": 11.0, "currency": "MYR"}]


def test_plain_lines():
    assert parse_lines(["Roti Canai 2.50"])[0]["price"] == 2.5


def test_delivery_payload():
    payload = {"merchant": {"menu": {"categories": [
        {"name": "Rice", "items": [{"name": "Chicken Rice", "priceInMinorUnit": 1290}]}]}}}
    items = extract_from_payloads([payload])
    assert items == [{"category": "Rice", "name": "Chicken Rice", "description": None,
                      "price": 12.9, "currency": "MYR"}]


def test_dedupe_merges_osm_and_google(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    a = db.upsert_restaurant(conn, {"name": "Sushi King", "lat": 6.036, "lon": 116.1297, "osm_id": "node/1"})
    b = db.upsert_restaurant(conn, {"name": "Sushi King Restaurant", "lat": 6.0361, "lon": 116.1298,
                                    "google_place_id": "abc", "website": "https://x.com"})
    assert a == b
    row = conn.execute("SELECT * FROM restaurants").fetchone()
    assert row["osm_id"] == "node/1" and row["google_place_id"] == "abc" and row["website"]


def test_replace_items_is_idempotent(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    rid = db.upsert_restaurant(conn, {"name": "A", "lat": 1, "lon": 1})
    items = [{"name": "X", "price": 1.0}]
    db.replace_menu_items(conn, rid, "website", "u", items)
    db.replace_menu_items(conn, rid, "website", "u", items)
    assert conn.execute("SELECT COUNT(*) FROM menu_items").fetchone()[0] == 1


def test_multi_param_dedupe_by_url_and_normalized_name(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    # Existing restaurant with no coordinates initially
    rid_1 = db.upsert_restaurant(conn, {
        "name": "Subway - 1Borneo Hypermall",
        "grab_url": "https://food.grab.com/my/en/restaurant/subway-1-borneo-delivery/123",
        "area": "1borneo"
    })
    # Scrape incoming with slightly different name and canonical url
    rid_2 = db.upsert_restaurant(conn, {
        "name": "Subway 1 Borneo",
        "grab_url": "https://food.grab.com/my/en/restaurant/subway-1-borneo-delivery/123?latlng=6.03,116.13",
        "rating": 4.5,
        "cuisine": "Fast Food, Sandwich",
        "opening_hours": "09:00 - 22:00",
        "lat": 6.036082,
        "lon": 116.130047,
        "address": "Ground Floor, 1Borneo"
    })
    # Must deduplicate and return same ID
    assert rid_1 == rid_2
    
    # Must have enriched the existing record with all parameters
    row = conn.execute("SELECT * FROM restaurants WHERE id = ?", (rid_1,)).fetchone()
    assert row["rating"] == 4.5
    assert row["cuisine"] == "Fast Food, Sandwich"
    assert row["opening_hours"] == "09:00 - 22:00"
    assert row["lat"] == 6.036082
    assert row["lon"] == 116.130047
    assert row["address"] == "Ground Floor, 1Borneo"
    assert conn.execute("SELECT COUNT(*) FROM restaurants").fetchone()[0] == 1


def test_delivery_metadata_extraction():
    from scraper.extract_delivery import extract_metadata_from_payloads
    sample_payload = {
        "merchant": {
            "name": "KFC 1Borneo",
            "rating": 4.3,
            "cuisine": ["Fast Food", "Chicken"],
            "openingHours": "10:00 - 22:00",
            "address": {"address1": "Concourse Level, 1Borneo"},
            "latlng": {"latitude": 6.0361, "longitude": 116.1301}
        }
    }
    meta = extract_metadata_from_payloads([sample_payload])
    assert meta["rating"] == 4.3
    assert "Fast Food" in meta["cuisine"]
    assert meta["opening_hours"] == "10:00 - 22:00"
    assert "1Borneo" in meta["address"]
    assert meta["lat"] == 6.0361
    assert meta["lon"] == 116.1301


def test_foodpanda_payload_and_variations():
    payload = {
        "data": {
            "restaurantDetailsPage": {
                "vendorData": {
                    "name": "Maimunah Food Corner (Alamesra)",
                    "vendorRating": {"value": 5.0, "count": 120},
                    "characteristics": {"cuisines": [{"name": "Malaysian"}, {"name": "Roti Canai"}]},
                    "location": {
                        "addressLine1": "Lot 30, Lorong Plaza Utama 3, Alamesra",
                        "latitude": 6.033558,
                        "longitude": 116.127149,
                        "city": {"name": "Kota Kinabalu"},
                        "postcode": "88450"
                    },
                    "schedules": {
                        "weekly": {
                            "monday": {
                                "delivery": [{"timeOfDayRange": {"from": "07:00", "to": "24:00"}}]
                            }
                        }
                    },
                    "menu": {
                        "categories": [
                            {
                                "title": "Roti",
                                "products": [
                                    {
                                        "title": "Roti Canai",
                                        "description": "Crispy flatbread",
                                        "variations": [
                                            {"price": 1.80, "discountedPrice": None}
                                        ]
                                    },
                                    {
                                        "title": "Roti Telur",
                                        "description": "Flatbread with egg",
                                        "variations": [
                                            {"price": 2.80, "discountedPrice": 2.50}
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        }
    }
    items = extract_from_payloads([payload])
    assert len(items) == 2
    assert items[0] == {
        "category": "Roti",
        "name": "Roti Canai",
        "description": "Crispy flatbread",
        "price": 1.80,
        "currency": "MYR"
    }
    # discounted price prioritized
    assert items[1] == {
        "category": "Roti",
        "name": "Roti Telur",
        "description": "Flatbread with egg",
        "price": 2.50,
        "currency": "MYR"
    }

    from scraper.extract_delivery import extract_metadata_from_payloads
    meta = extract_metadata_from_payloads([payload])
    assert meta["name"] == "Maimunah Food Corner (Alamesra)"
    assert meta["rating"] == 5.0
    assert "Malaysian" in meta["cuisine"]
    assert "Alamesra" in meta["address"]
    assert meta["lat"] == 6.033558
    assert meta["lon"] == 116.127149
    assert meta["opening_hours"] == "07:00 - 24:00"


def test_delivery_jsonld_metadata():
    from scraper.extract_delivery import extract_metadata_from_payloads
    html = """
    <html>
    <head>
    <script type="application/ld+json">
    {
      "@context": "http://schema.org",
      "@type": "Restaurant",
      "name": "Maimunah Food Corner (Alamesra)",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Lot 30, Alamesra",
        "addressLocality": "Kota Kinabalu",
        "postalCode": "88450"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 6.033558,
        "longitude": 116.127149
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": 5.0
      },
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "opens": "07:00",
          "closes": "24:00"
        }
      ],
      "servesCuisine": ["Malaysian", "Roti Canai"]
    }
    </script>
    </head>
    <body></body>
    </html>
    """
    meta = extract_metadata_from_payloads([], html=html)
    assert meta["name"] == "Maimunah Food Corner (Alamesra)"
    assert meta["rating"] == 5.0
    assert "Malaysian" in meta["cuisine"]
    assert "Kota Kinabalu" in meta["address"]
    assert meta["lat"] == 6.033558
    assert meta["lon"] == 116.127149
    assert meta["opening_hours"] == "07:00 - 24:00"


def test_runner_helpers():
    from scraper.runner import _guess_restaurant_name, _infer_area
    assert _guess_restaurant_name("https://food.grab.com/my/en/restaurant/subway-alamesra-delivery/1-123") == "Subway Alamesra"
    assert _guess_restaurant_name("https://www.foodpanda.my/restaurant/r4hh/maimunah-food-corner-alamesra-r4hh") == "Maimunah Food Corner Alamesra"
    assert _infer_area("https://food.grab.com", "Lorong Plaza Utama, Alamesra") == "alamesra"
    assert _infer_area("https://food.grab.com", "Concourse Level, 1Borneo Hypermall") == "1borneo"


def test_to_price_variations_and_formats():
    from scraper.extract_delivery import _to_price
    assert _to_price({"priceInMinorUnit": 1250}) == 12.5
    assert _to_price({"price": "RM 9.90"}) == 9.9
    assert _to_price({"discountedPrice": 7.50, "price": 10.0}) == 7.5
    assert _to_price({"variations": [{"price": 4.50}]}) == 4.5
    assert _to_price({"options": [{"price": 15.00}]}) == 15.0



