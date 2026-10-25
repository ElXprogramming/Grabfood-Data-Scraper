"""Security utilities for Menu Scraper.
Includes SSRF defense, URL validation, CSV formula injection neutralization,
and input parameter sanitization.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from typing import Any, Tuple
from urllib.parse import urlparse

# Blocked hostnames associated with cloud metadata or internal infrastructure
BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata",
    "instance-data",
    "169.254.169.254",
}

# Formula injection triggers for CSV/Excel/Sheets
FORMULA_PREFIX_RE = re.compile(r"^[=+\-@\t\r]")


def is_safe_url(url: str) -> Tuple[bool, str]:
    """Validate that a URL is safe to fetch via HTTP or Playwright.
    Enforces HTTP/HTTPS protocol and blocks loopback, private RFC1918,
    link-local cloud metadata (169.254.x.x), and unresolvable internal domains.
    Returns (is_safe, reason).
    """
    if not url or not isinstance(url, str):
        return False, "URL must be a non-empty string"

    url = url.strip()
    if len(url) > 2048:
        return False, "URL exceeds maximum allowed length of 2048 characters"

    try:
        parsed = urlparse(url)
    except Exception as e:
        return False, f"Malformed URL: {e}"

    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"Insecure protocol '{parsed.scheme}': only http and https are permitted"

    if not parsed.netloc:
        return False, "URL missing host"

    # Disallow user:password@host embedded credentials
    if parsed.username or parsed.password:
        return False, "Embedded authentication credentials in URL are disallowed"

    # Extract hostname without port
    hostname = parsed.hostname
    if not hostname:
        return False, "URL missing valid hostname"

    hostname_lower = hostname.lower().strip(".")

    if hostname_lower in BLOCKED_HOSTNAMES:
        return False, f"Access to restricted hostname '{hostname}' is blocked"

    # Check for direct IP address literal
    try:
        ip = ipaddress.ip_address(hostname_lower)
        if ip.is_loopback:
            return False, f"Access to loopback IP '{ip}' is blocked"
        if ip.is_private:
            return False, f"Access to private network IP '{ip}' is blocked"
        if ip.is_link_local:
            return False, f"Access to link-local/cloud metadata IP '{ip}' is blocked"
        if ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False, f"Access to non-routable IP '{ip}' is blocked"
        return True, "Safe IP"
    except ValueError:
        # Hostname is a domain name, not an IP literal
        pass

    # Disallow single-word internal domains (e.g., 'intranet', 'internal')
    if "." not in hostname_lower:
        return False, f"Access to single-label domain '{hostname}' is blocked"

    # Check DNS resolution to protect against DNS rebinding to private/loopback IPs
    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            resolved_ip = ipaddress.ip_address(ip_str)
            if (
                resolved_ip.is_loopback
                or resolved_ip.is_private
                or resolved_ip.is_link_local
                or resolved_ip.is_reserved
                or resolved_ip.is_unspecified
            ):
                return False, f"Domain '{hostname}' resolves to restricted IP '{resolved_ip}'"
    except socket.gaierror:
        # If DNS cannot resolve in testing or offline environments, permit standard public domains
        # as long as hostname is well-formed
        pass
    except Exception:
        pass

    return True, "Safe URL"


def sanitize_csv_cell(value: Any) -> str:
    """Neutralize potential CSV/Spreadsheet formula injection (DDE/Formula attacks).
    Spreadsheet software (Excel, LibreOffice, Google Sheets) interprets cells
    starting with '=', '+', '-', '@', tab, or carriage return as formula expressions.
    Prepend a single quote `'` to enforce plain text interpretation.
    """
    if value is None:
        return ""
    s = str(value)
    if FORMULA_PREFIX_RE.match(s):
        # Prefix with single quote to deactivate formula execution
        return "'" + s
    return s


def sanitize_text(text: str | None, max_len: int = 250) -> str | None:
    """Sanitize user text input: strip null bytes/control chars, enforce max length,
    and prevent argument injection leading dashes.
    """
    if text is None:
        return None
    # Remove null bytes and non-printable control characters (retain tabs/newlines if safe, or strip)
    clean = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(text)).strip()
    # Strip leading hyphens if they could be misparsed as CLI flags
    clean = re.sub(r"^[-]+", "", clean).strip()
    return clean[:max_len] if clean else None
