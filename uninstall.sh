#!/bin/bash
# Removes the Mo's Scripts helper registration. Pass --all to also delete saved scripts and logs.
for b in "Google/Chrome" "Chromium" "BraveSoftware/Brave-Browser" "Microsoft Edge" "Arc/User Data"; do
  rm -f "$HOME/Library/Application Support/$b/NativeMessagingHosts/com.local.runsh.json"
done
if [ "${1:-}" = "--all" ]; then
  rm -rf "$HOME/.mos-scripts"
  echo "Removed the helper and all saved data."
else
  echo "Removed the helper. Your saved scripts and logs are still in ~/.mos-scripts (run with --all to delete them)."
fi
