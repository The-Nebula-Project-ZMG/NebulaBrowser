// =============================================================================
// STEAM DECK / STEAMOS CONTROLLER INPUT FIX
// =============================================================================
// These environment variables MUST be set before Electron/Chromium initializes.
// They signal to Steam's input layer that this application handles its own
// controller input and should NOT have mouse/keyboard emulation applied.
//
// Without these, Steam assumes the app needs Desktop mouse emulation when running
// in Game Mode, which overrides the app's native gamepad support.
// =============================================================================

// Tell SDL (and by extension Steam Input) that this app uses the gamepad API
// SDL_GAMECONTROLLERCONFIG is used by SDL to know about controllers
process.env.SDL_GAMECONTROLLERCONFIG = process.env.SDL_GAMECONTROLLERCONFIG || '';

// Signal that this app handles gamepad input natively
// This prevents Steam from applying mouse emulation in Game Mode
// IMPORTANT: set to 0 to avoid Steam's virtual gamepad layer when possible.
// Forcing this to 1 can keep Steam virtualization/emulation active.
process.env.SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD =
  process.env.SDL_GAMECONTROLLER_ALLOW_STEAM_VIRTUAL_GAMEPAD ?? '0';

// Prevent Steam from remapping the controller to keyboard/mouse
// Setting to '1' tells Steam we want raw controller access
process.env.SDL_GAMECONTROLLER_IGNORE_DEVICES = '';

// Disable Steam's overlay input hooks for this process if possible
process.env.SteamNoOverlayUIDrawing = process.env.SteamNoOverlayUIDrawing || '0';

// Tell Steam Input we're a native controller app
// When STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD is 0, Steam won't virtualize the gamepad
process.env.STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD =
  process.env.STEAM_INPUT_ENABLE_VIRTUAL_GAMEPAD ?? '0';

// Hint that this is a game/controller-focused app
process.env.SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS = '1';

// =============================================================================
// STEAMWORKS API INTEGRATION
// =============================================================================
// Initialize Steam API to properly signal to Steam that this app handles
// controller input natively. This is more reliable than environment variables
// alone for disabling Steam Input's mouse/keyboard emulation.
//
// NOTE: Since Nebula is categorized as Software (not a Game), we can't configure
// Steam Input settings in the Steamworks dashboard. Instead, we initialize the
// Steam Input API directly to signal native controller handling.
// =============================================================================

let steamworksClient = null;
let steamworksInitialized = false;
let steamInput = null;
let steamworksModule = null;
let steamCallbacksInterval = null;

function initializeSteamworks() {
  try {
    const steamworks = require('steamworks.js');
    steamworksModule = steamworks;
    
    // Initialize with Nebula's Steam App ID
    steamworksClient = steamworks.init(4290110);
    steamworksInitialized = true;
    
    // Log successful initialization
    const playerName = steamworksClient.localplayer.getName();
    console.log(`[Steamworks] Initialized successfully for user: ${playerName}`);
    
    // Initialize Steam Input API - this tells Steam we handle controllers natively
    // and should prevent mouse/keyboard emulation in Game Mode
    try {
      steamInput = steamworksClient.input;
      if (steamInput) {
        console.log('[Steamworks] Steam Input API available - native controller mode enabled');

        // Explicitly initialize Steam Input.
        // Also ensure Steam callbacks are pumped; Steamworks features (including input)
        // depend on runCallbacks being called regularly.
        try {
          if (typeof steamInput.init === 'function') {
            steamInput.init();
          }
        } catch (initErr) {
          console.log('[Steamworks] Steam Input init failed:', initErr.message);
        }

        if (!steamCallbacksInterval && typeof steamworks.runCallbacks === 'function') {
          steamCallbacksInterval = setInterval(() => {
            try {
              steamworks.runCallbacks();
            } catch {
              // Ignore callback pump errors to avoid crashing the app.
            }
          }, 100);
        }
        
        // Try to get connected controllers to verify input is working
        try {
          const controllers = steamInput.getControllers();
          if (controllers && controllers.length > 0) {
            console.log(`[Steamworks] Found ${controllers.length} connected controller(s)`);
          }
        } catch (inputErr) {
          // Controller enumeration may not be available, that's OK
        }
      }
    } catch (inputErr) {
      console.log('[Steamworks] Steam Input API not fully available:', inputErr.message);
    }
    
    return true;
  } catch (e) {
    // Not running through Steam, or steamworks.js not available
    // This is fine - app works without Steam API
    if (e.code === 'MODULE_NOT_FOUND') {
      console.log('[Steamworks] steamworks.js not installed - running without Steam API');
    } else if (e.message && e.message.includes('Steam client')) {
      console.log('[Steamworks] Steam client not running - running without Steam API');
    } else {
      console.log('[Steamworks] Failed to initialize:', e.message || e);
    }
    return false;
  }
}

// Initialize Steamworks early (before app.ready)
// This is critical for Steam Input to recognize native controller support
initializeSteamworks();

const { app, BrowserWindow, BrowserView, ipcMain, session, screen, shell, dialog, Menu, clipboard, webContents } = require('electron');

// Cleanup Steam callback pump on exit
app.once('before-quit', () => {
  if (steamCallbacksInterval) {
    clearInterval(steamCallbacksInterval);
    steamCallbacksInterval = null;
  }
  try {
    steamInput?.shutdown?.();
  } catch {}
});
const { autoUpdater } = require('electron-updater');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const PerformanceMonitor = require('./performance-monitor');
const GPUFallback = require('./gpu-fallback');
const GPUConfig = require('./gpu-config');
const PluginManager = require('./plugin-manager');
const portableData = require('./portable-data');

// Windows: set explicit AppUserModelID to ensure proper default-app registration
// and notification branding.
if (process.platform === 'win32') {
  try {
    app.setAppUserModelId('com.andrewzambazos.nebula');
  } catch {}
}

// --- Single instance + protocol URL handling ---
let pendingOpenUrl = null;

function extractUrlFromArgv(argv = []) {
  return argv.find(arg => /^https?:\/\//i.test(arg));
}

function openUrlInExistingWindow(targetUrl) {
  if (!targetUrl) return false;
  const windows = BrowserWindow.getAllWindows();
  const mainWindow = windows.find(w => {
    try { return w && !w.isDestroyed() && !w.getParentWindow(); } catch { return false; }
  });

  if (mainWindow) {
    try { mainWindow.show(); } catch {}
    try { mainWindow.focus(); } catch {}
    try {
      mainWindow.webContents.send('open-url-new-tab', targetUrl);
      return true;
    } catch {}
    try {
      mainWindow.webContents.send('open-url', targetUrl);
      return true;
    } catch {}
  }

  pendingOpenUrl = targetUrl;
  return false;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = extractUrlFromArgv(argv);
    if (url) {
      openUrlInExistingWindow(url);
      return;
    }
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(w => {
      try { return w && !w.isDestroyed() && !w.getParentWindow(); } catch { return false; }
    });
    if (mainWindow) {
      try { mainWindow.show(); } catch {}
      try { mainWindow.focus(); } catch {}
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  openUrlInExistingWindow(url);
});

// Capture protocol URL if the app was launched with one
const initialProtocolUrl = extractUrlFromArgv(process.argv);
if (initialProtocolUrl) {
  pendingOpenUrl = initialProtocolUrl;
}

// Initialize performance monitoring and GPU management
const perfMonitor = new PerformanceMonitor();
const gpuFallback = new GPUFallback();
const gpuConfig = new GPUConfig();
const pluginManager = new PluginManager();

// =============================================================================
// DESKTOP MODE: BrowserView tab management
// =============================================================================
const desktopViewStateByWindowId = new Map();
const desktopViewByWebContentsId = new Map();
const menuPopupByWindowId = new Map();
const MENU_POPUP_SIZE = { width: 240, height: 240 };

const SCROLL_NORMALIZATION_CSS = `
  *, *::before, *::after { scroll-behavior: auto !important; }
  html, body { scroll-behavior: auto !important; }
`;

const SCROLL_NORMALIZATION_JS = `
(function() {
  if (window.__nebulaScrollNormalized) return;
  window.__nebulaScrollNormalized = true;
  const SCROLL_SPEED = 100;
  document.addEventListener('wheel', function(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let target = e.target;
    let scrollable = null;
    while (target && target !== document.body && target !== document.documentElement) {
      const style = window.getComputedStyle(target);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      if ((overflowY === 'auto' || overflowY === 'scroll') && target.scrollHeight > target.clientHeight) { scrollable = target; break; }
      if ((overflowX === 'auto' || overflowX === 'scroll') && target.scrollWidth > target.clientWidth && e.shiftKey) { scrollable = target; break; }
      target = target.parentElement;
    }
    if (!scrollable) scrollable = document.scrollingElement || document.documentElement || document.body;
    let deltaY = e.deltaY;
    let deltaX = e.deltaX;
    if (e.deltaMode === 1) {
      deltaY *= SCROLL_SPEED; deltaX *= SCROLL_SPEED;
    } else if (e.deltaMode === 2) {
      deltaY *= window.innerHeight; deltaX *= window.innerWidth;
    } else {
      const sign = deltaY > 0 ? 1 : -1;
      deltaY = sign * Math.min(Math.abs(deltaY), SCROLL_SPEED * 3);
      const signX = deltaX > 0 ? 1 : -1;
      deltaX = signX * Math.min(Math.abs(deltaX), SCROLL_SPEED * 3);
    }
    e.preventDefault();
    scrollable.scrollBy({ top: deltaY, left: e.shiftKey ? deltaX : 0, behavior: 'auto' });
  }, { passive: false, capture: true });
})();
`;

function getDesktopViewState(win) {
  if (!win) return null;
  let state = desktopViewStateByWindowId.get(win.id);
  if (!state) {
    state = {
      views: new Map(), // tabId -> BrowserView
      activeTabId: null,
      bounds: null
    };
    desktopViewStateByWindowId.set(win.id, state);
  }
  return state;
}

function createMenuPopupWindow(parentWin) {
  const menuWin = new BrowserWindow({
    parent: parentWin,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      partition: 'persist:main'
    }
  });

  menuWin.setMenu(null);
  try { menuWin.setAlwaysOnTop(true, 'pop-up-menu'); } catch {}

  const hideMenu = () => {
    if (!menuWin.isDestroyed()) menuWin.hide();
  };

  menuWin.on('blur', hideMenu);
  parentWin.on('move', hideMenu);
  parentWin.on('resize', hideMenu);

  menuWin.on('closed', () => {
    try { menuPopupByWindowId.delete(parentWin.id); } catch {}
    try { parentWin.removeListener('move', hideMenu); } catch {}
    try { parentWin.removeListener('resize', hideMenu); } catch {}
  });

  menuWin.loadFile(path.join(__dirname, 'renderer', 'menu-popup.html'));
  return menuWin;
}

function positionMenuPopup(parentWin, menuWin, anchorRect) {
  if (!parentWin || !menuWin || !anchorRect) return;
  const contentBounds = parentWin.getContentBounds();
  const display = screen.getDisplayMatching(contentBounds);
  const workArea = display?.workArea || contentBounds;

  const width = MENU_POPUP_SIZE.width;
  const height = MENU_POPUP_SIZE.height;
  let x = Math.round(contentBounds.x + anchorRect.x + anchorRect.width - width);
  let y = Math.round(contentBounds.y + anchorRect.y + anchorRect.height + 6);

  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;
  if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
  if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;

  menuWin.setBounds({ x, y, width, height }, false);
}

