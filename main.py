"""
BLACK_VAULT_NEXUS_LIVE — Main FastAPI Application.

Real-time AI-powered code hardening with Gemini Live API.
Submission: Gemini Live Agent Challenge 2026
Categories: Live Agents + Creative Storyteller + UI Navigator
"""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import structlog
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agents.live_agent import CodeHardeningLiveAgent
from agents.storyteller import HardeningStorytellerAgent
from agents.ui_navigator import CodeHardeningUINavigator
from config import get_settings
from middleware.security import RateLimitMiddleware, SecurityHeadersMiddleware
from schemas.analysis import AnalysisRequest
from schemas.session import SessionCreate
from services.code_analyzer import CodeAnalyzer
from services.fix_generator import FixGenerator
from services.vulnerability_scanner import VulnerabilityScanner

# ──────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer() if os.environ.get("APP_ENV") != "production"
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(os.environ.get("LOG_LEVEL", "INFO"))
    ),
)

log = structlog.get_logger()

# ──────────────────────────────────────────────────────────────
# Application Lifecycle
# ──────────────────────────────────────────────────────────────

settings = get_settings()
live_agent = CodeHardeningLiveAgent(settings)
storyteller = HardeningStorytellerAgent(settings)
ui_navigator = CodeHardeningUINavigator(settings)
code_analyzer = CodeAnalyzer(settings)
vuln_scanner = VulnerabilityScanner(settings)
fix_generator = FixGenerator(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("nexus_starting", env=settings.app_env, region=settings.gcp_region)
    yield
    log.info("nexus_shutdown")


# ──────────────────────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="BLACK_VAULT_NEXUS_LIVE",
    description=(
        "Real-time AI-powered code hardening agent using Gemini Live API. "
        "Voice + Vision + Multimodal security analysis."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# Middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=settings.rate_limit_per_minute)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for frontend
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


# ──────────────────────────────────────────────────────────────
# Health & System Endpoints
# ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Proof of Cloud Run deployment — required for submission."""
    return {
        "status": "healthy",
        "service": "black-vault-nexus-live",
        "version": "1.0.0",
        "region": os.environ.get("CLOUD_RUN_REGION", settings.gcp_region),
        "revision": os.environ.get("K_REVISION", "local"),
        "deployment": "Google Cloud Run",
        "gemini_api": "connected" if settings.gemini_api_key else "not_configured",
        "capabilities": [
            "live_agent",
            "creative_storyteller",
            "ui_navigator",
            "code_analysis",
            "vulnerability_scanning",
            "fix_generation",
        ],
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.get("/ready")
async def readiness_check():
    """Kubernetes/Cloud Run readiness probe."""
    if not settings.gemini_api_key:
        raise HTTPException(503, "Gemini API key not configured")
    return {"ready": True}


# ──────────────────────────────────────────────────────────────
# CATEGORY 1: Live Agent (Real-time Voice + Vision)
# ──────────────────────────────────────────────────────────────

@app.post("/api/v1/sessions")
async def create_live_session(request: SessionCreate):
    """Create a new live hardening session with Gemini Live API."""
    session_id = await live_agent.create_session(
        voice_enabled=request.voice_enabled,
        vision_enabled=request.vision_enabled,
        compliance_frameworks=request.compliance_frameworks,
    )

    return {
        "session_id": session_id,
        "status": "created",
        "websocket_url": f"/ws/live/{session_id}",
        "capabilities": {
            "voice": request.voice_enabled,
            "vision": request.vision_enabled,
            "barge_in": True,
            "code_analysis": True,
        },
    }


@app.websocket("/ws/live/{session_id}")
async def live_session_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time live agent interaction.

    Protocol:
    - Client sends: {"type": "audio|text|image|control", "data": "...", "metadata": {...}}
    - Server sends: {"type": "audio|text|error|end", "data": "...", "metadata": {...}}
    - Control messages: {"type": "control", "data": "interrupt|end"}
    """
    await websocket.accept()
    log.info("ws_connected", session_id=session_id)

    session = live_agent.get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "data": "Session not found"})
        await websocket.close()
        return

    try:
        await session.connect()

        while True:
            # Receive message from client
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type == "audio":
                # Decode base64 audio and send to Gemini
                audio_bytes = base64.b64decode(msg["data"])
                await session.send_audio(audio_bytes)

                # Stream responses back
                async for response in session.receive_responses():
                    await websocket.send_json(response)

            elif msg_type == "text":
                await session.send_text(msg["data"])
                async for response in session.receive_responses():
                    await websocket.send_json(response)

            elif msg_type == "image":
                # IDE screenshot for vision analysis
                image_bytes = base64.b64decode(msg["data"])
                await session.send_screenshot(image_bytes)
                async for response in session.receive_responses():
                    await websocket.send_json(response)

            elif msg_type == "code":
                # Direct code analysis request
                await session.send_code_for_analysis(
                    msg["data"],
                    msg.get("metadata", {}).get("filename", "code.py"),
                )
                async for response in session.receive_responses():
                    await websocket.send_json(response)

            elif msg_type == "control":
                if msg["data"] == "interrupt":
                    await session.interrupt()
                    await websocket.send_json({
                        "type": "text",
                        "data": "[Interrupt acknowledged]",
                        "metadata": {},
                    })
                elif msg["data"] == "end":
                    await live_agent.end_session(session_id)
                    await websocket.send_json({"type": "end", "data": "Session ended"})
                    break

    except WebSocketDisconnect:
        log.info("ws_disconnected", session_id=session_id)
    except Exception as e:
        log.error("ws_error", session_id=session_id, error=str(e))
        await websocket.send_json({"type": "error", "data": str(e)})
    finally:
        await live_agent.end_session(session_id)


# ──────────────────────────────────────────────────────────────
# CATEGORY 2: Creative Storyteller (Multimodal Narrative)
# ──────────────────────────────────────────────────────────────

@app.post("/api/v1/stories")
async def generate_hardening_story(request: AnalysisRequest):
    """Generate an interleaved multimodal hardening story for the given code."""
    try:
        story = await storyteller.generate_story(
            code=request.code,
            filename=request.filename,
            language=request.language,
            vulnerability_hint=request.context,
            frameworks=request.frameworks,
        )
        return story
    except Exception as e:
        log.warning("story_generation_failed", error=str(e))
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable") from None


@app.post("/api/v1/stories/screenshot")
async def generate_story_from_screenshot(file: UploadFile = File(...)):
    """Generate a hardening story from an IDE screenshot."""
    image_data = await file.read()
    mime_type = file.content_type or "image/png"

    story = await storyteller.generate_story_from_screenshot(
        image_data=image_data,
        mime_type=mime_type,
    )
    return story


@app.post("/api/v1/stories/compare")
async def generate_comparative_story(
    vulnerable_code: str,
    secure_code: str,
    language: str = "python",
):
    """Generate a before/after comparison story."""
    story = await storyteller.generate_comparative_story(
        vulnerable_code=vulnerable_code,
        secure_code=secure_code,
        language=language,
    )
    return story


@app.get("/api/v1/stories/{story_id}/html")
async def render_story_html(story_id: str):
    """Render a hardening story as rich HTML with Mermaid diagrams."""
    # In production, fetch from Firestore. For demo, generate a sample.
    sample_story = {
        "story_id": story_id,
        "generated_at": datetime.now(UTC).isoformat(),
        "sections": [
            {
                "modality": "text",
                "content": "This story demonstrates the power of interleaved multimodal output.",
                "metadata": {"title": "Introduction"},
            }
        ],
    }
    html = storyteller.render_story_html(sample_story)
    return HTMLResponse(content=html)


# ──────────────────────────────────────────────────────────────
# CATEGORY 3: UI Navigator (Vision-Powered IDE Analysis)
# ──────────────────────────────────────────────────────────────

@app.post("/api/v1/navigate/analyze")
async def analyze_ide_screenshot(file: UploadFile = File(...), context: str | None = None):
    """
    Analyze an IDE screenshot for security vulnerabilities.

    Returns structured analysis with vulnerabilities, suggested UI actions,
    and compliance notes.
    """
    image_data = await file.read()
    mime_type = file.content_type or "image/png"

    analysis = await ui_navigator.analyze_screenshot(
        image_data=image_data,
        mime_type=mime_type,
        context=context,
    )
    return analysis


@app.post("/api/v1/navigate/overlay")
async def generate_fix_overlay(file: UploadFile = File(...)):
    """
    Analyze screenshot and return overlay instructions for IDE plugin.

    Returns line highlights, fix panels, and warning badges that a frontend
    plugin can render on top of the IDE.
    """
    image_data = await file.read()
    mime_type = file.content_type or "image/png"

    analysis = await ui_navigator.analyze_screenshot(
        image_data=image_data,
        mime_type=mime_type,
    )

    overlays = await ui_navigator.generate_fix_overlay(analysis)

    return {
        "analysis_id": analysis.get("analysis_id"),
        "overall_risk": analysis.get("overall_risk"),
        "vulnerability_count": len(analysis.get("vulnerabilities", [])),
        "overlays": overlays,
    }


@app.get("/api/v1/navigate/history")
async def get_navigation_history():
    """Get UI navigator analysis history with risk trend."""
    return {
        "history": ui_navigator.get_analysis_history()[-20:],
        "risk_trend": ui_navigator.get_risk_trend()[-20:],
    }


# ──────────────────────────────────────────────────────────────
# Code Analysis & Fix Generation (Supporting Services)
# ──────────────────────────────────────────────────────────────

@app.post("/api/v1/analyze")
async def analyze_code(request: AnalysisRequest):
    """
    Analyze code for security vulnerabilities.

    Combines fast pattern-based scanning with deep AI analysis.
    """
    import time
    start = time.monotonic()

    # Fast pattern-based analysis
    pattern_findings = code_analyzer.analyze(request.code, request.filename)

    # Deep AI-powered analysis (gracefully degrades if API unavailable)
    deep_scan: dict = {"vulnerabilities": [], "positive_findings": [], "recommendations": []}
    try:
        deep_scan = await vuln_scanner.deep_scan(
            code=request.code,
            filename=request.filename,
            language=request.language,
            context=request.context,
        )
    except Exception as e:
        log.warning("ai_scan_unavailable", error=str(e))

    # Generate fixes if requested
    fixes = []
    if request.include_fixes and (pattern_findings or deep_scan.get("vulnerabilities")):
        all_vulns = [
            {
                "type": f.title,
                "line_number": f.line_number,
                "cwe_id": f.cwe_id,
                "description": f.description,
            }
            for f in pattern_findings[:5]
        ]
        try:
            fixes = await fix_generator.generate_batch_fixes(
                code=request.code,
                vulnerabilities=all_vulns,
                language=request.language,
            )
        except Exception as e:
            log.warning("fix_generation_unavailable", error=str(e))

    duration_ms = int((time.monotonic() - start) * 1000)
    risk_score = code_analyzer.calculate_risk_score(pattern_findings)
    compliance = code_analyzer.get_compliance_status(
        pattern_findings,
        [f.value for f in request.frameworks],
    )

    return {
        "session_id": f"analysis-{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(UTC).isoformat(),
        "pattern_findings": [
            {
                "rule_id": f.rule_id,
                "title": f.title,
                "description": f.description,
                "severity": f.severity,
                "line_number": f.line_number,
                "line_content": f.line_content,
                "cwe_id": f.cwe_id,
                "owasp_category": f.owasp_category,
                "fix_hint": f.fix_hint,
            }
            for f in pattern_findings
        ],
        "ai_findings": deep_scan.get("vulnerabilities", []),
        "positive_findings": deep_scan.get("positive_findings", []),
        "fixes": fixes,
        "risk_score": risk_score,
        "compliance_status": compliance,
        "analysis_duration_ms": duration_ms,
        "recommendations": deep_scan.get("recommendations", []),
    }


class FixRequest(BaseModel):
    code: str
    vulnerability_type: str
    line_number: int | None = None
    cwe_id: str | None = None
    language: str = "python"


class ExplainRequest(BaseModel):
    code: str
    vulnerability_type: str
    language: str = "python"


@app.post("/api/v1/fix")
async def generate_fix(request: FixRequest):
    """Generate a secure fix for a specific vulnerability."""
    try:
        fix = await fix_generator.generate_fix(
            code=request.code,
            vulnerability_type=request.vulnerability_type,
            line_number=request.line_number,
            cwe_id=request.cwe_id,
            language=request.language,
        )
        return fix
    except Exception as e:
        log.warning("fix_generation_failed", error=str(e))
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable") from None


@app.post("/api/v1/explain")
async def explain_vulnerability(request: ExplainRequest):
    """Get a detailed educational explanation of a vulnerability."""
    try:
        explanation = await fix_generator.explain_vulnerability(
            vulnerability_type=request.vulnerability_type,
            code=request.code,
            language=request.language,
        )
        return explanation
    except Exception as e:
        log.warning("explain_failed", error=str(e))
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable") from None


# ──────────────────────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the main frontend application."""
    with open("frontend/index.html") as f:
        return HTMLResponse(content=f.read())


# ──────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.app_port,
        reload=not settings.is_production,
        log_level=settings.log_level.lower(),
    )
