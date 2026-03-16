"""
BLACK_VAULT_NEXUS_LIVE — Real-time Code Hardening Live Agent.

Uses Gemini 2.0 Live API for real-time voice + vision interaction.
Engineers speak naturally, agent sees their IDE, and responds with
voice guidance + code fixes + compliance notes.

Category: Live Agents (Real-time Audio/Vision Interaction)
"""

from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from google import genai
from google.genai import types

from config import Settings
from schemas.session import SessionEvent, SessionStatus

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are BLACK_VAULT_NEXUS_LIVE, an expert code security hardening agent.

PERSONA: Senior security engineer with 15+ years of experience. You are the engineer's
trusted teammate — expert but approachable, direct but educational.

YOUR CAPABILITIES:
1. LISTEN to engineer questions about code security, compliance, and hardening
2. SEE their IDE screen via screenshots (vision) and understand the code context
3. ANALYZE visible code for vulnerabilities, anti-patterns, and compliance gaps
4. RESPOND with clear, actionable security recommendations
5. HANDLE interruptions gracefully — acknowledge, pivot, then resume naturally
6. GENERATE secure code fixes with explanations

RESPONSE FORMAT:
- Voice: Clear, concise guidance (2-3 sentences per point)
- When you identify a vulnerability, state: severity (P0-P3), type, affected line, and fix
- Always explain WHY a fix matters, not just what to change
- Reference compliance frameworks: SOC2, ISO27001, GDPR, HIPAA, OWASP Top 10, PCI-DSS
- When interrupted (barge-in), say "Good question—" then address the interruption

VULNERABILITY CLASSIFICATION:
- P0 CRITICAL: SQL injection, RCE, auth bypass, secrets in code → Flag IMMEDIATELY
- P1 HIGH: XSS, CSRF, insecure deserialization, broken access control
- P2 MEDIUM: Missing rate limiting, verbose errors, weak crypto
- P3 LOW: Missing security headers, info disclosure, outdated deps