function getOwnerWindowForContents(contents) {
  if (!contents) return null;
  try {
    if (contents.hostWebContents) {
      return BrowserWindow.fromWebContents(contents.hostWebContents);
    }
  } catch {}
  try {
    const maybeWin = BrowserWindow.fromWebContents(contents);
    if (maybeWin) return maybeWin;
  } catch {}
  const mapped = desktopViewByWebContentsId.get(contents.id);
  return mapped?.win || null;
}

function getActiveDesktopViewWebContents(win) {
  const state = getDesktopViewState(win);
  if (!state || !state.activeTabId) return null;
  const view = state.views.get(state.activeTabId);
  return view?.webContents || null;
}

function sendBrowserViewEvent(win, payload) {
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send('browserview-event', payload);
    }
  } catch {}
}

function createBrowserViewForTab(win, tabId, url) {
  const state = getDesktopViewState(win);
  if (!state) return null;
  if (state.views.has(tabId)) return state.views.get(tabId);

  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:main',
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      nativeWindowOpen: false,
      additionalArguments: [`--nebula-tab-id=${tabId}`]
    }
  });

  try {
    if (!process.env.NEBULA_DEBUG_ELECTRON_UA) {
      view.webContents.setUserAgent(app.userAgentFallback || computeBaseUA());
    }
  } catch {}

  state.views.set(tabId, view);
  desktopViewByWebContentsId.set(view.webContents.id, { win, tabId, view });

  view.webContents.on('page-title-updated', (_e, title) => {
    sendBrowserViewEvent(win, { tabId, type: 'page-title-updated', title });
  });

  view.webContents.on('destroyed', () => {
    try { desktopViewByWebContentsId.delete(view.webContents.id); } catch {}
    try { state.views.delete(tabId); } catch {}
    if (state.activeTabId === tabId) state.activeTabId = null;
  });

  view.webContents.on('page-favicon-updated', (_e, favicons) => {
    sendBrowserViewEvent(win, { tabId, type: 'page-favicon-updated', favicons });
  });

  view.webContents.on('did-navigate', (_e, url) => {
    sendBrowserViewEvent(win, { tabId, type: 'did-navigate', url });
  });

  view.webContents.on('did-navigate-in-page', (_e, url) => {
    sendBrowserViewEvent(win, { tabId, type: 'did-navigate-in-page', url });
  });

  view.webContents.on('did-finish-load', () => {
    sendBrowserViewEvent(win, { tabId, type: 'did-finish-load' });
  });

  view.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    sendBrowserViewEvent(win, {
      tabId,
      type: 'did-fail-load',
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });

  view.webContents.on('dom-ready', () => {
    try { view.webContents.insertCSS(SCROLL_NORMALIZATION_CSS); } catch {}
    try { view.webContents.executeJavaScript(SCROLL_NORMALIZATION_JS, true); } catch {}
    sendBrowserViewEvent(win, { tabId, type: 'dom-ready' });
  });

  view.webContents.on('focus', () => {
    sendBrowserViewEvent(win, { tabId, type: 'focus' });
  });

  // Route window.open() calls to tabs unless OAuth allowlist matched
  view.webContents.setWindowOpenHandler((details) => {
    const { url: targetUrl } = details;
    if (!/^https?:\/\//i.test(targetUrl)) return { action: 'deny' };
    const oauthDomains = [
      'accounts.google.com',
      'login.microsoftonline.com',
      'appleid.apple.com',
      'github.com/login',
      'auth0.com',
      'okta.com',
      'login.live.com',
      'facebook.com/dialog',
      'api.twitter.com/oauth',
      'discord.com/oauth2'
    ];
    const isOAuthDomain = oauthDomains.some(domain => targetUrl.toLowerCase().includes(domain.toLowerCase()));
    if (isOAuthDomain) return { action: 'allow' };
    try { win.webContents.send('open-url-new-tab', targetUrl); } catch {}
    return { action: 'deny' };
  });

  if (url) {
    try { view.webContents.loadURL(url); } catch {}
  }

  return view;
}

function setActiveBrowserView(win, tabId) {
  const state = getDesktopViewState(win);
  if (!state) return null;
  const view = state.views.get(tabId);
  if (!view) return null;

  state.activeTabId = tabId;
  try {
    win.setBrowserView(view);
    if (state.bounds) {
      view.setBounds(state.bounds);
    }
    view.setAutoResize({ width: true, height: true });
    view.webContents.focus();
  } catch {}
  return view;
}

function destroyBrowserView(win, tabId) {
  const state = getDesktopViewState(win);
  if (!state) return false;
  const view = state.views.get(tabId);
  if (!view) return false;
  try {
    if (state.activeTabId === tabId) {
      try { win.setBrowserView(null); } catch {}
      state.activeTabId = null;
    }
    state.views.delete(tabId);
    desktopViewByWebContentsId.delete(view.webContents.id);
    try { view.webContents.destroy(); } catch {}
  } catch {}
  return true;
}

function getZoomTargetForEvent(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const parentWin = typeof win.getParentWindow === 'function' ? win.getParentWindow() : null;
  if (parentWin && !parentWin.isDestroyed?.()) {
    if (parentWin.__nebulaMode === 'desktop') {
      return getActiveDesktopViewWebContents(parentWin) || parentWin.webContents;
    }
    return parentWin.webContents;
  }
  if (win.__nebulaMode === 'desktop') {
    return getActiveDesktopViewWebContents(win) || win.webContents;
  }
  return win.webContents;
}

// =============================================================================
// FIRST-TIME SETUP UTILITIES
// =============================================================================

/**
 * Check if this is the first run of the application
 */
function getOnboardingFilePath() {
  try {
    const portablePath = portableData.getDataFilePath?.('first-run.json');
    if (portablePath) return portablePath;
  } catch {}
  return path.join(app.getPath('userData'), 'first-run.json');
}

function migrateFirstRunFile() {
  const newPath = getOnboardingFilePath();
  const legacyPath = path.join(__dirname, 'first-run.json');
  if (newPath === legacyPath) return;
  try {
    if (!fs.existsSync(newPath) && fs.existsSync(legacyPath)) {
      const data = fs.readFileSync(legacyPath, 'utf8');
      fs.writeFileSync(newPath, data);
      try { fs.unlinkSync(legacyPath); } catch {}
      console.log('[FirstRun] Migrated first-run.json to user data path');
    }
  } catch (err) {
    console.error('[FirstRun] Error migrating first-run.json:', err);
  }
}

function isFirstRun() {
  migrateFirstRunFile();
  const firstRunPath = getOnboardingFilePath();
  try {
    if (fs.existsSync(firstRunPath)) {
      const data = JSON.parse(fs.readFileSync(firstRunPath, 'utf8'));
      return !data.completed;
    }
    return true; // File doesn't exist, so it's first run
  } catch (err) {
    console.error('[FirstRun] Error checking first-run status:', err);
    return true; // Assume first run on error
  }
}

/**
 * Get first-run data
 */
function getFirstRunData() {
  migrateFirstRunFile();
  const firstRunPath = getOnboardingFilePath();
  try {
    if (fs.existsSync(firstRunPath)) {
      return JSON.parse(fs.readFileSync(firstRunPath, 'utf8'));
    }
    return null;
  } catch (err) {
    console.error('[FirstRun] Error reading first-run data:', err);
    return null;
  }
}

/**
 * Complete first-run setup and save preferences
 */
async function completeFirstRun(preferences = {}) {
  migrateFirstRunFile();
  const firstRunPath = getOnboardingFilePath();
  const data = {
    completed: true,
    skipped: preferences.skipped || false,
    selectedThemeId: preferences.selectedTheme || 'default',
    defaultBrowserAttempted: preferences.defaultBrowserSet || false,
    defaultBrowserSet: preferences.defaultBrowserSet || false,
    steamCloudOptIn: preferences.steamCloudOptIn || false,
    completedAt: new Date().toISOString()
  };
  
  try {
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(firstRunPath, JSON.stringify(data, null, 2));
    } else {
      await fs.promises.writeFile(firstRunPath, JSON.stringify(data, null, 2));
    }
    console.log('[FirstRun] First-run setup completed:', data);
    return true;
  } catch (err) {
    console.error('[FirstRun] Error saving first-run data:', err);
    return false;
  }
}

/**
 * Check if Nebula is set as the default browser
 */
function getProtocolClientArgs() {
  if (process.platform === 'win32' && process.defaultApp) {
    const appPath = path.resolve(process.argv[1]);
    return { exe: process.execPath, args: [appPath] };
  }
  return null;
}

function isDefaultBrowser() {
  try {
    const protocolArgs = getProtocolClientArgs();
    if (protocolArgs) {
      return app.isDefaultProtocolClient('http', protocolArgs.exe, protocolArgs.args)
        && app.isDefaultProtocolClient('https', protocolArgs.exe, protocolArgs.args);
    }
    return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https');
  } catch (err) {
    console.error('[DefaultBrowser] Error checking default browser status:', err);
    return false;
  }
}

/**
 * Set Nebula as the default browser
 */
function setAsDefaultBrowser() {
  try {
    const protocolArgs = getProtocolClientArgs();
    const httpResult = protocolArgs
      ? app.setAsDefaultProtocolClient('http', protocolArgs.exe, protocolArgs.args)
      : app.setAsDefaultProtocolClient('http');
    const httpsResult = protocolArgs
      ? app.setAsDefaultProtocolClient('https', protocolArgs.exe, protocolArgs.args)
      : app.setAsDefaultProtocolClient('https');
    const htmlResult = protocolArgs
      ? app.setAsDefaultProtocolClient('html', protocolArgs.exe, protocolArgs.args)
      : app.setAsDefaultProtocolClient('html');

    const success = httpResult && httpsResult;
    const needsUserAction = success && !isDefaultBrowser();

    console.log('[DefaultBrowser] Set as default:', { httpResult, httpsResult, htmlResult, needsUserAction });
    return { success, needsUserAction };
  } catch (err) {
    console.error('[DefaultBrowser] Error setting as default browser:', err);
    return { success: false, needsUserAction: false, error: err.message };
  }
}

function openDefaultBrowserSettings() {
  try {
    if (process.platform === 'win32') {
      return shell.openExternal('ms-settings:defaultapps');
    }
    if (process.platform === 'darwin') {
      return shell.openExternal('x-apple.systempreferences:com.apple.preference.general?DefaultWebBrowser');
    }
  } catch (err) {
    console.warn('[DefaultBrowser] Failed to open system settings:', err.message || err);
  }
  return false;
}

// =============================================================================

// Initialize portable data paths BEFORE app.ready (must be done early)
// This enables portable mode on all platforms (Windows, macOS, Linux)
// Data is stored in 'user-data' folder within the application directory
portableData.initialize();

/**
 * Get the path for a user data file (bookmarks, history, etc.)
 * Uses portable path when in portable mode, otherwise uses __dirname
 * @param {string} filename - The filename (e.g., 'bookmarks.json')
 * @returns {string} The full path to the file
 */
function getDataFilePath(filename) {
  const portablePath = portableData.getDataFilePath(filename);
  if (portablePath) {
    return portablePath;
  }
  return path.join(__dirname, filename);
}

/**
 * Get the directory path for user data files
 * Uses portable path when in portable mode, otherwise uses __dirname
 * @returns {string} The directory path
 */
function getDataDirPath() {
  if (portableData.isPortableMode()) {
    const portablePath = portableData.getPortableDataPath();
    if (portablePath) {
      return portablePath;
    }
  }
  return __dirname;
}

