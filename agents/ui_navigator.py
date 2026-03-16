"""
BLACK_VAULT_NEXUS_LIVE — UI Navigator Agent.

Observes the engineer's IDE via screenshots, understands code context,
identifies vulnerabilities visually, and suggests actions (highlight,
fix, navigate).

Category: UI Navigator (Visual UI Understanding & Action)
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from textwrap import dedent

from google import genai
from google.genai import types

from config import Settings

logger = logging.getLogger(__name__)

UI_NAVIGATOR_SYSTEM = """You are BLACK_VAULT_NEXUS_LIVE's UI Navigator — a vision-powered
security agent that observes an engineer's IDE screen in real-time.

YOUR TASK:
1. OBSERVE the screenshot of the engineer's IDE
2. IDENTIFY what file is open, what code is visible, what the engineer is doing
3. DETECT security vulnerabilities in the visible code
4. RECOMMEND specific UI actions the engineer should take

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "screen_context": {
    "ide": "VS Code | JetBrains | Vim | Other",
    "filename": "detected filename from tab/title bar",
    "language": "detected programming language",
    "visible_lines": "approximate range, e.g. 1-50",
    "activity": "what the engineer appears to be doing"
  },
  "visible_code_summary": "brief description of the visible code's purpose",
  "vulnerabilities": [
    {
      "id": "VULN-001",
      "type": "vulnerability type (e.g., SQL_INJECTION)",
      "title": "short title",
      "description": "what's wrong and why",
      "severity": "P0|P1|P2|P3",
      "line_number": 42,
      "cwe_id": "CWE-89",
      "confidence": 0.95
    }
  ],
  "suggested_actions": [
    {
      "action": "highlight_line|show_fix|navigate_to|show_warning|auto_fix",
      "target": "line number or element description",
      "priority": 1,
      "description": "what this action does",
      "fix_code": "if action is show_fix or auto_fix, the replacement code"
    }
  ],
  "compliance_notes": [
    "SOC2: Control CC6.1 requires input validation on all user-facing endpoints",
    "OWASP A03:2021 — Injection is #3 on the OWASP Top 10"
  ],
  "overall_risk": "CRITICAL|HIGH|MEDIUM|LOW|CLEAN"
}

GUIDELINES:
- Be specific about line numbers — reference exact lines visible in the screenshot
- Only flag issues you're confident about (confidence >= 0.7)
- Prioritize P0/P1 issues — if the code looks clean, say so
- For each vulnerability, provide actionable fix code
- If you can't read the code clearly, say so in visible_code_summary"""


