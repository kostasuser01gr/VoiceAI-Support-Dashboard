"""
BLACK_VAULT_NEXUS_LIVE — Creative Storyteller Agent.

Generates rich, interleaved multimodal "hardening stories" that combine:
- Text narratives explaining vulnerabilities
- Before/after code snippets
- Architecture diagrams (Mermaid/SVG)
- Compliance impact analysis
- Step-by-step remediation guides

Category: Creative Storyteller (Interleaved Multimodal Output)
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
from schemas.analysis import (
    ComplianceFramework,
)

logger = logging.getLogger(__name__)

STORYTELLER_SYSTEM = """You are BLACK_VAULT_NEXUS_LIVE's Creative Storyteller engine.

You generate rich, educational "hardening stories" that explain security vulnerabilities
through an interleaved narrative. Each story weaves together:

1. PROBLEM STATEMENT — What's wrong and why it matters (plain language)
2. VULNERABLE CODE — The actual insecure code with line annotations
3. ATTACK SCENARIO — How an attacker would exploit this (step-by-step)
4. ATTACK FLOW DIAGRAM — Mermaid diagram showing the attack path
5. SECURE CODE — The fixed version with explanations
6. EXPLANATION — Why the fix works (technically precise)
7. COMPLIANCE MAPPING — Which frameworks require this fix (SOC2, GDPR, etc.)
8. REMEDIATION CHECKLIST — Step-by-step guide to implement the fix

OUTPUT FORMAT: Return a JSON array of story sections. Each section has:
{
  "modality": "text" | "code" | "diagram" | "checklist",
  "content": "<the content>",
  "metadata": {
    "title": "section title",
    "language": "python",  // for code sections
    "diagram_type": "mermaid",  // for diagram sections
    "severity": "P0"  // if applicable
  }
}