// Try to enable WebAuthn/platform authenticator features early.
// This helps Chromium expose platform authenticators (Touch ID / built-in) where supported.
try {
  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  // Add common WebAuthn-related feature flags. These are safe attempts to enable platform
  // authenticators and related WebAuthn plumbing in embedded Chromium builds.
  app.commandLine.appendSwitch('enable-features', 'WebAuthn,WebAuthnNestedAssertions,WebAuthnCable');
} catch (e) {
  // Non-fatal: some environments may not allow commandLine changes at this time.
}

// =============================================================================
// GAMEPAD / CONTROLLER CHROMIUM FLAGS
// =============================================================================
// Enable native gamepad support in Chromium - helps with Steam Deck compatibility
try {
  // Enable raw gamepad access (bypasses Steam's virtualization when possible)
  app.commandLine.appendSwitch('enable-gamepad-extensions');
  
  // Ensure the Gamepad API is enabled and working
  app.commandLine.appendSwitch('enable-blink-features', 'GamepadExtensions');
  
  // On Linux/Steam Deck, this can help with gamepad detection
  if (process.platform === 'linux') {
    // Disable Chromium's sandbox for gamepad access if having issues
    // (Only needed in some SteamOS configurations)
    // app.commandLine.appendSwitch('no-sandbox');
    
    // Use the system's gamepad config rather than Chromium's built-in
    app.commandLine.appendSwitch('enable-features', 'WebGamepad');
  }
} catch (e) {
  console.warn('[Gamepad] Failed to set Chromium gamepad flags:', e.message);
}

// Configure GPU settings before app is ready
gpuConfig.configure();

// Set a custom application name
app.setName('Nebula');

// --- Custom User Agent (hide Electron token & brand as Nebula) ---
// Many sites rely on UA sniffing. Default Electron UA contains 'Electron/x.y.z' which
// makes detection sites label the app as an Electron application. We construct a
// Chrome‑compatible UA string without the Electron token, appending a Nebula marker.
// NOTE: Keep the Chrome and Safari tokens for maximum compatibility.
// If you ever need to temporarily reveal Electron for debugging, set NEBULA_DEBUG_ELECTRON_UA=1.
const chromeVersion = process.versions.chrome; // matches bundled Chromium
const nebulaVersion = app.getVersion();
function computeBaseUA() {
  let platformPart;
  if (process.platform === 'win32') {
    // Use generic Windows 10 token; detailed build numbers rarely needed and can cause UA entropy issues.
    platformPart = 'Windows NT 10.0; Win64; x64';
  } else if (process.platform === 'darwin') {
    // A neutral modern macOS token; avoid exposing real minor version for stability.
    platformPart = 'Macintosh; Intel Mac OS X 10_15_7';
  } else {
    platformPart = 'X11; Linux x86_64';
  }
  return `Mozilla/5.0 (${platformPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Nebula/${nebulaVersion}`;
}

if (!process.env.NEBULA_DEBUG_ELECTRON_UA) {
  // Set a fallback UA so any new sessions inherit it automatically.
  try { app.userAgentFallback = computeBaseUA(); } catch {}
}

// Setup GPU crash handling
gpuFallback.setupCrashHandling();

// --- clear any prior registrations to prevent duplicate‐handler errors ---
ipcMain.removeHandler('window-minimize');
ipcMain.removeHandler('window-maximize');
ipcMain.removeHandler('window-close');

// =============================================================================
// BIG PICTURE MODE - Steam Deck / Console UI
// =============================================================================

function envTruthy(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function argvHasFlag(flag) {
  return process.argv.includes(flag);
}

/**
 * Heuristic: detect Steam Deck / SteamOS Gaming Mode (gamescope) launches.
 *
 * This is intentionally conservative and only used for picking the *default*
 * startup UI. Users can override via CLI/env.
 */
function isGameModeEnvironment() {
  const env = process.env;

  // Common Steam tenfoot / gamepad UI markers
  if (envTruthy(env.STEAM_GAMEPADUI)) return true;
  if (envTruthy(env.SteamTenfoot)) return true;
  if (envTruthy(env.STEAM_TENFOOT)) return true;

  // SteamOS / gamescope compositor markers
  const currentDesktop = String(env.XDG_CURRENT_DESKTOP || '').toLowerCase();
  const sessionDesktop = String(env.XDG_SESSION_DESKTOP || '').toLowerCase();
  if (currentDesktop.includes('gamescope') || sessionDesktop.includes('gamescope')) return true;

  if (env.GAMESCOPE_WSI || env.GAMESCOPE_SESSION || env.GAMESCOPE_FOCUSED_APP) return true;

  return false;
}

function shouldStartInBigPictureMode() {
  // Explicit CLI overrides first
  if (argvHasFlag('--no-big-picture') || argvHasFlag('--no-bigpicture')) return false;
  if (argvHasFlag('--big-picture') || argvHasFlag('--bigpicture') || argvHasFlag('--tenfoot') || argvHasFlag('--game-mode')) return true;

  // Explicit env overrides
  if (envTruthy(process.env.NEBULA_NO_BIG_PICTURE) || envTruthy(process.env.NEBULA_NO_BIGPICTURE)) return false;
  if (envTruthy(process.env.NEBULA_BIG_PICTURE) || envTruthy(process.env.NEBULA_BIGPICTURE) || envTruthy(process.env.NEBULA_GAME_MODE)) return true;

  // Auto-detect SteamOS Gaming Mode
  return isGameModeEnvironment();
}

// Steam Deck screen dimensions: 1280x800
const STEAM_DECK_WIDTH = 1280;
const STEAM_DECK_HEIGHT = 800;
const HANDHELD_THRESHOLD = 1366; // Consider screens smaller than this as "handheld"

// Track if main window is currently in Big Picture Mode (no separate window anymore)
let isInBigPictureMode = false;

/**
 * Check if the current display is likely a Steam Deck or similar handheld
 */
function isSteamDeckDisplay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  
  // Check for Steam Deck resolution or similar small screens
  const isSteamDeckRes = width === STEAM_DECK_WIDTH && height === STEAM_DECK_HEIGHT;
  const isSmallScreen = width <= HANDHELD_THRESHOLD;
  
  // Also check for certain aspect ratios common in handhelds (16:10, 16:9)
  const aspectRatio = width / height;
  const isHandheldAspect = aspectRatio >= 1.5 && aspectRatio <= 1.8;
  
  return isSteamDeckRes || (isSmallScreen && isHandheldAspect);
}

/**
 * Get screen info for UI decisions
 */
function getScreenInfo() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const { scaleFactor } = primaryDisplay;
  
  return {
    width,
    height,
    scaleFactor,
    isSteamDeck: width === STEAM_DECK_WIDTH && height === STEAM_DECK_HEIGHT,
    isSmallScreen: width <= HANDHELD_THRESHOLD,
    aspectRatio: width / height,
    suggestBigPicture: isSteamDeckDisplay()
  };
}

/**
 * Launch Big Picture Mode in the main window (no separate window)
 * This keeps resources low and prevents SteamOS from creating desktop mode alongside.
 */
function launchBigPictureMode() {
  const windows = BrowserWindow.getAllWindows();
  // Prefer the top-level app window (menu popup is a child window)
  const mainWindow = windows.find(w => {
    try { return w && !w.isDestroyed() && !w.getParentWindow(); } catch { return false; }
  });
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[BigPicture] No main window available');
    return null;
  }
  
  if (isInBigPictureMode) {
    console.log('[BigPicture] Already in Big Picture Mode');
    mainWindow.focus();
    return mainWindow;
  }
  
  isInBigPictureMode = true;

  // Switch mode and ensure any active BrowserView is detached so it can't cover the UI.
  try { mainWindow.__nebulaMode = 'bigpicture'; } catch {}
  try { mainWindow.setBrowserView(null); } catch {}
  
  // Enter fullscreen for Big Picture experience
  mainWindow.setFullScreen(true);
  mainWindow.setTitle('Nebula - Big Picture Mode');
  
  // Navigate to Big Picture UI
  mainWindow.loadFile('renderer/bigpicture.html');
  
  console.log('[BigPicture] Launched in main window');
  return mainWindow;
}

/**
 * Exit Big Picture Mode and return to desktop UI in the same window
 */
function exitBigPictureMode() {
  const windows = BrowserWindow.getAllWindows();
  // Prefer the top-level app window (menu popup is a child window)
  const mainWindow = windows.find(w => {
    try { return w && !w.isDestroyed() && !w.getParentWindow(); } catch { return false; }
  });
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[BigPicture] No main window to exit from');
    return;
  }
  
  if (!isInBigPictureMode) {
    console.log('[BigPicture] Not in Big Picture Mode');
    return;
  }
  
  isInBigPictureMode = false;

  // Restore desktop mode and (after the UI reloads) reattach the active BrowserView.
  try { mainWindow.__nebulaMode = 'desktop'; } catch {}
  
  // Exit fullscreen and restore normal window
  mainWindow.setFullScreen(false);
  mainWindow.setTitle('Nebula');
  
  // Navigate back to desktop UI
  mainWindow.loadFile('renderer/index.html');

  try {
    mainWindow.webContents.once('did-finish-load', () => {
      try {
        const state = getDesktopViewState(mainWindow);
        const tabId = state?.activeTabId;
        const view = tabId ? state?.views?.get(tabId) : null;
        if (view) {
          try { mainWindow.setBrowserView(view); } catch {}
          try { if (state.bounds) view.setBounds(state.bounds); } catch {}
          try { view.setAutoResize({ width: true, height: true }); } catch {}
        }
      } catch {}
    });
  } catch {}
  
  // Maximize on Windows after exiting fullscreen
  if (process.platform === 'win32') {
    setTimeout(() => {
      try { mainWindow.maximize(); } catch {}
    }, 100);
  }
  
  console.log('[BigPicture] Exited to desktop mode');
}

// IPC handlers for Big Picture Mode
ipcMain.handle('get-screen-info', () => getScreenInfo());

ipcMain.handle('launch-bigpicture', () => {
  launchBigPictureMode();
  return { success: true };
});

ipcMain.handle('exit-bigpicture', () => {
  exitBigPictureMode();
  return { success: true };
});

ipcMain.handle('is-bigpicture-suggested', () => {
  return isSteamDeckDisplay();
});

// Check if currently in Big Picture Mode
ipcMain.handle('is-in-bigpicture', () => {
  return isInBigPictureMode;
});

ipcMain.on('exit-bigpicture', () => {
  exitBigPictureMode();
});

// IPC handler for sending mouse input events to webviews (used by Big Picture Mode)
ipcMain.handle('webview-send-input-event', async (event, { webContentsId, inputEvent }) => {
  try {
    const { webContents: webContentsModule } = require('electron');
    const targetWebContents = webContentsModule.fromId(webContentsId);
    if (targetWebContents && !targetWebContents.isDestroyed()) {
      targetWebContents.sendInputEvent(inputEvent);
      return { success: true };
    }
    return { success: false, error: 'WebContents not found' };
  } catch (err) {
    console.error('[Main] webview-send-input-event error:', err);
    return { success: false, error: err.message };
  }
});

// =============================================================================


