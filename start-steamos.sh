#!/bin/bash
# SteamOS/Steam Deck launch script for Nebula Browser
# This script applies necessary flags for proper rendering on SteamOS/Gamescope

# Detect if running on SteamOS
if [ -f /etc/steamos-release ] || [ -f /usr/share/steamos/steamos.conf ]; then
    echo "SteamOS detected"
fi

# Detect if running under Gamescope (Steam Deck's compositor)
if [ -n "$GAMESCOPE_WAYLAND_DISPLAY" ] || [ -n "$SteamDeck" ]; then
    echo "Gamescope/Steam Deck environment detected"
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Launch Nebula with SteamOS-compatible flags
# These flags help with webview rendering issues on AMD GPUs under Gamescope
exec electron "$SCRIPT_DIR" \
    --ozone-platform=x11 \
    --disable-gpu-compositing \
    --disable-gpu-vsync \
    --disable-accelerated-2d-canvas \
    --use-gl=desktop \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu-sandbox \
    --disable-features=VizDisplayCompositor \
    --enable-unsafe-swiftshader \
    "$@"
