# GPU Fix Guide for Nebula Browser

## Common GPU Issues

Nebula Browser is an Electron-based application that uses Chromium's rendering engine. Some systems may experience GPU-related issues such as:
- Black/blank screens
- Webviews not loading content
- Flickering or visual artifacts
- Application crashes

## SteamOS / Steam Deck

### Symptoms
On SteamOS (Steam Deck), you may see:
- Browser chrome loads (tab bar, URL bar visible)
- Web page content area is completely black/empty
- No error messages visible

### Cause
This is caused by GPU compositing conflicts between Electron's Chromium renderer and Gamescope (Steam Deck's compositor). The AMD GPU in Steam Deck handles nested compositor contexts differently.

### Solution

**Automatic Detection (v1.3.3+)**
The latest version of Nebula automatically detects SteamOS/Gamescope and applies the necessary fixes in both development and packaged builds.

**For AppImage/Packaged Builds:**

If the automatic detection isn't working, you can launch the AppImage with flags:

```bash
# Run the AppImage with SteamOS flags
./Nebula-*.AppImage --ozone-platform=x11 --disable-gpu-compositing --disable-gpu-vsync --no-sandbox --disable-dev-shm-usage --disable-features=VizDisplayCompositor
```

**Create a custom .desktop file:**

Copy `nebula-steamos.desktop` to `~/.local/share/applications/` for a Steam Deck optimized launcher:
```bash
cp nebula-steamos.desktop ~/.local/share/applications/
```

**For Development:**
```bash
npm run start:steamos
```

**Environment Variable Override:**
You can force SteamOS mode by setting an environment variable:
```bash
export SteamDeck=1
./Nebula-*.AppImage
```

## Linux (General)

### Wayland
If running on a Wayland compositor (GNOME Wayland, KDE Wayland, Sway, etc.):
```bash
electron . --ozone-platform=wayland --enable-features=UseOzonePlatform,WaylandWindowDecorations
```

### X11
For X11 sessions:
```bash
electron . --ozone-platform=x11
```

### NVIDIA GPUs
If using NVIDIA proprietary drivers:
```bash
electron . --disable-gpu-sandbox --no-sandbox
```

## Windows

### Intel/AMD Integrated Graphics Issues
If experiencing blank screens on Windows with integrated graphics:
1. Try running with `start-gpu-safe.bat`
2. Update your graphics drivers
3. Disable hardware acceleration in settings (if available)

### Multiple GPU Systems
On laptops with both integrated and discrete GPUs:
- Right-click the Nebula shortcut
- Select "Run with graphics processor"
- Choose your dedicated GPU

## macOS

macOS typically has fewer GPU issues, but if problems occur:
```bash
electron . --disable-gpu
```

## Diagnostic Information

To see GPU information and diagnostics:
1. Open Nebula Browser
2. Navigate to `nebula://gpu` or `chrome://gpu`
3. Check the "Graphics Feature Status" section

## Reporting Issues

If none of the above solutions work, please report the issue with:
1. Operating system and version
2. GPU model and driver version
3. Contents of `chrome://gpu` page
4. Any error messages from terminal/console