function createWindow(startUrl, bigPictureMode = false) {
  // Capture high‑resolution startup timing markers
  const perfMarks = { createWindow_called: performance.now() };

  // Track Big Picture Mode state if starting in that mode
  if (bigPictureMode) {
    isInBigPictureMode = true;
  }

  // Get the available screen size (avoid full workArea allocation jank by starting slightly smaller then maximizing later if desired)
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const initialWidth = Math.min(width, Math.round(width * 0.9));
  const initialHeight = Math.min(height, Math.round(height * 0.9));

  // Window is created hidden; we only show after first meaningful paint to avoid OS‑level pointer jank while Chromium initializes
  let windowOptions = {
    width: bigPictureMode ? width : initialWidth,
    height: bigPictureMode ? height : initialHeight,
    show: false,
    useContentSize: true,
    backgroundColor: bigPictureMode ? '#0a0a0f' : '#121212', // Big Picture uses darker bg
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security & performance improvement
      contextIsolation: true,
      webviewTag: true,
      enableRemoteModule: false, // Deprecated and slow
      nodeIntegrationInSubFrames: false, // Security & performance
      nativeWindowOpen: false,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      offscreen: false,
      enableWebSQL: false,
      plugins: false,
      backgroundThrottling: false, // keep UI responsive during early load
      // OAuth compatibility settings
      partition: 'persist:main',
      sandbox: false
    },
    fullscreen: bigPictureMode, // Start in fullscreen for Big Picture Mode
    autoHideMenuBar: true,
    icon: process.platform === 'darwin'
      ? path.join(__dirname, 'assets/images/Logos/Nebula-Favicon.icns')
      : path.join(__dirname, 'assets/images/Logos/Nebula-favicon.png'),
    title: 'Nebula'
  };

  if (process.platform === 'darwin') {
    // Use a hidden/transparent title bar on macOS so we can render a
    // custom, sleeker header in the renderer while still supporting
    // native traffic-light placement. The renderer will expose a
    // draggable region via CSS (-webkit-app-region: drag).
    Object.assign(windowOptions, {
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 20 },
      // Transparent background so renderer chrome blends with content.
      backgroundColor: '#00000000',
      transparent: true,
    });
  } else if (process.platform === 'win32') {
    // Use frameless window on Windows with custom title bar controls
    // rendered in the tab strip area (Firefox-style).
    Object.assign(windowOptions, {
      frame: false,
      backgroundColor: '#0b0d10',
    });
  } else {
    windowOptions.frame = true;
  }

  const win = new BrowserWindow(windowOptions);
  win.__nebulaMode = bigPictureMode ? 'bigpicture' : 'desktop';
  win.on('closed', () => {
    const state = desktopViewStateByWindowId.get(win.id);
    if (state) {
      for (const view of state.views.values()) {
        try { desktopViewByWebContentsId.delete(view.webContents.id); } catch {}
        try { view.webContents.destroy(); } catch {}
      }
      desktopViewStateByWindowId.delete(win.id);
    }
  });
  perfMarks.browserWindow_instantiated = performance.now();

  // Intercept window.open() requests and route them into the existing window as a new tab
  // instead of spawning separate BrowserWindows. We allow a small list of specific OAuth
  // domains to open real popups if the flow depends on window.opener relationships.
  // Everything else becomes a new tab.
  win.webContents.setWindowOpenHandler((details) => {
    const { url } = details;
    if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
    // OAuth / SSO allowlist - only allow specific authentication provider domains
    // Be restrictive to prevent normal links from opening in new windows
    const oauthDomains = [
      'accounts.google.com',
      'login.microsoftonline.com',
      'appleid.apple.com',
      'github.com/login',
      'auth0.com',
      'okta.com',
      'login.live.com',
      'facebook.com/dialog',
      'api.twitter.com/oauth',
      'discord.com/oauth2'
    ];
    const isOAuthDomain = oauthDomains.some(domain => url.toLowerCase().includes(domain.toLowerCase()));
    if (isOAuthDomain) {
      return { action: 'allow' }; // preserve popup semantics for complex auth flows
    }
    // Forward to renderer to open as tab
    try { win.webContents.send('open-url-new-tab', url); } catch {}
    return { action: 'deny' };
  });

  // IMPORTANT: Do NOT intercept 'will-navigate' with preventDefault() because
  // that strips POST bodies (turning logins into GET requests). Let Chromium
  // perform the navigation normally. If you need to observe navigations, add
  // a listener without calling preventDefault().
  // (Previous code here was causing login forms to fail.)

  // Remove deprecated 'new-window' handler that forcibly loaded targets in the
  // same window; this also broke some auth popup flows. setWindowOpenHandler
  // above now governs popup behavior.

  // ensure all embedded <webview> tags behave predictably without heavy injections
  win.webContents.on('did-attach-webview', (event, webviewContents) => {
    // Route <webview> window.open() calls to tabs unless OAuth allowlist matched
    webviewContents.setWindowOpenHandler((details) => {
      const { url } = details;
      if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
      // OAuth / SSO allowlist - only allow specific authentication provider domains
      const oauthDomains = [
        'accounts.google.com',
        'login.microsoftonline.com',
        'appleid.apple.com',
        'github.com/login',
        'auth0.com',
        'okta.com',
        'login.live.com',
        'facebook.com/dialog',
        'api.twitter.com/oauth',
        'discord.com/oauth2'
      ];
      const isOAuthDomain = oauthDomains.some(domain => url.toLowerCase().includes(domain.toLowerCase()));
      if (isOAuthDomain) {
        return { action: 'allow' }; // keep popup for auth
      }
      // Send to main window's webContents to open a new tab
      try {
        win.webContents.send('open-url-new-tab', url);
      } catch {}
      return { action: 'deny' };
    });
  });

  // Load appropriate UI based on mode (Big Picture or Desktop)
  // Check for first-run and load setup page if needed
  if (bigPictureMode) {
    win.loadFile('renderer/bigpicture.html');
    win.setTitle('Nebula - Big Picture Mode');
  } else {
    // Check if this is the first run (only for desktop mode)
    const firstRun = isFirstRun();
    if (firstRun) {
      console.log('[Startup] First run detected, loading setup page');
      win.loadFile('renderer/setup.html');
      win.setTitle('Welcome to Nebula');
    } else {
      win.loadFile('renderer/index.html');
    }
  }
  perfMarks.loadFile_issued = performance.now();

  // if caller passed in a URL, forward it to the renderer after load
  if (startUrl) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('open-url', startUrl);
    });
  }

  // Set default zoom to 100%
  const zoomFactor = 1.0;
  const loadStartTime = Date.now();
  // Show window ASAP after first paint for perceived performance
  let shown = false;
  const showNow = (reason) => {
    if (shown) return;
    shown = true;
    win.show();
    if (process.platform === 'win32') {
      // Defer maximize to next frame to avoid large-surface first paint cost
      setTimeout(() => {
        try { win.maximize(); } catch {}
      }, 16);
    }
    console.log(`[Startup] Window shown (${reason}) in ${(performance.now() - perfMarks.createWindow_called).toFixed(1)}ms`);
  };

  win.webContents.once('ready-to-show', () => showNow('ready-to-show'));
  // Fallback in case ready-to-show is delayed
  setTimeout(() => showNow('timeout-fallback'), 4000);

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor);
    const loadTime = Date.now() - loadStartTime;
    perfMonitor.trackLoadTime(win.webContents.getURL(), loadTime);
    perfMarks.did_finish_load = performance.now();

    // Defer heavier, non‑critical tasks to next idle slice to keep UI smooth
    setTimeout(() => {
      // Kick off GPU status check here (was earlier) to avoid competing with first paint
      gpuConfig.checkGPUStatus()
        .then(gpuStatus => {
          console.log('[Deferred] GPU Configuration Results:');
          console.log('- GPU Status:', gpuStatus);
          console.log('- Recommendations:', gpuConfig.getRecommendations());
        })
        .catch(err => console.error('[Deferred] GPU status check failed:', err));

      // Start performance monitoring after initial load
      perfMonitor.start();
    }, 300);
    // Diagnostic: check WebAuthn / platform authenticator availability in renderer
    try {
      win.webContents.executeJavaScript(`(async function(){
        const out = { hasNavigator: !!window.navigator, hasCredentials: !!navigator.credentials, hasCreate: !!(navigator.credentials && navigator.credentials.create), hasGet: !!(navigator.credentials && navigator.credentials.get) };
        try {
          if (window.PublicKeyCredential) {
            out.PublicKeyCredential = true;
            out.isUserVerifyingPlatformAuthenticatorAvailable = typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() : 'unknown';
          } else {
            out.PublicKeyCredential = false;
          }
        } catch (e) { out.webauthnError = String(e); }
        return out;
      })()`)
      .then(result => {
        console.log('[WebAuthn Diagnostic] renderer report:', result);
      }).catch(err => {
        console.error('[WebAuthn Diagnostic] executeJavaScript failed:', err);
      });
    } catch (e) {
      console.warn('WebAuthn diagnostic injection skipped:', e);
    }

  // After the first load, let plugins know a window exists
  try { pluginManager.emit('window-created', win); } catch {}
  });

  // Renderer manages history; no main-process recording here
}

// This method will be called when Electron has finished initialization
// Configure sessions asynchronously (non-blocking for window creation)
function configureSessionsAsync() {
  const sessionsToConfigure = [session.fromPartition('persist:main'), session.defaultSession];
  try {
    for (const ses of sessionsToConfigure) {
      if (!ses) continue;
      ses.setPermissionRequestHandler((webContents, permission, callback) => {
        if (['notifications', 'geolocation', 'camera', 'microphone'].includes(permission)) {
          callback(false);
        } else {
          callback(true);
        }
      });
      try {
        let realUA = ses.getUserAgent();
        // If Electron token present and we're not in debug mode, recompute using base builder.
        if (!process.env.NEBULA_DEBUG_ELECTRON_UA) {
          const hasElectron = /Electron\//i.test(realUA);
          if (hasElectron || !/Nebula\//.test(realUA)) {
            realUA = app.userAgentFallback || computeBaseUA();
            ses.setUserAgent(realUA);
          }
        } else {
          // Debug mode: just append Nebula tag if missing (keeps Electron segment visible)
            if (realUA && !/Nebula\//.test(realUA)) {
              ses.setUserAgent(realUA + ' Nebula/' + app.getVersion());
            }
        }
      } catch (e) {
        console.warn('Failed to read real user agent, keeping default:', e);
      }
      ses.cookies.on('changed', (event, cookie, cause, removed) => {
        if (cookie.domain && (cookie.domain.includes('google') || cookie.domain.includes('accounts'))) {
          console.log(`Cookie ${removed ? 'removed' : 'added'}: ${cookie.name} for ${cookie.domain}`);
        }
      });
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders;
        if (details.url.includes('accounts.google.com') || details.url.includes('oauth')) {
          headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
          headers['Accept'] = headers['Accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        }
        if (!headers['Accept-Language'] && !headers['accept-language']) {
          headers['Accept-Language'] = 'en-US,en;q=0.9';
        }
        callback({ requestHeaders: headers });
      });
    }
    console.log('Session configured successfully for OAuth compatibility');
  } catch (err) {
    console.error('Session setup error:', err);
  }
}

