#!/bin/bash
# =============================================================================
# NEBULA BROWSER - Steam Deck / SteamOS Launch Script
# =============================================================================
# This script is designed for launching Nebula on Steam Deck in Game Mode.
# It sets necessary environment variables to disable Steam's mouse/keyboard
# emulation so the app's native controller support works properly.
#
# Usage:
#   1. Add Nebula as a Non-Steam game (or via Steamworks)
#   2. Set launch options to: ./start-steamdeck.sh
#   OR
#   3. Use this script's environment variables in Steam Launch Options:
#      SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0 %command% --big-picture
# =============================================================================

cd "$(dirname "$0")"

# =============================================================================
# STEAM INPUT CONFIGURATION
# =============================================================================
# These variables tell Steam's input layer that this app handles controller
# input natively and should NOT have mouse/keyboard emulation applied.

# Disable Steam's virtual gamepad layer
export SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0
export STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD=0

# Allow raw gamepad access
export SDL_GAMECONTROLLER_IGNORE_DEVICES=""

# Allow background gamepad events (useful when app doesn't have focus)
export SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS=1

# Hint to SDL that we're using gamepads natively
export SDL_GAMECONTROLLERCONFIG="${SDL_GAMECONTROLLERCONFIG:-}"

# =============================================================================
# NEBULA CONFIGURATION
# =============================================================================

# Enable Big Picture Mode for controller-friendly UI
export NEBULA_BIG_PICTURE=1

# Enable GPU acceleration on Linux
export NEBULA_GPU_ALLOW_LINUX=1

# =============================================================================
# LAUNCH
# =============================================================================

# Check if we're in an AppImage/AppDir or dev environment
if [ -f "./nebula" ]; then
    # Packaged AppDir
    exec ./nebula --big-picture "$@"
elif [ -f "./Nebula" ]; then
    # Alternate launcher name
    exec ./Nebula --big-picture "$@"
elif command -v npm &> /dev/null && [ -f "package.json" ]; then
    # Development environment
    npm start -- --big-picture "$@"
else
    echo "Error: Could not find Nebula executable or npm"
    echo "Make sure you're running this script from the Nebula directory"
    exit 1
fi
