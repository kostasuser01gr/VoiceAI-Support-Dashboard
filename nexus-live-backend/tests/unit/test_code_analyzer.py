"""Tests for the pattern-based code analyzer."""

import pytest

from services.code_analyzer import CodeAnalyzer, Finding


@pytest.fixture
def analyzer() -> CodeAnalyzer:
    return CodeAnalyzer()


class TestSQLInjection:
    """Test SQL injection detection patterns."""

    def test_fstring_sql_injection(self, analyzer: CodeAnalyzer) -> None:
        code = """
def get_user(username):
    query = f"SELECT * FROM users WHERE username='{username}'"
    return db.execute(query)
"""
        findings = analyzer.analyze(code, "auth.py")
        assert any(f.rule_id == "SEC-001" for f in findings)
        assert any(f.severity == "P0" for f in findings)

    def test_format_sql_injection(self, analyzer: CodeAnalyzer) -> None:
        code = """
query = "SELECT * FROM users WHERE id = {}".format(user_id)
db.execute(query)
"""
        findings = analyzer.analyze(code)
        sql_findings = [f for f in findings if f.rule_id == "SEC-001"]
        assert len(sql_findings) >= 1

    def test_safe_parameterized_query(self, analyzer: CodeAnalyzer) -> None:
        code = """
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = ?"
    return db.execute(query, [user_id])
"""
        findings = analyzer.analyze(code)
        sql_findings = [f for f in findings if f.rule_id == "SEC-001"]
        assert len(sql_findings) == 0


class TestRCE:
    """Test remote code execution detection."""

    def test_eval_with_user_input(self, analyzer: CodeAnalyzer) -> None:
        code = """
def process(data):
    result = eval(request.form["expression"])
    return result
"""
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-002" for f in findings)

    def test_exec_with_user_input(self, analyzer: CodeAnalyzer) -> None:
        code = """
def run(user_code):
    exec(user_input)
"""
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-002" for f in findings)


class TestHardcodedSecrets:
    """Test hardcoded secret detection."""

    def test_hardcoded_api_key(self, analyzer: CodeAnalyzer) -> None:
        code = 'API_KEY = "sk-1234567890abcdef"'
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-003" for f in findings)

    def test_hardcoded_password(self, analyzer: CodeAnalyzer) -> None:
        code = 'password = "super_secret_123"'
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-003" for f in findings)

    def test_env_var_is_safe(self, analyzer: CodeAnalyzer) -> None:
        code = 'api_key = os.environ.get("API_KEY")'
        findings = analyzer.analyze(code)
        secret_findings = [f for f in findings if f.rule_id == "SEC-003"]
        assert len(secret_findings) == 0


class TestCommandInjection:
    """Test command injection detection."""

    def test_shell_true(self, analyzer: CodeAnalyzer) -> None:
        code = "subprocess.run(cmd, shell=True)"
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-004" for f in findings)


class TestInsecureDeserialization:
    """Test insecure deserialization detection."""

    def test_pickle_load(self, analyzer: CodeAnalyzer) -> None:
        code = """
import pickle
data = pickle.loads(user_input)
"""
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-005" for f in findings)


class TestWeakCrypto:
    """Test weak cryptographic hash detection."""

    def test_md5_usage(self, analyzer: CodeAnalyzer) -> None:
        code = "hash = md5(password)"
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-011" for f in findings)

    def test_sha1_usage(self, analyzer: CodeAnalyzer) -> None:
        code = "digest = sha1(data)"
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-011" for f in findings)


class TestTLSVerification:
    """Test TLS certificate verification detection."""

    def test_verify_false(self, analyzer: CodeAnalyzer) -> None:
        code = "requests.get(url, verify=False)"
        findings = analyzer.analyze(code)
        assert any(f.rule_id == "SEC-012" for f in findings)


class TestRiskScoring:
    """Test risk score calculation."""

    def test_empty_findings(self, analyzer: CodeAnalyzer) -> None:
        assert analyzer.calculate_risk_score([]) == 0.0

    def test_single_p0(self, analyzer: CodeAnalyzer) -> None:
        findings = [
            Finding(
                rule_id="SEC-001",
                title="SQLi",
                description="",
                severity="P0",
                line_number=1,
                line_content="",
                cwe_id="CWE-89",
                owasp_category="",
            )
        ]
        assert analyzer.calculate_risk_score(findings) == 4.0

    def test_capped_at_10(self, analyzer: CodeAnalyzer) -> None:
        findings = [
            Finding(
                rule_id=f"SEC-{i}",
                title="",
                description="",
                severity="P0",
                line_number=i,
                line_content="",
                cwe_id="CWE-89",
                owasp_category="",
            )
            for i in range(5)
        ]
        assert analyzer.calculate_risk_score(findings) == 10.0


class TestComplianceStatus:
    """Test compliance framework checking."""

    def test_clean_code_passes(self, analyzer: CodeAnalyzer) -> None:
        status = analyzer.get_compliance_status([], ["OWASP_TOP_10", "SOC2"])
        assert all(status.values())

    def test_sqli_fails_owasp(self, analyzer: CodeAnalyzer) -> None:
        findings = [
            Finding(
                rule_id="SEC-001",
                title="SQLi",
                description="",
                severity="P0",
                line_number=1,
                line_content="",
                cwe_id="CWE-89",
                owasp_category="",
            )
        ]
        status = analyzer.get_compliance_status(findings, ["OWASP_TOP_10"])
        assert status["OWASP_TOP_10"] is False

    def test_hardcoded_secret_fails_soc2(self, analyzer: CodeAnalyzer) -> None:
        findings = [
            Finding(
                rule_id="SEC-003",
                title="Secret",
                description="",
                severity="P0",
                line_number=1,
                line_content="",
                cwe_id="CWE-798",
                owasp_category="",
            )
        ]
        status = analyzer.get_compliance_status(findings, ["SOC2"])
        assert status["SOC2"] is False
