# BLACK_VAULT NEXUS LIVE — Production Dockerfile
# Optimized for Google Cloud Run deployment

FROM python:3.11-slim AS base

# Security: non-root user
RUN groupadd -r nexus && useradd -r -g nexus nexus

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    portaudio19-dev \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create static directory if missing
RUN mkdir -p frontend/static/css frontend/static/js

# Security: switch to non-root user
RUN chown -R nexus:nexus /app
USER nexus

# Cloud Run expects PORT env var (default 8080)
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8080/health'); r.raise_for_status()" || exit 1

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2", "--timeout-keep-alive", "120"]