app.whenReady().then(() => {
  const t0 = performance.now();

  // If launched via SteamOS Gaming Mode / gamepad UI, default to Big Picture Mode.
  // Desktop launches remain unchanged. Big Picture now opens in main window to keep resources low.
  const startUrl = pendingOpenUrl;
  pendingOpenUrl = null;

  const startInBigPicture = startUrl ? false : shouldStartInBigPictureMode();
  if (startInBigPicture) {
    console.log('[Startup] Detected game mode launch; starting in Big Picture Mode (in main window)');
    createWindow(null, true); // Pass bigPictureMode flag
  } else {
    createWindow(startUrl || null, false);
  }

  // Initialize user plugins after app ready
  try {
    pluginManager.ensureUserPluginsDir();
    pluginManager.loadAll();
    pluginManager.emit('app-ready');
  } catch (e) {
    console.error('[Plugins] initialization error:', e);
  }
  console.log('[Startup] initial window created (', startInBigPicture ? 'bigpicture' : 'desktop', ') in', (performance.now() - t0).toFixed(1), 'ms after app.whenReady');

  // Handle GPU process crashes (still register early)
  app.on('gpu-process-crashed', (event, killed) => {
    console.warn('GPU process crashed, killed:', killed);
    if (!killed) {
      console.log('Attempting to recover GPU process...');
    }
  });

  // Defer session configuration to microtask/next tick (already inexpensive) – keep explicit
  setImmediate(configureSessionsAsync);

  // Register download handlers for common sessions
  try {
    const mainSes = session.fromPartition('persist:main');
    const defSes = session.defaultSession;
    if (mainSes) registerDownloadHandling(mainSes);
    if (defSes && defSes !== mainSes) registerDownloadHandling(defSes);
  // Allow plugins to attach webRequest hooks
  if (mainSes) pluginManager.applyWebRequestHandlers(mainSes);
  if (defSes) pluginManager.applyWebRequestHandlers(defSes);
  pluginManager.emit('session-configured', { mainSes, defSes });
  } catch (e) {
    console.warn('Failed to register download handlers:', e);
  }

  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'assets/images/Logos/Nebula-Icon.icns'));
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // --- Auto-Updater Setup ---
  // Configure auto-updater logging
  try {
    autoUpdater.logger = require('electron-updater').autoUpdater.logger;
    if (autoUpdater.logger && autoUpdater.logger.transports && autoUpdater.logger.transports.file) {
      autoUpdater.logger.transports.file.level = 'info';
    }
  } catch (err) {
    console.log('[AutoUpdater] Could not configure logger:', err.message);
  }

  // Check for updates after a short delay to not block startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('[AutoUpdater] Update check failed:', err.message);
    });
  }, 3000);

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    broadcastToAll('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    broadcastToAll('update-status', { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No update available. Current version:', app.getVersion());
    broadcastToAll('update-status', { status: 'not-available', currentVersion: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
    broadcastToAll('update-status', { status: 'downloading', progress: progress.percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    broadcastToAll('update-status', { status: 'downloaded', version: info.version });
    // Optionally prompt user to restart
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Nebula ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you restart the app.',
      buttons: ['Restart Now', 'Later']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    broadcastToAll('update-status', { status: 'error', message: err.message });
  });
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ipcMain handlers

// --- Auto-Update IPC handlers ---
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    isDevelopment: !app.isPackaged
  };
});

// --- First-Time Setup IPC handlers ---
ipcMain.handle('is-first-run', () => {
  return isFirstRun();
});

ipcMain.handle('get-first-run-data', () => {
  return getFirstRunData();
});

