# Security Policy

## Reporting

- Do not open public GitHub issues for unpatched exploitable vulnerabilities.
- Report security issues privately to the repository owner and include:
  - affected file or endpoint
  - reproduction steps
  - impact
  - suggested remediation if known

## Secrets

- Never commit `.env.local`.
- Never commit raw production logs, cloud credentials, API keys, OAuth tokens, or signed session material.
- Use `.env.local.example` for safe configuration examples only.

## Production safeguards

- Set `SESSION_SIGNING_SECRET` in production.
- Set `SHARE_TOKEN_SECRET` in production.
- Set `GEMINI_API_KEY` through the deployment secret store.
- If `RUNTIME_STATE_MODE=redis`, set `REDIS_URL`.
- If `HISTORY_MODE=db`, set `DATABASE_URL`.

## Validation baseline

Run these checks before deployment:

```bash
npm run lint
npm run typecheck
npm test
npm run eval
npm run build
npm audit --audit-level=high
gitleaks detect --no-banner --redact --source .
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL .
```
