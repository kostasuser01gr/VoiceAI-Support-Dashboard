# ── deps ─────────────────────────────────────────────────────────────────────
# Pin to a specific minor version for reproducibility.
# TODO(ops): pin to sha256 digest after confirming in CI, e.g.:
#   node:20-alpine@sha256:<digest>
FROM node:20.19-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm install instead of npm ci: npm ci errors on EBADPLATFORM for optional
# platform-specific packages (e.g. @esbuild/aix-ppc64) generated on a different
# host OS; npm install warns and skips them gracefully.
RUN npm install --ignore-scripts

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:20.19-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:20.19-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Run as non-root to limit blast radius of any code-execution vulnerability
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
EXPOSE 8080
ENV PORT=8080
CMD ["npm", "run", "start", "--", "-p", "8080"]
