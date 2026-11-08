#!/bin/bash
# Removes the LaunchAgent that runs the update scan. Scan state and logs stay.
set -euo pipefail

LABEL="com.ainable.setter.update-scan"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
rm -f "$PLIST"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "launchd still lists $LABEL, try: launchctl bootout $DOMAIN/$LABEL" >&2
  exit 1
fi
echo "Removed $LABEL. The scan no longer runs on a schedule."
echo "State and logs are kept in research/colddms/watch/."
