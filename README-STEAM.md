Converting extracted AppImage (`squashfs-root`) into a distributable AppDir for Steam

If your environment lacks `rsync`, use `cp -a` to copy the extracted AppImage into a clean AppDir and prepare it for upload to Steam.

1) Copy the extracted AppImage to an AppDir folder
```bash
cp -a squashfs-root/ nebula-appdir
```

2) Unpack `app.asar` to edit or include app sources (optional; requires `npx asar`)
```bash
cd nebula-appdir/resources
npx asar extract app.asar app
# keep a backup if you want
mv app app.orig && rm app.asar
cd ../../
```

3) Add/verify launcher (we added `nebula-appdir/Nebula`):
```bash
chmod +x nebula-appdir/Nebula
```
Run locally:
```bash
cd nebula-appdir
./Nebula
```

4) Ensure binary & permissions are correct
```bash
chmod +x nebula-appdir/nebula
```

5) Package or upload to Steam
- Create a tarball to upload as game files, or upload the AppDir contents as the depot.
```bash
tar -czf nebula-appdir.tar.gz -C nebula-appdir .
```
- In Steamworks, set the launch command to `./Nebula` (or `./nebula`).

Notes
- `--no-sandbox` reduces Chromium sandboxing; prefer fixing `chrome-sandbox` and enabling sandboxing when possible.
- Using the AppDir avoids AppImage/FUSE dependency on target systems.
- Test on a clean SteamOS/Deck image before publishing.

Big Picture auto-start (SteamOS Gaming Mode)
- If Nebula is launched from SteamOS Gaming Mode, it will auto-start in Big Picture Mode.
- To force/disable via Steam Launch Options: `--big-picture` or `--no-big-picture`.

---

## Built-in Controller Support (Steam Deck / Game Mode)

Nebula has **native gamepad support** that signals to Steam that the application is consuming controller input. This prevents Steam from applying Desktop mouse/keyboard emulation when running in Game Mode.

### How It Works

Steam Deck only stops applying Desktop mouse emulation when:
1. The application actively reads controller/gamepad input, OR
2. Steam Input is enabled (which requires explicit configuration)

If an app does not read controller input at all, Steam assumes the user needs mouse emulation.

Nebula solves this by:
1. **Preload Gamepad Handler**: The preload script (`preload.js`) continuously polls `navigator.getGamepads()` from the moment any window loads. This signals to Steam that the app is consuming gamepad events and should not apply mouse emulation.
2. **Big Picture Mode**: Full controller-friendly UI with:
   - D-pad / Left stick: Navigate menus
   - A button: Select/activate
   - B button: Back
   - X button: Backspace (in keyboard)
   - Y button: Space / Open search
   - LB/RB: Navigate webview history
   - Right stick: Virtual cursor (in browse mode)
   - Triggers: Left/right click (in browse mode)
   - Start: Toggle settings/sidebar
   - Select: Toggle fullscreen webview

### Gamepad API (for Developers)

The gamepad handler exposes an API via `window.gamepadAPI`:

```javascript
// Check if gamepad handler is initialized
if (gamepadAPI.isAvailable()) {
  console.log('Gamepad handler is running');
}

// Check if a gamepad is connected
if (gamepadAPI.isConnected()) {
  console.log('Gamepad connected!');
}

// Get list of connected gamepads
const gamepads = gamepadAPI.getConnected();
// Returns: [{ id, index, mapping, buttons, axes }, ...]
console.log(gamepads);

// Get active gamepad's current state (buttons and axes)
const active = gamepadAPI.getActive();
if (active) {
  console.log('Active gamepad:', active.id);
  console.log('Buttons:', active.buttons);
  console.log('Axes:', active.axes);
}

// Get handler state for debugging
const state = gamepadAPI.getState();
console.log('Handler state:', state);
// Returns: { initialized, connectedCount, activeGamepadIndex, isPolling }

// Listen for gamepad events (via CustomEvent on window)
window.addEventListener('nebula-gamepad-button', (e) => {
  const { button, pressed, value } = e.detail;
  console.log(`Button ${button}: ${pressed ? 'pressed' : 'released'}`);
});

window.addEventListener('nebula-gamepad-connect', (e) => {
  console.log('Gamepad connected:', e.detail.id);
});

window.addEventListener('nebula-gamepad-disconnect', (e) => {
  console.log('Gamepad disconnected:', e.detail.id);
});

window.addEventListener('nebula-gamepad-axis', (e) => {
  const { axis, value } = e.detail;
  console.log(`Axis ${axis}: ${value}`);
});

// Enable debug logging
gamepadAPI.setDebug(true);
```

