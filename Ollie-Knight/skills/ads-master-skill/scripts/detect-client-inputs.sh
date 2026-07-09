#!/usr/bin/env bash
# Detect which canonical inputs exist for a given client slug.
# Used by ads-master-skill Phase 1.
#
# Usage: ./detect-client-inputs.sh <slug>
# Output: a checklist to stdout, one line per input, with status + path(s).
#
# Detection is fuzzy: it tries the canonical filename first, then a list of
# fallback patterns. Many client folders use slightly different naming, so
# we look for what's semantically equivalent.

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client-slug>"
  exit 1
fi

SLUG="$1"
JARVIS_ROOT="${JARVIS_ROOT:-/Users/oliverknight/Jarvis}"
CLIENT_DIR="$JARVIS_ROOT/clients/$SLUG"
KB_DIR="$CLIENT_DIR/knowledge-base"

if [[ ! -d "$CLIENT_DIR" ]]; then
  echo "✗ Client folder not found: $CLIENT_DIR"
  exit 2
fi

echo "Detection report for client: $SLUG"
echo "Client folder: $CLIENT_DIR"
echo ""

# Find first matching file from a list of glob patterns.
# Skips files under swipe-file/ (competitor library) to avoid false matches.
# Patterns are tried in order.
find_first() {
  local hit
  for pattern in "$@"; do
    hit=$(find "$KB_DIR" -maxdepth 3 \( -name "$pattern" -o -iname "$pattern" \) \
            -not -path "*/swipe-file/*" -not -path "*/swipe/*" 2>/dev/null | head -1 || true)
    if [[ -n "$hit" ]]; then
      echo "$hit"
      return 0
    fi
  done
  return 1
}

# Find first matching directory.
find_first_dir() {
  local hit
  for pattern in "$@"; do
    hit=$(find "$KB_DIR" -maxdepth 2 -type d -name "$pattern" 2>/dev/null | head -1 || true)
    if [[ -n "$hit" ]]; then
      echo "$hit"
      return 0
    fi
  done
  return 1
}

check() {
  local label="$1"
  local blocking="$2"
  shift 2
  # remaining args = candidate patterns

  if found=$(find_first "$@"); then
    echo "✓ $label"
    echo "    → $found"
    return 0
  else
    if [[ "$blocking" == "BLOCKING" ]]; then
      echo "✗ $label  [BLOCKING — must resolve]"
    else
      echo "⚠ $label  [non-blocking — defaults will be used]"
    fi
    echo "    → tried: $*"
    return 1
  fi
}

echo "=== Voice (Phase 0) ==="
check "Voice asset" "BLOCKING" \
  "voice.md" "brand-voice.md" "*voice*.md" "*synthesis*.md" "*-voice*.md"

echo ""
echo "=== Discovery (Phase 1) ==="

# Offer: try generic names, then packages/ folder, then "offers" / "packages" / "products"
echo "Offer KB:"
if pkg_dir=$(find_first_dir "packages"); then
  echo "  ✓ packages/ folder found"
  echo "    → $pkg_dir"
  ls -1 "$pkg_dir"/*.md 2>/dev/null | sed 's|^|        |'
else
  check "  Offer KB" "BLOCKING" \
    "offer.md" "coaching-offers.md" "offers.md" "products.md" "*offer*.md"
fi

check "ICP / target persona" "BLOCKING" \
  "icp.md" "persona.md" "*icp*.md" "*persona*.md" "*ideal-customer*.md"

check "Funnel destination" "BLOCKING" \
  "funnel.md" "funnels.md" "*funnel*.md"

check "Top objections" "BLOCKING" \
  "objections.md" "*objection*.md"

check "Case studies" "non-blocking" \
  "client-case-studies.md" "case-studies.md" "*case-stud*.md"

# Swipe file is often a folder
echo "Swipe file:"
if swipe_dir=$(find_first_dir "swipe-file" "swipe"); then
  echo "  ✓ swipe corpus folder found"
  echo "    → $swipe_dir"
elif swipe_file=$(find_first "swipe-file.md" "*swipe*.md"); then
  echo "  ✓ swipe file found"
  echo "    → $swipe_file"
else
  echo "  ⚠ Swipe file  [non-blocking — can be refreshed via ads-research-skill]"
fi

check "Photo library metadata" "non-blocking" \
  "photo-library.md" "*photo-library*.md" "*photos*.md"

check "Creative brief" "non-blocking" \
  "creative-brief.md" "*creative*.md" "*briefing*.md"

check "Unique mechanisms" "non-blocking" \
  "unique-mechanisms*.md" "*mechanism*.md"

check "Synthesis / brand KB" "non-blocking" \
  "*synthesis*.md" "*brand-kb*.md"

check "Locale" "non-blocking" \
  "locale.md"

echo ""
echo "=== Existing batch folders ==="
ADS_DIR="$CLIENT_DIR/ads"
if [[ -d "$ADS_DIR" ]]; then
  echo "✓ Existing ads/ folder:"
  ls -1 "$ADS_DIR" 2>/dev/null | sed 's/^/    /'
else
  echo "ⓘ No previous ad batches for this client"
fi

echo ""
echo "Done."