TONE: Expert but conversational. Like a security engineer pair-programming with you.
Never condescending. Always educational. Build confidence in the engineer."""


class CodeHardeningLiveAgent:
    """
    Real-time voice + vision agent using Gemini 2.0 Live API.

    Handles:
    - Bidirectional audio streaming (voice in → voice out)
    - Vision analysis (IDE screenshots → security recommendations)
    - Barge-in / interruption handling
    - Session state management
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.sessions: dict[str, LiveSession] = {}

    async def create_session(
        self,
        voice_enabled: bool = True,
        vision_enabled: bool = True,
        compliance_frameworks: list[str] | None = None,
    ) -> str:
        """Create a new live hardening session. Returns session_id."""
        session_id = f"nexus-{uuid.uuid4().hex[:12]}"

        frameworks = compliance_frameworks or ["OWASP_TOP_10"]
        system_prompt = SYSTEM_INSTRUCTION + (
            f"\n\nFocus compliance analysis on: {', '.join(frameworks)}"
        )

        modalities: list[types.Modality] = [types.Modality.TEXT]
        if voice_enabled:
            modalities.append(types.Modality.AUDIO)

        config = types.LiveConnectConfig(
            response_modalities=modalities,
            system_instruction=types.Content(parts=[types.Part(text=system_prompt)]),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
        )

        self.sessions[session_id] = LiveSession(
            session_id=session_id,
            config=config,
            model=self.settings.gemini_model,
            client=self.client,
            voice_enabled=voice_enabled,
            vision_enabled=vision_enabled,
        )

        logger.info(
            "Created live session %s (voice=%s, vision=%s)",
            session_id,
            voice_enabled,
            vision_enabled,
        )
        return session_id

    def get_session(self, session_id: str) -> LiveSession | None:
        return self.sessions.get(session_id)

    async def end_session(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if session:
            await session.close()
            logger.info("Ended session %s", session_id)


class LiveSession:
    """
    Manages a single Gemini Live API session with audio/vision streaming.
    """

    def __init__(
        self,
        session_id: str,
        config: types.LiveConnectConfig,
        model: str,
        client: genai.Client,
        voice_enabled: bool = True,
        vision_enabled: bool = True,
    ) -> None:
        self.session_id = session_id
        self.config = config
        self.model = model
        self.client = client
        self.voice_enabled = voice_enabled
        self.vision_enabled = vision_enabled
        self.status = SessionStatus.CREATED
        self._gemini_session: Any = None
        self._events: list[SessionEvent] = []
        self._interrupt_flag = asyncio.Event()

    async def connect(self) -> None:
        """Establish connection to Gemini Live API."""
        self.status = SessionStatus.CONNECTING
        try:
            self._gemini_session = self.client.aio.live.connect(
                model=self.model,
                config=self.config,
            )
            self.status = SessionStatus.ACTIVE
            logger.info("Session %s connected to Gemini Live API", self.session_id)
        except Exception as e:
            self.status = SessionStatus.ERROR
            logger.error("Session %s connection failed: %s", self.session_id, e)
            raise

    async def send_audio(self, audio_data: bytes, sample_rate: int = 16000) -> None:
        """
        Send audio chunk to Gemini Live API for real-time processing.

        Args:
            audio_data: Raw PCM audio bytes (16-bit, mono)
            sample_rate: Audio sample rate in Hz
        """
        if not self._gemini_session or self.status != SessionStatus.ACTIVE:
            raise RuntimeError(f"Session {self.session_id} is not active")

        self._log_event("audio_in", {"bytes": len(audio_data), "sample_rate": sample_rate})

        async with self._gemini_session as session:
            await session.send(
                input=types.LiveClientRealtimeInput(
                    media_chunks=[
                        types.Blob(
                            mime_type=f"audio/pcm;rate={sample_rate}",
                            data=audio_data,
                        )
                    ]
                )
            )

    async def send_text(self, text: str) -> None:
        """Send a text message to the agent."""
        if not self._gemini_session or self.status != SessionStatus.ACTIVE:
            raise RuntimeError(f"Session {self.session_id} is not active")

        self._log_event("text_in", {"text": text})

        async with self._gemini_session as session:
            await session.send(
                input=types.LiveClientContent(
                    turns=[
                        types.Content(
                            role="user",
                            parts=[types.Part(text=text)],
                        )
                    ],
                    turn_complete=True,
                )
            )

    async def send_screenshot(self, image_data: bytes, mime_type: str = "image/png") -> None:
        """
        Send an IDE screenshot for vision analysis.

        Args:
            image_data: Raw image bytes (PNG or JPEG)
            mime_type: Image MIME type
        """
        if not self._gemini_session or self.status != SessionStatus.ACTIVE:
            raise RuntimeError(f"Session {self.session_id} is not active")

        self._log_event("vision", {"bytes": len(image_data), "mime_type": mime_type})

        async with self._gemini_session as session:
            await session.send(
                input=types.LiveClientRealtimeInput(
                    media_chunks=[
                        types.Blob(
                            mime_type=mime_type,
                            data=image_data,
                        )
                    ]
                )
            )

    async def send_code_for_analysis(self, code: str, filename: str = "code.py") -> None:
        """Send code text with analysis prompt."""
        prompt = (
            f"Analyze the following code from '{filename}' for security vulnerabilities. "
            f"For each issue found, state: severity (P0-P3), vulnerability type, "
            f"affected line number, CWE ID, and a concrete fix.\n\n"
            f"```\n{code}\n```"
        )
        await self.send_text(prompt)

    async def receive_responses(self) -> AsyncGenerator[dict[str, Any], None]:
        """
        Receive streaming responses from Gemini Live API.

        Yields dicts with keys: type (text|audio|end), data, metadata
        """
        if not self._gemini_session:
            raise RuntimeError(f"Session {self.session_id} not connected")

        async with self._gemini_session as session:
            while True:
                if self._interrupt_flag.is_set():
                    self._interrupt_flag.clear()
                    yield {"type": "interrupt_ack", "data": None, "metadata": {}}
                    continue

                try:
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content is None:
                            continue

                        # Check for turn completion
                        if server_content.turn_complete:
                            self._log_event("turn_complete", {})
                            yield {"type": "end", "data": None, "metadata": {}}
                            break

                        # Process model output parts
                        if server_content.model_turn and server_content.model_turn.parts:
                            for part in server_content.model_turn.parts:
                                if part.text:
                                    self._log_event("text_out", {"text": part.text})
                                    yield {
                                        "type": "text",
                                        "data": part.text,
                                        "metadata": {},
                                    }
                                elif part.inline_data:
                                    audio_b64 = base64.b64encode(part.inline_data.data).decode(
                                        "utf-8"
                                    )
                                    self._log_event(
                                        "audio_out",
                                        {
                                            "bytes": len(part.inline_data.data),
                                            "mime_type": part.inline_data.mime_type,
                                        },
                                    )
                                    yield {
                                        "type": "audio",
                                        "data": audio_b64,
                                        "metadata": {"mime_type": part.inline_data.mime_type},
                                    }

                    break  # Turn complete, exit outer loop

                except Exception as e:
                    logger.error("Receive error in session %s: %s", self.session_id, e)
                    yield {"type": "error", "data": str(e), "metadata": {}}
                    break

    async def interrupt(self) -> None:
        """Signal a barge-in interruption (user wants to speak over agent)."""
        self._interrupt_flag.set()
        self._log_event("interrupt", {})
        logger.info("Barge-in interrupt signaled for session %s", self.session_id)

    async def close(self) -> None:
        """Close the live session."""
        self.status = SessionStatus.ENDED
        self._gemini_session = None
        logger.info("Session %s closed (%d events)", self.session_id, len(self._events))

    def _log_event(self, event_type: str, data: dict[str, Any]) -> None:
        self._events.append(
            SessionEvent(
                session_id=self.session_id,
                event_type=event_type,
                data=data,
            )
        )

    @property
    def event_count(self) -> int:
        return len(self._events)

    @property
    def events(self) -> list[SessionEvent]:
        return list(self._events)
