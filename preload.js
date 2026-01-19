// preload.js - Optimized version
const { contextBridge, ipcRenderer } = require('electron');
let pathModule;
let fsModule;
try {
  pathModule = require('path');
  fsModule = require('fs');
} catch (err) {
  pathModule = null;
  fsModule = null;
}

// BrowserView tab id (desktop mode) injected via additionalArguments
let nebulaTabId = null;
try {
  const arg = (process?.argv || []).find(a => typeof a === 'string' && a.startsWith('--nebula-tab-id='));
  if (arg) nebulaTabId = arg.split('=')[1] || null;
} catch {}

// =============================================================================
// GAMEPAD HANDLER - Steam Deck / SteamOS Support
// =============================================================================
// This is CRITICAL for Steam Deck Game Mode: Steam only stops applying
// Desktop mouse emulation when the app actively reads controller input.
// By continuously polling navigator.getGamepads(), Steam recognizes that
// the app is consuming gamepad events and backs off the mouse emulation layer.
// =============================================================================

const gamepadState = {
  initialized: false,
  gamepads: {},
  connectedCount: 0,
  activeGamepadIndex: null,
  rafId: null,
  buttonStates: {},
  listeners: { connect: [], disconnect: [], button: [], axis: [], input: [] },
};

const GAMEPAD_CONFIG = {
  STICK_DEADZONE: 0.15,
  DEBUG: false,
};

function gamepadLog(...args) {
  if (GAMEPAD_CONFIG.DEBUG) {
    console.log('[NebulaGamepad]', ...args);
  }
}

function initGamepadHandler() {
  if (gamepadState.initialized) return;
  
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    console.warn('[NebulaGamepad] Gamepad API not available');
    return;
  }
  
  gamepadLog('Initializing gamepad handler');
  
  window.addEventListener('gamepadconnected', handleGamepadConnected);
  window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
  
  // Initial scan for already-connected gamepads
  scanGamepads();
  
  // Start polling loop - this is what tells Steam we're consuming gamepad input
  startGamepadPolling();
  
  gamepadState.initialized = true;
  console.log('[NebulaGamepad] Gamepad handler initialized - Steam will see controller input being consumed');
}

function handleGamepadConnected(event) {
  const gamepad = event.gamepad;
  gamepadLog('Gamepad connected:', gamepad.index, gamepad.id);
  
  gamepadState.gamepads[gamepad.index] = {
    id: gamepad.id,
    index: gamepad.index,
    connected: true,
    mapping: gamepad.mapping,
    timestamp: Date.now(),
  };
  gamepadState.connectedCount++;
  
  if (gamepadState.activeGamepadIndex === null) {
    gamepadState.activeGamepadIndex = gamepad.index;
  }
  
  gamepadState.buttonStates[gamepad.index] = {};
  emitGamepadEvent('connect', { gamepad, index: gamepad.index, id: gamepad.id });
}

function handleGamepadDisconnected(event) {
  const gamepad = event.gamepad;
  gamepadLog('Gamepad disconnected:', gamepad.index, gamepad.id);
  
  if (gamepadState.gamepads[gamepad.index]) {
    delete gamepadState.gamepads[gamepad.index];
    gamepadState.connectedCount--;
  }
  
  delete gamepadState.buttonStates[gamepad.index];
  
  if (gamepadState.activeGamepadIndex === gamepad.index) {
    gamepadState.activeGamepadIndex = null;
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        gamepadState.activeGamepadIndex = i;
        break;
      }
    }
  }
  
  emitGamepadEvent('disconnect', { index: gamepad.index, id: gamepad.id });
}

function scanGamepads() {
  const gamepads = navigator.getGamepads();
  for (let i = 0; i < gamepads.length; i++) {
    const gamepad = gamepads[i];
    if (gamepad && !gamepadState.gamepads[gamepad.index]) {
      gamepadLog('Found pre-connected gamepad:', gamepad.index, gamepad.id);
      gamepadState.gamepads[gamepad.index] = {
        id: gamepad.id,
        index: gamepad.index,
        connected: true,
        mapping: gamepad.mapping,
        timestamp: Date.now(),
      };
      gamepadState.connectedCount++;
      if (gamepadState.activeGamepadIndex === null) {
        gamepadState.activeGamepadIndex = gamepad.index;
      }
      gamepadState.buttonStates[gamepad.index] = {};
    }
  }
}

