#!/bin/bash
# Run Nebula with portable data storage
# User data (cookies, history, bookmarks) is stored in usr/data/ alongside the app.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"

export APPDIR="$HERE"
export PATH="$HERE/usr/bin:$PATH"
export LD_LIBRARY_PATH="$HERE/usr/lib:$HERE/usr/lib64:$LD_LIBRARY_PATH"

# --- PORTABLE DATA CONFIGURATION ---
# Store user data in a local folder for portable operation
PORTABLE_DATA_DIR="$HERE/usr/data"
export NEBULA_PORTABLE=1
export NEBULA_PORTABLE_PATH="$PORTABLE_DATA_DIR"

# Create portable data directory with secure permissions if it doesn't exist
if [ ! -d "$PORTABLE_DATA_DIR" ]; then
	mkdir -p "$PORTABLE_DATA_DIR"
	chmod 700 "$PORTABLE_DATA_DIR"
fi

exec "$HERE/nebula-appdir/AppRun"
