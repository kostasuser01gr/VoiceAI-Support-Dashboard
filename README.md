# VoiceAI Support Dashboard

[![CI](https://github.com/kostasuser01gr/VoiceAI-Support-Dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/kostasuser01gr/VoiceAI-Support-Dashboard/actions/workflows/ci.yml)
[![Hackathon](https://img.shields.io/badge/🏆-Hackathon_Submission-gold)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/Gemini-AI-4285F4)](https://ai.google.dev)

> Real-time Voice AI customer support command center with live transcription, sentiment analysis, structured output contracts, and full audit trail.

Production-grade hackathon submission — deterministic AI output with server-side Zod validation, rate limiting, and demo-safe fallback mode.

---

## What It Does

Converts voice transcript or text input into strict structured outputs:

| Output | Description |
|--------|-------------|
| **Transcript** | Cleaned, timestamped transcription |
| **Executive Summary** | Auto-generated call summary |
| **Action Items** | Extracted tasks with owners |
| **Email Draft** | Ready-to-send follow-up email |
| **Audit Trail** | Full decision log with quality scores |
| **Meta Diagnostics** | Observability counters and model telemetry |

---

## Features

- **Browser Web Speech API** transcription with text fallback
- **Structured Gemini output** with JSON Schema + server-side Zod validation
- **Signed share links** (`/share/[token]`)
- **Approval center** — task/email approval with reviewer comments
- **Export center** — copy/download as Markdown, JSON, TXT, or PDF
- **History mode** — local (localStorage) or Postgres DB sessions
- **Rate limiting** — body size limits, per-minute and burst caps
- **Demo-safe mode** — deterministic fallback (`DEMO_SAFE_MODE=true`) for reliable demos
- **Webhook relay** — export to public HTTPS endpoints
- **Session intelligence** — topic/entity extraction, open loop detection

---

## Tech Stack

- **Next.js** (App Router, TypeScript)
- **Tailwind CSS**
- **Gemini SDK** (`@google/genai`) — structured output
- **Zod** — server-side output validation
- **Vitest** — unit and eval tests
- Optional **Postgres** (`pg`) for DB history mode

---

## Getting Started

```bash
git clone https://github.com/kostasuser01gr/VoiceAI-Support-Dashboard
cd VoiceAI-Support-Dashboard
npm ci
cp .env.local.example .env.local
# Set GEMINI_API_KEY in .env.local for live mode
# Or leave unset for DEMO_SAFE_MODE (no API key needed)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Testing

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## License

MIT
