# Mo's Scripts

Save your shell scripts once, then run, stop and watch them from the Chrome toolbar.

Chrome extensions can't run programs on their own, so Mo's Scripts comes in two parts:

1. **The extension**, from the Chrome Web Store.
2. **The helper**, a small Python program on your Mac that actually runs your scripts. Install it once.

## Install the helper (macOS)

1. Download `mos-scripts-helper-<version>.zip` from the [latest release](https://github.com/mditani82/mos-scripts/releases/latest) and unzip it.
2. In Terminal:
   ```
   cd ~/Downloads/mos-scripts-helper
   ./install.sh
   ```
3. Reopen the extension popup.

Needs Python 3.8+. Most Macs have it; if not, run `xcode-select --install` or `brew install python`.
Works with Chrome, Chromium, Brave, Edge and Arc.

## Using it

- **+** adds a script: give it an optional alias, then pick the `.sh` file.
- **Search** by alias or path. Use ↑ ↓ to select and Enter to run.
- **Click a row** to see its path and output (live while it runs).
- **▶** runs, **Stop** stops. ✎ renames, ✕ removes from the list (your file is never touched).
- Scripts in a `/prod/` or `/production/` folder are marked **PROD** and need a second click to run.
- Scripts still running after 10 seconds (tunnels, servers) keep running in the background until you press Stop.

Scripts run in their own folder, with your login shell's PATH. They can't ask for input (passwords, MFA codes, y/n prompts).

## Where things live

Everything stays on your Mac, in `~/.mos-scripts/`:

- `scripts.json`: your saved scripts
- `logs/<alias>.log`: output of each script's last run

## Uninstall

```
./uninstall.sh          # remove the helper, keep your saved scripts
./uninstall.sh --all    # remove everything
```
Then remove the extension from `chrome://extensions`.

## Security

The extension can only refer to scripts by alias. A script's path can only be set through the macOS file dialog, so
neither the extension nor any website can make the helper run a file you didn't pick yourself.
