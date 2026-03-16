#!/usr/bin/env python3
"""
adversarial-test-gen.py — Generate adversarial test cases for BLACK_VAULT ATG
Usage: python3 scripts/hardening/adversarial-test-gen.py [--category CATEGORY] [--output FILE]

Generates adversarial payloads and boundary test cases for security-critical modules:
  - ssrf: SSRF bypass attempts (encoded IPs, DNS rebinding, cloud metadata)
  - auth: Session token manipulation, role escalation
  - injection: SQL, command, path traversal, template injection
  - xss: Cross-site scripting bypass vectors
  - csrf: CSRF bypass attempts

Protocol: PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE
"""

import json
import argparse
import sys
from typing import Any

# ── SSRF Adversarial Payloads ────────────────────────────────────────────────

SSRF_PAYLOADS: list[dict[str, Any]] = [
    # IPv4 encoded variants
    {"id": "SSRF-001", "desc": "Decimal-encoded loopback",        "url": "https://2130706433/hook"},
    {"id": "SSRF-002", "desc": "Octal-encoded loopback",          "url": "https://0177.0.0.1/hook"},
    {"id": "SSRF-003", "desc": "Hex-encoded loopback",            "url": "https://0x7f000001/hook"},
    {"id": "SSRF-004", "desc": "Mixed encoding 127.1",             "url": "https://127.1/hook"},
    {"id": "SSRF-005", "desc": "0.0.0.0 zero address",            "url": "https://0.0.0.0/hook"},
    {"id": "SSRF-006", "desc": "[::]  IPv6 all-zeros",            "url": "https://[::]/hook"},
    {"id": "SSRF-007", "desc": "Cloud metadata AWS",              "url": "https://169.254.169.254/latest/meta-data/"},
    {"id": "SSRF-008", "desc": "Cloud metadata GCP",              "url": "https://metadata.google.internal/computeMetadata/v1/"},
    {"id": "SSRF-009", "desc": "Cloud metadata Azure",            "url": "https://169.254.169.254/metadata/instance?api-version=2021-02-01"},
    {"id": "SSRF-010", "desc": "Private 10.x via DNS",            "url": "https://internal.corp.example/admin"},
    {"id": "SSRF-011", "desc": "Private 172.16-31 range",         "url": "https://172.16.0.1/hook"},
    {"id": "SSRF-012", "desc": "Private 192.168.x",               "url": "https://192.168.1.1/hook"},
    {"id": "SSRF-013", "desc": "Link-local 169.254.x",            "url": "https://169.254.0.1/hook"},
    {"id": "SSRF-014", "desc": "CGNAT 100.64.x",                  "url": "https://100.64.0.1/hook"},
    {"id": "SSRF-015", "desc": "IPv6 loopback ::1",               "url": "https://[::1]/hook"},
    {"id": "SSRF-016", "desc": "IPv6 private fc::/7",             "url": "https://[fc00::1]/hook"},
    {"id": "SSRF-017", "desc": "IPv6 link-local fe80::",          "url": "https://[fe80::1]/hook"},
    {"id": "SSRF-018", "desc": "IPv4-mapped IPv6 ::ffff:10.x",   "url": "https://[::ffff:10.0.0.1]/hook"},
    {"id": "SSRF-019", "desc": "HTTP (not HTTPS)",                "url": "http://example.com/hook"},
    {"id": "SSRF-020", "desc": "Credentials in URL",              "url": "https://user:pass@example.com/hook"},
    {"id": "SSRF-021", "desc": "DNS rebinding candidate",         "url": "https://rebind.example.com/hook"},
    {"id": "SSRF-022", "desc": "*.local hostname",                "url": "https://server.local/hook"},
    {"id": "SSRF-023", "desc": "*.internal hostname",             "url": "https://api.internal/hook"},
    {"id": "SSRF-024", "desc": "Benchmark range 198.18.x",        "url": "https://198.18.0.1/hook"},
    {"id": "SSRF-025", "desc": "Multicast 224.x",                 "url": "https://224.0.0.1/hook"},
    {"id": "SSRF-026", "desc": "Broadcast 255.255.255.255",       "url": "https://255.255.255.255/hook"},
    {"id": "SSRF-027", "desc": "URL without scheme",              "url": "not-a-url"},
    {"id": "SSRF-028", "desc": "File URI",                        "url": "file:///etc/passwd"},
    {"id": "SSRF-029", "desc": "FTP URI",                         "url": "ftp://192.168.1.1/file"},
    {"id": "SSRF-030", "desc": "Dict URI",                        "url": "dict://192.168.1.1:11111/info"},
]

# ── Auth Adversarial Payloads ────────────────────────────────────────────────

