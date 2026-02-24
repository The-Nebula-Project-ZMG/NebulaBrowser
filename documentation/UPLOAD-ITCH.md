# Uploading releases to itch.io using Butler

This document explains how to prepare and upload Nebula releases to itch.io using Butler, covering macOS, Windows, and Linux.

## Overview

Butler (itch.io) is the recommended channel for distributing Nebula releases. The process is:

1. Build your platform-specific artifact.
2. Install and authenticate `butler`.
3. Push the build to your `username/game:channel` with `butler push`.

## Install Butler

- macOS / Linux / Windows: Download the appropriate Butler binary from the official itch.io Butler releases (follow the official docs). Unpack, make executable, and place it on your `PATH`.

Example (Linux/macOS):

```bash
# after downloading 'butler' binary
chmod +x butler
sudo mv butler /usr/local/bin/
```

On Windows, place `butler.exe` in a folder on `PATH` or use it directly from the build folder.

## Authenticate

Run:

```bash
butler login
```

This opens a browser-based authentication flow. Verify with:

```bash
butler whoami
```

If automation is required, consult the official Butler docs for API-key/token login options.

## Prepare platform artifacts

macOS
- Create a zip of your `.app` bundle (keep the `.app` as a top-level item inside the zip):

```bash
ditto -c -k --sequesterRsrc --keepParent MyApp.app MyApp-mac.zip
```

Windows
- Zip the folder containing your `.exe` and runtime files, or create an installer and zip the installer.

```powershell
Compress-Archive -Path .\build\MyApp\* -DestinationPath MyApp-windows.zip
```

Linux
- Create a tarball (or zip) of the Linux runtime files:

```bash
tar -czf MyApp-linux.tar.gz -C build/linux .
```

Note: ensure the main binary has executable permissions before archiving.

## Push to itch.io

Basic command:

```bash
butler push <path> <username>/<game>:<channel>
```

Examples:

```bash
# macOS build
butler push MyApp-mac.zip myuser/nebulabrowser:mac

# Windows build
butler push MyApp-windows.zip myuser/nebulabrowser:windows

# Linux build
butler push MyApp-linux.tar.gz myuser/nebulabrowser:linux
```

Set a release version for itch.io using `--userversion`:

```bash
butler push MyApp-mac.zip myuser/nebulabrowser:mac --userversion 1.2.3
```

## Recommended channel strategy

- `stable` or `default` — production releases
- `beta` — pre-release testing
- Use platform-specific channels (e.g., `mac`, `windows`, `linux`) if you want separate channels per OS

## Tips

- Keep artifacts small and platform-specific to reduce download size.
- Verify the upload with `butler whoami` and by visiting your game page on itch.io.
- When testing on macOS, notarization and Gatekeeper may affect distribution; provide clear install instructions on your itch page.

## Rollback

Butler supports pushing to a channel multiple times; the latest pushed build becomes the current for that channel. To revert, push a previous artifact or use the itch.io web UI to select a previous build.

## References

Consult the official Butler documentation for advanced usage (credentials, automated CI uploads, delta uploads, and platform-specific packaging recommendations).
