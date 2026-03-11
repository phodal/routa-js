#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Smart Pre-Push Check Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# Runs lint and tests before push. On failure:
#   - In AI agent environment → Output clear error message for AI to fix
#   - In human environment → Optionally auto-fix with claude -p
#
# Usage:
#   ./scripts/smart-check.sh           # Run checks
#   ./scripts/smart-check.sh --fix     # Run checks, auto-fix on failure (human mode)
#
# Environment variables for AI detection:
#   CLAUDE_CODE=1, ANTHROPIC_AGENT=1, AUGMENT_AGENT=1, CURSOR_AGENT=1,
#   GITHUB_ACTIONS=1, CI=1, ROUTA_AGENT=1
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── AI Agent Detection ─────────────────────────────────────────────────────

is_ai_agent() {
  # Check common AI agent environment variables
  # Note: CLAUDE_CODE_SSE_PORT is set by Augment but doesn't mean we're in AI mode
  # We need to check for the actual CLAUDE_CODE variable (without suffix)
  if [[ "$CLAUDE_CODE" == "1" ]] || \
     [[ -n "$ANTHROPIC_AGENT" ]] || \
     [[ -n "$AUGMENT_AGENT" ]] || \
     [[ -n "$CURSOR_AGENT" ]] || \
     [[ -n "$ROUTA_AGENT" ]] || \
     [[ -n "$AIDER_AGENT" ]] || \
     [[ -n "$COPILOT_AGENT" ]] || \
     [[ -n "$WINDSURF_AGENT" ]] || \
     [[ -n "$CLINE_AGENT" ]]; then
    return 0
  fi

  # Check if running in CI (GitHub Actions, etc.)
  if [[ -n "$GITHUB_ACTIONS" ]] || [[ -n "$CI" ]]; then
    return 0
  fi

  # Check if parent process is an AI agent (heuristic)
  # Claude Code spawns processes with specific patterns
  if [[ -n "$CLAUDE_CONFIG_DIR" ]] || [[ -n "$MCP_SERVER_NAME" ]]; then
    return 0
  fi

  return 1
}

# ─── Temp Files for Output Capture ──────────────────────────────────────────

LINT_LOG=$(mktemp)
TYPECHECK_LOG=$(mktemp)
TEST_LOG=$(mktemp)

cleanup() {
  rm -f "$LINT_LOG" "$TYPECHECK_LOG" "$TEST_LOG"
}
trap cleanup EXIT

# ─── Main ───────────────────────────────────────────────────────────────────

main() {
  local auto_fix=false
  if [[ "$1" == "--fix" ]]; then
    auto_fix=true
  fi

  local lint_exit=0 typecheck_exit=0 test_exit=0

  # ─── Run Lint (with real-time output) ─────────────────────────────────────
  echo -e "${BLUE}[1/3] Running lint...${NC}"
  echo ""
  set +e
  npm run lint 2>&1 | tee "$LINT_LOG"
  lint_exit=${PIPESTATUS[0]}
  set -e
  echo ""
  if [[ $lint_exit -eq 0 ]]; then
    echo -e "${GREEN}✓ Lint passed${NC}"
  else
    echo -e "${RED}✗ Lint failed (exit code: $lint_exit)${NC}"
  fi
  echo ""

  # ─── Run Type Check (with real-time output) ───────────────────────────────
  echo -e "${BLUE}[2/3] Running type check...${NC}"
  echo ""
  set +e
  npx tsc --noEmit 2>&1 | tee "$TYPECHECK_LOG"
  typecheck_exit=${PIPESTATUS[0]}
  set -e

  # Check if the error is due to stale .next types
  if [[ $typecheck_exit -ne 0 ]] && grep -q "\.next/types/.*Cannot find module.*src/app/.*page\.js" "$TYPECHECK_LOG"; then
    echo -e "${YELLOW}⚠ Detected stale .next types. Cleaning and retrying...${NC}"
    rm -rf .next
    echo ""
    set +e
    npx tsc --noEmit 2>&1 | tee "$TYPECHECK_LOG"
    typecheck_exit=${PIPESTATUS[0]}
    set -e
  fi

  echo ""
  if [[ $typecheck_exit -eq 0 ]]; then
    echo -e "${GREEN}✓ Type check passed${NC}"
  else
    echo -e "${RED}✗ Type check failed (exit code: $typecheck_exit)${NC}"
  fi
  echo ""

  # ─── Run Tests (with real-time output) ────────────────────────────────────
  echo -e "${BLUE}[3/3] Running tests...${NC}"
  echo ""
  set +e
  npm run test -- --run 2>&1 | tee "$TEST_LOG"
  test_exit=${PIPESTATUS[0]}
  set -e
  echo ""
  if [[ $test_exit -eq 0 ]]; then
    echo -e "${GREEN}✓ Tests passed${NC}"
  else
    echo -e "${RED}✗ Tests failed (exit code: $test_exit)${NC}"
  fi
  echo ""

  # All passed?
  if [[ $lint_exit -eq 0 ]] && [[ $typecheck_exit -eq 0 ]] && [[ $test_exit -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  All checks passed! Ready to push.${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    exit 0
  fi

  # ─── Failure Handling ─────────────────────────────────────────────────────

  echo ""
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}  Pre-push checks failed!${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo ""

  # Errors already shown in real-time above

  # Check if we're in an AI agent environment
  if is_ai_agent; then
    echo -e "${YELLOW}Running in AI agent environment.${NC}"
    echo -e "${YELLOW}Please fix the errors shown above.${NC}"
    exit 1
  fi

  # Check if claude CLI is available
  if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}Claude CLI not found. Please fix errors manually.${NC}"
    exit 1
  fi

  if [[ "$auto_fix" == true ]]; then
    echo -e "${BLUE}Auto-fix mode enabled. Starting Claude...${NC}"
  else
    echo -e "${YELLOW}Would you like Claude to fix these issues? [y/N]${NC}"
    read -r -t 30 response || response="n"
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
      echo "Aborted. Please fix errors manually."
      exit 1
    fi
  fi

  # Build the fix prompt using captured log files
  local fix_prompt="Pre-push checks failed. Please fix the following issues:\n\n"

  if [[ $lint_exit -ne 0 ]]; then
    fix_prompt+="## Lint Errors\n\`\`\`\n$(cat "$LINT_LOG" | tail -100)\n\`\`\`\n\n"
  fi

  if [[ $typecheck_exit -ne 0 ]]; then
    fix_prompt+="## Type Check Errors\n\`\`\`\n$(cat "$TYPECHECK_LOG" | tail -100)\n\`\`\`\n\n"
  fi

  if [[ $test_exit -ne 0 ]]; then
    fix_prompt+="## Test Failures\n\`\`\`\n$(cat "$TEST_LOG" | tail -100)\n\`\`\`\n\n"
  fi

  fix_prompt+="After fixing all issues, run the checks again to verify, then push the changes."

  echo -e "${BLUE}Starting Claude to fix issues...${NC}"
  echo ""

  # Run claude with the fix prompt
  claude -p "$fix_prompt"

  echo ""
  echo -e "${GREEN}Claude has attempted to fix the issues.${NC}"
  echo -e "${YELLOW}Please review the changes and run 'git push' again.${NC}"
  exit 1
}

main "$@"

