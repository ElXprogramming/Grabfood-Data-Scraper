"""Polite HTTP client: identifiable UA, robots.txt, per-host rate limiting, retries."""
import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from . import config
from .security import is_safe_url


class PoliteClient:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": config.USER_AGENT, "Accept-Language": "en,ms;q=0.8"})
        retry = Retry(total=3, backoff_factor=1.5, status_forcelist=(429, 500, 502, 503, 504),
                      respect_retry_after_header=True)
        self.s.mount("https://", HTTPAdapter(max_retries=retry))
        self.s.mount("http://", HTTPAdapter(max_retries=retry))
        self._last: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        # 1. SSRF & Insecure Protocol defense
        safe, _ = is_safe_url(url)
        if not safe:
            return False

        if not config.RESPECT_ROBOTS:
            return True
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self._robots:
            rp = RobotFileParser()
            try:
                r = self.s.get(base + "/robots.txt", timeout=config.REQUEST_TIMEOUT_S)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except requests.RequestException:
                rp.parse([])
            self._robots[base] = rp
        return self._robots[base].can_fetch(config.USER_AGENT, url)

    def _wait(self, url: str):
        host = urlparse(url).netloc
        gap = time.time() - self._last.get(host, 0)
        if gap < config.REQUEST_DELAY_S:
            time.sleep(config.REQUEST_DELAY_S - gap)
        self._last[host] = time.time()

    def get(self, url: str, **kw) -> requests.Response | None:
        """Return a Response, or None if disallowed by robots.txt, failed SSRF check, or error."""
        if not self.allowed(url):
            return None
        self._wait(url)
        try:
            r = self.s.get(url, timeout=config.REQUEST_TIMEOUT_S, **kw)
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    time.sleep(min(int(retry_after), 30))
            r.raise_for_status()
            return r
        except requests.RequestException:
            return None