ipcMain.handle('complete-first-run', async (event, preferences) => {
  try {
    const success = await completeFirstRun(preferences);
    return { success };
  } catch (err) {
    console.error('[FirstRun] Error in IPC handler:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-all-themes', () => {
  try {
    const ThemeManager = require('./theme-manager.js');
    const manager = new ThemeManager();
    const themes = manager.getAllThemes();
    const defaultThemeCount = Object.keys(themes.default || {}).length;
    const userThemeCount = Object.keys(themes.user || {}).length;
    const downloadedThemeCount = Object.keys(themes.downloaded || {}).length;
    console.log('[Themes] Loaded themes:', {
      default: defaultThemeCount,
      user: userThemeCount,
      downloaded: downloadedThemeCount
    });
    return themes;
  } catch (err) {
    console.error('[Themes] Error loading themes:', err);
    return { default: { default: { name: 'Default', colors: {} } } };
  }
});

ipcMain.handle('apply-theme', async (event, themeId) => {
  try {
    // The theme will be applied in the renderer
    // Here we just save the preference
    console.log('[Themes] Theme selected:', themeId);
    return { success: true };
  } catch (err) {
    console.error('[Themes] Error applying theme:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('is-default-browser', () => {
  return isDefaultBrowser();
});

ipcMain.handle('set-as-default-browser', () => {
  try {
    const result = setAsDefaultBrowser();
    return result;
  } catch (err) {
    console.error('[DefaultBrowser] Error in IPC handler:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-default-browser-settings', () => {
  try {
    const result = openDefaultBrowserSettings();
    return { success: !!result };
  } catch (err) {
    console.error('[DefaultBrowser] Error opening system settings:', err);
    return { success: false, error: err.message };
  }
});

// --- window control handlers (only registered once now)
ipcMain.handle('window-minimize', event => {
  BrowserWindow.fromWebContents(event.sender).minimize();
});
ipcMain.handle('window-maximize', event => {
  const w = BrowserWindow.fromWebContents(event.sender);
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.handle('window-close', event => {
  BrowserWindow.fromWebContents(event.sender).close();
});
ipcMain.handle('window-is-maximized', event => {
  return BrowserWindow.fromWebContents(event.sender).isMaximized();
});

// Add site and search history IPC handlers
// Site history is now handled via localStorage in the renderer
// But keep these handlers for compatibility and potential future use
ipcMain.handle('load-site-history', async () => {
  const filePath = getDataFilePath('site-history.json');
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-site-history', async (event, history) => {
  const filePath = getDataFilePath('site-history.json');
  try {
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(filePath, JSON.stringify(history, null, 2));
    } else {
      await fs.promises.writeFile(filePath, JSON.stringify(history, null, 2));
    }
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('clear-site-history', async () => {
  const filePath = getDataFilePath('site-history.json');
  try {
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(filePath, JSON.stringify([], null, 2));
    } else {
      await fs.promises.writeFile(filePath, JSON.stringify([], null, 2));
    }
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('load-search-history', async () => {
  const filePath = getDataFilePath('search-history.json');
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-search-history', async (event, history) => {
  const filePath = getDataFilePath('search-history.json');
  try {
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(filePath, JSON.stringify(history, null, 2));
    } else {
      await fs.promises.writeFile(filePath, JSON.stringify(history, null, 2));
    }
    return true;
  } catch (err) {
    return false;
  }
});

// debug: log default‐homepage changes from renderer
ipcMain.on('homepage-changed', (event, url) => {
  console.log('[MAIN] homepage-changed →', url);
});

// Handle theme changes - broadcast to all windows
ipcMain.on('theme-changed', (event, theme) => {
  console.log('[MAIN] theme-changed →', theme?.name || 'unknown');
  // Broadcast theme change to all browser windows
  BrowserWindow.getAllWindows().forEach(win => {
    if (win.webContents && win.webContents.id !== event.sender.id) {
      win.webContents.send('theme-changed', theme);
    }
  });
});

// Handle display scale changes
ipcMain.on('set-display-scale', (event, scale) => {
  console.log('[MAIN] set-display-scale →', scale);
  try {
    // Get the webcontents from the event (will be bigPictureWindow)
    const wc = event.sender;
    if (wc && typeof wc.setZoomFactor === 'function') {
      const zoomFactor = Math.max(0.5, Math.min(3, scale / 100));
      wc.setZoomFactor(zoomFactor);
      console.log(`[MAIN] Applied zoom factor: ${zoomFactor} for scale ${scale}%`);
    }
  } catch (err) {
    console.warn('[MAIN] Failed to apply display scale:', err);
  }
});

// Bookmark management
ipcMain.handle('load-bookmarks', async () => {
  try {
    const bookmarksPath = getDataFilePath('bookmarks.json');
    try {
      await fs.promises.access(bookmarksPath);
    } catch {
      console.log('No bookmarks file found, starting with empty array');
      return [];
    }
    const data = await fs.promises.readFile(bookmarksPath, 'utf8');
    const bookmarks = JSON.parse(data);
    console.log(`Loaded ${bookmarks.length} bookmarks from file`);
    return bookmarks;
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    // Try to create a backup if the file is corrupted
    const bookmarksPath = getDataFilePath('bookmarks.json');
    const backupPath = getDataFilePath(`bookmarks.backup.${Date.now()}.json`);
    try {
      await fs.promises.copyFile(bookmarksPath, backupPath);
      console.log(`Corrupted bookmarks file backed up to: ${backupPath}`);
    } catch (backupError) {
      console.error('Failed to create backup:', backupError);
    }
    return [];
  }
});

ipcMain.handle('save-bookmarks', async (event, bookmarks) => {
  try {
    const bookmarksPath = getDataFilePath('bookmarks.json');
    try {
      await fs.promises.access(bookmarksPath);
      const backupPath = getDataFilePath('bookmarks.backup.json');
      await fs.promises.copyFile(bookmarksPath, backupPath);
    } catch {}
    // Use secure file writing in portable mode
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
    } else {
      await fs.promises.writeFile(bookmarksPath, JSON.stringify(bookmarks, null, 2));
    }
    console.log(`Saved ${bookmarks.length} bookmarks to file`);
    return true;
  } catch (error) {
    console.error('Error saving bookmarks:', error);
    return false;
  }
});

ipcMain.handle('clear-browser-data', async () => {
  try {
    const sessionsToClear = [session.defaultSession, session.fromPartition('persist:main')];

    for (const ses of sessionsToClear) {
      if (!ses) continue;
      // Clear all common site storage types
      await ses.clearStorageData({
        storages: [
          'cookies',
          'localstorage',
          'indexdb',
          'filesystem',
          'websql',
          'serviceworkers',
          'caches',
          'shadercache',
          'appcache'
        ],
      });
      // Clear caches and auth
      await ses.clearCache();
      await ses.clearAuthCache();
    }

    // Also reset on-disk history JSON files managed by the app
    const siteHistoryPath = getDataFilePath('site-history.json');
    const searchHistoryPath = getDataFilePath('search-history.json');
    try { 
      if (portableData.isPortableMode()) {
        await portableData.writeSecureFileAsync(siteHistoryPath, JSON.stringify([], null, 2));
      } else {
        await fs.promises.writeFile(siteHistoryPath, JSON.stringify([], null, 2));
      }
    } catch {}
    try { 
      if (portableData.isPortableMode()) {
        await portableData.writeSecureFileAsync(searchHistoryPath, JSON.stringify([], null, 2));
      } else {
        await fs.promises.writeFile(searchHistoryPath, JSON.stringify([], null, 2));
      }
    } catch {}

    return true; // Indicate success
  } catch (error) {
    console.error('Failed to clear browser data:', error);
    return false; // Indicate failure
  }
});

// Optional: standalone clear for search history JSON
ipcMain.handle('clear-search-history', async () => {
  const filePath = getDataFilePath('search-history.json');
  try {
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(filePath, JSON.stringify([], null, 2));
    } else {
      await fs.promises.writeFile(filePath, JSON.stringify([], null, 2));
    }
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('get-zoom-factor', event => {
  const wc = getZoomTargetForEvent(event);
  return wc ? wc.getZoomFactor() : 1.0;
});

ipcMain.handle('zoom-in', event => {
  const wc = getZoomTargetForEvent(event);
  if (!wc) return 1.0;
  const current = wc.getZoomFactor();
  const z = Math.min(current + 0.1, 3);
  wc.setZoomFactor(z);
  return z;
});


ipcMain.handle('zoom-out', event => {
  const wc = getZoomTargetForEvent(event);
  if (!wc) return 1.0;
  const current = wc.getZoomFactor();
  const z = Math.max(current - 0.1, 0.25);
  wc.setZoomFactor(z);
  return z;
});

ipcMain.handle('get-display-scale', async (event) => {
  // Try to read from localStorage data (user data path)
  const userDataPath = app.getPath('userData');
  const storageFile = path.join(userDataPath, 'localStorage');
  
  try {
    // Try to get from electron store or persistent storage
    // For now, we'll just return a default and let the app set it
    // The display scale is stored in localStorage on the client side
    return 100; // Default to 100%
  } catch (err) {
    return 100; // Default to 100%
  }
});

ipcMain.handle('set-zoom-factor', (event, zoomFactor) => {
  const wc = getZoomTargetForEvent(event);
  if (wc && typeof wc.setZoomFactor === 'function') {
    wc.setZoomFactor(zoomFactor);
    return true;
  }
  return false;
});

// allow renderer to pop a tab into its own window
ipcMain.handle('open-tab-in-new-window', (event, url) => {
  createWindow(url);
});

ipcMain.handle('save-site-history-entry', async (event, url) => {
  const filePath = getDataFilePath('site-history.json');
  try {
    let data = [];
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      data = JSON.parse(raw);
    } catch {}
    // Remove if already exists to avoid duplicates
    data = data.filter(item => item !== url);
    // Add to beginning and clamp size
    data.unshift(url);
    if (data.length > 100) data = data.slice(0, 100);
    if (portableData.isPortableMode()) {
      await portableData.writeSecureFileAsync(filePath, JSON.stringify(data, null, 2));
    } else {
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    }
    return true;
  } catch (err) {
    console.error('[MAIN] Error saving site history entry:', err);
    return false;
  }
});

// Add performance monitoring IPC handlers
ipcMain.handle('get-performance-report', () => {
  return perfMonitor.getReport();
});

ipcMain.handle('force-gc', () => {
  perfMonitor.forceGC();
  return true;
});

// GPU diagnostics handler
ipcMain.handle('get-gpu-info', async () => {
  try {
    const gpuStatus = await gpuConfig.checkGPUStatus();
    const fallbackStatus = gpuFallback.getStatus();
    const recommendations = gpuConfig.getRecommendations();
    
    return {
      ...gpuStatus,
      fallbackStatus: fallbackStatus,
      recommendations: recommendations,
      isOptimized: gpuStatus.isSupported && !fallbackStatus.fallbackLevel
    };
  } catch (err) {
    console.error('Error getting GPU info:', err);
    return { error: err.message, isSupported: false };
  }
});

// Force GPU fallback handler
ipcMain.handle('apply-gpu-fallback', (event, level) => {
  try {
    gpuFallback.applyFallback(level);
    return { success: true, level: level };
  } catch (err) {
    console.error('Error applying GPU fallback:', err);
    return { error: err.message };
  }
});

// About/info handler
ipcMain.handle('get-about-info', () => {
  try {
    return {
      appName: app.getName(),
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpu: os.cpus()?.[0]?.model || 'Unknown CPU',
      totalMemGB: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    };
  } catch (err) {
    console.error('Error building about info:', err);
    return { error: err.message };
  }
});

// Toggle DevTools for the requesting window (main window webContents)
ipcMain.handle('open-devtools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const contents = win.__nebulaMode === 'desktop'
    ? (getActiveDesktopViewWebContents(win) || win.webContents)
    : win.webContents;
  if (contents.isDevToolsOpened()) {
    contents.closeDevTools();
  } else {
  // Open docked inside the main window (bottom). Other options: 'right', 'undocked', 'detach'
  contents.openDevTools({ mode: 'bottom' });
  }
  return contents.isDevToolsOpened();
});

// =============================================================================
// BrowserView IPC (desktop mode tabs)
// =============================================================================
ipcMain.handle('browserview-create', (event, { tabId, url }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'no-window' };
    if (win.__nebulaMode !== 'desktop') return { success: false, error: 'not-desktop' };
    const view = createBrowserViewForTab(win, tabId, url);
    return { success: !!view };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('browserview-set-active', (event, { tabId }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.__nebulaMode !== 'desktop') return false;
    return !!setActiveBrowserView(win, tabId);
  } catch {
    return false;
  }
});

ipcMain.handle('browserview-destroy', (event, { tabId }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.__nebulaMode !== 'desktop') return false;
    return destroyBrowserView(win, tabId);
  } catch {
    return false;
  }
});

ipcMain.handle('browserview-load-url', (event, { tabId, url }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.__nebulaMode !== 'desktop') return false;
    const state = getDesktopViewState(win);
    const view = state?.views.get(tabId);
    if (!view) return false;
    view.webContents.loadURL(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('browserview-reload', (event, { tabId, ignoreCache }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.__nebulaMode !== 'desktop') return false;
    const state = getDesktopViewState(win);
    const view = state?.views.get(tabId);
    if (!view) return false;
    if (ignoreCache && typeof view.webContents.reloadIgnoringCache === 'function') {
      view.webContents.reloadIgnoringCache();
    } else {
      view.webContents.reload();
    }
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('browserview-get-url', (event, { tabId }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    if (win.__nebulaMode !== 'desktop') return null;
    const state = getDesktopViewState(win);
    const view = state?.views.get(tabId);
    return view?.webContents.getURL() || null;
  } catch {
    return null;
  }
});

ipcMain.handle('browserview-execute-js', async (event, { tabId, code }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    if (win.__nebulaMode !== 'desktop') return null;
    const state = getDesktopViewState(win);
    const view = state?.views.get(tabId);
    if (!view) return null;
    return await view.webContents.executeJavaScript(code, true);
  } catch {
    return null;
  }
});

ipcMain.handle('browserview-set-bounds', (event, bounds) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.__nebulaMode !== 'desktop') return false;
    const state = getDesktopViewState(win);
    if (!state) return false;
    const safeBounds = {
      x: Math.max(0, Math.round(bounds?.x || 0)),
      y: Math.max(0, Math.round(bounds?.y || 0)),
      width: Math.max(0, Math.round(bounds?.width || 0)),
      height: Math.max(0, Math.round(bounds?.height || 0))
    };
    state.bounds = safeBounds;
    if (state.activeTabId) {
      const view = state.views.get(state.activeTabId);
      if (view) {
        view.setBounds(safeBounds);
      }
    }
    return true;
  } catch {
    return false;
  }
});

// Overlay menu (to sit above BrowserView)
ipcMain.on('menu-popup-toggle', (event, payload = {}) => {
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    if (!parentWin) return;

    let menuWin = menuPopupByWindowId.get(parentWin.id);
    if (!menuWin || menuWin.isDestroyed()) {
      menuWin = createMenuPopupWindow(parentWin);
      menuPopupByWindowId.set(parentWin.id, menuWin);
    }

    if (menuWin.isVisible()) {
      menuWin.hide();
      return;
    }

    positionMenuPopup(parentWin, menuWin, payload.anchorRect);

    const initPayload = { theme: payload.theme || null };
    const sendInit = () => {
      try { menuWin.webContents.send('menu-popup-init', initPayload); } catch {}
    };
    try {
      if (menuWin.webContents.isLoadingMainFrame()) {
        menuWin.webContents.once('did-finish-load', sendInit);
      } else {
        sendInit();
      }
    } catch {}

    menuWin.show();
    menuWin.focus();
  } catch {}
});

ipcMain.on('menu-popup-hide', (event) => {
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    if (!parentWin) return;
    const menuWin = menuPopupByWindowId.get(parentWin.id);
    if (menuWin && !menuWin.isDestroyed()) menuWin.hide();
  } catch {}
});

ipcMain.on('menu-popup-command', (event, payload = {}) => {
  try {
    const menuWin = BrowserWindow.fromWebContents(event.sender);
    const parentWin = menuWin?.getParentWindow();
    if (!parentWin || parentWin.isDestroyed()) return;
    if (!payload?.cmd || payload.cmd === 'close') return;
    parentWin.webContents.send('menu-command', payload);
  } catch {}
});

ipcMain.on('browserview-broadcast', (event, { channel, args }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.__nebulaMode !== 'desktop') return;
    const state = getDesktopViewState(win);
    if (!state) return;
    for (const view of state.views.values()) {
      try { view.webContents.send(channel, ...(args || [])); } catch {}
    }
  } catch {}
});

ipcMain.on('browserview-host-message', (event, payload = {}) => {
  try {
    const { tabId, channel, args } = payload || {};
    console.log('[IPC Main] browserview-host-message received, tabId:', tabId, 'channel:', channel);
    
    let win = getOwnerWindowForContents(event.sender);
    console.log('[IPC Main] getOwnerWindowForContents returned:', win ? 'window found' : 'null');

    if (!win && tabId) {
      console.log('[IPC Main] Trying to find window by tabId...');
      for (const candidate of BrowserWindow.getAllWindows()) {
        const state = desktopViewStateByWindowId.get(candidate.id);
        console.log('[IPC Main] Checking window', candidate.id, 'state:', state ? 'found' : 'null', 'has tabId:', state?.views?.has(tabId));
        if (state && state.views && state.views.has(tabId)) {
          win = candidate;
          console.log('[IPC Main] Found window by tabId');
          break;
        }
      }
    }

    if (!win || win.isDestroyed()) {
      console.log('[IPC Main] No valid window found, returning');
      return;
    }
    console.log('[IPC Main] Forwarding to renderer');
    win.webContents.send('browserview-host-message', { tabId, channel, args: args || [] });
  } catch (err) {
    console.error('[IPC Main] Error:', err);
  }
});

// Helper function to read package.json version
function getInstalledElectronVersion() {
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Get the version from devDependencies
    const electronDep = packageJson.devDependencies?.electron;
    const electronNightlyDep = packageJson.devDependencies?.['electron-nightly'];
    
    if (electronDep) {
      return electronDep.replace(/^\D+/, ''); // Remove ^ or ~ or other version specifiers
    }
    if (electronNightlyDep) {
      return electronNightlyDep.replace(/^\D+/, '');
    }
    
    return app.getVersion();
  } catch (err) {
    console.error('Error reading installed electron version:', err);
    return app.getVersion();
  }
}

// Electron version management handlers
ipcMain.handle('get-electron-versions', async (event, buildType = 'stable') => {
  const https = require('https');
  
  return new Promise((resolve) => {
    let url;
    
    if (buildType === 'nightly') {
      // Get latest nightly version from npm
      url = 'https://registry.npmjs.org/electron-nightly/latest';
    } else {
      // Get latest stable version from npm
      url = 'https://registry.npmjs.org/electron/latest';
    }
    
    const request = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const packageInfo = JSON.parse(data);
          // Get the actual installed version from package.json, not app.getVersion()
          const installedVersion = getInstalledElectronVersion();
          resolve({
            available: packageInfo.version,
            current: installedVersion,
            buildType: buildType
          });
        } catch (err) {
          console.error('Failed to parse version info:', err);
          resolve({
            available: null,
            current: getInstalledElectronVersion(),
            error: 'Failed to fetch version info'
          });
        }
      });
    });
    
    request.on('error', (err) => {
      console.error('Failed to fetch versions:', err);
      resolve({
        available: null,
        current: getInstalledElectronVersion(),
        error: err.message
      });
    });
    
    request.setTimeout(5000, () => {
      request.destroy();
      resolve({
        available: null,
        current: getInstalledElectronVersion(),
        error: 'Version check timed out'
      });
    });
  });
});

