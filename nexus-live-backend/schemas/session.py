"""Schemas for live session management."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class SessionStatus(StrEnum):
    CREATED = "created"
    CONNECTING = "connecting"
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"
    ERROR = "error"


class SessionCreate(BaseModel):
    """Request to create a new live session."""

    persona: str = "security_engineer"
    voice_enabled: bool = True
    vision_enabled: bool = True
    compliance_frameworks: list[str] = ["OWASP_TOP_10"]
    language: str = "en"


class SessionResponse(BaseModel):
    """Response after creating/querying a session."""

    session_id: str
    status: SessionStatus
    created_at: datetime = Field(default_factory=datetime.utcnow)
    persona: str = "security_engineer"
    capabilities: list[str] = ["voice", "vision", "code_analysis", "fix_generation"]
    websocket_url: str | None = None


class SessionEvent(BaseModel):
    """An event in a live session."""

    session_id: str
    event_type: str  # audio_in, audio_out, text_in, text_out, vision, fix, interrupt
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: dict[str, object] = {}


class LiveMessage(BaseModel):
    """A message in the live WebSocket protocol."""

    type: str  # audio, text, image, control
    data: str | None = None  # base64 for binary, text for strings
    metadata: dict[str, object] = {}
