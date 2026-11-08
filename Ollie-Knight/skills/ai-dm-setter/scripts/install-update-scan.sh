#!/bin/bash
# Installs the LaunchAgent that runs scripts/update-scan.mjs on a schedule.
#
#   scripts/install-update-scan.sh            weekly, Monday 07:30 local time
#   scripts/install-update-scan.sh daily      every day at 07:30 local time
#   scripts/install-update-scan.sh weekly --no-apply
#                                             anything after the schedule is passed to the scan
#
# Running it again replaces the installed schedule.
set -euo pipefail

LABEL="com.ainable.setter.update-scan"
SCHEDULE="${1:-weekly}"
if [ $# -gt 0 ]; then shift; fi

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$PROJECT/scripts/update-scan.mjs"
WATCH="$PROJECT/research/colddms/watch"
LOG="$WATCH/launchd.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CLAUDE_DIR="$HOME/.local/bin"

NODE="$(command -v node || true)"
if [ -z "$NODE" ] && [ -x /usr/local/bin/node ]; then NODE=/usr/local/bin/node; fi
if [ -z "$NODE" ]; then echo "node was not found on PATH" >&2; exit 1; fi
NODE_DIR="$(dirname "$NODE")"
if [ ! -f "$SCRIPT" ]; then echo "missing $SCRIPT" >&2; exit 1; fi
if [ ! -x "$CLAUDE_DIR/claude" ]; then echo "warning: no claude CLI at $CLAUDE_DIR/claude, the scan will detect changes but cannot apply them" >&2; fi

case "$SCHEDULE" in
  weekly) WHEN="    <key>Weekday</key><integer>1</integer>
    <key>Hour</key><integer>7</integer>
    <key>Minute</key><integer>30</integer>"; SAY="weekly, Monday 07:30" ;;
  daily) WHEN="    <key>Hour</key><integer>7</integer>
    <key>Minute</key><integer>30</integer>"; SAY="daily, 07:30" ;;
  *) echo "usage: $0 [weekly|daily] [extra scan flags]" >&2; exit 2 ;;
esac

EXTRA=""
for a in "$@"; do EXTRA="$EXTRA
    <string>$a</string>"; done

mkdir -p "$WATCH" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$SCRIPT</string>$EXTRA
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$CLAUDE_DIR:$NODE_DIR:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
$WHEN
  </dict>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_END

plutil -lint "$PLIST" >/dev/null

DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "Installed and loaded: $LABEL ($SAY${*:+, extra flags: $*})"
  echo "  plist: $PLIST"
  echo "  log:   $LOG"
  echo "  run now: launchctl kickstart $DOMAIN/$LABEL"
else
  echo "The plist was written but launchd did not load it: $PLIST" >&2
  exit 1
fi
