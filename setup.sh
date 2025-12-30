#!/bin/bash

# Nebula Browser Setup Script
# This script installs dependencies and fixes Electron sandbox permissions

echo "========================================="
echo "  Nebula Browser Setup Script"
echo "========================================="
echo ""

# Navigate to the project directory
cd "$(dirname "$0")"

# Run npm install
echo "[1/2] Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ npm install failed!"
    exit 1
fi

echo ""
echo "[2/2] Fixing Electron sandbox permissions..."
echo "This requires root access. You may be prompted for your password."
echo ""

# Fix chrome-sandbox permissions
SANDBOX_PATH="./node_modules/electron/dist/chrome-sandbox"

if [ -f "$SANDBOX_PATH" ]; then
    sudo chown root:root "$SANDBOX_PATH"
    sudo chmod 4755 "$SANDBOX_PATH"
    
    if [ $? -eq 0 ]; then
        echo "✅ Sandbox permissions fixed successfully!"
        echo ""
        echo "========================================="
        echo "  Setup complete! Run 'npm start' to launch Nebula"
        echo "========================================="
    else
        echo "❌ Failed to set sandbox permissions."
        echo "   Try running manually:"
        echo "   sudo chown root:root $SANDBOX_PATH && sudo chmod 4755 $SANDBOX_PATH"
        exit 1
    fi
else
    echo "❌ chrome-sandbox not found at $SANDBOX_PATH"
    echo "   Make sure npm install completed successfully."
    exit 1
fi
