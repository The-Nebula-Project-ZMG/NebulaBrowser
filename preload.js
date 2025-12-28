// preload.js - Optimized version
const { contextBridge, ipcRenderer } = require('electron');
let pathModule;
try {
  pathModule = require('path');
} catch (err) {
  pathModule = null;
}

// Cache DOM references for performance
let domReady = false;
window.addEventListener('DOMContentLoaded', () => {
  domReady = true;
  console.log("Browser UI loaded.");
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
  // Send message to embedding page (webview host)
  sendToHost: (ch, ...args) => {
    try {
      return ipcRenderer.sendToHost(ch, ...args);
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

// Minimal about API for settings page
contextBridge.exposeInMainWorld('aboutAPI', {
  getInfo: () => ipcRenderer.invoke('get-about-info')
});

// Big Picture Mode API - Steam Deck / Console UI
contextBridge.exposeInMainWorld('bigPictureAPI', {
  // Get screen info to determine if Big Picture Mode is recommended
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  // Check if device is likely a Steam Deck or handheld
  isSuggested: () => ipcRenderer.invoke('is-bigpicture-suggested'),
  // Launch Big Picture Mode
  launch: () => ipcRenderer.invoke('launch-bigpicture'),
  // Exit Big Picture Mode
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