# Big Picture Mode - Steam Deck & Controller UI

Nebula Browser includes a **Big Picture Mode** - a controller-friendly, console-style interface designed for Steam Deck, handheld devices, and living room setups.

## Features

### 🎮 Controller Support
- **Full gamepad navigation** - Use D-pad or left stick to navigate
- **Button mapping**:
  - **A / Cross** - Select/Activate
  - **B / Circle** - Go Back
  - **Y / Triangle** - Quick Search
  - **Start** - Toggle Settings
- **Audio feedback** for navigation

### 📱 Optimized for Steam Deck
- **1280x800 native resolution** support
- Automatic detection of Steam Deck screens
- Large touch-friendly UI elements
- Fullscreen immersive experience

### 🎨 Modern Console-Style UI
- Inspired by Steam OS Big Picture and Xbox Dashboard
- Smooth animations and transitions
- Glowing focus indicators
- Dark theme optimized for OLED displays

### ⌨️ On-Screen Keyboard
- Built-in virtual keyboard for controller input
- URL and search input support
- Special keys for common domains (.com, .org, etc.)

## How to Access

### From Desktop Mode
1. **Menu Button (☰)** → Click **"🎮 Big Picture Mode"**
2. **Settings** → **General** → Click **"Launch Big Picture Mode"**

### Keyboard Shortcut
- Press `F11` while in Big Picture Mode to toggle fullscreen

### Automatic Detection
If Nebula detects a Steam Deck-sized display (1280x800), it will suggest Big Picture Mode in settings.

### Auto-start in SteamOS Gaming Mode
When Nebula is launched from SteamOS **Gaming Mode** (gamescope / Steam gamepad UI), it will automatically start in **Big Picture Mode**.

You can override this behavior:
- Force Big Picture at launch: launch options `--big-picture` (or `--bigpicture`)
- Disable Big Picture auto-start: launch options `--no-big-picture` (or `--no-bigpicture`)
- Environment overrides: `NEBULA_BIG_PICTURE=1` / `NEBULA_NO_BIG_PICTURE=1`

## Navigation Sections

| Section | Description |
|---------|-------------|
| **Home** | Quick access sites, search, and recent browsing |
| **Bookmarks** | Your saved websites in a tile grid |
| **History** | Recently visited sites |
| **Downloads** | Downloaded files |
| **NeBot AI** | Launch the AI assistant |
| **Settings** | Theme, privacy, and display options |

## Controller Button Reference

| Button | Action |
|--------|--------|
| D-Pad / Left Stick | Navigate between elements |
| A / Cross | Select focused element |
| B / Circle | Go back / Close menu |
| Y / Triangle | Open search (on-screen keyboard) |
| Start | Open/Close settings |
| LB/RB | Scroll horizontally |

## Exiting Big Picture Mode

- Press the **Exit** button in the top-right corner
- Go to **Settings** → **Desktop Mode**
- Press `Escape` key multiple times

## Technical Details

### Files
- `renderer/bigpicture.html` - Main HTML structure
- `renderer/bigpicture.css` - Console-optimized styles
- `renderer/bigpicture.js` - Controller handling and navigation

### Screen Detection
Big Picture Mode is suggested for displays matching:
- Steam Deck resolution: 1280×800
- Screens smaller than 1366px width
- 16:10 or 16:9 aspect ratios

### API
```javascript
// Check if Big Picture Mode is recommended
const suggested = await window.bigPictureAPI.isSuggested();

// Get screen information
const info = await window.bigPictureAPI.getScreenInfo();

// Launch Big Picture Mode
await window.bigPictureAPI.launch();

// Exit Big Picture Mode
await window.bigPictureAPI.exit();
```

## Customization

The Big Picture Mode respects your theme settings. Colors are applied from your selected theme:
- Background colors
- Accent and primary colors  
- Text colors

## Known Limitations

- Some complex web forms may be difficult to navigate with controller only
- Video players use native controls
- Right-click context menus require mouse/touch

## Future Improvements

- [ ] Rumble/haptic feedback for compatible controllers
- [ ] Voice search integration with NeBot
- [ ] Picture-in-picture mode for videos
- [ ] Game overlay mode
- [ ] Custom controller mappings
