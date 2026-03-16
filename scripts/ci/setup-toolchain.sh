#!/usr/bin/env bash
# setup-toolchain.sh — Install all BLACK_VAULT security toolchain
# Usage: bash scripts/ci/setup-toolchain.sh
# Installs: semgrep, trivy, stryker (already in package.json), @cyclonedx/cyclonedx-npm

set -euo pipefail

echo "Setting up BLACK_VAULT security toolchain..."

# Node.js tools (install globally for CI usage)
echo "Installing Node.js security tools..."
npm install --ignore-scripts

# semgrep
if ! command -v semgrep &>/dev/null; then
  echo "Installing semgrep..."
  if command -v pip3 &>/dev/null; then
    pip3 install semgrep --quiet
  elif command -v brew &>/dev/null; then
    brew install semgrep --quiet
  else
    echo "  WARNING: Cannot install semgrep — install manually: pip install semgrep"
  fi
else
  echo "  semgrep: $(semgrep --version | head -1)"
fi

# trivy
if ! command -v trivy &>/dev/null; then
  echo "Installing trivy..."
  if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
    brew install aquasecurity/trivy/trivy --quiet
  elif [[ "$(uname)" == "Linux" ]]; then
    curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin latest
  else
    echo "  WARNING: Cannot install trivy — install manually from https://trivy.dev"
  fi
else
  echo "  trivy: $(trivy --version | head -1)"
fi

# gh CLI
if ! command -v gh &>/dev/null; then
  echo "  WARNING: gh CLI not found — install from https://cli.github.com"
else
  echo "  gh: $(gh --version | head -1)"
fi

# Verify Stryker
echo "Verifying Stryker..."
if node -e "require('@stryker-mutator/core')" 2>/dev/null; then
  echo "  stryker: installed"
else
  echo "  Installing Stryker..."
  npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner --ignore-scripts
fi

echo ""
echo "Toolchain setup complete."
echo "Run 'bash scripts/ci/run-gates.sh' to execute all gates."