function startGamepadPolling() {
  if (gamepadState.rafId !== null) return;
  
  function pollLoop(timestamp) {
    // CRITICAL: This call to getGamepads() tells Steam we're consuming gamepad input
    const gamepads = navigator.getGamepads();
    
    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i];
      if (gamepad) {
        processGamepadInput(gamepad);
      }
    }
    
    // Periodic scan for newly connected gamepads
    if (timestamp % 1000 < 20) {
      scanGamepads();
    }
    
    gamepadState.rafId = requestAnimationFrame(pollLoop);
  }
  
  gamepadState.rafId = requestAnimationFrame(pollLoop);
  gamepadLog('Started gamepad polling');
}

function processGamepadInput(gamepad) {
  const index = gamepad.index;
  const buttonState = gamepadState.buttonStates[index] || {};
  let hasInput = false;
  
  // Process buttons
  for (let i = 0; i < gamepad.buttons.length; i++) {
    const button = gamepad.buttons[i];
    const wasPressed = buttonState[`b${i}`] || false;
    const isPressed = button.pressed || button.value > 0.5;
    
    if (isPressed !== wasPressed) {
      buttonState[`b${i}`] = isPressed;
      hasInput = true;
      emitGamepadEvent('button', { gamepad, index, button: i, pressed: isPressed, value: button.value });
    }
  }
  
  // Process axes
  for (let i = 0; i < gamepad.axes.length; i++) {
    const value = gamepad.axes[i];
    const prevValue = buttonState[`a${i}`] || 0;
    
    if (Math.abs(value - prevValue) > 0.01) {
      buttonState[`a${i}`] = value;
      if (Math.abs(value) > GAMEPAD_CONFIG.STICK_DEADZONE) {
        hasInput = true;
        emitGamepadEvent('axis', { gamepad, index, axis: i, value });
      }
    }
  }
  
  gamepadState.buttonStates[index] = buttonState;
  
  if (hasInput) {
    emitGamepadEvent('input', { gamepad, index });
  }
}

function emitGamepadEvent(type, data) {
  // Dispatch as CustomEvent for renderer scripts to listen to
  try {
    window.dispatchEvent(new CustomEvent(`nebula-gamepad-${type}`, { detail: data }));
  } catch (err) {
    // Ignore errors if CustomEvent isn't available
  }
}

function getActiveGamepad() {
  if (gamepadState.activeGamepadIndex === null) return null;
  const gamepads = navigator.getGamepads();
  return gamepads[gamepadState.activeGamepadIndex] || null;
}

function getConnectedGamepads() {
  const gamepads = navigator.getGamepads();
  return Array.from(gamepads).filter(gp => gp !== null);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (gamepadState.rafId !== null) {
    cancelAnimationFrame(gamepadState.rafId);
    gamepadState.rafId = null;
  }
});

// =============================================================================
// EARLY GAMEPAD INITIALIZATION - Critical for Steam Deck
// =============================================================================
// Initialize gamepad polling as EARLY as possible to signal Steam Input
// that this app handles controller input natively. This MUST happen before
// Steam decides to apply mouse/keyboard emulation.
// 
// We try to initialize immediately when preload runs, not waiting for DOMContentLoaded,
// because Steam's input layer makes decisions very early in the process lifecycle.
// =============================================================================

// Try immediate initialization (works in most Electron contexts)
try {
  if (typeof navigator !== 'undefined' && navigator.getGamepads) {
    // Start polling immediately - this is the key signal to Steam
    initGamepadHandler();
    console.log('[NebulaGamepad] Early initialization successful - Steam should recognize controller input');
  }
} catch (e) {
  // Will retry on DOMContentLoaded
  console.log('[NebulaGamepad] Early init deferred, will retry on DOM ready');
}

// =============================================================================
// DOM READY & INITIALIZATION
// =============================================================================

// Cache DOM references for performance
let domReady = false;
window.addEventListener('DOMContentLoaded', () => {
  domReady = true;
  console.log("Browser UI loaded.");
  
  // Re-initialize gamepad handler if early init failed
  if (!gamepadState.initialized) {
    initGamepadHandler();
  }
});

