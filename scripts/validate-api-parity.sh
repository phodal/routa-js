#!/bin/bash
#
# Routa.js API Parity Validation
#
# This script performs two levels of validation:
#   1. Static check  — route definitions match between Next.js, Rust, and the contract
#   2. Runtime check  — same integration tests pass on both backends
#
# Usage:
#   ./scripts/validate-api-parity.sh              # static check only (no running backend needed)
#   ./scripts/validate-api-parity.sh --runtime     # static + runtime tests (needs both backends)
#   ./scripts/validate-api-parity.sh --nextjs-only  # runtime tests against Next.js only
#   ./scripts/validate-api-parity.sh --rust-only    # runtime tests against Rust only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NEXTJS_URL="${NEXTJS_URL:-http://localhost:3000}"
RUST_URL="${RUST_URL:-http://localhost:3210}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "\n${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Routa.js API Parity Validation             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}\n"

ERRORS=0

# ─── Step 1: Static Route Parity ─────────────────────────
echo -e "${BLUE}[1/2] Static route parity check...${NC}\n"

if npx tsx "$ROOT_DIR/scripts/check-api-parity.ts"; then
  echo -e "\n${GREEN}✅ Static route check passed${NC}\n"
else
  echo -e "\n${RED}❌ Static route check failed${NC}"
  echo -e "${YELLOW}   Run: npx tsx scripts/check-api-parity.ts --fix-hint${NC}\n"
  ERRORS=$((ERRORS + 1))
fi

# ─── Step 2: Runtime Contract Tests ──────────────────────
RUN_RUNTIME=false
NEXTJS_ONLY=false
RUST_ONLY=false

for arg in "$@"; do
  case $arg in
    --runtime)     RUN_RUNTIME=true ;;
    --nextjs-only) RUN_RUNTIME=true; NEXTJS_ONLY=true ;;
    --rust-only)   RUN_RUNTIME=true; RUST_ONLY=true ;;
  esac
done

if [ "$RUN_RUNTIME" = true ]; then
  echo -e "${BLUE}[2/2] Runtime contract tests...${NC}\n"

  if [ "$RUST_ONLY" = false ]; then
    echo -e "${BLUE}── Testing Next.js backend ($NEXTJS_URL) ──${NC}\n"
    if BASE_URL="$NEXTJS_URL" npx tsx "$ROOT_DIR/tests/api-contract/run.ts"; then
      echo -e "${GREEN}✅ Next.js contract tests passed${NC}\n"
    else
      echo -e "${RED}❌ Next.js contract tests failed${NC}\n"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  if [ "$NEXTJS_ONLY" = false ]; then
    echo -e "${BLUE}── Testing Rust backend ($RUST_URL) ──${NC}\n"
    if BASE_URL="$RUST_URL" npx tsx "$ROOT_DIR/tests/api-contract/run.ts"; then
      echo -e "${GREEN}✅ Rust contract tests passed${NC}\n"
    else
      echo -e "${RED}❌ Rust contract tests failed${NC}\n"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # ── Cross-compare results ──
  if [ "$NEXTJS_ONLY" = false ] && [ "$RUST_ONLY" = false ]; then
    echo -e "${BLUE}── Cross-comparing results ──${NC}\n"

    NEXTJS_RESULTS=$(BASE_URL="$NEXTJS_URL" npx tsx "$ROOT_DIR/tests/api-contract/run.ts" --json 2>/dev/null || echo '{"error":"failed"}')
    RUST_RESULTS=$(BASE_URL="$RUST_URL" npx tsx "$ROOT_DIR/tests/api-contract/run.ts" --json 2>/dev/null || echo '{"error":"failed"}')

    NEXTJS_PASSED=$(echo "$NEXTJS_RESULTS" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      console.log(data.totalPassed || 0);
    " 2>/dev/null || echo "0")

    RUST_PASSED=$(echo "$RUST_RESULTS" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      console.log(data.totalPassed || 0);
    " 2>/dev/null || echo "0")

    echo -e "  Next.js passed: ${NEXTJS_PASSED} tests"
    echo -e "  Rust passed:    ${RUST_PASSED} tests"

    if [ "$NEXTJS_PASSED" = "$RUST_PASSED" ]; then
      echo -e "  ${GREEN}✅ Both backends have identical test results${NC}\n"
    else
      echo -e "  ${YELLOW}⚠️  Backends differ in test results${NC}\n"
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  echo -e "${YELLOW}[2/2] Skipping runtime tests (use --runtime, --nextjs-only, or --rust-only)${NC}\n"
fi

# ─── Summary ─────────────────────────────────────────────
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✅ All parity checks passed!${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════${NC}\n"
  exit 0
else
  echo -e "${RED}══════════════════════════════════════════════════${NC}"
  echo -e "${RED}  ❌ ${ERRORS} parity check(s) failed${NC}"
  echo -e "${RED}══════════════════════════════════════════════════${NC}\n"
  exit 1
fi