AUTH_PAYLOADS: list[dict[str, Any]] = [
    {"id": "AUTH-001", "desc": "Empty cookie",                    "cookie": ""},
    {"id": "AUTH-002", "desc": "Null cookie",                     "cookie": None},
    {"id": "AUTH-003", "desc": "Unsigned cookie with admin role", "cookie": "GENERATE_UNSIGNED_ADMIN"},
    {"id": "AUTH-004", "desc": "Cookie with unknown role",        "cookie": "GENERATE_ROLE_SUPERUSER"},
    {"id": "AUTH-005", "desc": "Cookie with 3 segments",          "cookie": "payload.sig.extra"},
    {"id": "AUTH-006", "desc": "Wrong signature",                 "cookie": "GENERATE_WRONG_SIG"},
    {"id": "AUTH-007", "desc": "Unsigned in prod with secret set","cookie": "GENERATE_UNSIGNED_PROD"},
    {"id": "AUTH-008", "desc": "JWT format (wrong format)",       "cookie": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fake"},
    {"id": "AUTH-009", "desc": "Base64 non-JSON payload",         "cookie": "bm90anNvbg=="},
    {"id": "AUTH-010", "desc": "Missing userId in payload",       "cookie": "GENERATE_NO_USERID"},
]

# ── Injection Adversarial Payloads ───────────────────────────────────────────

INJECTION_PAYLOADS: list[dict[str, Any]] = [
    {"id": "INJ-001",  "desc": "SQL injection classic",           "input": "' OR '1'='1"},
    {"id": "INJ-002",  "desc": "SQL injection UNION",             "input": "' UNION SELECT 1,2,3--"},
    {"id": "INJ-003",  "desc": "SQL injection time-based",        "input": "'; WAITFOR DELAY '0:0:5'--"},
    {"id": "INJ-004",  "desc": "Command injection semicolon",     "input": "test; cat /etc/passwd"},
    {"id": "INJ-005",  "desc": "Command injection pipe",          "input": "test | id"},
    {"id": "INJ-006",  "desc": "Command injection backtick",      "input": "`id`"},
    {"id": "INJ-007",  "desc": "Path traversal basic",            "input": "../../../etc/passwd"},
    {"id": "INJ-008",  "desc": "Path traversal URL-encoded",      "input": "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"},
    {"id": "INJ-009",  "desc": "Path traversal double-encoded",   "input": "%252e%252e%252f%252e%252e%252f"},
    {"id": "INJ-010",  "desc": "LDAP injection",                  "input": "*)(uid=*))(|(uid=*"},
    {"id": "INJ-011",  "desc": "NoSQL injection",                 "input": '{"$gt": ""}'},
    {"id": "INJ-012",  "desc": "Template injection Jinja2",       "input": "{{7*7}}"},
    {"id": "INJ-013",  "desc": "Template injection Go",           "input": "{{.}}"},
    {"id": "INJ-014",  "desc": "XML injection",                   "input": '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>'},
    {"id": "INJ-015",  "desc": "JSON injection",                  "input": '"},"admin":true,"x":"'},
]

# ── XSS Adversarial Payloads ─────────────────────────────────────────────────

XSS_PAYLOADS: list[dict[str, Any]] = [
    {"id": "XSS-001",  "desc": "Classic script tag",              "input": "<script>alert(1)</script>"},
    {"id": "XSS-002",  "desc": "Event handler",                   "input": "<img src=x onerror=alert(1)>"},
    {"id": "XSS-003",  "desc": "JavaScript URI",                  "input": 'javascript:alert(1)'},
    {"id": "XSS-004",  "desc": "SVG XSS",                        "input": '<svg onload=alert(1)>'},
    {"id": "XSS-005",  "desc": "HTML entity encoded",             "input": "&lt;script&gt;alert(1)&lt;/script&gt;"},
    {"id": "XSS-006",  "desc": "Unicode encoded",                 "input": "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"},
    {"id": "XSS-007",  "desc": "DOM-based via hash",              "input": "#<img src=x onerror=alert(1)>"},
    {"id": "XSS-008",  "desc": "Prototype pollution",             "input": '__proto__[polluted]=true'},
]

# ── Category Map ─────────────────────────────────────────────────────────────

CATEGORIES: dict[str, list[dict[str, Any]]] = {
    "ssrf":      SSRF_PAYLOADS,
    "auth":      AUTH_PAYLOADS,
    "injection": INJECTION_PAYLOADS,
    "xss":       XSS_PAYLOADS,
}

def generate_report(categories: list[str]) -> dict[str, Any]:
    """Generate adversarial test report for specified categories."""
    report: dict[str, Any] = {
        "protocol": "PROJECT_OPS_V13_BLACK_VAULT_ENTERPRISE",
        "generated": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "purpose": "Adversarial test generation (ATG) — structural test coverage for security bypass vectors",
        "categories": {}
    }

    for cat in categories:
        if cat not in CATEGORIES:
            print(f"WARNING: Unknown category '{cat}' — skipping", file=sys.stderr)
            continue
        payloads = CATEGORIES[cat]
        report["categories"][cat] = {
            "count": len(payloads),
            "payloads": payloads
        }

    total = sum(c["count"] for c in report["categories"].values())
    report["total_payloads"] = total
    return report

def main() -> None:
    parser = argparse.ArgumentParser(description="BLACK_VAULT Adversarial Test Generator")
    parser.add_argument("--category", "-c",
                        choices=list(CATEGORIES.keys()) + ["all"],
                        default="all",
                        help="Category of payloads to generate (default: all)")
    parser.add_argument("--output", "-o",
                        default=None,
                        help="Output JSON file path (default: stdout)")
    args = parser.parse_args()

    cats = list(CATEGORIES.keys()) if args.category == "all" else [args.category]
    report = generate_report(cats)

    output = json.dumps(report, indent=2)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        total = report["total_payloads"]
        print(f"Generated {total} adversarial payloads → {args.output}")
    else:
        print(output)

if __name__ == "__main__":
    main()