// Optimized API exposure with error handling and caching
const electronAPI = {
  send: (ch, ...args) => {
    try {
      return ipcRenderer.send(ch, ...args);
    } catch (err) {
      console.error('IPC send error:', err);
    }
  },
  // Send message to embedding page (webview host) or to BrowserView host
  sendToHost: (ch, ...args) => {
    try {
      // If running in BrowserView context, ALWAYS use browserview-host-message
      if (nebulaTabId) {
        return ipcRenderer.send('browserview-host-message', { tabId: nebulaTabId, channel: ch, args });
      }
      // Otherwise try ipcRenderer.sendToHost (for webview contexts)
      if (typeof ipcRenderer.sendToHost === 'function') {
        return ipcRenderer.sendToHost(ch, ...args);
      }
      // Final fallback
      return ipcRenderer.send(ch, ...args);
    } catch (err) {
      console.error('IPC sendToHost error:', err);
    }
  },
  invoke: (ch, ...args) => {
    try {
      return ipcRenderer.invoke(ch, ...args);
    } catch (err) {
      console.error('IPC invoke error:', err);
      return Promise.reject(err);
    }
  },
  on: (ch, fn) => {
    try {
      return ipcRenderer.on(ch, (e, ...args) => fn(...args));
    } catch (err) {
      console.error('IPC on error:', err);
    }
  },
  // Add removeListener for cleanup
  removeListener: (ch, fn) => {
    try {
      return ipcRenderer.removeListener(ch, fn);
    } catch (err) {
      console.error('IPC removeListener error:', err);
    }
  },
  toggleDevTools: () => {
    try {
      return ipcRenderer.invoke('open-devtools');
    } catch (err) {
      console.error('IPC open-devtools error:', err);
      return Promise.reject(err);
    }
  },
  openLocalFile: async () => {
    try {
      return await ipcRenderer.invoke('show-open-file-dialog');
    } catch (err) {
      console.error('IPC openLocalFile error:', err);
      return null;
    }
  },
  showContextMenu: (params) => {
    try {
      return ipcRenderer.invoke('show-context-menu', params);
    } catch (err) {
      console.error('IPC showContextMenu error:', err);
    }
  },
  saveImageToDisk: async (suggestedName, dataUrl) => ipcRenderer.invoke('save-image-from-dataurl', { suggestedName, dataUrl }),
  saveImageFromNet: async (url) => ipcRenderer.invoke('save-image-from-url', { url })
};

// Provide absolute path to the renderer preload for webview guests so
// webview `preload` attributes use an absolute, resolvable path on all platforms.
const webviewPreloadAbsolutePath = pathModule ? pathModule.join(__dirname, 'preload.js') : null;
electronAPI.getWebviewPreloadPath = () => webviewPreloadAbsolutePath;

// Fixup any static <webview preload="..."> attributes in the DOM early so
// guests receive an absolute path instead of a relative one that may fail
// to resolve inside the guest process.
window.addEventListener('DOMContentLoaded', () => {
  try {
    if (webviewPreloadAbsolutePath) {
      const els = document.querySelectorAll('webview[preload]');
      for (const el of els) {
        try { el.setAttribute('preload', webviewPreloadAbsolutePath); } catch {};
      }
    }
  } catch (e) {
    // non-fatal
  }
});

// Cache for bookmarks to reduce IPC calls
let bookmarksCache = null;
let bookmarksCacheTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

const bookmarksAPI = {
  load: async () => {
    const now = Date.now();
    if (bookmarksCache && (now - bookmarksCacheTime) < CACHE_DURATION) {
      return bookmarksCache;
    }
    try {
      bookmarksCache = await ipcRenderer.invoke('load-bookmarks');
      bookmarksCacheTime = now;
      return bookmarksCache;
    } catch (err) {
      console.error('Bookmarks load error:', err);
      return [];
    }
  },
  save: async (data) => {
    try {
      bookmarksCache = data; // Update cache immediately
      bookmarksCacheTime = Date.now();
      return await ipcRenderer.invoke('save-bookmarks', data);
    } catch (err) {
      console.error('Bookmarks save error:', err);
      return false;
    }
  }
};

// Expose APIs to main world
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('bookmarksAPI', bookmarksAPI);

