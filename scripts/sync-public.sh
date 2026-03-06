#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=sync-public.conf
source "${SCRIPT_DIR}/sync-public.conf"

# ── Helpers ─────────────────────────────────────────────────────────

log()  { echo "[sync] $*"; }
warn() { echo "[sync] WARNING: $*" >&2; }
die()  { echo "[sync] ERROR: $*" >&2; exit 1; }

# ── Validate ────────────────────────────────────────────────────────

[[ -d "${SOURCE_DIR}/skills" ]] || die "SOURCE_DIR is not a valid project: ${SOURCE_DIR}"
log "Source: ${SOURCE_DIR}"
log "Target: ${TARGET_DIR}"

# ── Prepare target ──────────────────────────────────────────────────

mkdir -p "${TARGET_DIR}"

# Clean synced content from target (preserve .git, docs, etc.)
log "Cleaning previous sync..."

# Build list of preserved paths for find exclusion
FIND_PRUNE=""
for p in "${PRESERVE_PATHS[@]+"${PRESERVE_PATHS[@]}"}"; do
  FIND_PRUNE="${FIND_PRUNE} -name ${p} -prune -o"
done

# Remove everything except preserved paths
cd "${TARGET_DIR}"
for item in *; do
  PRESERVED=false
  for p in "${PRESERVE_PATHS[@]+"${PRESERVE_PATHS[@]}"}"; do
    if [[ "$item" == "$p" ]]; then
      PRESERVED=true
      break
    fi
  done
  if [[ "$PRESERVED" == false ]]; then
    rm -rf "$item"
  fi
done
cd - > /dev/null

# ── Build rsync exclude list ────────────────────────────────────────

RSYNC_EXCLUDES=()
for p in "${EXCLUDE_PATHS[@]+"${EXCLUDE_PATHS[@]}"}"; do
  RSYNC_EXCLUDES+=(--exclude "$p")
done

# ── Copy files ──────────────────────────────────────────────────────

log "Copying files..."
rsync -a --delete-excluded \
  "${RSYNC_EXCLUDES[@]+"${RSYNC_EXCLUDES[@]}"}" \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"

# ── Verify: check for personal data leaks ───────────────────────────

log "Checking for personal data leaks..."
LEAKS=0

# Add patterns to check as the repo accumulates private data
# For now, check common PII patterns
for pattern in "/Users/rebeccaraebarton" "Popoloto"; do
  MATCHES=$(grep -r --include='*.py' --include='*.json' --include='*.html' --include='*.md' \
    "$pattern" "${TARGET_DIR}/skills" 2>/dev/null || true)
  if [[ -n "$MATCHES" ]]; then
    echo "  LEAK: '$pattern' found:"
    echo "$MATCHES" | head -5
    LEAKS=$((LEAKS + 1))
  fi
done

if [[ "$LEAKS" -gt 0 ]]; then
  die "$LEAKS personal data pattern(s) found in public repo — aborting"
fi
log "Clean — no personal data leaks detected"

# ── Summary ─────────────────────────────────────────────────────────

SKILL_COUNT=$(find "${TARGET_DIR}/skills" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
log "Done. ${SKILL_COUNT} skill(s) synced to ${TARGET_DIR}"
