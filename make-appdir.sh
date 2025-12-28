#!/usr/bin/env bash
# Assemble nebula-appdir from extracted squashfs-root
set -euo pipefail
SRC="${1:-squashfs-root}"
DEST="${2:-nebula-appdir}"

if [ ! -d "$SRC" ]; then
  echo "Source $SRC not found. Extract the AppImage first (./dist/Nebula-*.AppImage --appimage-extract)"
  exit 1
fi

# Copy extracted contents into DEST
mkdir -p "$DEST"
cp -a "$SRC/." "$DEST/"

# Ensure launcher/binary exist
if [ -f "$DEST/run-nebula.sh" ]; then
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

# Fix permissions
chmod -R a+r "$DEST/usr/share/icons/hicolor/256x256/apps" || true
chmod +x "$DEST/Nebula" || true

echo "AppDir assembled at $DEST. Run with: $DEST/Nebula"