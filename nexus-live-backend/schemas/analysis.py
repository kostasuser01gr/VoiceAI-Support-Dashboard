"""Schemas for code analysis requests and responses."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class Severity(StrEnum):
    P0 = "P0"  # Critical - immediate action required
    P1 = "P1"  # High - fix within 24 hours
    P2 = "P2"  # Medium - fix within sprint
    P3 = "P3"  # Low - backlog


class ComplianceFramework(StrEnum):
    SOC2 = "SOC2"
    ISO27001 = "ISO27001"
    GDPR = "GDPR"
    HIPAA = "HIPAA"
    OWASP = "OWASP_TOP_10"
    PCI_DSS = "PCI_DSS"


class CodeSnippet(BaseModel):
    """A code snippet with context."""

    filename: str = ""
    language: str = "python"
    content: str
    start_line: int = 1
    end_line: int | None = None


class Vulnerability(BaseModel):
    """A detected security vulnerability."""

    id: str = Field(description="Unique vulnerability identifier (e.g., VULN-001)")
    type: str = Field(description="Vulnerability type (e.g., SQL_INJECTION)")
    title: str
    description: str
    severity: Severity
    line_number: int | None = None
    cwe_id: str | None = Field(None, description="CWE identifier (e.g., CWE-89)")
    owasp_category: str | None = None
    compliance_impact: list[ComplianceFramework] = []
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)


class FixSuggestion(BaseModel):
    """A suggested fix for a vulnerability."""

    vulnerability_id: str
    description: str
    before_code: CodeSnippet
    after_code: CodeSnippet
    explanation: str
    effort_estimate: str = "low"  # low, medium, high
    breaking_change: bool = False


class AnalysisRequest(BaseModel):
    """Request to analyze code for vulnerabilities."""

    code: str = Field(description="Code content to analyze")
    filename: str = "untitled.py"
    language: str = "python"
    context: str | None = Field(None, description="Additional context about the codebase")
    frameworks: list[ComplianceFramework] = [ComplianceFramework.OWASP]
    include_fixes: bool = True


class AnalysisResponse(BaseModel):
    """Response from code analysis."""

    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    vulnerabilities: list[Vulnerability] = []
    fixes: list[FixSuggestion] = []
    summary: str = ""
    risk_score: float = Field(ge=0.0, le=10.0, default=0.0)
    compliance_status: dict[str, bool] = {}
    analysis_duration_ms: int = 0


class ScreenAnalysisRequest(BaseModel):
    """Request to analyze a screenshot of code."""

    image_base64: str = Field(description="Base64-encoded screenshot")
    context: str | None = None
    frameworks: list[ComplianceFramework] = [ComplianceFramework.OWASP]


class HardeningStory(BaseModel):
    """A multimodal hardening narrative."""

    title: str
    vulnerability: Vulnerability
    sections: list[StorySection] = []
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class StorySection(BaseModel):
    """A section of a hardening story with mixed modality."""

    modality: str  # text, code, image, audio, diagram
    content: str
    metadata: dict[str, object] = {}


# Fix forward reference
HardeningStory.model_rebuild()