class CodeHardeningUINavigator:
    """
    Vision-powered UI navigator that analyzes IDE screenshots for vulnerabilities.

    Uses Gemini multimodal to:
    - Understand IDE state (what file, what code)
    - Detect vulnerabilities from visual inspection
    - Suggest UI actions (highlight, fix, navigate)
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self._analysis_history: list[dict] = []

    async def analyze_screenshot(
        self,
        image_data: bytes,
        mime_type: str = "image/png",
        context: str | None = None,
        previous_analysis: dict | None = None,
    ) -> dict:
        """
        Analyze an IDE screenshot for security vulnerabilities.

        Args:
            image_data: Raw screenshot bytes (PNG/JPEG)
            mime_type: Image MIME type
            context: Additional context about the codebase
            previous_analysis: Previous analysis result for diff detection

        Returns:
            Structured analysis with vulnerabilities and suggested actions
        """
        parts = [
            types.Part(
                inline_data=types.Blob(mime_type=mime_type, data=image_data)
            ),
        ]

        prompt_text = "Analyze this IDE screenshot for security vulnerabilities."
        if context:
            prompt_text += f"\n\nAdditional context: {context}"
        if previous_analysis:
            prompt_text += (
                "\n\nPrevious analysis found these issues: "
                + json.dumps(previous_analysis.get("vulnerabilities", []))
                + "\nOnly report NEW issues or changes."
            )

        parts.append(types.Part(text=prompt_text))

        try:
            response = await self.client.aio.models.generate_content(
                model=self.settings.gemini_vision_model,
                contents=types.Content(parts=parts),
                config=types.GenerateContentConfig(
                    system_instruction=UI_NAVIGATOR_SYSTEM,
                    temperature=0.3,  # Low temp for precise analysis
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )

            analysis = self._parse_analysis(response.text)
            analysis["analysis_id"] = f"nav-{uuid.uuid4().hex[:8]}"
            analysis["timestamp"] = datetime.now(UTC).isoformat()

            self._analysis_history.append(analysis)
            logger.info(
                "UI analysis %s: %d vulnerabilities, risk=%s",
                analysis["analysis_id"],
                len(analysis.get("vulnerabilities", [])),
                analysis.get("overall_risk", "UNKNOWN"),
            )

            return analysis

        except Exception as e:
            logger.error("Screenshot analysis failed: %s", e)
            raise

    async def analyze_code_region(
        self,
        image_data: bytes,
        region: dict,
        mime_type: str = "image/png",
    ) -> dict:
        """
        Analyze a specific region of the screen (e.g., a single function).

        Args:
            image_data: Full screenshot bytes
            region: {"x": int, "y": int, "width": int, "height": int}
            mime_type: Image MIME type
        """
        parts = [
            types.Part(
                inline_data=types.Blob(mime_type=mime_type, data=image_data)
            ),
            types.Part(text=dedent(f"""\
                Focus your analysis on the code region at approximately:
                x={region.get('x', 0)}, y={region.get('y', 0)},
                width={region.get('width', 800)}, height={region.get('height', 600)}

                Analyze ONLY the code in that region for security vulnerabilities.
                Return the standard JSON analysis format.""")),
        ]

        response = await self.client.aio.models.generate_content(
            model=self.settings.gemini_vision_model,
            contents=types.Content(parts=parts),
            config=types.GenerateContentConfig(
                system_instruction=UI_NAVIGATOR_SYSTEM,
                temperature=0.3,
                max_output_tokens=2048,
                response_mime_type="application/json",
            ),
        )

        return self._parse_analysis(response.text)

    async def generate_fix_overlay(self, analysis: dict) -> list[dict]:
        """
        Generate UI overlay instructions for the IDE based on analysis results.

        Returns a list of overlay instructions that a frontend plugin can render:
        - Line highlights (red for vuln, green for fix)
        - Inline suggestions
        - Floating fix panels
        """
        overlays = []

        for vuln in analysis.get("vulnerabilities", []):
            severity = vuln.get("severity", "P2")
            line = vuln.get("line_number")

            color_map = {
                "P0": "#f85149",  # Red
                "P1": "#db6d28",  # Orange
                "P2": "#d29922",  # Yellow
                "P3": "#8b949e",  # Gray
            }
            color = color_map.get(severity, "#d29922")

            if line:
                overlays.append({
                    "type": "line_highlight",
                    "line": line,
                    "color": color,
                    "tooltip": f"[{severity}] {vuln.get('title', '')}",
                })

        for action in analysis.get("suggested_actions", []):
            if action.get("action") in ("show_fix", "auto_fix") and action.get("fix_code"):
                overlays.append({
                    "type": "fix_panel",
                    "target_line": action.get("target"),
                    "title": f"Fix: {action.get('description', '')}",
                    "fix_code": action["fix_code"],
                    "auto_applicable": action["action"] == "auto_fix",
                })
            elif action.get("action") == "show_warning":
                overlays.append({
                    "type": "warning_badge",
                    "target_line": action.get("target"),
                    "message": action.get("description", ""),
                })

        return overlays

    async def continuous_monitor(
        self,
        capture_callback,
        on_finding,
        interval_seconds: float = 3.0,
        max_iterations: int = 100,
    ) -> None:
        """
        Continuously monitor screen for vulnerabilities.

        Args:
            capture_callback: async callable that returns (image_data, mime_type)
            on_finding: async callable(analysis_dict) called when issues found
            interval_seconds: Time between captures
            max_iterations: Maximum number of monitoring cycles
        """
        import asyncio

        previous = None
        for i in range(max_iterations):
            try:
                image_data, mime_type = await capture_callback()
                analysis = await self.analyze_screenshot(
                    image_data, mime_type, previous_analysis=previous
                )

                if analysis.get("vulnerabilities"):
                    await on_finding(analysis)

                previous = analysis

            except Exception as e:
                logger.error("Monitor cycle %d failed: %s", i, e)

            await asyncio.sleep(interval_seconds)

    def get_analysis_history(self) -> list[dict]:
        return list(self._analysis_history)

    def get_risk_trend(self) -> list[dict]:
        """Get risk level over time from analysis history."""
        return [
            {
                "timestamp": a.get("timestamp"),
                "risk": a.get("overall_risk", "UNKNOWN"),
                "vuln_count": len(a.get("vulnerabilities", [])),
            }
            for a in self._analysis_history
        ]

    def _parse_analysis(self, raw_text: str) -> dict:
        """Parse Gemini response into structured analysis."""
        try:
            result = json.loads(raw_text)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass

        # Try extracting from code block
        try:
            if "```json" in raw_text:
                json_block = raw_text.split("```json")[1].split("```")[0]
                return json.loads(json_block)
            elif "```" in raw_text:
                json_block = raw_text.split("```")[1].split("```")[0]
                return json.loads(json_block)
        except (json.JSONDecodeError, IndexError):
            pass

        logger.warning("Could not parse UI analysis as JSON")
        return {
            "screen_context": {"ide": "Unknown"},
            "visible_code_summary": raw_text[:200],
            "vulnerabilities": [],
            "suggested_actions": [],
            "compliance_notes": [],
            "overall_risk": "UNKNOWN",
        }
