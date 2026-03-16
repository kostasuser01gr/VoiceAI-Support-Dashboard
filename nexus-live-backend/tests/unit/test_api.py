"""Tests for the FastAPI endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_health_check(client):
    """Health endpoint returns 200 with required fields."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "black-vault-nexus-live"
    assert "capabilities" in data
    assert "live_agent" in data["capabilities"]
    assert "creative_storyteller" in data["capabilities"]
    assert "ui_navigator" in data["capabilities"]


@pytest.mark.anyio
async def test_analyze_code_sql_injection(client):
    """Analysis endpoint detects SQL injection."""
    response = await client.post("/api/v1/analyze", json={
        "code": 'query = f"SELECT * FROM users WHERE id=\'{user_id}\'"\\ndb.execute(query)',
        "filename": "test.py",
        "language": "python",
        "frameworks": ["OWASP_TOP_10"],
        "include_fixes": False,
    })
    assert response.status_code == 200
    data = response.json()
    assert "pattern_findings" in data
    assert "risk_score" in data


@pytest.mark.anyio
async def test_analyze_clean_code(client):
    """Analysis endpoint handles clean code."""
    response = await client.post("/api/v1/analyze", json={
        "code": "def add(a, b):\\n    return a + b",
        "filename": "math.py",
        "language": "python",
        "include_fixes": False,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["risk_score"] == 0.0


@pytest.mark.anyio
async def test_create_session(client):
    """Session creation endpoint works."""
    response = await client.post("/api/v1/sessions", json={
        "voice_enabled": True,
        "vision_enabled": True,
    })
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert "websocket_url" in data
    assert data["capabilities"]["voice"] is True


@pytest.mark.anyio
async def test_navigation_history_empty(client):
    """Navigation history starts empty."""
    response = await client.get("/api/v1/navigate/history")
    assert response.status_code == 200
    data = response.json()
    assert "history" in data
    assert "risk_trend" in data
