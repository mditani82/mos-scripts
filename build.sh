#!/bin/bash
# Builds dist/ : the Chrome Web Store upload (manifest "key" removed) and the helper download.
set -euo pipefail
cd "$(dirname "$0")"
V=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
rm -rf dist && mkdir -p dist
T=$(mktemp -d)
cp -R extension "$T/"
rm -f "$T/extension/icons/icon.svg"
python3 - "$T/extension/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m.pop('key', None)
json.dump(m, open(sys.argv[1], 'w'), indent=2)
PY
(cd "$T/extension" && zip -qrX "$OLDPWD/dist/mos-scripts-extension-$V.zip" . -x '.*')
mkdir "$T/mos-scripts-helper"
cp host.py install.sh uninstall.sh README.md "$T/mos-scripts-helper/"
(cd "$T" && zip -qrX "$OLDPWD/dist/mos-scripts-helper-$V.zip" mos-scripts-helper)
rm -rf "$T"
ls -la dist
