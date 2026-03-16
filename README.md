# BLACK_VAULT NEXUS LIVE

**Real-Time AI-Powered Code Hardening with Gemini Live API**

> Gemini Live Agent Challenge 2026 | Categories: Live Agents + Creative Storyteller + UI Navigator

## What It Does

Engineers talk to their code hardening agent in real-time. The agent **hears** questions via voice, **sees** the IDE via screen capture, and responds with **voice guidance + code fixes + compliance notes** — all powered by Gemini 2.0 Live API on Google Cloud.

### Three Categories, One Platform

| Category | Capability |
|---|---|
| **Live Agent** | Real-time voice + vision interaction with barge-in support |
| **Creative Storyteller** | Interleaved multimodal hardening narratives (text + code + diagrams) |
| **UI Navigator** | Vision-powered IDE analysis with fix overlays |

## Quick Start

### Prerequisites

- Python 3.11+
- [Gemini API Key](https://aistudio.google.com/app/apikey)
- Google Cloud account (for deployment)

### Local Development

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/black-vault-nexus-live
cd black-vault-nexus-live

# Set up environment
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env and set GEMINI_API_KEY

# Run
python main.py

# Open http://localhost:8080
```

### Cloud Run Deployment

```bash
export GCP_PROJECT_ID="your-project"
export GEMINI_API_KEY="your-key"

chmod +x deploy/cloudrun-deploy.sh
./deploy/cloudrun-deploy.sh
```

Or with Terraform:

```bash
cd deploy/terraform
terraform init
terraform apply -var="project_id=your-project" -var="gemini_api_key=your-key"
```

### Verify Deployment

```bash
curl https://YOUR-SERVICE-URL/health
```

## Architecture

```
[Browser/IDE Plugin]
      |
      | WebSocket (audio/video/text)
      v
[Cloud Run: FastAPI Backend]
      |
      +---> [Gemini 2.0 Live API]  -- Voice I/O, Vision, Multimodal
      |
      +---> [Code Analyzer]        -- Pattern-based vuln detection (15 rules)
      |
      +---> [Vuln Scanner]         -- AI-powered deep analysis
      |
      +---> [Fix Generator]        -- Secure code fix generation
      |
      +---> [Cloud Firestore]      -- Scan history & analytics
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (Cloud Run proof) |
| `POST` | `/api/v1/sessions` | Create live agent session |
| `WS` | `/ws/live/{id}` | WebSocket for real-time interaction |
| `POST` | `/api/v1/analyze` | Analyze code for vulnerabilities |
| `POST` | `/api/v1/stories` | Generate hardening story |
| `POST` | `/api/v1/navigate/analyze` | Analyze IDE screenshot |
| `POST` | `/api/v1/navigate/overlay` | Get fix overlay for IDE |
| `POST` | `/api/v1/fix` | Generate secure code fix |
| `POST` | `/api/v1/explain` | Explain a vulnerability |

## Testing

```bash
# Unit tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=. --cov-report=html
```

## Tech Stack

- **Backend**: FastAPI, Python 3.11, uvicorn
- **AI**: Gemini 2.0 Live API, Vertex AI
- **Cloud**: Google Cloud Run, Firestore, Artifact Registry
- **Frontend**: Vanilla HTML/CSS/JS, Web Audio API, Screen Capture API
- **Security**: 15 pattern rules (CWE/OWASP mapped), AI deep scanning
- **IaC**: Terraform, Cloud Build

## Project Structure

```
black-vault-nexus-live/
  main.py                    # FastAPI application
  config.py                  # Settings (Pydantic)
  agents/
    live_agent.py            # Gemini Live API real-time agent
    storyteller.py           # Multimodal narrative generator
    ui_navigator.py          # Vision-powered IDE analyzer
  services/
    code_analyzer.py         # Pattern-based vulnerability scanner
    vulnerability_scanner.py # AI-powered deep analysis
    fix_generator.py         # Secure code fix generator
  schemas/                   # Pydantic request/response models
  middleware/                # Security headers, rate limiting
  frontend/                  # Browser-based UI
  deploy/                    # Dockerfile, Cloud Run, Terraform
  tests/                     # Unit and integration tests
```

## License

MIT
