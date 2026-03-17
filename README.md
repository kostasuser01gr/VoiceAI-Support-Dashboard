# voice-to-action-agent

Production-like hackathon SaaS that converts voice transcript or text input into strict structured outputs:

- transcript
- executive summary
- action items
- email draft
- audit trail
- meta diagnostics

## What it is

This project delivers a support automation command center with deterministic AI output contracts, guardrails, and operational telemetry.
It is built to be demo-safe for hackathon judging and production-like for reliability checks.
It includes end-to-end proof artifacts, deployment automation, and verification commands that judges can reproduce directly.

## Live URLs

- Cloud Run: https://voice-to-action-agent-zbluqfbniq-ew.a.run.app
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app/api/health
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app/api/guardian
  - https://voice-to-action-agent-zbluqfbniq-ew.a.run.app/api/metrics
- Firebase: https://chatgpt-ops.web.app
  - https://chatgpt-ops.web.app/health.json
  - https://chatgpt-ops.web.app/api/guardian
  - https://chatgpt-ops.web.app/api/metrics

## Quickstart (5 minutes)

```bash
npm ci
cp .env.local.example .env.local
# Optional for live model mode: set GEMINI_API_KEY in .env.local
npm run dev
```

Open `http://localhost:3000`.

Use Node 20.x with npm 10.x to match CI and production builds.

## Reproducible testing

```bash
npm run lint
npm run typecheck
npm run test
npm test -- --coverage
npm run test:e2e
npx stryker run
npm run eval
npm run build
npm run scan
npm run judge:verify
```

`npm run test:e2e` starts a local app server with demo-safe mode enabled and exercises the primary browser flow with Playwright.

## Governance and operations

- Contribution workflow: `CONTRIBUTING.md`
- Security reporting and production safeguards: `SECURITY.md`
- Autonomous stabilization ledger: `docs/autonomous-ops-ledger.md`

## Tech stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Zod
- Gemini SDK `@google/genai`
- Vitest
- Optional Postgres (`pg`) for DB history mode

## Core features

- Strict Gemini structured output with JSON Schema + server-side Zod validation
- Node runtime route handlers (`/app/api/*`) only
- Browser Web Speech API transcription with automatic text fallback
- Deterministic safety checks and quality scoring
- Request limits: body size, max chars, minute and burst rate limits
- Export center: copy/download Markdown, JSON, TXT, print to PDF
- Signed share links (`/share/[token]`)
- Webhook export relay (public HTTPS endpoints only)
- History mode:
  - `local` (default, localStorage + migrations + pin/delete)
  - `db` (Postgres sessions table)
- Settings diagnostics panel with observability counters
- Integrations page with safe dry-run background jobs
- Session intelligence card (topics/entities/open loops)
- Approval center (task/email approval + reviewer comments)
- Wave 1 APIs: approvals, compare/regenerate, open loops, metrics, integrations execute/retry
- Demo-safe deterministic fallback mode (`DEMO_SAFE_MODE=true`) for judge reliability

## Pages

- `/` dashboard
- `/history`
- `/history/[id]`
- `/history/compare`
- `/settings`
- `/integrations`
- `/actions`
- `/open-loops`
- `/share/[token]`
- `/status`

## API routes

- `POST /api/process`
- `GET /api/health`
- `GET /api/me`
- `GET /api/metrics`
- `GET /api/history` (db mode)
- `GET /api/history/[id]` (db mode)
- `GET /api/history/compare` (wave1 + db mode)
- `POST /api/history/[id]/regenerate` (wave1 + db mode)
- `GET /api/open-loops` (wave1 + db mode)
- `POST /api/sessions/[id]/approve-email` (wave1 + db mode)
- `POST /api/sessions/[id]/approve-tasks` (wave1 + db mode)
- `POST /api/sessions/[id]/comments` (wave1 + db mode)
- `GET|POST|DELETE /api/auth/session`
- `POST /api/share`
- `POST /api/export/webhook`
- `POST /api/integrations/dry-run`
- `POST /api/integrations/execute`
- `GET /api/integrations/jobs/[id]`
- `POST /api/integrations/jobs/[id]/retry`

## Structured output contract

`/api/process` returns:

```json
{
  "inputMode": "voice | text",
  "transcript": "string",
  "summary": "string",
  "actions": {
    "taskList": ["string"],
    "emailDraft": "string"
  },
  "auditTrail": [
    { "step": "capture|transcribe|extract|draft|safety_check", "timestamp": "string", "details": "string" }
  ],
  "meta": {
    "requestId": "string",
    "model": "string",
    "latencyMs": 0,
    "validation": "passed|failed",
    "fallbackUsed": false
  }
}
```

Validation path:
1. Request schema validation (Zod)
2. Gemini response schema enforcement (`responseJsonSchema`)
3. Zod response validation
4. Deterministic `safety_check`
5. Quality scoring and audit notes
6. Runtime security shield + guardian health model

## Environment variables

Required:
- `GEMINI_API_KEY`