IMPORTANT:
- Make it educational, not scary. Engineers should feel empowered, not overwhelmed.
- Use concrete, realistic code examples (not toy examples).
- Include CWE IDs and OWASP categories for each vulnerability.
- Diagrams should use Mermaid syntax for rendering."""


class HardeningStorytellerAgent:
    """
    Generates multimodal hardening stories using Gemini.

    Produces interleaved text + code + diagrams + checklists that tell the
    complete story of a vulnerability — from discovery to remediation.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def generate_story(
        self,
        code: str,
        filename: str = "app.py",
        language: str = "python",
        vulnerability_hint: str | None = None,
        frameworks: list[ComplianceFramework] | None = None,
    ) -> dict:
        """
        Generate a complete hardening story for the given code.

        Returns a structured story with interleaved modalities.
        """
        frameworks = frameworks or [ComplianceFramework.OWASP]
        framework_names = ", ".join(f.value for f in frameworks)

        prompt = dedent(f"""\
            Analyze the following code and generate a hardening story for the most
            critical vulnerability found.

            File: {filename}
            Language: {language}
            Compliance Frameworks: {framework_names}
            {"Hint: " + vulnerability_hint if vulnerability_hint else ""}

            ```{language}
            {code}
            ```

            Generate the story as a JSON array of sections following the format
            described in your system instructions. Include ALL section types:
            text, code (before & after), diagram (Mermaid), and checklist.

            Return ONLY the JSON array, no additional text.""")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.settings.gemini_vision_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=STORYTELLER_SYSTEM,
                    temperature=0.7,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )

            sections = self._parse_sections(response.text)

            story_id = f"story-{uuid.uuid4().hex[:8]}"
            return {
                "story_id": story_id,
                "filename": filename,
                "language": language,
                "frameworks": [f.value for f in frameworks],
                "sections": sections,
                "generated_at": datetime.now(UTC).isoformat(),
                "section_count": len(sections),
                "modalities": list({s["modality"] for s in sections}),
            }

        except Exception as e:
            logger.error("Story generation failed: %s", e)
            raise

    async def generate_story_from_screenshot(
        self,
        image_data: bytes,
        mime_type: str = "image/png",
        context: str | None = None,
    ) -> dict:
        """
        Generate a hardening story from an IDE screenshot.

        Uses Gemini vision to read code from the screenshot, then generates
        a full interleaved narrative.
        """
        parts = [
            types.Part(
                inline_data=types.Blob(mime_type=mime_type, data=image_data)
            ),
            types.Part(text=dedent(f"""\
                Look at this IDE screenshot. Identify the code visible on screen.

                1. First, transcribe the visible code exactly as shown.
                2. Identify the most critical security vulnerability.
                3. Generate a complete hardening story as a JSON array of sections.

                {"Additional context: " + context if context else ""}

                Each section should have: modality, content, metadata.
                Return ONLY the JSON array.""")),
        ]

        try:
            response = await self.client.aio.models.generate_content(
                model=self.settings.gemini_vision_model,
                contents=types.Content(parts=parts),
                config=types.GenerateContentConfig(
                    system_instruction=STORYTELLER_SYSTEM,
                    temperature=0.7,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )

            sections = self._parse_sections(response.text)

            story_id = f"story-vis-{uuid.uuid4().hex[:8]}"
            return {
                "story_id": story_id,
                "source": "screenshot",
                "sections": sections,
                "generated_at": datetime.now(UTC).isoformat(),
                "section_count": len(sections),
                "modalities": list({s["modality"] for s in sections}),
            }

        except Exception as e:
            logger.error("Screenshot story generation failed: %s", e)
            raise

    async def generate_comparative_story(
        self,
        vulnerable_code: str,
        secure_code: str,
        language: str = "python",
    ) -> dict:
        """Generate a story comparing vulnerable vs. secure implementations."""
        prompt = dedent(f"""\
            Compare these two code versions and generate a hardening story explaining
            what was wrong and how it was fixed.

            VULNERABLE VERSION:
            ```{language}
            {vulnerable_code}
            ```

            SECURE VERSION:
            ```{language}
            {secure_code}
            ```

            Generate the story as a JSON array with interleaved sections showing
            the transformation from vulnerable to secure code. Include a Mermaid
            diagram showing the security improvement.

            Return ONLY the JSON array.""")

        response = await self.client.aio.models.generate_content(
            model=self.settings.gemini_vision_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=STORYTELLER_SYSTEM,
                temperature=0.7,
                max_output_tokens=4096,
                response_mime_type="application/json",
            ),
        )

        sections = self._parse_sections(response.text)
        story_id = f"story-cmp-{uuid.uuid4().hex[:8]}"

        return {
            "story_id": story_id,
            "type": "comparative",
            "sections": sections,
            "generated_at": datetime.now(UTC).isoformat(),
            "section_count": len(sections),
        }

    def render_story_html(self, story: dict) -> str:
        """Render a story as rich HTML with embedded Mermaid diagrams."""
        html_parts = [
            '<!DOCTYPE html><html><head>',
            '<meta charset="utf-8">',
            '<title>Hardening Story</title>',
            '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>',
            '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">',
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>',
            '<style>',
            'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ',
            '  max-width: 900px; margin: 0 auto; padding: 2rem; background: #0d1117; color: #c9d1d9; }',
            'h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 0.5rem; }',
            'h2 { color: #7ee787; }',
            '.section { margin: 1.5rem 0; padding: 1rem; border-radius: 8px; }',
            '.section-text { background: #161b22; border-left: 4px solid #58a6ff; }',
            '.section-code { background: #0d1117; }',
            '.section-diagram { background: #161b22; border-left: 4px solid #7ee787; text-align: center; }',
            '.section-checklist { background: #161b22; border-left: 4px solid #d29922; }',
            '.severity-P0 { border-color: #f85149; }',
            '.severity-P1 { border-color: #db6d28; }',
            'pre { background: #0d1117; padding: 1rem; border-radius: 6px; overflow-x: auto; }',
            'code { font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 0.9rem; }',
            '.mermaid { background: #fff; padding: 1rem; border-radius: 6px; }',
            '</style></head><body>',
            f'<h1>Hardening Story: {story.get("story_id", "")}</h1>',
            f'<p><em>Generated: {story.get("generated_at", "")}</em></p>',
        ]

        for section in story.get("sections", []):
            modality = section.get("modality", "text")
            content = section.get("content", "")
            metadata = section.get("metadata", {})
            title = metadata.get("title", "")
            severity = metadata.get("severity", "")

            severity_class = f" severity-{severity}" if severity else ""

            if modality == "text":
                html_parts.append(
                    f'<div class="section section-text{severity_class}">'
                    f'{f"<h2>{title}</h2>" if title else ""}'
                    f'<p>{content}</p></div>'
                )
            elif modality == "code":
                lang = metadata.get("language", "python")
                html_parts.append(
                    f'<div class="section section-code">'
                    f'{f"<h2>{title}</h2>" if title else ""}'
                    f'<pre><code class="language-{lang}">{content}</code></pre></div>'
                )
            elif modality == "diagram":
                html_parts.append(
                    f'<div class="section section-diagram">'
                    f'{f"<h2>{title}</h2>" if title else ""}'
                    f'<div class="mermaid">{content}</div></div>'
                )
            elif modality == "checklist":
                items = content.split("\n")
                items_html = "".join(
                    f"<li>{item.lstrip('- ')}</li>" for item in items if item.strip()
                )
                html_parts.append(
                    f'<div class="section section-checklist">'
                    f'{f"<h2>{title}</h2>" if title else ""}'
                    f'<ul>{items_html}</ul></div>'
                )

        html_parts.extend([
            '<script>mermaid.initialize({startOnLoad:true, theme:"dark"});</script>',
            '<script>hljs.highlightAll();</script>',
            '</body></html>',
        ])

        return "\n".join(html_parts)

    def _parse_sections(self, raw_text: str) -> list[dict]:
        """Parse Gemini response into story sections."""
        def _normalize(data: list | dict) -> list[dict]:
            """Normalize various JSON shapes into a flat list of sections."""
            if isinstance(data, list):
                # Could be list of sections or list of objects with nested sections
                result = []
                for item in data:
                    if isinstance(item, dict):
                        # Gemini may return {modality, content} or {type, title, content}
                        if "modality" in item or "content" in item or "type" in item:
                            result.append(item)
                        elif "sections" in item:
                            result.extend(_normalize(item["sections"]))
                        else:
                            result.append({"modality": "text", "content": json.dumps(item), "metadata": {}})
                    else:
                        result.append({"modality": "text", "content": str(item), "metadata": {}})
                return result
            if isinstance(data, dict):
                if "sections" in data:
                    return _normalize(data["sections"])
                return [data]
            return [{"modality": "text", "content": str(data), "metadata": {}}]

        try:
            parsed = json.loads(raw_text)
            return _normalize(parsed)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown code block
            for prefix in ("```json", "```"):
                if prefix in raw_text:
                    try:
                        json_block = raw_text.split(prefix)[1].split("```")[0]
                        return _normalize(json.loads(json_block))
                    except (json.JSONDecodeError, IndexError):
                        continue
            # Fallback: wrap raw text as single text section
            logger.warning("Could not parse story sections as JSON, using raw text")
            return [{"modality": "text", "content": raw_text, "metadata": {}}]
