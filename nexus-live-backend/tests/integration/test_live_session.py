"""Integration tests for live agent sessions."""

import pytest

from agents.live_agent import CodeHardeningLiveAgent
from config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(gemini_api_key="test-key-not-real")


@pytest.fixture
def agent(settings: Settings) -> CodeHardeningLiveAgent:
    return CodeHardeningLiveAgent(settings)


@pytest.mark.anyio
async def test_create_session(agent: CodeHardeningLiveAgent) -> None:
    """Creating a session returns a valid session ID."""
    session_id = await agent.create_session(
        voice_enabled=True,
        vision_enabled=True,
    )
    assert session_id.startswith("nexus-")
    assert len(session_id) > 10


@pytest.mark.anyio
async def test_get_session(agent: CodeHardeningLiveAgent) -> None:
    """Can retrieve a created session."""
    session_id = await agent.create_session()
    session = agent.get_session(session_id)
    assert session is not None
    assert session.session_id == session_id


@pytest.mark.anyio
async def test_end_session(agent: CodeHardeningLiveAgent) -> None:
    """Ending a session removes it from active sessions."""
    session_id = await agent.create_session()
    await agent.end_session(session_id)
    assert agent.get_session(session_id) is None


@pytest.mark.anyio
async def test_end_nonexistent_session(agent: CodeHardeningLiveAgent) -> None:
    """Ending a nonexistent session doesn't raise."""
    await agent.end_session("nonexistent-session-id")


@pytest.mark.anyio
async def test_multiple_sessions(agent: CodeHardeningLiveAgent) -> None:
    """Can create and manage multiple concurrent sessions."""
    ids = [await agent.create_session() for _ in range(5)]
    assert len(set(ids)) == 5

    for sid in ids:
        assert agent.get_session(sid) is not None

    await agent.end_session(ids[2])
    assert agent.get_session(ids[2]) is None
    assert agent.get_session(ids[0]) is not None
