# Contributing

## Local prerequisites

- Node 20.x
- npm 10.x
- Copy `.env.local.example` to `.env.local`
- Set `GEMINI_API_KEY` when testing live model mode

## Local workflow

1. Install dependencies with `npm ci`.
2. Run the app with `npm run dev`.
3. Validate changes before pushing:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run eval`
   - `npm run build`
   - `npm audit --audit-level=high`

## Deployment-sensitive changes

- Do not commit secrets or raw cloud logs.
- Keep GitHub Actions pinned to immutable action SHAs.
- When changing auth, rate limiting, SSRF, sharing, or deployment code, rerun the full validation matrix.

## Commits

- Prefer short, high-signal commit messages.
- Keep changes minimal and scoped to one fix or one documentation improvement.