ipcMain.handle('upgrade-electron', async (event, buildType = 'stable') => {
  const https = require('https');
  const { exec } = require('child_process');

  console.log('[ELECTRON-UPGRADE] Checking environment...');
  console.log('[ELECTRON-UPGRADE] app.isPackaged:', app.isPackaged);
  console.log('[ELECTRON-UPGRADE] __dirname:', __dirname);
  console.log('[ELECTRON-UPGRADE] process.resourcesPath:', process.resourcesPath);

  // For packaged apps (like win-unpacked), we can't use npm
  // This feature is only for development with `npm start`
  // Steam users will get updates through Steam

  return new Promise((resolve) => {
    resolve({
      success: false,
      error: 'Electron updates are not available in packaged builds',
      message: 'For Steam users: Updates are delivered through Steam.\n\nFor developers: Use "npm start" to enable Electron updates during development.'
    });
  });

  /* Keeping this code commented for future reference if needed
  const packageName = buildType === 'nightly' ? 'electron-nightly' : 'electron';
  const packageJsonPath = path.join(__dirname, 'package.json');
  const nodeModulesPath = path.join(__dirname, 'node_modules');

  return new Promise((resolve) => {
    // Check if we're in a real development environment
    if (app.isPackaged || !fs.existsSync(packageJsonPath) || !fs.existsSync(nodeModulesPath)) {
      resolve({
        success: false,
        error: 'Electron updates are only available in development mode',
        message: 'Run the app with "npm start" to enable Electron updates.'
      });
      return;
    }

    // Run npm install to upgrade the package
    const command = `npm install --save-dev ${packageName}@latest`;

    console.log('[ELECTRON-UPGRADE] Running command:', command);
    console.log('[ELECTRON-UPGRADE] Working directory:', __dirname);

    exec(command,
      {
        cwd: __dirname,
        maxBuffer: 10 * 1024 * 1024,
        shell: true,
        env: process.env
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[ELECTRON-UPGRADE] Upgrade failed:', error);
          console.error('[ELECTRON-UPGRADE] stderr:', stderr);

          let errorMsg = error.message;
          if (errorMsg.includes('ENOENT')) {
            errorMsg = 'npm command not found. Please ensure Node.js and npm are installed.';
          } else if (errorMsg.includes('EACCES')) {
            errorMsg = 'Permission denied. Try running as administrator.';
          }

          resolve({
            success: false,
            error: errorMsg,
            message: 'Failed to upgrade Electron'
          });
        } else {
          console.log('[ELECTRON-UPGRADE] Upgrade output:', stdout);
          if (stderr) console.log('[ELECTRON-UPGRADE] stderr:', stderr);

          // Clean up alternate package
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (buildType === 'nightly' && packageJson.devDependencies?.electron) {
              delete packageJson.devDependencies.electron;
              fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
            } else if (buildType === 'stable' && packageJson.devDependencies?.['electron-nightly']) {
              delete packageJson.devDependencies['electron-nightly'];
              fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
            }
          } catch (err) {
            console.warn('[ELECTRON-UPGRADE] Could not clean up alternate package:', err);
          }

          resolve({
            success: true,
            message: 'Electron upgrade completed. Restarting application...'
          });
        }
      }
    );
  });
  */
});

ipcMain.handle('restart-app', async (event) => {
  // Quit and relaunch the app
  app.relaunch();
  app.quit();
});

// Open local file dialog -> returns file:// URL (or null if cancelled)
ipcMain.handle('show-open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'HTML Files', extensions: ['html', 'htm', 'xhtml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    try {
      return pathToFileURL(filePath).href;
    } catch {
      // Fallback manual conversion
      let p = filePath.replace(/\\/g, '/');
      if (!p.startsWith('/')) p = '/' + p; // ensure leading slash for drive letters
      return 'file://' + (p.startsWith('/') ? '/' : '') + p; // double slash safety
    }
  } catch (err) {
    console.error('open-file dialog failed:', err);
    return null;
  }
});

// Helper to build and show a native context menu for a given webContents + params
function buildAndShowContextMenu(sender, params = {}) {
  try {
    const ownerWin = getOwnerWindowForContents(sender);
    const embedder = ownerWin?.webContents || sender.hostWebContents || sender;
    const template = [];

    template.push(
      { label: 'Back', enabled: sender.canGoBack?.(), click: () => { try { sender.goBack(); } catch {} } },
      { label: 'Forward', enabled: sender.canGoForward?.(), click: () => { try { sender.goForward(); } catch {} } },
      { label: 'Reload', click: () => { try { sender.reload(); } catch {} } },
      { type: 'separator' }
    );

    // Link actions
    const linkURL = params.linkURL && params.linkURL.startsWith('http') ? params.linkURL : undefined;
    if (linkURL) {
      template.push(
        { label: 'Open Link in New Tab', click: () => embedder.send('context-menu-command', { cmd: 'open-link-new-tab', url: linkURL }) },
        { label: 'Download Link', click: () => {
            try { (sender.hostWebContents || sender).downloadURL(linkURL); } catch (e) { console.error('downloadURL failed:', e); }
          }
        },
        { label: 'Open Link Externally', click: () => shell.openExternal(linkURL).catch(()=>{}) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(linkURL) },
        { type: 'separator' }
      );
    }

    // Image actions
    const imageURL = (params.mediaType === 'image' && params.srcURL) ? params.srcURL : (params.imgURL || undefined);
    if (imageURL) {
      template.push(
        { label: 'Open Image in New Tab', click: () => embedder.send('context-menu-command', { cmd: 'open-image-new-tab', url: imageURL }) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(imageURL) },
  { label: 'Save Image As...', click: () => embedder.send('context-menu-command', { cmd: 'save-image', url: imageURL, mime: params.mediaType === 'image' ? params.mimeType : undefined }) },
        { type: 'separator' }
      );
    }

    // Text / editable
    if (params.isEditable) {
      template.push(
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' },
        { type: 'separator' }
      );
    } else if (params.selectionText) {
      template.push(
        { label: 'Copy', role: 'copy' },
        { label: 'Select All', role: 'selectAll' },
        { type: 'separator' }
      );
    }

    template.push({
      label: 'Inspect Element',
      click: () => {
        try {
          const inspectTarget = sender;
          const inspectX = params.x ?? params.clientX ?? 0;
          const inspectY = params.y ?? params.clientY ?? 0;
          
          // Open DevTools docked at bottom if not already open
          if (!inspectTarget.isDevToolsOpened()) {
            inspectTarget.openDevTools({ mode: 'bottom' });
          }
          
          // Inspect the element
          setTimeout(() => {
            try {
              inspectTarget.inspectElement(inspectX, inspectY);
            } catch (e) {
              // Fallback: try on original sender
              try { sender.inspectElement(inspectX, inspectY); } catch {}
            }
          }, 50);
        } catch (err) {
          console.error('Inspect Element failed:', err);
        }
      }
    });

  // Allow plugins to customize/append context menu
  try { pluginManager.applyContextMenuContrib(template, params, sender); } catch {}
  const menu = Menu.buildFromTemplate(template);
    const win = ownerWin || BrowserWindow.fromWebContents(embedder);
    if (win) menu.popup({ window: win });
  } catch (err) {
    console.error('Failed to build context menu:', err);
  }
}

// IPC trigger (legacy / renderer-requested)
ipcMain.handle('show-context-menu', (event, params = {}) => {
  buildAndShowContextMenu(event.sender, params);
});

// Plugins: expose renderer preload list
ipcMain.handle('plugins-get-renderer-preloads', () => {
  try { return pluginManager.getRendererPreloads(); } catch { return []; }
});

// Plugins: expose registered internal pages (nebula://<id>)
ipcMain.handle('plugins-get-pages', () => {
  try { return pluginManager.getRendererPages(); } catch { return []; }
});

// Plugins: management IPC for settings UI
ipcMain.handle('plugins-list', () => pluginManager.discoverPlugins());
ipcMain.handle('plugins-set-enabled', async (_e, { id, enabled }) => {
  const ok = await pluginManager.setEnabled(id, enabled);
  // Reload to apply enable/disable (requires app reload for renderer preloads)
  pluginManager.reload();
  return ok;
});
ipcMain.handle('plugins-reload', (_e, { id } = {}) => {
  pluginManager.reload(id);
  return true;
});

// Automatic native context menu for any webContents (windows + webviews)
app.on('web-contents-created', (event, contents) => {
  contents.on('context-menu', (e, params) => {
    buildAndShowContextMenu(contents, params);
  });

  // Emit to plugins
  try { pluginManager.emit('web-contents-created', contents); } catch {}

  // On macOS, when a page (or a <webview>) enters HTML fullscreen (e.g., YouTube video),
  // also toggle the BrowserWindow into simple fullscreen so the content uses the whole
  // screen and macOS traffic lights/titlebar are hidden. Revert when HTML fullscreen exits.
  if (process.platform === 'darwin') {
    const getOwningWindow = () => {
      try {
        const host = contents.hostWebContents || contents;
        return BrowserWindow.fromWebContents(host) || null;
      } catch { return null; }
    };

    contents.on('enter-html-full-screen', () => {
      const win = getOwningWindow();
      if (!win) return;
      win.__htmlFsDepth = (win.__htmlFsDepth || 0) + 1;
      // If the window is already in native fullscreen (green button), don't switch modes
      const alreadyNativeFs = typeof win.isFullScreen === 'function' && win.isFullScreen();
      if (!alreadyNativeFs && !win.isSimpleFullScreen?.()) {
        try { win.setSimpleFullScreen?.(true); win.__htmlFsUsingSimple = true; } catch {}
      }
    });

    contents.on('leave-html-full-screen', () => {
      const win = getOwningWindow();
      if (!win) return;
      win.__htmlFsDepth = Math.max(0, (win.__htmlFsDepth || 1) - 1);
      if (win.__htmlFsDepth === 0 && win.__htmlFsUsingSimple) {
        try { if (win.isSimpleFullScreen?.()) win.setSimpleFullScreen?.(false); } catch {}
        win.__htmlFsUsingSimple = false;
      }
    });
  }
});