Optional:
- `APP_BASE_URL`
- `HISTORY_MODE=local|db` (default `local`)
- `RATE_LIMIT_PER_MIN` (default `20`)
- `RATE_LIMIT_BURST_PER_10S` (default `6`)
- `MAX_INPUT_CHARS` (default `2000`)
- `PROMPT_VERSION` (default `v1`)
- `DEMO_SAFE_MODE=true|false` (default `false`)
- `FEATURE_WAVE1` (default `true`)
- `VERIFIER_POLICY=warn|repair|reject` (default `warn`)
- `INTEGRATIONS_MODE=mock|live` (default `mock`)
- `RUNTIME_STATE_MODE=memory|redis` (default `memory`)
- `REDIS_URL` (required when `RUNTIME_STATE_MODE=redis`)
- `SHARE_TOKEN_SECRET`
- `SHARE_TOKEN_TTL_MS` (default `604800000` = 7 days)
- `SHARE_TOKEN_REQUIRE_PASSWORD=true|false` (default `false`)
- `SESSION_SIGNING_SECRET` (recommended for production)
- `REQUIRE_SIGNED_SESSION_IN_PROD=true|false` (default `true`)
- `ALLOW_HEADER_SESSION_FALLBACK_IN_PROD=true|false` (default `false`)
- `MUTATION_IDEMPOTENCY_REQUIRED=true|false` (default `false`)
- `FEATURE_V2_APIS=true|false` (default `true`)
- `SECONDARY_GEMINI_MODEL`
- `GEMINI_TIMEOUT_MS` (default `10000`)
- `GEMINI_BREAKER_FAILURE_THRESHOLD` (default `5`)
- `GEMINI_BREAKER_COOLDOWN_MS` (default `30000`)
- `NEXT_PUBLIC_MAX_LOCAL_SESSIONS` (default `25`, min `5`, max `200`)
- `GUARDIAN_ENABLED=true|false` (default `true`)
- `GUARDIAN_INTERVAL_MS` (default `10000`)
- `SECURITY_BLOCK_MINUTES` (default `5`)
- `SECURITY_RISK_THRESHOLD` (default `100`)
- `DATABASE_URL` (required only when `HISTORY_MODE=db`)
- `CLOUD_TASKS_QUEUE`, `CLOUD_TASKS_LOCATION` (optional)
- `CANARY_WORKSPACE_ALLOWLIST` (comma-separated workspace IDs)

See `.env.local.example`.

## History mode: local vs db

Local:
- stores last 25 sessions
- schema versioned localStorage migration with checksum + backup recovery
- pin/delete/update review metadata

DB:
- `lib/db.ts` auto-creates and manages `sessions` table
- includes workspace and user columns
- API query support for search/mode/workspace/user

## Architecture diagram

- Diagram image: `docs/architecture.png`
- Diagram explanation: `docs/architecture.md`
- Submission helper: `docs/submission-links.md`

Flow summary:
1. Input enters `/api/process` with schema-first request validation.
2. Model output is constrained by JSON schema and re-validated server-side.
3. Safety verifier and guardian controls apply deterministic safeguards.
4. Sessions and jobs persist through local/db and integration queues.
5. Dashboard pages consume health, guardian, and metrics proof endpoints.

## Deployment automation proof (bonus)

- `scripts/deploy-firebase.sh` one-command Firebase Hosting deploy (`npm run deploy:firebase`)
- `scripts/deploy.sh` one-command Cloud Run deploy
- `scripts/precheck-cloudrun.sh` billing/API/env preflight
- `scripts/release-bundle.sh` judge artifact bundle generator
- `scripts/judge-verify.sh` one-command zero-to-pass verification
- `scripts/migrate.ts` SQL migration runner (`npm run db:migrate`)
- `scripts/verify-screenshots.sh` required screenshot placeholders check
- `cloudbuild.yaml` Cloud Build pipeline deploy
- `.github/workflows/deploy-gcp.yml` GitHub Actions deploy to GCP
- `infra/main.tf` Terraform Cloud Run service

### Firebase deploy

```bash
PROJECT_ID=chatgpt-ops npm run deploy:firebase
```

### Cloud Run deploy

```bash
PROJECT_ID=chatgpt-ops REGION=europe-west1 DEMO_SAFE_MODE=true ./scripts/deploy.sh
```

Live model mode requires secrets (for example `GEMINI_API_KEY`) configured in environment or CI secret store. Never commit secrets to the repo.

## Runtime guardian and attack prevention

- Background guardian loop evaluates health score continuously (status: `healthy|degraded|critical`).
- Temporary security shield blocks abusive client fingerprints on repeated malicious signals.
- Signals include malformed payload bursts, RBAC denials, repeated rate-limit abuse, and model/safety failures.
- Guardian telemetry is exposed in:
  - `GET /api/health`
  - `GET /api/metrics`
  - `GET /api/guardian`

## Docker option

```bash
npm run docker:build
docker run --rm -p 8080:8080 -e GEMINI_API_KEY=... voice-to-action-agent:local
```

## Demo script

See `docs/demo-script.md` (90-second judge flow).

## QA checklist

See `docs/qa-checklist.md`.

## Additional docs

- `docs/judge-runbook.md`
- `docs/troubleshooting.md`
- `docs/scoring-matrix.md`
- `docs/screenshot-checklist.md`

## Judging highlights

- Schema-first AI pipeline with strict contract enforcement
- Deterministic post-model safety layer and audit timeline
- Observable and reproducible: tests + eval + build + deployment automation
- Dual persistence architecture (local + db) with session replay
- Export/share/integration flows designed for safe hackathon demos

## Security notes

- No secrets are stored in repository source.
- Runtime logs and responses avoid exposing secret values.
- Request-rate limits and payload-size limits are enforced server-side.
- Guardian + security shield reduce abuse and degrade safely under risk.

## Known limitations

- Live model behavior depends on external API availability and quota.
- Firebase `/api/*` proxy behavior depends on hosting rewrite configuration.
- Low-severity transitive audit findings remain in optional dependency paths.

## Bonus links placeholders

- Published content URL: `TODO`
- Public GDG profile URL: `TODO`
