"""
Fix generator service — generates secure code fixes using Gemini.

Takes vulnerability findings and produces actionable, tested code patches.
"""

from __future__ import annotations

import json
import logging
from textwrap import dedent

from google import genai
from google.genai import types

from config import Settings

logger = logging.getLogger(__name__)

FIX_GENERATOR_PROMPT = """You are an expert secure coding engineer. Given a vulnerability
and the affected code, generate a secure fix.

OUTPUT FORMAT: Return JSON with this structure:
{
  "fix": {
    "description": "What this fix does and why",
    "before_code": "the vulnerable code exactly as provided",
    "after_code": "the secure replacement code",
    "explanation": "Technical explanation of why the fix works",
    "testing_notes": "How to verify the fix works correctly",
    "breaking_changes": false,
    "effort": "low|medium|high",
    "references": [
      {"title": "OWASP Prevention Cheat Sheet", "url": "https://cheatsheetseries.owasp.org/..."}
    ]
  }
}

RULES:
- The fix MUST be a minimal, targeted change — don't refactor unrelated code
- The fix MUST preserve existing behavior (except removing the vulnerability)
- The fix MUST be production-ready (not a TODO or placeholder)
- Include proper error handling in the fix
- If the fix requires a new import, include it
- If the fix requires a new dependency, note it in the description

Return ONLY valid JSON."""


class FixGenerator:
    """
    Generates secure code fixes for detected vulnerabilities.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def generate_fix(
        self,
        code: str,
        vulnerability_type: str,
        line_number: int | None = None,
        cwe_id: str | None = None,
        language: str = "python",
    ) -> dict:
        """
        Generate a fix for a specific vulnerability.

        Args:
            code: The vulnerable code
            vulnerability_type: Type of vulnerability (e.g., "SQL_INJECTION")
            line_number: Affected line number
            cwe_id: CWE identifier
            language: Programming language

        Returns:
            Fix object with before/after code and explanation
        """
        prompt = dedent(f"""\
            Generate a secure fix for this vulnerability:

            Vulnerability: {vulnerability_type}
            {"CWE: " + cwe_id if cwe_id else ""}
            {"Affected Line: " + str(line_number) if line_number else ""}
            Language: {language}

            Vulnerable Code:
            ```{language}
            {code}
            ```

            Generate a minimal, targeted fix that resolves the vulnerability
            while preserving existing behavior.""")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.settings.gemini_vision_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=FIX_GENERATOR_PROMPT,
                    temperature=0.3,
                    max_output_tokens=2048,
                    response_mime_type="application/json",
                ),
            )

            result = self._parse_response(response.text)
            logger.info("Generated fix for %s (line %s)", vulnerability_type, line_number)
            return result

        except Exception as e:
            logger.error("Fix generation failed: %s", e)
            raise

    async def generate_batch_fixes(
        self,
        code: str,
        vulnerabilities: list[dict],
        language: str = "python",
    ) -> list[dict]:
        """Generate fixes for multiple vulnerabilities in a single code block."""
        vuln_list = "\n".join(
            f"- {v.get('type', 'Unknown')}: line {v.get('line_number', '?')} "
            f"({v.get('cwe_id', '')}): {v.get('description', '')}"
            for v in vulnerabilities
        )

        prompt = dedent(f"""\
            Generate fixes for ALL of these vulnerabilities in the code below:

            Vulnerabilities:
            {vuln_list}

            Code:
            ```{language}
            {code}
            ```

            Return a JSON object with:
            {{
              "fixes": [
                {{
                  "vulnerability_type": "...",
                  "line_number": N,
                  "description": "...",
                  "before_code": "...",
                  "after_code": "...",
                  "explanation": "..."
                }}
              ],
              "fully_fixed_code": "the complete code with ALL fixes applied"
            }}""")

        response = await self.client.aio.models.generate_content(
            model=self.settings.gemini_vision_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=FIX_GENERATOR_PROMPT,
                temperature=0.3,
                max_output_tokens=4096,
                response_mime_type="application/json",
            ),
        )

        result = self._parse_response(response.text)
        return result.get("fixes", [result]) if isinstance(result, dict) else [result]

    async def explain_vulnerability(
        self,
        vulnerability_type: str,
        code: str,
        language: str = "python",
    ) -> dict:
        """Generate a detailed educational explanation of a vulnerability."""
        prompt = dedent(f"""\
            Explain this vulnerability in detail for an engineer who wants to understand
            the security implications:

            Type: {vulnerability_type}
            Code:
            ```{language}
            {code}
            ```

            Return JSON:
            {{
              "explanation": {{
                "what": "What the vulnerability is",
                "why": "Why it's dangerous",
                "how": "How an attacker exploits it (step-by-step)",
                "impact": "Real-world consequences",
                "prevention": "How to prevent it in the future",
                "references": ["list of reference URLs"]
              }}
            }}""")

        response = await self.client.aio.models.generate_content(
            model=self.settings.gemini_vision_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.5,
                max_output_tokens=2048,
                response_mime_type="application/json",
            ),
        )

        return self._parse_response(response.text)

    def _parse_response(self, raw_text: str) -> dict:
        try:
            result = json.loads(raw_text)
            return result if isinstance(result, dict) else {"data": result}
        except json.JSONDecodeError:
            pass
        try:
            if "```json" in raw_text:
                block = raw_text.split("```json")[1].split("```")[0]
                return json.loads(block)
        except (json.JSONDecodeError, IndexError):
            pass
        return {"raw_response": raw_text[:1000]}
