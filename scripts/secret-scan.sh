#!/usr/bin/env bash
#
# Scans the working tree and the entire git history for committed credentials.
#
# Zero dependencies on purpose: this runs the same way locally and in CI, and needs no
# third-party action or license. Only file locations are printed — never the matched
# text — so a finding cannot leak the secret into a CI log.
#
# Usage:
#   bash scripts/secret-scan.sh                 # scan everything
#   bash scripts/secret-scan.sh --no-history    # working tree only (faster)
#
# Exits non-zero if anything is found.

set -uo pipefail

SCAN_HISTORY=1
for arg in "$@"; do
  case "$arg" in
    --no-history) SCAN_HISTORY=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# High-signal patterns only. Deliberately excludes vague rules like "any 32-char string",
# which produce false positives in bundled JavaScript and package lockfiles.
PATTERNS=(
  'ghp_[A-Za-z0-9]{36}'                     # GitHub classic personal access token
  'github_pat_[A-Za-z0-9_]{22,}'            # GitHub fine-grained personal access token
  'gh[osu]_[A-Za-z0-9]{36}'                 # GitHub OAuth / app / server-to-server tokens
  'AKIA[0-9A-Z]{16}'                        # AWS access key id
  'ASIA[0-9A-Z]{16}'                        # AWS temporary access key id
  'xox[baprs]-[A-Za-z0-9-]{10,}'            # Slack token
  'sk-[A-Za-z0-9]{32,}'                     # OpenAI-style API key
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'      # private key material
)

status=0

report() {
  local scope="$1" pattern="$2" locations="$3"
  echo "::error::Potential credential in ${scope} (pattern: ${pattern})"
  echo "$locations" | sed 's/^/    /'
  status=1
}

echo "Scanning tracked files for ${#PATTERNS[@]} credential patterns..."

# --- 1. The working tree (files as committed/checked out) ---------------------
for pattern in "${PATTERNS[@]}"; do
  # -I skips binary files; -l for history, -n here so findings point at a line.
  hits="$(git grep -I -n -E -e "$pattern" -- . 2>/dev/null | cut -d: -f1,2 || true)"
  if [ -n "$hits" ]; then
    report "the working tree" "$pattern" "$hits"
  fi
done

# --- 2. Every blob in history -------------------------------------------------
# A credential that was committed once and deleted later is still compromised, so
# history is scanned too. This passes every commit as an argument, which is fine for
# a repository of this size; a much larger history would want `git log -p` streaming.
if [ "$SCAN_HISTORY" -eq 1 ]; then
  commits="$(git rev-list --all || true)"
  if [ -n "$commits" ]; then
    echo "Scanning $(echo "$commits" | wc -l | tr -d ' ') commits in history..."
    for pattern in "${PATTERNS[@]}"; do
      hits="$(git grep -I -l -E -e "$pattern" $commits -- . 2>/dev/null | sort -u || true)"
      if [ -n "$hits" ]; then
        report "git history" "$pattern" "$(echo "$hits" | head -n 10)"
      fi
    done
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "✅ No credentials found."
else
  echo ""
  echo "❌ Potential credentials found. If any of these is real, revoke it immediately —"
  echo "   removing it from the code does not invalidate it. Rotate first, then rewrite history."
fi

exit "$status"
