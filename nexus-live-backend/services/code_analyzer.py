"""
Code analysis service — pattern-based + AI-powered vulnerability detection.

Combines fast regex-based pattern matching for known vulnerability patterns
with Gemini AI for deeper semantic analysis.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from config import Settings

logger = logging.getLogger(__name__)


@dataclass
class Finding:
    """A security finding from static analysis."""
    rule_id: str
    title: str
    description: str
    severity: str  # P0, P1, P2, P3
    line_number: int
    line_content: str
    cwe_id: str
    owasp_category: str
    confidence: float = 0.9
    fix_hint: str = ""


# Vulnerability detection patterns organized by severity
PATTERNS: list[dict] = [
    # P0 — CRITICAL
    {
        "rule_id": "SEC-001",
        "pattern": r"""(?:(?:execute|exec|cursor\.execute)\s*\(\s*(?:f['"]|['"]\s*%\s*|['"]\s*\+|['"].*\.format)|(?:query|sql|stmt)\s*=\s*(?:f['"]|['"].*\.format|['"].*\s*\+))""",
        "title": "SQL Injection",
        "description": "String interpolation/concatenation in SQL query allows injection attacks",
        "severity": "P0",
        "cwe_id": "CWE-89",
        "owasp": "A03:2021 Injection",
        "fix_hint": "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = ?', [user_id])",
    },
    {
        "rule_id": "SEC-002",
        "pattern": r"""(?:eval|exec)\s*\(\s*(?:request|input|user|data|params|args|body)""",
        "title": "Remote Code Execution (RCE)",
        "description": "User-controlled input passed to eval/exec enables arbitrary code execution",
        "severity": "P0",
        "cwe_id": "CWE-94",
        "owasp": "A03:2021 Injection",
        "fix_hint": "Never use eval/exec with user input. Use ast.literal_eval() for safe parsing.",
    },
    {
        "rule_id": "SEC-003",
        "pattern": r"""(?:password|secret|api_key|token|private_key)\s*=\s*['"][^'"]+['"]""",
        "title": "Hardcoded Secret",
        "description": "Credentials or secrets hardcoded in source code",
        "severity": "P0",
        "cwe_id": "CWE-798",
        "owasp": "A07:2021 Identification and Authentication Failures",
        "fix_hint": "Use environment variables: os.environ.get('SECRET_KEY')",
    },
    {
        "rule_id": "SEC-004",
        "pattern": r"""subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True""",
        "title": "Command Injection via Shell",
        "description": "shell=True with user input enables command injection",
        "severity": "P0",
        "cwe_id": "CWE-78",
        "owasp": "A03:2021 Injection",
        "fix_hint": "Use subprocess.run(cmd_list, shell=False) with a list of arguments",
    },
    {
        "rule_id": "SEC-005",
        "pattern": r"""pickle\.(?:load|loads)\s*\(""",
        "title": "Insecure Deserialization",
        "description": "pickle.load on untrusted data enables arbitrary code execution",
        "severity": "P0",
        "cwe_id": "CWE-502",
        "owasp": "A08:2021 Software and Data Integrity Failures",
        "fix_hint": "Use json.loads() or a safe serialization format instead of pickle",
    },
    # P1 — HIGH
    {
        "rule_id": "SEC-010",
        "pattern": r"""(?:innerHTML|outerHTML|document\.write)\s*(?:=|\().*(?:request|input|user|data|params)""",
        "title": "Cross-Site Scripting (XSS)",
        "description": "User input rendered as HTML without sanitization",
        "severity": "P1",
        "cwe_id": "CWE-79",
        "owasp": "A07:2021 Cross-Site Scripting",
        "fix_hint": "Use textContent instead of innerHTML, or sanitize with DOMPurify",
    },
    {
        "rule_id": "SEC-011",
        "pattern": r"""(?:md5|sha1)\s*\(""",
        "title": "Weak Cryptographic Hash",
        "description": "MD5/SHA1 are cryptographically broken for security purposes",
        "severity": "P1",
        "cwe_id": "CWE-328",
        "owasp": "A02:2021 Cryptographic Failures",
        "fix_hint": "Use bcrypt for passwords, SHA-256+ for integrity checks",
    },
    {
        "rule_id": "SEC-012",
        "pattern": r"""verify\s*=\s*False|CERT_NONE|check_hostname\s*=\s*False""",
        "title": "TLS Certificate Verification Disabled",
        "description": "SSL/TLS certificate verification disabled, enabling MITM attacks",
        "severity": "P1",
        "cwe_id": "CWE-295",
        "owasp": "A02:2021 Cryptographic Failures",
        "fix_hint": "Always verify TLS certificates: requests.get(url, verify=True)",
    },
    {
        "rule_id": "SEC-013",
        "pattern": r"""open\s*\(.*(?:request|input|user|data|params)""",
        "title": "Path Traversal",
        "description": "User-controlled file path enables directory traversal",
        "severity": "P1",
        "cwe_id": "CWE-22",
        "owasp": "A01:2021 Broken Access Control",
        "fix_hint": "Validate and sanitize file paths: os.path.realpath() and check prefix",
    },
    # P2 — MEDIUM
    {
        "rule_id": "SEC-020",
        "pattern": r"""DEBUG\s*=\s*True""",
        "title": "Debug Mode Enabled",
        "description": "Debug mode exposes sensitive information in production",
        "severity": "P2",
        "cwe_id": "CWE-489",
        "owasp": "A05:2021 Security Misconfiguration",
        "fix_hint": "Set DEBUG = False in production, use environment variable",
    },
    {
        "rule_id": "SEC-021",
        "pattern": r"""(?:CORS|cors).*(?:\*|all|any)""",
        "title": "Overly Permissive CORS",
        "description": "Wildcard CORS allows any origin to access the API",
        "severity": "P2",
        "cwe_id": "CWE-942",
        "owasp": "A05:2021 Security Misconfiguration",
        "fix_hint": "Restrict CORS to specific trusted origins",
    },
    {
        "rule_id": "SEC-022",
        "pattern": r"""except\s*(?:Exception|BaseException)?\s*:?\s*\n\s*pass""",
        "title": "Silent Exception Swallowing",
        "description": "Catching and silencing all exceptions hides security errors",
        "severity": "P2",
        "cwe_id": "CWE-390",
        "owasp": "A09:2021 Security Logging and Monitoring Failures",
        "fix_hint": "Log exceptions and handle specific exception types",
    },
    # P3 — LOW
    {
        "rule_id": "SEC-030",
        "pattern": r"""#\s*(?:TODO|FIXME|HACK|XXX).*(?:security|auth|password|token|secret)""",
        "title": "Security TODO Left in Code",
        "description": "Unresolved security-related TODO comment",
        "severity": "P3",
        "cwe_id": "CWE-546",
        "owasp": "A05:2021 Security Misconfiguration",
        "fix_hint": "Resolve security TODOs before deployment",
    },
]


class CodeAnalyzer:
    """
    Pattern-based code security analyzer.

    Performs fast, deterministic vulnerability scanning using regex patterns
    aligned to CWE/OWASP classifications.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings
        self._compiled_patterns = [
            {**p, "_regex": re.compile(p["pattern"], re.IGNORECASE | re.MULTILINE)}
            for p in PATTERNS
        ]

    def analyze(self, code: str, filename: str = "code.py") -> list[Finding]:
        """
        Analyze code for security vulnerabilities.

        Args:
            code: Source code to analyze
            filename: Filename for context

        Returns:
            List of Finding objects sorted by severity
        """
        findings: list[Finding] = []
        lines = code.split("\n")

        for pattern_def in self._compiled_patterns:
            regex = pattern_def["_regex"]

            for match in regex.finditer(code):
                # Calculate line number from match position
                line_num = code[:match.start()].count("\n") + 1
                line_content = lines[line_num - 1].strip() if line_num <= len(lines) else ""

                finding = Finding(
                    rule_id=pattern_def["rule_id"],
                    title=pattern_def["title"],
                    description=pattern_def["description"],
                    severity=pattern_def["severity"],
                    line_number=line_num,
                    line_content=line_content,
                    cwe_id=pattern_def["cwe_id"],
                    owasp_category=pattern_def["owasp"],
                    fix_hint=pattern_def.get("fix_hint", ""),
                )
                findings.append(finding)

        # Sort by severity (P0 first)
        severity_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
        findings.sort(key=lambda f: severity_order.get(f.severity, 99))

        logger.info(
            "Analyzed %s: %d lines, %d findings (P0=%d, P1=%d, P2=%d, P3=%d)",
            filename,
            len(lines),
            len(findings),
            sum(1 for f in findings if f.severity == "P0"),
            sum(1 for f in findings if f.severity == "P1"),
            sum(1 for f in findings if f.severity == "P2"),
            sum(1 for f in findings if f.severity == "P3"),
        )

        return findings

    def calculate_risk_score(self, findings: list[Finding]) -> float:
        """
        Calculate a 0-10 risk score based on findings.

        Scoring: P0=4.0, P1=2.0, P2=1.0, P3=0.5 per finding, capped at 10.
        """
        weights = {"P0": 4.0, "P1": 2.0, "P2": 1.0, "P3": 0.5}
        score = sum(weights.get(f.severity, 0) for f in findings)
        return min(score, 10.0)

    def get_compliance_status(
        self, findings: list[Finding], frameworks: list[str] | None = None
    ) -> dict[str, bool]:
        """Check compliance status against security frameworks."""
        frameworks = frameworks or ["OWASP_TOP_10", "SOC2"]

        # Framework → CWE mappings (simplified)
        framework_cwe_blockers = {
            "OWASP_TOP_10": {"CWE-89", "CWE-79", "CWE-78", "CWE-94", "CWE-502", "CWE-22"},
            "SOC2": {"CWE-89", "CWE-798", "CWE-78", "CWE-295"},
            "GDPR": {"CWE-89", "CWE-79", "CWE-502", "CWE-22"},
            "HIPAA": {"CWE-89", "CWE-798", "CWE-328", "CWE-295"},
            "PCI_DSS": {"CWE-89", "CWE-79", "CWE-798", "CWE-328"},
        }

        finding_cwes = {f.cwe_id for f in findings}
        status = {}

        for fw in frameworks:
            blockers = framework_cwe_blockers.get(fw, set())
            violations = finding_cwes & blockers
            status[fw] = len(violations) == 0  # True = compliant

        return status
