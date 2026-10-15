#!/bin/bash
# Installs the Mo's Scripts helper (native messaging host) on macOS.
# It copies host.py to ~/.mos-scripts and registers it with Chrome, Chromium, Brave, Edge and Arc.
set -euo pipefail

STORE_ID="glfihgedpplinlcjjkgfngnfjdcppmal"            # Chrome Web Store item ID, shown in the developer dashboard
DEV_ID="pebcfenhbfgegpgbhnlonjjfklceknef"   # unpacked development build

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.mos-scripts"

[ "$(uname)" = Darwin ] || { echo "Mo's Scripts currently supports macOS only."; exit 1; }

PY=""
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [ -x "$p" ] && "$p" -c 'import sys; assert sys.version_info >= (3, 8)' 2>/dev/null; then PY="$p"; break; fi
done
if [ -z "$PY" ]; then
  echo "Python 3.8 or newer is required. Install it with:  xcode-select --install   (or: brew install python)"
  exit 1
fi

mkdir -p "$DEST"
if [ "$SRC" != "$DEST" ]; then
  # Carry over saved scripts and logs from an older install that lived next to this file.
  for f in scripts.json running.json logs; do
    if [ -e "$SRC/$f" ] && [ ! -e "$DEST/$f" ]; then cp -R "$SRC/$f" "$DEST/"; fi
  done
  { echo "#!$PY"; tail -n +2 "$SRC/host.py"; } > "$DEST/host.py"
fi
chmod +x "$DEST/host.py"

ORIGINS="\"chrome-extension://$DEV_ID/\""
[ "$STORE_ID" != "REPLACE_WITH_STORE_ID" ] && ORIGINS="$ORIGINS, \"chrome-extension://$STORE_ID/\""
JSON="{\"name\":\"com.local.runsh\",\"description\":\"Mo's Scripts helper\",\"path\":\"$DEST/host.py\",\"type\":\"stdio\",\"allowed_origins\":[$ORIGINS]}"

for b in "Google/Chrome" "Chromium" "BraveSoftware/Brave-Browser" "Microsoft Edge" "Arc/User Data"; do
  dir="$HOME/Library/Application Support/$b/NativeMessagingHosts"
  [ -d "$(dirname "$dir")" ] || [ "$b" = "Google/Chrome" ] || continue
  mkdir -p "$dir"
  echo "$JSON" > "$dir/com.local.runsh.json"
  echo "Registered with: $b"
done
echo "Installed to $DEST (Python: $PY). Reopen the extension popup to start."
