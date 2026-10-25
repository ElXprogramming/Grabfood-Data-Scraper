from scraper.http_client import PoliteClient
from scraper.runner import cmd_scrape
from scraper.security import is_safe_url, sanitize_csv_cell, sanitize_text


def test_is_safe_url_valid_domains():
    safe, msg = is_safe_url("https://food.grab.com/my/en/restaurant/subway-delivery")
    assert safe, msg

    safe, msg = is_safe_url("http://kfc.com.my/menu")
    assert safe, msg

    safe, msg = is_safe_url("https://www.foodpanda.my/restaurant/test")
    assert safe, msg


def test_is_safe_url_blocks_insecure_schemes():
    for bad in ["file:///etc/passwd", "ftp://example.com", "gopher://example.com", "data:text/plain,hello"]:
        safe, msg = is_safe_url(bad)
        assert not safe
        assert "Insecure protocol" in msg or "protocol" in msg.lower()


def test_is_safe_url_blocks_loopback_and_private():
    blocked = [
        "http://localhost:5173",
        "http://localhost/",
        "http://127.0.0.1:8080/secret",
        "http://127.0.1.1/",
        "http://10.0.0.1/admin",
        "http://192.168.1.1/router",
        "http://172.16.0.1/internal",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://0.0.0.0:8000",
    ]
    for url in blocked:
        safe, msg = is_safe_url(url)
        assert not safe, f"Expected {url} to be blocked, but got safe={safe} ({msg})"


def test_is_safe_url_blocks_credentials():
    safe, msg = is_safe_url("http://admin:secret@example.com/menu")
    assert not safe
    assert "credentials" in msg.lower()


def test_sanitize_csv_cell_neutralizes_formulas():
    assert sanitize_csv_cell("=SUM(A1:A10)") == "'=SUM(A1:A10)"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-2+3*4") == "'-2+3*4"
    assert sanitize_csv_cell("@HYPERLINK('http://evil.com')") == "'@HYPERLINK('http://evil.com')"
    assert sanitize_csv_cell("\tTabbed") == "'\tTabbed"
    assert sanitize_csv_cell("\rCarriage") == "'\rCarriage"
    # Normal content untouched
    assert sanitize_csv_cell("Chicken Rice") == "Chicken Rice"
    assert sanitize_csv_cell("RM 12.50") == "RM 12.50"
    assert sanitize_csv_cell(12.5) == "12.5"
    assert sanitize_csv_cell(None) == ""


def test_sanitize_text():
    assert sanitize_text("  Subway\x00 Store  ") == "Subway Store"
    assert sanitize_text("--sync-firebase") == "sync-firebase"
    assert sanitize_text("-flag") == "flag"
    assert sanitize_text("A" * 300, max_len=50) == "A" * 50


def test_polite_client_blocks_ssrf():
    client = PoliteClient()
    assert not client.allowed("file:///etc/hosts")
    assert not client.allowed("http://127.0.0.1:8080")
    assert not client.allowed("http://169.254.169.254/meta-data")
    assert client.get("http://127.0.0.1:9999/test") is None


def test_cmd_scrape_rejects_unsafe_url():
    res = cmd_scrape("http://127.0.0.1:5173/api/scrape", save_sqlite=False)
    assert res["success"] is False
    assert "security policy" in res["error"].lower()