### Troubleshooting

If Steam is still applying mouse emulation:

1. **Configure Steam Input per-game** (most reliable fix):
   - **Windows / Desktop Steam UI**:
     - Library → right-click Nebula → Properties → **Controller**
     - Set **"Override for Nebula"** to **"Disable Steam Input"**
   - **Steam Deck / SteamOS Gaming Mode**:
     - Open Nebula → press the Steam button → **Controller Settings** (or the controller icon)
     - Set the layout to a **Gamepad** template (not “Keyboard/Mouse”), or disable Steam Input if the toggle is available
   - This stops Steam from translating controller input into keyboard/mouse events (“Desktop Layout” behavior).

   If you **don’t see a Controller tab** (common when the Steam entry is treated as an “application/tool”):
   - Use **Big Picture / Gaming Mode** and edit the **Controller Layout** for that specific entry.
   - Or change Steam’s global Desktop Layout: Steam → Settings → Controller → **Desktop Layout** → pick a gamepad-focused template or remove mouse/keyboard bindings.

2. **Verify gamepad polling is active**: Open DevTools (F12) and run `gamepadAPI.getState()` - check that `isPolling` is `true`
3. **Check gamepad connection**: Run `gamepadAPI.getConnected()` to see detected gamepads
4. **Press a button first**: On Linux, the `gamepadconnected` event may not fire until the first button press
5. **Enable debug mode**: Run `gamepadAPI.setDebug(true)` to see detailed logs
6. **Restart the app**: Close Nebula completely and relaunch from Steam

### Steam Launch Options

#### Windows

The `VAR=value %command%` syntax does **not** work on Windows. Use the Steam UI instead:

1. **Library** → right-click Nebula → **Properties** → **Controller** → set to **"Disable Steam Input"**
2. If no Controller tab exists, open Steam in **Big Picture Mode** → Nebula → **Manage Game** (gear) → **Controller Options** → **Disable Steam Input**

If you must use launch options on Windows, use this wrapper syntax:
```bat
cmd /c "set SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0 && %command%"
```

#### Linux / SteamOS / Steam Deck

Add these to your Steam launch options (Right-click game → Properties → Launch Options):

```bash
# Disable Steam Input completely (recommended for native controller support)
SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0 %command%

# Force native gamepad without Steam's emulation layer
STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD=0 %command%

# Combined - full native controller mode with Big Picture UI
SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0 STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD=0 %command% --big-picture

# If you need to debug controller issues
SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0 %command% --big-picture 2>&1 | tee ~/nebula-debug.log
```

### Steam Deck Recommended Setup

For the best experience on Steam Deck:

1. **Add Nebula as a Non-Steam Game** (if not using Steamworks version)
2. **Controller Settings**:
   - Right-click Nebula → Properties → Controller
   - Set to **"Disable Steam Input"** 
3. **Launch Options**:
   ```
   SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD=0 STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD=0 %command% --big-picture
   ```
4. **Shortcuts** (optional):
   - Configure gamepad shortcuts in Steam for Steam button actions (screenshots, etc.)

### Why This Is Needed

Steam Deck / SteamOS Game Mode applies "Desktop Configuration" mouse/keyboard emulation to apps that don't appear to handle controller input. Even though Nebula polls `navigator.getGamepads()` continuously, Steam's input layer initializes before the app can signal its intent.

The solution is two-fold:
1. **Environment variables** (`SDL_GAMECONTROLLER_*`) signal to Steam's SDL-based input layer early
2. **Steam Input settings** ("Disable Steam Input") bypasses the emulation entirely

### Shipping Defaults (Steamworks “Software/App” limitation)

If your Steamworks package is categorized as **Software/Application**, Steamworks may not expose per-title Steam Input configuration the way it does for games.

In that case:
- You generally **cannot force a global Steam Input toggle** for all users from Steamworks.
- The practical, shippable approach is to (a) **consume controller input natively** (Nebula does this via early Gamepad API polling) so Steam Deck/Game Mode backs off Desktop emulation, and (b) provide user-facing guidance for disabling Steam Input / choosing a Gamepad layout.

If you need Steam Input defaults controlled centrally, the usual path is to ask Valve Partner Support to enable the relevant Steam Input configuration for your App ID, or to re-categorize the title where appropriate.

### Force Big Picture Mode

```bash
# Via command line
./Nebula --big-picture

# Via environment
NEBULA_BIG_PICTURE=1 ./Nebula

# Disable Big Picture Mode  
./Nebula --no-big-picture
NEBULA_NO_BIG_PICTURE=1 ./Nebula
```
