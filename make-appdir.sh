#!/usr/bin/env bash
# Assemble nebula-appdir from extracted squashfs-root
set -euo pipefail
SRC="${1:-squashfs-root}"
DEST="${2:-nebula-appdir}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$SRC" ]; then
  echo "Source $SRC not found. Extract the AppImage first (./dist/Nebula-*.AppImage --appimage-extract)"
  exit 1
fi

# Copy extracted contents into DEST
mkdir -p "$DEST"
cp -a "$SRC/." "$DEST/"

# Ensure launcher/binary exist (prefer extracted run-nebula.sh as fallback)
if [ -f "$DEST/run-nebula.sh" ] && [ ! -f "$DEST/Nebula" ]; then
  mv "$DEST/run-nebula.sh" "$DEST/Nebula" 2>/dev/null || true
fi
chmod +x "$DEST/Nebula" || true

# Ensure directories for icons and desktop entries
mkdir -p "$DEST/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$DEST/usr/share/applications"

# Copy icon if present at top level of extracted AppImage
if [ -f "$SRC/nebula.png" ]; then
  cp "$SRC/nebula.png" "$DEST/usr/share/icons/hicolor/256x256/apps/nebula.png"
fi

# Also embed project icon if present in repo assets
PROJECT_ICON="$(cd "$(dirname "$0")" && pwd)/assets/images/Logos/Nebula-Favicon.png"
if [ -f "$PROJECT_ICON" ]; then
  echo "Embedding project icon into AppDir: $PROJECT_ICON"
  cp "$PROJECT_ICON" "$DEST/usr/share/icons/hicolor/256x256/apps/nebula.png"
fi

# Install desktop file into AppDir
if [ -f "$DEST/nebula.desktop" ]; then
  cp "$DEST/nebula.desktop" "$DEST/usr/share/applications/nebula.desktop"
else
  cat > "$DEST/usr/share/applications/nebula.desktop" <<'EOF'
[Desktop Entry]
Name=Nebula
Comment=Nebula Browser
Exec=./Nebula %U
Terminal=false
Type=Application
Icon=nebula
Categories=Network;WebBrowser;
StartupWMClass=Nebula
EOF
fi

# Match appdir-example layout: extract app.asar to resources/app and keep app.asar.orig
if [ -f "$DEST/resources/app.asar" ]; then
  if command -v npx &> /dev/null; then
    echo "Extracting app.asar to resources/app (keeping app.asar.orig)"
    (cd "$DEST/resources" && npx asar extract "app.asar" "app")
    mv "$DEST/resources/app.asar" "$DEST/resources/app.asar.orig" 2>/dev/null || true
  else
    echo "Warning: npx not found; leaving app.asar in place."
  fi
fi

# Copy Linux launch wrappers if present in appdir-example
if [ -f "$SCRIPT_DIR/appdir-example/run-nebula.sh" ]; then
  cp "$SCRIPT_DIR/appdir-example/run-nebula.sh" "$DEST/run-nebula.sh"
  chmod +x "$DEST/run-nebula.sh" || true
fi
if [ -f "$SCRIPT_DIR/appdir-example/steam_appid.txt" ]; then
  cp "$SCRIPT_DIR/appdir-example/steam_appid.txt" "$DEST/steam_appid.txt"
fi
if [ -f "$SCRIPT_DIR/appdir-example/nebula.desktop" ]; then
  cp "$SCRIPT_DIR/appdir-example/nebula.desktop" "$DEST/nebula.desktop"
  cp "$SCRIPT_DIR/appdir-example/nebula.desktop" "$DEST/usr/share/applications/nebula.desktop"
fi
# Ensure root launchers exist (from example if needed)
if [ -f "$SCRIPT_DIR/appdir-example/Nebula-Desktop" ]; then
  cp "$SCRIPT_DIR/appdir-example/Nebula-Desktop" "$DEST/Nebula-Desktop"
  chmod +x "$DEST/Nebula-Desktop" || true
fi
if [ -f "$SCRIPT_DIR/appdir-example/Nebula-Controller" ]; then
  cp "$SCRIPT_DIR/appdir-example/Nebula-Controller" "$DEST/Nebula-Controller"
  chmod +x "$DEST/Nebula-Controller" || true
fi
# Fallback: create Nebula as symlink to Nebula-Desktop
if [ ! -f "$DEST/Nebula" ] && [ -f "$DEST/Nebula-Desktop" ]; then
  ln -sf "Nebula-Desktop" "$DEST/Nebula"
fi

# Fix permissions
chmod -R a+r "$DEST/usr/share/icons/hicolor/256x256/apps" || true
chmod +x "$DEST/Nebula" "$DEST/Nebula-Desktop" "$DEST/Nebula-Controller" || true

echo "AppDir assembled at $DEST."
echo "  Desktop mode:    $DEST/Nebula-Desktop"
echo "  Controller mode: $DEST/Nebula-Controller"
echo "  Default:         $DEST/Nebula (symlink to Nebula-Desktop)"