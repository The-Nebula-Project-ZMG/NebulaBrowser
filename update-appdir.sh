#!/bin/bash
# Update nebula-appdir with local source changes
# Run this after making changes to sync them to the AppDir

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPDIR_ROOT="$SCRIPT_DIR/nebula-appdir"
# Support both layouts:
# 1) nebula-appdir/resources/app
# 2) nebula-appdir/nebula-appdir/resources/app (example layout)
if [ -d "$APPDIR_ROOT/resources" ] || [ -f "$APPDIR_ROOT/resources/app.asar" ]; then
    RESOURCES_DIR="$APPDIR_ROOT/resources"
else
    RESOURCES_DIR="$APPDIR_ROOT/nebula-appdir/resources"
fi
APP_DIR="$RESOURCES_DIR/app"
ASAR_FILE="$RESOURCES_DIR/app.asar"
ASAR_ORIG_FILE="$RESOURCES_DIR/app.asar.orig"

echo "🚀 Updating Nebula AppDir..."
echo "   Source: $SCRIPT_DIR"
echo "   Target: $APP_DIR"
echo ""

# Check if target exists (or extract from app.asar if present)
if [ ! -d "$APP_DIR" ]; then
    if [ -f "$ASAR_FILE" ] || [ -f "$ASAR_ORIG_FILE" ]; then
        if command -v npx &> /dev/null; then
            if [ -f "$ASAR_FILE" ]; then
                echo "ℹ️  app.asar detected. Extracting to $APP_DIR..."
                (cd "$RESOURCES_DIR" && npx asar extract "app.asar" "app")
                mv "$ASAR_FILE" "$ASAR_ORIG_FILE" 2>/dev/null || true
            else
                echo "ℹ️  app.asar.orig detected. Extracting to $APP_DIR..."
                (cd "$RESOURCES_DIR" && npx asar extract "app.asar.orig" "app")
            fi
        else
            echo "❌ Error: $APP_DIR not found and npx is not available to extract app.asar."
            echo "   Install Node.js/npm, then run:"
            echo "   cd $RESOURCES_DIR && npx asar extract app.asar app"
            exit 1
        fi
    else
        echo "❌ Error: AppDir not found at $APP_DIR"
        exit 1
    fi
fi

# Files to sync (main app files)
FILES=(
    "main.js"
    "preload.js"
    "package.json"
    "portable-data.js"
    "gpu-config.js"
    "gpu-fallback.js"
    "performance-monitor.js"
    "plugin-manager.js"
    "theme-manager.js"
    "bookmarks.json"
)

# Directories to sync
DIRS=(
    "renderer"
    "themes"
    "assets"
    "plugins"
    "documentation"
)

# Sync individual files
echo "📄 Syncing files..."
for file in "${FILES[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        cp "$SCRIPT_DIR/$file" "$APP_DIR/$file"
        echo "   ✓ $file"
    else
        echo "   ⚠ $file (not found, skipping)"
    fi
done

# Update main launcher scripts if present
echo ""
echo "🔄 Syncing launcher scripts..."
for launcher in "Nebula-Desktop" "Nebula-Controller"; do
    if [ -f "$SCRIPT_DIR/nebula-appdir/$launcher" ]; then
        cp "$SCRIPT_DIR/nebula-appdir/$launcher" "$APPDIR_ROOT/$launcher"
        chmod +x "$APPDIR_ROOT/$launcher" || true
        echo "   ✓ $launcher"
    fi
done
# Sync Nebula symlink if it exists
if [ -L "$SCRIPT_DIR/nebula-appdir/Nebula" ]; then
    rm -f "$APPDIR_ROOT/Nebula"
    ln -sf "Nebula-Desktop" "$APPDIR_ROOT/Nebula"
    echo "   ✓ Nebula (symlink)"
fi

# Sync directories
echo ""
echo "📁 Syncing directories..."
for dir in "${DIRS[@]}"; do
    if [ -d "$SCRIPT_DIR/$dir" ]; then
        # Use rsync if available, otherwise use cp
        if command -v rsync &> /dev/null; then
            rsync -a --delete "$SCRIPT_DIR/$dir/" "$APP_DIR/$dir/"
        else
            rm -rf "$APP_DIR/$dir"
            cp -r "$SCRIPT_DIR/$dir" "$APP_DIR/$dir"
        fi
        echo "   ✓ $dir/"
    else
        echo "   ⚠ $dir/ (not found, skipping)"
    fi
done

echo ""
echo "✅ AppDir updated successfully!"
echo ""
echo "To run Nebula, use:"
echo "   ./nebula-appdir/run-nebula.sh"