// --- Image save handlers ---
ipcMain.handle('save-image-from-dataurl', async (event, { suggestedName = 'image', dataUrl }) => {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return false;
    const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl);
    if (!match) return false;
    const mime = match[1] || 'application/octet-stream';
    const ext = (mime.split('/')[1] || 'png').split(';')[0];
    const buf = Buffer.from(match[2], 'base64');
    const win = BrowserWindow.fromWebContents(event.sender.hostWebContents || event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${suggestedName}.${ext}` });
    if (canceled || !filePath) return false;
    await fs.promises.writeFile(filePath, buf);
    return true;
  } catch (err) {
    console.error('save-image-from-dataurl failed:', err);
    return false;
  }
});

ipcMain.handle('save-image-from-url', async (event, { url }) => {
  if (!url) return false;
  const win = BrowserWindow.fromWebContents(event.sender.hostWebContents || event.sender);
  try {
    let dataBuf;
    if (url.startsWith('http')) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP '+res.status);
      const arrayBuf = await res.arrayBuffer();
      dataBuf = Buffer.from(arrayBuf);
      const ctype = res.headers.get('content-type') || 'application/octet-stream';
      const ext = (ctype.split('/')[1] || 'png').split(';')[0];
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `image.${ext}` });
      if (canceled || !filePath) return false;
      await fs.promises.writeFile(filePath, dataBuf);
      return true;
    } else if (url.startsWith('data:')) {
      // Forward to dataURL handler path – easier to keep logic single
      return ipcMain.emit('save-image-from-dataurl', event, { dataUrl: url });
    } else if (url.startsWith('file:')) {
      // Copy file to chosen destination
      const filePathSrc = new URL(url).pathname.replace(/^\//, '');
      const base = path.basename(filePathSrc);
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: base });
      if (canceled || !filePath) return false;
      await fs.promises.copyFile(filePathSrc, filePath);
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.error('save-image-from-url failed:', err);
    return false;
  }
});

// =========================
// Download manager plumbing
// =========================

// In-memory download registry
const downloads = new Map(); // id -> { id, url, filename, savePath, totalBytes, receivedBytes, state, startedAt, mime, canResume, paused, scan? }

function broadcastToAll(channel, payload) {
  try {
    for (const wc of webContents.getAllWebContents()) {
      try { wc.send(channel, payload); } catch {}
    }
  } catch (e) {
    // Fallback to windows only
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send(channel, payload); } catch {}
    }
  }
}

function registerDownloadHandling(ses) {
  if (!ses || ses.__nebulaDownloadsHooked) return;
  ses.__nebulaDownloadsHooked = true;
  ses.on('will-download', async (event, item, wc) => {
    try {
      // Build an id (prefer stable GUID if available)
      const id = typeof item.getGUID === 'function' ? item.getGUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      item.__nebulaId = id;
      const filename = item.getFilename();
      const mime = item.getMimeType?.() || 'application/octet-stream';
      const totalBytes = item.getTotalBytes();
      const url = item.getURL();

      // Choose a default save path under user's Downloads, ensure unique to avoid overwrite
      const defaultDir = app.getPath('downloads');
      const uniquePath = await computeUniqueSavePath(defaultDir, filename);
      try { item.setSavePath(uniquePath); } catch {}

      const info = {
        id, url, filename,
        savePath: uniquePath,
        totalBytes,
        receivedBytes: 0,
        state: 'in-progress',
        startedAt: Date.now(),
        mime,
        canResume: false,
        paused: false,
        scan: { status: process.platform === 'win32' ? 'pending' : 'unavailable', engine: process.platform === 'win32' ? 'Windows Defender' : 'none' }
      };
      downloads.set(id, { ...info, item });
  const payload = { ...info };
  broadcastToAll('downloads-started', payload);

      item.on('updated', (e, state) => {
        const d = downloads.get(id);
        if (!d) return;
        d.receivedBytes = item.getReceivedBytes();
        d.canResume = !!item.canResume?.();
        d.paused = !!item.isPaused?.();
        d.state = state === 'interrupted' ? 'interrupted' : 'in-progress';
        downloads.set(id, d);
        broadcastToAll('downloads-updated', {
          id,
          receivedBytes: d.receivedBytes,
          totalBytes: d.totalBytes,
          state: d.state,
          canResume: d.canResume,
          paused: d.paused
        });
      });

      item.once('done', async (e, state) => {
        const d = downloads.get(id) || {};
        const finalState = state === 'completed' ? 'completed' : (state === 'cancelled' ? 'cancelled' : 'interrupted');
        const final = {
          id,
          url,
          filename,
          savePath: item.getSavePath?.() || d.savePath,
          totalBytes: d.totalBytes || item.getTotalBytes?.() || 0,
          receivedBytes: item.getReceivedBytes?.() || d.receivedBytes || 0,
          state: finalState,
          startedAt: d.startedAt || Date.now(),
          endedAt: Date.now(),
          mime,
          scan: d.scan || { status: process.platform === 'win32' ? 'pending' : 'unavailable', engine: process.platform === 'win32' ? 'Windows Defender' : 'none' }
        };
        // Store minimal object; drop live item ref
        downloads.set(id, final);
        broadcastToAll('downloads-done', final);

        // Kick off a malware scan on Windows if the download completed and path exists
        if (finalState === 'completed' && final.savePath && process.platform === 'win32') {
          try {
            // Update to scanning state and broadcast
            const cur = downloads.get(id) || final;
            cur.scan = { ...(cur.scan || {}), status: 'scanning', engine: 'Windows Defender' };
            downloads.set(id, cur);
            broadcastToAll('downloads-scan-started', { id, savePath: final.savePath });

            const result = await scanFileForMalware(final.savePath);
            const updated = downloads.get(id) || cur;
            updated.scan = result;
            downloads.set(id, updated);
            broadcastToAll('downloads-scan-result', { id, scan: result });
          } catch (scanErr) {
            const updated = downloads.get(id) || final;
            updated.scan = { status: 'error', engine: 'Windows Defender', details: String(scanErr && scanErr.message || scanErr) };
            downloads.set(id, updated);
            broadcastToAll('downloads-scan-result', { id, scan: updated.scan });
          }
        }
      });
    } catch (err) {
      console.error('will-download handler error:', err);
    }
  });
}

async function computeUniqueSavePath(dir, baseName) {
  try {
    const target = path.join(dir, baseName);
    try {
      await fs.promises.access(target);
      // Already exists, create a (n) suffix
      const { name, ext } = splitNameExt(baseName);
      for (let i = 1; i < 10000; i++) {
        const candidate = path.join(dir, `${name} (${i})${ext}`);
        try { await fs.promises.access(candidate); } catch { return candidate; }
      }
      // Fallback if too many
      return path.join(dir, `${Date.now()}-${baseName}`);
    } catch {
      return target; // does not exist
    }
  } catch (e) {
    // Fallback to temp directory
    return path.join(app.getPath('downloads'), `${Date.now()}-${baseName}`);
  }
}

function splitNameExt(filename) {
  const ext = path.extname(filename);
  const name = filename.slice(0, filename.length - ext.length);
  return { name, ext };
}

// IPC: list downloads
ipcMain.handle('downloads-get-all', () => {
  return Array.from(downloads.values()).map(d => {
    const { item, ...rest } = d;
    if (item) {
      return {
        ...rest,
        receivedBytes: item.getReceivedBytes?.() ?? rest.receivedBytes ?? 0,
        totalBytes: item.getTotalBytes?.() ?? rest.totalBytes ?? 0,
        state: rest.state || 'in-progress',
        paused: item.isPaused?.() || false,
        canResume: item.canResume?.() || false,
        scan: rest.scan || { status: process.platform === 'win32' ? 'pending' : 'unavailable', engine: process.platform === 'win32' ? 'Windows Defender' : 'none' }
      };
    }
    return rest;
  });
});

// IPC: control a download (pause/resume/cancel/open/show)
ipcMain.handle('downloads-action', async (event, { id, action }) => {
  const d = downloads.get(id);
  if (!d) return false;
  const item = d.item;
  try {
    switch (action) {
      case 'pause':
        if (item && !item.isPaused?.()) item.pause?.();
        return true;
      case 'resume':
        if (item && item.canResume?.()) item.resume?.();
        return true;
      case 'cancel':
        if (item && d.state === 'in-progress') item.cancel?.();
        return true;
      case 'delete-file': {
        if (d.savePath) {
          try {
            await fs.promises.unlink(d.savePath);
            // Mark entry as deleted (custom state) and clear savePath
            const updated = { ...d, state: d.state === 'completed' ? 'deleted' : d.state, savePath: null };
            downloads.set(id, updated);
            broadcastToAll('downloads-updated', { id, state: updated.state, savePath: null });
            return true;
          } catch (e) {
            console.error('Failed to delete file:', e);
            return false;
          }
        }
        return false;
      }
      case 'rescan': {
        if (d.savePath && process.platform === 'win32') {
          try {
            const cur = downloads.get(id) || d;
            cur.scan = { status: 'scanning', engine: 'Windows Defender' };
            downloads.set(id, cur);
            broadcastToAll('downloads-scan-started', { id, savePath: d.savePath });
            const result = await scanFileForMalware(d.savePath);
            const updated = downloads.get(id) || cur;
            updated.scan = result;
            downloads.set(id, updated);
            broadcastToAll('downloads-scan-result', { id, scan: result });
            return true;
          } catch (e) {
            console.error('Rescan failed:', e);
            const updated = downloads.get(id) || d;
            updated.scan = { status: 'error', engine: 'Windows Defender', details: String(e && e.message || e) };
            downloads.set(id, updated);
            broadcastToAll('downloads-scan-result', { id, scan: updated.scan });
            return false;
          }
        }
        return false;
      }
      case 'open-file':
        if (d.savePath) {
          await shell.openPath(d.savePath);
          return true;
        }
        return false;
      case 'show-in-folder':
        if (d.savePath) {
          shell.showItemInFolder(d.savePath);
          return true;
        }
        return false;
      default:
        return false;
    }
  } catch (e) {
    console.error('downloads-action error:', e);
    return false;
  }
});

// IPC: clear completed entries from the registry (keeps in-progress)
ipcMain.handle('downloads-clear-completed', () => {
  for (const [id, d] of downloads.entries()) {
    if (d.state === 'completed' || d.state === 'cancelled' || d.state === 'deleted') downloads.delete(id);
  }
  broadcastToAll('downloads-cleared');
  return true;
});

// ---------------------------
// Malware scan helpers (Windows Defender)
// ---------------------------
async function findDefenderMpCmdRun() {
  if (process.platform !== 'win32') return null;
  const candidates = [];
  const programData = process.env['ProgramData'];
  if (programData) {
    const platformDir = path.join(programData, 'Microsoft', 'Windows Defender', 'Platform');
    try {
      const entries = await fs.promises.readdir(platformDir, { withFileTypes: true });
      const versions = entries.filter(e => e.isDirectory()).map(e => e.name);
      // Sort versions descending (simple lex sort approximates ok as versions are zero-padded; fallback to reverse chronological by stats)
      versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
      for (const v of versions) {
        candidates.push(path.join(platformDir, v, 'MpCmdRun.exe'));
      }
    } catch {}
  }
  const programFiles = process.env['ProgramFiles'] || 'C://Program Files';
  candidates.push(path.join(programFiles, 'Windows Defender', 'MpCmdRun.exe'));
  candidates.push(path.join(programFiles, 'Microsoft Defender', 'MpCmdRun.exe'));
  for (const c of candidates) {
    try {
      await fs.promises.access(c, fs.constants.X_OK | fs.constants.R_OK);
      return c;
    } catch {}
  }
  return null;
}

async function scanFileForMalware(filePath) {
  if (process.platform !== 'win32') {
    return { status: 'unavailable', engine: 'none', details: 'Malware scanning is only available on Windows with Microsoft Defender.' };
  }
  try {
    // Ensure file exists
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    return { status: 'error', engine: 'Windows Defender', details: 'File not found for scanning.' };
  }
  const exe = await findDefenderMpCmdRun();
  if (!exe) {
    return { status: 'unavailable', engine: 'Windows Defender', details: 'Microsoft Defender command-line scanner not found.' };
  }

  return await new Promise((resolve) => {
    const args = ['-Scan', '-ScanType', '3', '-File', filePath];
    let stdout = '';
    let stderr = '';
    const child = spawn(exe, args, { windowsHide: true });
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      resolve({ status: 'error', engine: 'Windows Defender', details: 'Failed to run scanner: ' + String(err && err.message || err) });
    });
    child.on('close', (code) => {
      const out = (stdout + '\n' + stderr).toLowerCase();
      // Heuristics: exit code 2 indicates threats found; also parse output
      const infected = code === 2 || /threat|infected|malware|found\s*:\s*[1-9]/i.test(stdout) || /threat|infected|malware/.test(stderr);
      if (infected) {
        resolve({ status: 'infected', engine: 'Windows Defender', details: stdout || stderr, exitCode: code });
      } else if (code === 0 || /no threats/.test(out) || /found\s*:\s*0/.test(out)) {
        resolve({ status: 'clean', engine: 'Windows Defender', details: stdout || 'No threats found.', exitCode: code });
      } else {
        resolve({ status: 'error', engine: 'Windows Defender', details: (stdout || stderr || 'Unknown scan result') + ` (code ${code})`, exitCode: code });
      }
    });
  });
}
