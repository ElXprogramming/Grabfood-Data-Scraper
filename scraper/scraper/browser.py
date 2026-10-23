"""Headless-browser helper (Playwright). Used for JS-rendered sites and delivery apps.

Setup once:  pip install playwright && playwright install chromium
"""
from . import config


def capture(url: str, wait_ms: int = 4000):
    """Load `url` in Chromium. Returns (rendered_html, [json_payloads]) where the payloads are
    every JSON response the page fetched in the background - menus usually travel this way."""
    from playwright.sync_api import sync_playwright

    payloads = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=config.USER_AGENT, locale="en-MY",
                                  geolocation={"latitude": 6.0360, "longitude": 116.1297},
                                  permissions=["geolocation"])
        page = ctx.new_page()

        def on_response(resp):
            try:
                if "json" in (resp.headers.get("content-type") or "") and resp.status == 200:
                    payloads.append(resp.json())
            except Exception:
                pass

        page.on("response", on_response)
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(wait_ms)
        html = page.content()
        browser.close()
    return html, payloads