// Gamepad API - Access to the gamepad handler running in the preload context
// The handler actively polls navigator.getGamepads() to signal to Steam that
// the app is consuming controller input (prevents mouse emulation on Steam Deck)
contextBridge.exposeInMainWorld('gamepadAPI', {
  // Check if gamepad handler is initialized
  isAvailable: () => gamepadState.initialized,
  
  // Check if any gamepad is connected
  isConnected: () => gamepadState.connectedCount > 0,
  
  // Get connected gamepads info
  getConnected: () => {
    const gamepads = getConnectedGamepads();
    return gamepads.map(gp => ({
      id: gp.id,
      index: gp.index,
      mapping: gp.mapping,
      buttons: gp.buttons.length,
      axes: gp.axes.length,
    }));
  },
  
  // Get the active gamepad's current state
  getActive: () => {
    const gp = getActiveGamepad();
    if (!gp) return null;
    return {
      id: gp.id,
      index: gp.index,
      mapping: gp.mapping,
      buttons: Array.from(gp.buttons).map((b, i) => ({ index: i, pressed: b.pressed, value: b.value })),
      axes: Array.from(gp.axes),
    };
  },
  
  // Enable debug mode
  setDebug: (enabled) => {
    GAMEPAD_CONFIG.DEBUG = !!enabled;
  },
  
  // Get handler state for debugging
  getState: () => ({
    initialized: gamepadState.initialized,
    connectedCount: gamepadState.connectedCount,
    activeGamepadIndex: gamepadState.activeGamepadIndex,
    isPolling: gamepadState.rafId !== null,
  }),
});

// Minimal about API for settings page
contextBridge.exposeInMainWorld('aboutAPI', {
  getInfo: () => ipcRenderer.invoke('get-about-info')
});

// Big Picture Mode API - Steam Deck / Console UI
// Note: Big Picture Mode now opens in the main window (not a separate window) to keep resources low
// and prevent SteamOS from creating desktop mode alongside when auto-launching.
contextBridge.exposeInMainWorld('bigPictureAPI', {
  // Get screen info to determine if Big Picture Mode is recommended
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  // Check if device is likely a Steam Deck or handheld
  isSuggested: () => ipcRenderer.invoke('is-bigpicture-suggested'),
  // Check if currently in Big Picture Mode
  isActive: () => ipcRenderer.invoke('is-in-bigpicture'),
  // Launch Big Picture Mode (navigates main window to Big Picture UI)
  launch: () => ipcRenderer.invoke('launch-bigpicture'),
  // Exit Big Picture Mode (navigates main window back to desktop UI)
  exit: () => ipcRenderer.invoke('exit-bigpicture'),
  // Navigate to URL (from Big Picture Mode)
  navigate: (url) => ipcRenderer.send('bigpicture-navigate', url),
  // Send input event to a webview (for virtual cursor clicks)
  sendInputEvent: (webContentsId, inputEvent) => 
    ipcRenderer.invoke('webview-send-input-event', { webContentsId, inputEvent })
});

// Relay context-menu commands from main to active renderer context (open new tabs etc.)
ipcRenderer.on('context-menu-command', (event, payload) => {
  window.dispatchEvent(new CustomEvent('nebula-context-command', { detail: payload }));
});

// Downloads API exposed to renderer
contextBridge.exposeInMainWorld('downloadsAPI', {
  list: () => ipcRenderer.invoke('downloads-get-all'),
  action: (id, action) => ipcRenderer.invoke('downloads-action', { id, action }),
  clearCompleted: () => ipcRenderer.invoke('downloads-clear-completed'),
  onStarted: (handler) => ipcRenderer.on('downloads-started', (_e, payload) => handler(payload)),
  onUpdated: (handler) => ipcRenderer.on('downloads-updated', (_e, payload) => handler(payload)),
  onDone: (handler) => ipcRenderer.on('downloads-done', (_e, payload) => handler(payload)),
  onCleared: (handler) => ipcRenderer.on('downloads-cleared', handler),
  onScanStarted: (handler) => ipcRenderer.on('downloads-scan-started', (_e, payload) => handler(payload)),
  onScanResult: (handler) => ipcRenderer.on('downloads-scan-result', (_e, payload) => handler(payload))
});

// Auto-Updater API exposed to renderer
contextBridge.exposeInMainWorld('updaterAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (handler) => ipcRenderer.on('update-status', (_e, payload) => handler(payload))
});

// ----------------------------------------
// Plugin renderer preloads
// ----------------------------------------
// We request a list of absolute file paths from main and require() them here.
// Each file can optionally call contextBridge.exposeInMainWorld to add APIs.
(async () => {
  try {
    const preloads = await ipcRenderer.invoke('plugins-get-renderer-preloads');
    if (Array.isArray(preloads)) {
      for (const p of preloads) {
        try {
          // eslint-disable-next-line global-require, import/no-dynamic-require
          require(p);
        } catch (e) {
          console.error('[Plugins] Failed to load renderer preload:', p, e);
        }
      }
    }
  } catch (e) {
    console.warn('[Plugins] No renderer preloads:', e);
  }
})();