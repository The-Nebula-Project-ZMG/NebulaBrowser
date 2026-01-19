const ipcRenderer = window.electronAPI;
// Lightweight debug logger (toggleable)
const DEBUG = false;
const debug = (...args) => { if (DEBUG) console.log(...args); };

// Scroll normalization CSS and JS to ensure consistent scroll speed across all sites
const SCROLL_NORMALIZATION_CSS = `
  /* Disable smooth scrolling behavior that some sites force */
  *, *::before, *::after {
    scroll-behavior: auto !important;
  }
  html, body {
    scroll-behavior: auto !important;
  }
`;

const SCROLL_NORMALIZATION_JS = `
(function() {
  if (window.__nebulaScrollNormalized) return;
  window.__nebulaScrollNormalized = true;
  
  // Consistent scroll amount in pixels per wheel delta unit
  const SCROLL_SPEED = 100;
  
  // Intercept wheel events to normalize scroll speed
  document.addEventListener('wheel', function(e) {
    // Don't interfere if modifier keys are pressed (zoom, horizontal scroll, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    
    // Get the scroll target
    let target = e.target;
    let scrollable = null;
    
    // Find the nearest scrollable element
    while (target && target !== document.body && target !== document.documentElement) {
      const style = window.getComputedStyle(target);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      
      if ((overflowY === 'auto' || overflowY === 'scroll') && target.scrollHeight > target.clientHeight) {
        scrollable = target;
        break;
      }
      if ((overflowX === 'auto' || overflowX === 'scroll') && target.scrollWidth > target.clientWidth && e.shiftKey) {
        scrollable = target;
        break;
      }
      target = target.parentElement;
    }
    
    // If no scrollable container found, use the document
    if (!scrollable) {
      scrollable = document.scrollingElement || document.documentElement || document.body;
    }
    
    // Calculate normalized scroll delta
    // deltaMode: 0 = pixels, 1 = lines, 2 = pages
    let deltaY = e.deltaY;
    let deltaX = e.deltaX;
    
    if (e.deltaMode === 1) {
      // Line mode - multiply by line height approximation
      deltaY *= SCROLL_SPEED;
      deltaX *= SCROLL_SPEED;
    } else if (e.deltaMode === 2) {
      // Page mode - multiply by viewport height
      deltaY *= window.innerHeight;
      deltaX *= window.innerWidth;
    } else {
      // Pixel mode - normalize to consistent speed
      // Clamp the delta to prevent extremely fast scrolling from some sites
      const sign = deltaY > 0 ? 1 : -1;
      deltaY = sign * Math.min(Math.abs(deltaY), SCROLL_SPEED * 3);
      
      const signX = deltaX > 0 ? 1 : -1;
      deltaX = signX * Math.min(Math.abs(deltaX), SCROLL_SPEED * 3);
    }
    
    // Apply scroll
    e.preventDefault();
    scrollable.scrollBy({
      top: deltaY,
      left: e.shiftKey ? deltaX : 0,
      behavior: 'auto'
    });
  }, { passive: false, capture: true });
})();
`;

// Function to apply scroll normalization to a webview
function applyScrollNormalization(webview) {
  try {
    // Inject CSS to disable smooth scrolling
    webview.insertCSS(SCROLL_NORMALIZATION_CSS);
    // Inject JS to normalize wheel scroll speed
    webview.executeJavaScript(SCROLL_NORMALIZATION_JS);
    debug('[Scroll] Applied scroll normalization to webview');
  } catch (err) {
    console.warn('[Scroll] Failed to apply scroll normalization:', err);
  }
}

// Site history management using localStorage
function getSiteHistory() {
  try {
    const history = localStorage.getItem('siteHistory');
    return history ? JSON.parse(history) : [];
  } catch (err) {
    console.error('Error reading site history from localStorage:', err);
    return [];
  }
}

function addToSiteHistory(url) {
  try {
    let history = getSiteHistory();
    // Remove if already exists to avoid duplicates
    history = history.filter(item => item !== url);
    // Add to beginning
    history.unshift(url);
    // Keep only last 100 entries
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    localStorage.setItem('siteHistory', JSON.stringify(history));
  } catch (err) {
    console.error('Error saving site history to localStorage:', err);
  }
}

// Search history management using localStorage
function getSearchHistory() {
  try {
    const history = localStorage.getItem('searchHistory');
    return history ? JSON.parse(history) : [];
  } catch (err) {
    console.error('Error reading search history from localStorage:', err);
    return [];
  }
}

function addToSearchHistory(searchQuery) {
  try {
    let history = getSearchHistory();
    // Remove if already exists to avoid duplicates
    history = history.filter(item => item !== searchQuery);
    // Add to beginning
    history.unshift(searchQuery);
    // Keep only last 100 entries
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    localStorage.setItem('searchHistory', JSON.stringify(history));
    // Also save to file via IPC for persistence
    if (window.electronAPI && window.electronAPI.invoke) {
      window.electronAPI.invoke('save-search-history', history);
    }
  } catch (err) {
    console.error('Error saving search history to localStorage:', err);
  }
}

// Store current theme colors globally for use by renderTabs
let currentThemeColors = null;

// Apply theme colors to the main UI (URL bar and tabs)
function applyThemeToMainUI(theme) {
  if (!theme || !theme.colors) return;
  const root = document.documentElement;
  const colors = theme.colors;
  
  // Store colors globally for renderTabs to use
  currentThemeColors = colors;

  // Set CSS variables on root for elements using var()
  const setVar = (cssVar, value, fallback) => {
    const val = value || fallback;
    if (val) root.style.setProperty(cssVar, val);
  };

  // Core palette so popups/menus and the address bar stay in sync
  setVar('--bg', colors.bg, '#0b0d10');
  setVar('--dark-blue', colors.darkBlue, '#0b1c2b');
  setVar('--dark-purple', colors.darkPurple, '#1b1035');
  setVar('--primary', colors.primary, '#7b2eff');
  setVar('--accent', colors.accent, '#00c6ff');
  setVar('--text', colors.text, '#e0e0e0');

  // URL bar + tab strip styling
  setVar('--url-bar-bg', colors.urlBarBg, '#1c2030');
  setVar('--url-bar-text', colors.urlBarText, '#e0e0e0');
  setVar('--url-bar-border', colors.urlBarBorder, '#3e4652');
  setVar('--tab-bg', colors.tabBg, '#161925');
  setVar('--tab-text', colors.tabText, '#a4a7b3');
  setVar('--tab-active', colors.tabActive, '#1c2030');
  setVar('--tab-active-text', colors.tabActiveText, '#e0e0e0');
  setVar('--tab-border', colors.tabBorder, '#2b3040');

  // Also directly apply to key elements to ensure styles take effect
  const nav = document.getElementById('nav');
  const titlebarContainer = document.getElementById('titlebar-container');
  const tabBar = document.getElementById('tab-bar');
  const urlBox = document.getElementById('url');
  const navCenter = document.querySelector('.nav-center');
  
  if (nav) {
    nav.style.setProperty('background', colors.urlBarBg || '#1c2030', 'important');
    nav.style.setProperty('border-bottom-color', colors.urlBarBorder || '#3e4652', 'important');
  }
  if (navCenter) {
    navCenter.style.setProperty('background', colors.urlBarBg || '#1c2030', 'important');
    navCenter.style.setProperty('border-color', colors.urlBarBorder || '#3e4652', 'important');
  }
  if (titlebarContainer) {
    titlebarContainer.style.setProperty('background', colors.tabBg || '#161925', 'important');
  }
  if (tabBar) {
    tabBar.style.setProperty('background', colors.tabBg || '#161925', 'important');
    tabBar.style.setProperty('border-bottom-color', colors.tabBorder || '#2b3040', 'important');
  }
  if (urlBox) {
    urlBox.style.setProperty('color', colors.urlBarText || '#e0e0e0', 'important');
  }

  // Update existing tab elements to reflect new theme colors
  document.querySelectorAll('.tab').forEach(tab => {
    const isActive = tab.classList.contains('active');
    tab.style.setProperty('background', isActive 
      ? (colors.tabActive || '#1c2030')
      : (colors.tabBg || '#161925'), 'important');
    tab.style.setProperty('color', isActive
      ? (colors.tabActiveText || '#e0e0e0')
      : (colors.tabText || '#a4a7b3'), 'important');
    tab.style.setProperty('border-color', colors.tabBorder || '#2b3040', 'important');
  });

  // Align the chrome background with the theme gradient or fallback
  if (theme.gradient) {
    document.body.style.background = theme.gradient;
  } else if (colors.bg) {
    document.body.style.background = colors.bg;
  }

  // Persist so other pages (home/settings) can pull the latest palette
  try { localStorage.setItem('currentTheme', JSON.stringify(theme)); } catch {}

  console.log('[THEME] Applied theme to main UI:', {
    urlBarBg: colors.urlBarBg,
    tabBg: colors.tabBg,
    navFound: !!nav,
    titlebarFound: !!titlebarContainer,
    tabBarFound: !!tabBar
  });
}

// Detect platform and add class to body for CSS platform-specific styling
(function detectPlatform() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) {
    document.body.classList.add('platform-darwin');
  } else if (platform.includes('win')) {
    document.body.classList.add('platform-win32');
  } else {
    document.body.classList.add('platform-linux');
  }
})();

// 1) cache hot DOM references
const urlBox       = document.getElementById('url');
const tabBarEl     = document.getElementById('tab-bar');
const viewHostEl   = document.getElementById('view-host');
const menuPopup    = document.getElementById('menu-popup');
// (Removed old custom HTML context menu in favor of native Electron menu)

function updateBrowserViewBounds() {
  if (!viewHostEl) return;
  const rect = viewHostEl.getBoundingClientRect();
  ipcRenderer.invoke('browserview-set-bounds', {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  }).catch(() => {});
}

window.addEventListener('resize', () => {
  updateBrowserViewBounds();
});

// Select all text on focus and prevent mouseup from deselecting
urlBox.addEventListener('focus', () => {
  urlBox.select();
});
urlBox.addEventListener('mouseup', e => e.preventDefault());
// Add Enter key navigation
urlBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    navigate();
  }
});

let tabs = [];
let activeTabId = null;
let isHistoryNavigation = false; // Flag to prevent duplicate history entries during back/forward
const allowedInternalPages = ['settings', 'home', 'downloads', 'nebot', 'insecure'];
// Session-scoped allowlist of HTTP hosts the user explicitly chose to proceed with.
const insecureBypassedHosts = new Set();
let pluginPages = []; // { id, file, fileUrl, pluginId }
let pluginPagesReady = false;
const pendingInternalNavigations = [];

// Allow isolated worlds / plugin preloads (contextIsolation) to request opening an internal page
window.addEventListener('message', (e) => {
  try {
    const data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'open-internal-page' && typeof data.url === 'string') {
      console.log('[DEBUG] Message request to open internal page:', data.url);
      createTab(data.url);
    } else if (data.type === 'navigate' && typeof data.url === 'string') {
      // Fallback navigation from pages (like insecure.html) when electronAPI.sendToHost is unavailable
      try {
        if (data.opts && data.opts.insecureBypass && /^http:\/\//i.test(data.url)) {
          const h = new URL(data.url).hostname;
          insecureBypassedHosts.add(h);
        }
      } catch {}
      urlBox.value = data.url;
      navigate();
    }
  } catch (err) {
    console.warn('[DEBUG] open-internal-page handler error', err);
  }
});

// Fetch plugin-provided pages (nebula://<id>) once on startup
(async () => {
  try {
    console.log('[DEBUG] About to request plugin pages from main process...');
    pluginPages = await ipcRenderer.invoke('plugins-get-pages');
    console.log('[DEBUG] Loaded pluginPages:', pluginPages);
    console.log('[DEBUG] allowedInternalPages before:', allowedInternalPages);
    for (const p of pluginPages) {
      if (p && p.id && !allowedInternalPages.includes(p.id)) {
        console.log('[DEBUG] Adding plugin page to allowed list:', p.id);
        allowedInternalPages.push(p.id);
      }
    }
    console.log('[DEBUG] allowedInternalPages after:', allowedInternalPages);
  } catch (e) { 
    console.warn('Failed to load plugin pages', e); 
  }
  finally {
    pluginPagesReady = true;
    console.log('[DEBUG] Plugin pages ready, flushing', pendingInternalNavigations.length, 'pending navigations');
    // Flush any queued internal navigations that occurred before readiness
    while (pendingInternalNavigations.length) {
      const fn = pendingInternalNavigations.shift();
      try { fn(); } catch {}
    }
  }
})();
let bookmarks = [];

// Efficient render scheduling to avoid redundant DOM work
let tabsRenderPending = false;
// Track previous order and positions for FLIP animations
let lastTabOrder = [];
let closingTabs = new Set();
function scheduleRenderTabs() {
  if (tabsRenderPending) return;
  tabsRenderPending = true;
  requestAnimationFrame(() => {
    tabsRenderPending = false;
    renderTabs();
  });
}

// Debounce nav button updates to reduce layout work
let navButtonsPending = false;
let backBtnCached = null;
let fwdBtnCached = null;
function scheduleUpdateNavButtons() {
  if (navButtonsPending) return;
  navButtonsPending = true;
  requestAnimationFrame(() => {
    navButtonsPending = false;
    try { updateNavButtons(); } catch {}
  });
}

// Derive a stable, safe label for a tab without throwing on non-URLs
function getTabLabel(tab) {
  if (tab.title && tab.title !== 'New Tab') return tab.title;
  const u = tab.url || '';
  try {
  if (u.startsWith('data:image')) return 'Image';
  if (u.startsWith('data:')) return 'Data';
  if (u.startsWith('blob:')) return 'Resource';
    if (u.startsWith('http')) return new URL(u).hostname;
    if (u.startsWith('nebula://')) return u.replace('nebula://', '');
    return u || 'New Tab';
  } catch {
    return u || 'New Tab';
  }
}

// Load bookmarks on startup
async function loadBookmarks() {
  try {
    bookmarks = await ipcRenderer.invoke('load-bookmarks');
  } catch (error) {
    console.error('Error loading bookmarks in main context:', error);
    bookmarks = [];
  }
}

// Function to save bookmarks
async function saveBookmarks(newBookmarks) {
  try {
    bookmarks = newBookmarks;
    await ipcRenderer.invoke('save-bookmarks', bookmarks);
  } catch (error) {
    console.error('Error saving bookmarks in main context:', error);
  }
}

// Load bookmarks when the script starts
loadBookmarks();
// Initial home tab will be created on DOMContentLoaded

// Remove iframe-based navigation listener (using webview IPC now)

// Listen for site history updates from main process
// NOTE: electronAPI.on wrapper strips the original event object and only forwards args.
// Handlers therefore must NOT expect the event parameter.
ipcRenderer.on('record-site-history', (url) => {
  debug('[DEBUG] Received site history update:', url);
  if (typeof url === 'string' && url) addToSiteHistory(url);
});

// Main process requests opening a URL in a new tab (window.open interception)
ipcRenderer.on('open-url-new-tab', (url) => {
  console.log('[DEBUG] IPC open-url-new-tab received:', url);
  if (typeof url === 'string' && url) createTab(url);
});

// Messages from BrowserView pages (sendToHost fallback)
ipcRenderer.on('browserview-host-message', (payload) => {
  console.log('[Renderer] browserview-host-message received:', payload);
  const data = payload || {};
  const channel = data.channel;
  const args = data.args || [];
  if (!channel) return;

  if (channel === 'navigate' && args[0]) {
    console.log('[Renderer] Navigating to:', args[0]);
    const targetUrl = args[0];
    const opts = args[1] || {};
    try {
      if (opts.insecureBypass && /^http:\/\//i.test(targetUrl)) {
        const h = new URL(targetUrl).hostname;
        insecureBypassedHosts.add(h);
      }
    } catch {}
    if (opts.newTab) {
      createTab(targetUrl);
    } else {
      urlBox.value = targetUrl;
      navigate();
    }
  } else if (channel === 'theme-update' && args[0]) {
    const theme = args[0];
    applyThemeToMainUI(theme);
    ipcRenderer.send('browserview-broadcast', { channel: 'theme-update', args: [theme] });
  }
});

// Commands from the overlay menu window
ipcRenderer.on('menu-command', (payload) => {
  const cmd = payload?.cmd;
  if (!cmd) return;
  switch (cmd) {
    case 'open-settings':
      openSettings();
      break;
    case 'open-downloads':
      openDownloads();
      break;
    case 'toggle-devtools':
      window.electronAPI?.toggleDevTools?.();
      break;
    case 'big-picture':
      window.bigPictureAPI?.launch?.();
      break;
    case 'zoom-in':
      zoomIn();
      break;
    case 'zoom-out':
      zoomOut();
      break;
    case 'hard-reload':
      hardReload();
      break;
    case 'fresh-reload':
      freshReload();
      break;
    default:
      break;
  }
});

// Auto-open on download start is disabled by design now.

function createTab(inputUrl) {
  inputUrl = inputUrl || 'nebula://home';
  console.log('[DEBUG] createTab() inputUrl =', inputUrl);
  const id = crypto.randomUUID();
  if (inputUrl.startsWith('nebula://') && !pluginPagesReady) {
    // Defer creation until plugin pages known to avoid 404 race
    console.log('[DEBUG] Deferring createTab until pluginPagesReady');
    pendingInternalNavigations.push(() => createTab(inputUrl));
    return id;
  }
  let resolvedUrl = resolveInternalUrl(inputUrl);
  console.log('[DEBUG] createTab resolvedUrl:', resolvedUrl, 'from inputUrl:', inputUrl);
  // Keep data: URLs intact; BrowserView cannot consume blob URLs created in the UI process.

  tabs.push({
    id,
    url: inputUrl,
    title: 'New Tab',
    favicon: null,
    history: [inputUrl],
    historyIndex: 0
  });

  ipcRenderer.invoke('browserview-create', { tabId: id, url: resolvedUrl })
    .then(() => {
      setActiveTab(id);
      updateBrowserViewBounds();
    })
    .catch(() => {});
  scheduleRenderTabs();
  return id;
}

// Expose for plugin usage (e.g., Nebot panel "Open Page")
try { window.createTab = createTab; } catch {}



function resolveInternalUrl(url) {
  console.log('[DEBUG] resolveInternalUrl called with:', url);
  if (url.startsWith('nebula://')) {
    // Support query / hash on internal pages (e.g., nebula://insecure?target=...)
    const tail = url.replace('nebula://', '');
    const page = tail.split(/[?#]/)[0];
    const suffix = tail.slice(page.length); // includes ? and/or # if present
    console.log('[DEBUG] Extracted page:', page);
    // Fast path: if user typed nebula://nebot and plugin page exists, return immediately
    if (page === 'nebot') {
      const nebotPage = pluginPages.find(p => p.id === 'nebot');
      console.log('[DEBUG] Fast path for nebot, pluginPages:', pluginPages, 'nebotPage:', nebotPage);
      if (nebotPage && (nebotPage.fileUrl || nebotPage.file)) {
        const resolvedFast = nebotPage.fileUrl || (nebotPage.file.startsWith('file://') ? nebotPage.file : 'file://' + nebotPage.file.replace(/\\/g,'/'));
        console.log('[DEBUG] Fast path nebot resolve ->', resolvedFast);
        return resolvedFast;
      }
      console.log('[DEBUG] No plugin page found for nebot, falling back to nebot.html');
    }
    console.log('[DEBUG] Checking if page in allowedInternalPages:', page, 'list:', allowedInternalPages);
    if (allowedInternalPages.includes(page)) {
      // Check if this page is provided by a plugin (absolute file path)
      const plug = pluginPages.find(p => p.id === page);
      console.log('[DEBUG] Resolving nebula://' + page, 'plug:', plug);
      if (plug && (plug.fileUrl || plug.file)) {
        // Prefer pre-built fileUrl for correctness across platforms
        const resolved = plug.fileUrl ? plug.fileUrl : (plug.file.startsWith('file://') ? plug.file : 'file://' + plug.file.replace(/\\/g,'/'));
        console.log('[DEBUG] Resolved plugin page', page, '->', resolved);
        return resolved + suffix;
      }
  // Fallback: built-in renderer copy (resolve to absolute file URL)
  console.log('[DEBUG] Using fallback for page:', page);
      const rel = `${page}.html${suffix}`;
      try {
        return new URL(rel, window.location.href).toString();
      } catch {
        return rel;
      }
    }
    console.log('[DEBUG] Page not in allowedInternalPages, returning 404');
    try {
      return new URL('404.html', window.location.href).toString();
    } catch {
      return '404.html';
    }
  }
  // Allow direct loading of common schemes without forcing https://
  if (/^(https?:|file:|data:|blob:)/i.test(url)) return url;
  return `https://${url}`;
}


function handleLoadFail(tabId) {
  return (event) => {
    if (!event.validatedURL.includes('nebula://') && event.errorCode !== -3) {
      const badUrl = tabs.find(t => t.id === tabId)?.url || '';
      ipcRenderer.invoke('browserview-load-url', {
        tabId,
        url: `404.html?url=${encodeURIComponent(badUrl)}`
      }).catch(() => {});
    }
  };
}

function updateTabMetadata(id, key, value) {
  const tab = tabs.find(t => t.id === id);
  if (tab) {
    tab[key] = value;
  scheduleRenderTabs();
  }
}

function performNavigation(input, originalInputForHistory) {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  const hasProtocol = /^https?:\/\//i.test(input);
  const isFileProtocol = /^file:\/\//i.test(input);
  const looksLikeLocalPath = /^(?:[A-Za-z]:\\|\\\\|\/?)[^?]*\.(?:x?html?)$/i.test(input);
  const isInternal = input.startsWith('nebula://');
  const isLikelyUrl = hasProtocol || input.includes('.');
  let resolved;
  let isSearch = false;
  if (isFileProtocol) {
    resolved = input;
  } else if (looksLikeLocalPath) {
    let p = input.replace(/\\/g,'/');
    if (/^[A-Za-z]:\//.test(p)) resolved = 'file:///' + encodeURI(p); else if (p.startsWith('/')) resolved = 'file://' + encodeURI(p); else resolved = 'file://' + encodeURI(p);
  } else if (!isInternal && !isLikelyUrl) {
    resolved = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
    isSearch = true;
    // Save to search history
    addToSearchHistory(input);
  } else {
    resolved = resolveInternalUrl(input);
  }

  console.log('[DEBUG] performNavigation input:', input, 'resolved:', resolved, 'isInternal:', isInternal);

  // Intercept plain HTTP (not HTTPS) navigations (excluding localhost / 127.* / internal pages)
  try {
    if (!isInternal && /^http:\/\//i.test(resolved)) {
      const u = new URL(resolved);
      const host = u.hostname;
      const isLoopback = /^(localhost|127\.0\.0\.1|::1)$/.test(host);
      if (!isLoopback && !insecureBypassedHosts.has(host)) {
        const encoded = encodeURIComponent(resolved);
        // Directly load insecure.html (avoid custom scheme so OS doesn't try to resolve an external handler)
        resolved = `insecure.html?target=${encoded}`;
      }
    }
  } catch (e) { debug('[DEBUG] HTTP interception error', e); }

  if (!activeTabId) {
    createTab(input);
    return;
  }
  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(originalInputForHistory);
  tab.historyIndex++;
  tab.url = originalInputForHistory;
  ipcRenderer.invoke('browserview-load-url', { tabId: activeTabId, url: resolved }).catch(() => {});
  scheduleRenderTabs();
  scheduleUpdateNavButtons();
}

function navigate() {
  const rawInput = urlBox.value.trim();
  let input = rawInput;
  if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) input = input.slice(1, -1);
  if (input !== rawInput) urlBox.value = input;
  const isInternal = input.startsWith('nebula://');
  if (isInternal && !pluginPagesReady) {
    const captured = input; // preserve original
    pendingInternalNavigations.push(() => performNavigation(captured, captured));
    return;
  }
  performNavigation(input, input);
}

// Keyboard shortcut: Ctrl+O (Cmd+O on mac) to open a local file
document.addEventListener('keydown', async (e) => {
  const isAccel = (navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey);
  if (isAccel && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    if (window.electronAPI && window.electronAPI.openLocalFile) {
      const fileUrl = await window.electronAPI.openLocalFile();
      if (fileUrl) {
        urlBox.value = fileUrl;
        navigate();
      }
    }
  }
});


function handleNavigation(tabId, newUrl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  debug('[DEBUG] handleNavigation called with:', newUrl);

  // --- record every real navigation into history ---
  // Skip adding to history if this is a programmatic back/forward navigation
  if (!isHistoryNavigation) {
    // Check both current position AND last recorded URL to prevent duplicates from
    // multiple event firings (did-navigate + did-navigate-in-page)
    const lastRecordedUrl = tab.history[tab.history.length - 1];
    if (tab.history[tab.historyIndex] !== newUrl && lastRecordedUrl !== newUrl) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(newUrl);
      tab.historyIndex++;
    }
  } else {
    // Reset flag after handling the navigation
    isHistoryNavigation = false;
  }

  // Record site history in localStorage (skip internal pages and file:// URLs)
  if (!newUrl.endsWith('home.html') && 
      !newUrl.endsWith('settings.html') && 
      !newUrl.startsWith('file://') && 
      !newUrl.includes('nebula://') &&
      newUrl.startsWith('http')) {
  debug('[DEBUG] Adding to site history:', newUrl);
    addToSiteHistory(newUrl);
    // Also send to main process for file storage
    ipcRenderer.invoke('save-site-history-entry', newUrl);
  }

  // translate local files back to our nebula:// scheme
  const isHome      = newUrl.endsWith('home.html');
  const isSettings  = newUrl.endsWith('settings.html');
  const isDownloads = newUrl.endsWith('downloads.html');
  const isNebot     = newUrl.endsWith('nebot.html');
  const isInsecure  = newUrl.includes('insecure.html');
  const is404       = newUrl.includes('404.html');
  const displayUrl = isHome
    ? 'nebula://home'
    : isSettings
      ? 'nebula://settings'
      : isDownloads
        ? 'nebula://downloads'
        : isNebot
          ? 'nebula://nebot'
          : isInsecure
            ? 'nebula://insecure'
            : is404
              ? 'nebula://404'
              : newUrl;

  tab.url = displayUrl;

  // Clear favicon and reset title for internal nebula:// pages
  if (displayUrl.startsWith('nebula://')) {
    tab.favicon = null;
    // Set appropriate title for each internal page
    if (isHome) {
      tab.title = 'New Tab';
    } else if (isSettings) {
      tab.title = 'Settings';
    } else if (isDownloads) {
      tab.title = 'Downloads';
    } else if (isNebot) {
      tab.title = 'Nebot';
    } else if (isInsecure) {
      tab.title = 'Insecure Connection';
    } else if (is404) {
      tab.title = 'Page Not Found';
    }
  }

  if (tabId === activeTabId) {
    urlBox.value = displayUrl === 'nebula://home' ? '' : displayUrl;
  }

  scheduleRenderTabs();
  scheduleUpdateNavButtons();
}


function setActiveTab(id) {
  activeTabId = id;
  ipcRenderer.invoke('browserview-set-active', { tabId: id }).catch(() => {});
  updateBrowserViewBounds();

  const tab = tabs.find(t => t.id === id);
  if (tab) {
    urlBox.value = tab.url === 'nebula://home' ? '' : tab.url;
    scheduleRenderTabs();
    updateNavButtons();
    updateZoomUI();
  }
}

function closeTab(id) {
  // Play closing animation on tab button, then remove
  const btn = tabBarEl.querySelector(`[data-tab-id="${id}"]`);
  if (btn && !closingTabs.has(id)) {
    closingTabs.add(id);
    btn.classList.add('tab--closing');
    // Pre-calc which tab should become active if we're closing the active tab
    const idx = tabs.findIndex(t => t.id === id);
    const nextActiveId = (id === activeTabId)
      ? (tabs[idx - 1]?.id ?? tabs[idx + 1]?.id ?? tabs[0]?.id)
      : activeTabId;
    btn.addEventListener('animationend', () => {
      ipcRenderer.invoke('browserview-destroy', { tabId: id }).catch(() => {});
      // Remove from model
      tabs = tabs.filter(t => t.id !== id);
      // Choose a new active tab if needed
      if (tabs.length > 0 && nextActiveId) setActiveTab(nextActiveId);
      closingTabs.delete(id);
      scheduleRenderTabs();
      updateNavButtons();
    }, { once: true });
    return;
  }
  // Fallback (no button rendered yet)
  ipcRenderer.invoke('browserview-destroy', { tabId: id }).catch(() => {});
  tabs = tabs.filter(t => t.id !== id);
  if (id === activeTabId && tabs.length > 0) setActiveTab(tabs[0].id);
  scheduleRenderTabs();
  updateNavButtons();
}

// 2) streamline renderTabs with a fragment
function renderTabs() {
  // Measure initial positions (First) for existing elements
  const firstRects = new Map();
  const existing = Array.from(tabBarEl.querySelectorAll('.tab'));
  existing.forEach(el => {
    firstRects.set(el.dataset.tabId, el.getBoundingClientRect());
  });

  const frag = document.createDocumentFragment();
  if (tabBarEl && tabBarEl.getAttribute('role') !== 'tablist') {
    tabBarEl.setAttribute('role', 'tablist');
  }

  // Create tab elements
  const currentOrder = [];
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.classList.add('tab--flip');
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(tab.id === activeTabId));
    el.setAttribute('tabindex', tab.id === activeTabId ? '0' : '-1');
    el.dataset.tabId = tab.id;
    currentOrder.push(tab.id);
    
    // Apply theme colors to new tab element
    if (currentThemeColors) {
      const isActive = tab.id === activeTabId;
      el.style.setProperty('background', isActive 
        ? (currentThemeColors.tabActive || '#1c2030')
        : (currentThemeColors.tabBg || '#161925'), 'important');
      el.style.setProperty('color', isActive
        ? (currentThemeColors.tabActiveText || '#e0e0e0')
        : (currentThemeColors.tabText || '#a4a7b3'), 'important');
      el.style.setProperty('border-color', currentThemeColors.tabBorder || '#2b3040', 'important');
    }

    if (!lastTabOrder.includes(tab.id)) {
      // New tab enters with animation
      el.classList.add('tab--enter');
    }

    if (tab.favicon) {
      const icon = document.createElement('img');
      icon.src = tab.favicon;
      icon.className = 'tab-favicon';
      icon.onerror = function() {
        this.style.display = 'none';
      };
      el.appendChild(icon);
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = getTabLabel(tab);
    el.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close tab';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    el.appendChild(closeBtn);

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    el.draggable = true;
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('tabId', tab.id);
      e.dataTransfer.setData('text/plain', tab.id);
      // Hide default ghost image; use an empty drag image
      const ghost = document.createElement('canvas');
      ghost.width = 1; ghost.height = 1; // 1x1 transparent pixel
      const ctx = ghost.getContext('2d');
      if (ctx) { ctx.clearRect(0, 0, 1, 1); }
      e.dataTransfer.setDragImage(ghost, 0, 0);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
      }
      // visual lift on drag start
      el.classList.add('tab--dragging');
      // Store initial pointer offset to keep tab under cursor
      const rect = el.getBoundingClientRect();
      el._dragOffsetX = e.clientX - rect.left;
      el._dragStartLeft = rect.left;
      el._dragStartTop = rect.top;
    });
    el.addEventListener('dragenter', e => {
      // If another tab is being dragged over this one, hint before/after
      const draggedId = (e.dataTransfer && (e.dataTransfer.getData('tabId') || e.dataTransfer.getData('text/plain'))) || null;
      if (!draggedId || draggedId === tab.id) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX;
      const before = (x - rect.left) < rect.width / 2;
      el.classList.toggle('tab--drop-before', before);
      el.classList.toggle('tab--drop-after', !before);
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      // Continuously update hint side while hovering
      const rect = el.getBoundingClientRect();
      const before = (e.clientX - rect.left) < rect.width / 2;
      el.classList.toggle('tab--drop-before', before);
      el.classList.toggle('tab--drop-after', !before);
    });
    // While dragging, move the actual element to follow cursor horizontally (attach once).
    if (!tabBarEl._dragoverAttached) {
      tabBarEl.addEventListener('dragover', (evt) => {
        const draggingEl = tabBarEl.querySelector('.tab.tab--dragging');
        if (!draggingEl) return;
        evt.preventDefault();
        if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
        const barRect = tabBarEl.getBoundingClientRect();
        const targetX = evt.clientX - barRect.left - (draggingEl._dragOffsetX || 0);
        // Translate relative to its current position
        const elRect = draggingEl.getBoundingClientRect();
        const dx = targetX - (elRect.left - barRect.left);
        draggingEl.style.transform = `translateX(${dx}px)`;
      });
      tabBarEl._dragoverAttached = true;
    }
    el.addEventListener('dragleave', () => {
      el.classList.remove('tab--drop-before', 'tab--drop-after');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('tabId') || e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === tab.id) return;
      const fromIndex = tabs.findIndex(t => t.id === draggedId);
      const toIndex = tabs.findIndex(t => t.id === tab.id);
      if (fromIndex === -1 || toIndex === -1) return;
      const rect = el.getBoundingClientRect();
      const after = (e.clientX - rect.left) > rect.width / 2;
      const newIndex = toIndex + (after ? 1 : 0);
      const [moved] = tabs.splice(fromIndex, 1);
      const adjIndex = fromIndex < newIndex ? newIndex - 1 : newIndex;
      tabs.splice(adjIndex, 0, moved);
      el.classList.remove('tab--drop-before', 'tab--drop-after');
      // Reset dragging transform before re-render FLIP
      const draggingEl = tabBarEl.querySelector('.tab.tab--dragging');
      if (draggingEl) draggingEl.style.transform = '';
      scheduleRenderTabs();
    });
    el.addEventListener('dragend', e => {
      // Clear dragging visual state
      el.classList.remove('tab--dragging');
      el.style.transform = '';
      // Clean any lingering hints
      el.classList.remove('tab--drop-before', 'tab--drop-after');
      if (
        e.clientX < 0 || e.clientX > window.innerWidth ||
        e.clientY < 0 || e.clientY > window.innerHeight
      ) {
        ipcRenderer.invoke('open-tab-in-new-window', tab.url);
        closeTab(tab.id);
      }
    });

    el.addEventListener('click', () => setActiveTab(tab.id));
    frag.appendChild(el);
  });

  // New tab button
  const plus = document.createElement('button');
  plus.className = 'new-tab-button';
  plus.title = 'New tab';
  plus.setAttribute('aria-label', 'New tab');
  plus.textContent = '+';
  plus.addEventListener('click', () => createTab());
  frag.appendChild(plus);

  // Swap DOM: to support FLIP, we need to keep the old nodes around until we can measure Last
  tabBarEl.innerHTML = '';
  tabBarEl.appendChild(frag);

  // Measure final positions (Last)
  const lastRects = new Map();
  Array.from(tabBarEl.querySelectorAll('.tab')).forEach(el => {
    lastRects.set(el.dataset.tabId, el.getBoundingClientRect());
  });

  // Apply FLIP: invert then play
  Array.from(tabBarEl.querySelectorAll('.tab')).forEach(el => {
    const id = el.dataset.tabId;
    const first = firstRects.get(id);
    const last = lastRects.get(id);
    if (!first || !last) return;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // force reflow
      el.style.transform = '';
    }
  });

  // Update order for next render
  lastTabOrder = currentOrder.slice();
}

// 1) handle URL sent by main for a detached window
ipcRenderer.on('open-url', (url) => {
  for (const t of tabs) {
    ipcRenderer.invoke('browserview-destroy', { tabId: t.id }).catch(() => {});
  }
  tabs = [];
  activeTabId = null;
  tabBarEl.innerHTML = '';
  if (typeof url === 'string' && url) createTab(url); else createTab();
});

function goBack() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  
  // Use custom history tracking to properly handle internal pages like home
  if (tab.historyIndex > 0) {
    tab.historyIndex--;
    const targetUrl = tab.history[tab.historyIndex];
    isHistoryNavigation = true;
    const resolvedUrl = resolveInternalUrl(targetUrl);
    ipcRenderer.invoke('browserview-load-url', { tabId: activeTabId, url: resolvedUrl }).catch(() => {});
  }
}

function goForward() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  
  // Use custom history tracking to properly handle internal pages like home
  if (tab.historyIndex < tab.history.length - 1) {
    tab.historyIndex++;
    const targetUrl = tab.history[tab.historyIndex];
    isHistoryNavigation = true;
    const resolvedUrl = resolveInternalUrl(targetUrl);
    ipcRenderer.invoke('browserview-load-url', { tabId: activeTabId, url: resolvedUrl }).catch(() => {});
  }
}

function updateNavButtons() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!backBtnCached || !fwdBtnCached) {
    backBtnCached = document.querySelector('.nav-left button:nth-child(1)');
    fwdBtnCached  = document.querySelector('.nav-left button:nth-child(2)');
  }
  // Use custom history tracking for button state
  if (backBtnCached) backBtnCached.disabled = !tab || tab.historyIndex <= 0;
  if (fwdBtnCached)  fwdBtnCached.disabled  = !tab || tab.historyIndex >= tab.history.length - 1;
}

function reload() {
  if (!activeTabId) return;
  ipcRenderer.invoke('browserview-reload', { tabId: activeTabId, ignoreCache: false }).catch(() => {});
  scheduleUpdateNavButtons();
}

function hardReload() {
  if (!activeTabId) return;
  ipcRenderer.invoke('browserview-reload', { tabId: activeTabId, ignoreCache: true }).catch(() => {});
  scheduleUpdateNavButtons();
}

function freshReload() {
  if (!activeTabId) return;
  ipcRenderer.invoke('browserview-get-url', { tabId: activeTabId }).then((currentUrl) => {
    if (!currentUrl) return hardReload();
    try {
      const u = new URL(currentUrl);
      u.searchParams.set('_bust', Date.now().toString());
      ipcRenderer.invoke('browserview-load-url', { tabId: activeTabId, url: u.toString() }).catch(() => {});
    } catch {
      hardReload();
    }
  });
}

// Function to open the Settings page
function openSettings() {
  createTab('nebula://settings');
}

// Open Downloads manager page
function openDownloads() {
  createTab('nebula://downloads');
}

// Toggle menu dropdown
const menuBtn = document.getElementById('menu-btn');
const menuWrapper = document.querySelector('.menu-wrapper');
// Downloads mini popup elements
let downloadsBtnEl = null;
let downloadsPopupEl = null;
let downloadsListEl = null;
let downloadsEmptyEl = null;
let downloadsShowAllBtn = null;
let ringSvgEl = null;

// Open/close on button click; stop propagation so outside-click handler doesn't immediately close it
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!menuBtn) return;
  const rect = menuBtn.getBoundingClientRect();
  const theme = currentThemeColors ? { colors: currentThemeColors } : null;
  ipcRenderer.send('menu-popup-toggle', {
    anchorRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    theme
  });
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ipcRenderer.send('menu-popup-hide');
  if (e.key === 'Escape' && downloadsPopupEl && !downloadsPopupEl.classList.contains('hidden')) {
    hideDownloadsPopup();
  }
});

// Close menus when BrowserView receives focus
ipcRenderer.on('browserview-event', (payload) => {
  if (!payload || !payload.type) return;
  const { tabId, type } = payload;
  if (type === 'focus') {
    ipcRenderer.send('menu-popup-hide');
    if (downloadsPopupEl && !downloadsPopupEl.classList.contains('hidden')) hideDownloadsPopup();
    return;
  }
  if (type === 'page-title-updated') {
    updateTabMetadata(tabId, 'title', payload.title);
    return;
  }
  if (type === 'page-favicon-updated') {
    const fav = payload.favicons?.[0];
    if (fav) updateTabMetadata(tabId, 'favicon', fav);
    return;
  }
  if (type === 'did-navigate' || type === 'did-navigate-in-page') {
    if (payload.url) {
      handleNavigation(tabId, payload.url);
      if (/\/cdn-cgi\//.test(payload.url) || /challenge/i.test(payload.url)) {
        console.log('[Nebula] Cloudflare challenge detected at', payload.url);
      }
    }
    return;
  }
  if (type === 'did-finish-load') {
    scheduleUpdateNavButtons();
    return;
  }
  if (type === 'did-fail-load') {
    handleLoadFail(tabId)({
      validatedURL: payload.validatedURL || '',
      errorCode: payload.errorCode,
      errorDescription: payload.errorDescription,
      isMainFrame: payload.isMainFrame
    });
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // Initialize theme from localStorage
  const savedTheme = localStorage.getItem('currentTheme');
  if (savedTheme) {
    try {
      const theme = JSON.parse(savedTheme);
      applyThemeToMainUI(theme);
      ipcRenderer.send('browserview-broadcast', { channel: 'theme-update', args: [theme] });
    } catch (err) {
      console.error('Error applying saved theme:', err);
    }
  }

  // Initialize display scale (zoom) from localStorage
  const savedDisplayScale = localStorage.getItem('nebula-display-scale');
  if (savedDisplayScale) {
    try {
      const scale = Number(savedDisplayScale);
      if (scale > 0 && scale <= 300) {
        const zoomFactor = scale / 100;
        if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
          ipcRenderer.invoke('set-zoom-factor', zoomFactor).catch(err => {
            console.error('Error setting zoom factor:', err);
          });
        }
      }
    } catch (err) {
      console.error('Error applying saved display scale:', err);
    }
  }
  
  // Initial boot
  createTab();
  updateBrowserViewBounds();
  // Fallback: listen for postMessage navigations from embedded pages (home/settings)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'navigate' && event.data.url) {
      if (event.data.newTab) {
        createTab(event.data.url);
      } else {
        urlBox.value = event.data.url;
        navigate();
      }
    }
  });
  // only now bind the reload button (guaranteed to exist)
  const reloadBtn = document.getElementById('reload-btn');
  reloadBtn.addEventListener('click', reload);
  const hardReloadBtn = document.getElementById('hard-reload-btn');
  if (hardReloadBtn) hardReloadBtn.addEventListener('click', hardReload);
  const freshReloadBtn = document.getElementById('fresh-reload-btn');
  if (freshReloadBtn) freshReloadBtn.addEventListener('click', freshReload);

  // bind zoom buttons (single binding)
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  zoomInBtn.addEventListener('click', zoomIn);
  zoomOutBtn.addEventListener('click', zoomOut);

  // DevTools toggle button
  const devtoolsBtn = document.getElementById('devtools-btn');
  if (devtoolsBtn && window.electronAPI && window.electronAPI.toggleDevTools) {
    devtoolsBtn.addEventListener('click', () => {
      window.electronAPI.toggleDevTools();
    });
  }

  // Big Picture Mode button
  const bigPictureBtn = document.getElementById('bigpicture-btn');
  if (bigPictureBtn && window.bigPictureAPI && window.bigPictureAPI.launch) {
    bigPictureBtn.addEventListener('click', async () => {
      try {
        await window.bigPictureAPI.launch();
        // Close the overlay menu
        ipcRenderer.send('menu-popup-hide');
      } catch (e) {
        console.error('Failed to launch Big Picture Mode:', e);
      }
    });
  }

  // Cache back/forward buttons for faster updates (no need to add listeners - already in HTML)
  backBtnCached = document.querySelector('.nav-left button:nth-child(1)');
  fwdBtnCached = document.querySelector('.nav-left button:nth-child(2)');

  // settings button
  const settingsBtn = document.getElementById('open-settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

  // downloads button
  downloadsBtnEl = document.getElementById('downloads-btn');
  downloadsPopupEl = document.getElementById('downloads-popup');
  downloadsListEl = document.getElementById('downloads-list');
  downloadsEmptyEl = document.getElementById('downloads-empty');
  downloadsShowAllBtn = document.getElementById('downloads-show-all');
  if (downloadsBtnEl) {
    // Insert progress ring SVG
    const ring = document.createElement('div');
    ring.className = 'ring';
  ring.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="bg" cx="20" cy="20" r="16.5"></circle><circle class="fg" cx="20" cy="20" r="16.5" stroke-dasharray="103.67" stroke-dashoffset="103.67"></circle></svg>';
    downloadsBtnEl.appendChild(ring);
    ringSvgEl = ring.querySelector('circle.fg');
    downloadsBtnEl.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleDownloadsPopup();
    });
  }
  if (downloadsShowAllBtn) downloadsShowAllBtn.addEventListener('click', ()=> { hideDownloadsPopup(); openDownloads(); });
  // Close popup if clicking elsewhere
  document.addEventListener('click', (e)=>{
    if (!downloadsPopupEl || downloadsPopupEl.classList.contains('hidden')) return;
    const wrapper = downloadsPopupEl.parentElement;
    if (wrapper && !wrapper.contains(e.target)) hideDownloadsPopup();
  });

  // Initialize list with any existing downloads
  refreshDownloadsMini();
  // Subscribe to updates
  window.downloadsAPI?.onStarted(()=> { refreshDownloadsMini(); });
  window.downloadsAPI?.onUpdated(()=> { refreshDownloadsMini(); });
  window.downloadsAPI?.onDone(()=> { refreshDownloadsMini(); });
  window.downloadsAPI?.onCleared(()=> { refreshDownloadsMini(); });

  // window control bindings (Windows frameless window)
  const minBtn   = document.getElementById('min-btn');
  const maxBtn   = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  const windowControls = document.getElementById('window-controls');
  
  console.log('[WindowControls] Elements found:', { minBtn: !!minBtn, maxBtn: !!maxBtn, closeBtn: !!closeBtn, windowControls: !!windowControls });
  
  // Detect platform - hide controls on macOS (uses native traffic lights)
  const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  console.log('[WindowControls] Platform:', navigator.platform, 'isMacOS:', isMacOS);
  
  if (windowControls) {
    if (isMacOS) {
      // Hide window controls on macOS
      windowControls.style.display = 'none';
      // Remove right padding for window controls
      document.getElementById('tab-bar').style.paddingRight = '10px';
    } else if (minBtn && maxBtn && closeBtn) {
      // Windows/Linux: Set up custom title bar controls
      console.log('[WindowControls] Setting up event listeners for Windows/Linux');
      
      minBtn.addEventListener('click', (e) => {
        console.log('[WindowControls] Minimize clicked');
        e.stopPropagation();
        ipcRenderer.invoke('window-minimize');
      });
      maxBtn.addEventListener('click', async (e) => {
        console.log('[WindowControls] Maximize clicked');
        e.stopPropagation();
        await ipcRenderer.invoke('window-maximize');
        updateMaximizeIcon();
      });
      closeBtn.addEventListener('click', (e) => {
        console.log('[WindowControls] Close clicked');
        e.stopPropagation();
        ipcRenderer.invoke('window-close');
      });
      
      // Update maximize icon based on window state
      async function updateMaximizeIcon() {
        try {
          const isMaximized = await ipcRenderer.invoke('window-is-maximized');
          const maximizeIcon = maxBtn.querySelector('.maximize-icon');
          const restoreIcon = maxBtn.querySelector('.restore-icon');
          if (maximizeIcon && restoreIcon) {
            maximizeIcon.style.display = isMaximized ? 'none' : 'block';
            restoreIcon.style.display = isMaximized ? 'block' : 'none';
            maxBtn.title = isMaximized ? 'Restore' : 'Maximize';
            maxBtn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
          }
        } catch (e) {
          // Ignore errors during state check
        }
      }
      
      // Initial state check
      updateMaximizeIcon();
      
      // Listen for window resize to update maximize icon
      window.addEventListener('resize', () => {
        // Debounce resize events
        clearTimeout(window._maximizeIconTimeout);
        window._maximizeIconTimeout = setTimeout(updateMaximizeIcon, 100);
      });
    }
  }

  // update initial zoom display
  ipcRenderer.invoke('get-zoom-factor').then(z => {
    document.getElementById('zoom-percent').textContent = `${Math.round(z * 100)}%`;
  });

  // (Removed broken duplicate context menu wiring)

  // Migrate existing site history from JSON file to localStorage (one-time migration)
  const migrateSiteHistory = async () => {
    try {
      // Check if we already have data in localStorage
      const existingHistory = getSiteHistory();
      if (existingHistory.length === 0) {
        // Try to load from the old JSON file system
        console.log('Attempting to migrate site history from JSON file...');
        // Since we can't access the file directly, we'll just start fresh
        // The site-history.json file was the old method, localStorage is the new method
      }
    } catch (err) {
      console.log('Site history migration skipped:', err.message);
    }
  };
  migrateSiteHistory();

  // ipcRenderer.invoke('load-bookmarks').then(bs => {
  //   bookmarks = bs;
  //   console.log('[DEBUG] Loaded bookmarks:', bookmarks);
  // });
});

// Global keyboard shortcut for DevTools (Ctrl+Shift+I or F12)
document.addEventListener('keydown', (e) => {
  const isMod = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i');
  if (isMod || e.key === 'F12') {
    if (window.electronAPI && window.electronAPI.toggleDevTools) {
      window.electronAPI.toggleDevTools();
      e.preventDefault();
    }
  }
});

// zoom helpers
function updateZoomUI() {
  const zp = document.getElementById('zoom-percent');
  if (zp) {
    ipcRenderer.invoke('get-zoom-factor').then(zf => {
      // just show "NN%", not "Zoom: NN%"
      zp.textContent = `${Math.round(zf * 100)}%`;
    });
  }
}

function zoomIn()  { ipcRenderer.invoke('zoom-in').then(updateZoomUI); }
function zoomOut() { ipcRenderer.invoke('zoom-out').then(updateZoomUI); }

// Optional: sample plugin demo hook (safe if plugin missing)
try {
  if (window.sampleHello && typeof window.sampleHello.onHello === 'function') {
    window.sampleHello.onHello((payload) => {
      console.log('[Sample Plugin] Hello message:', payload);
    });
  }
} catch {}

// Utility: close the menu when interacting with a given element (e.g., webview)
function attachCloseMenuOnInteract(el) {
  if (!el) return;
  const closeIfOpen = () => {
    ipcRenderer.send('menu-popup-hide');
    if (downloadsPopupEl && !downloadsPopupEl.classList.contains('hidden')) {
      hideDownloadsPopup();
    }
  };
  el.addEventListener('mousedown', closeIfOpen);
  el.addEventListener('pointerdown', closeIfOpen);
  el.addEventListener('focus', closeIfOpen, true);
}

// Use electronAPI from preload - already defined at top of file

// Native context menu: delegate to main via preload API
document.addEventListener('contextmenu', (e) => {
  // Determine if inside a webview or general renderer area
  const inWebviewArea = e.target.tagName === 'WEBVIEW' || e.composedPath().some(el => el.id === 'webviews');
  if (!inWebviewArea) return; // Let default OS menu appear in text inputs etc. if desired
  e.preventDefault();

  // Try to extract link/image/selection info (limited for <webview>, better done inside page but sandboxed)
  const selection = window.getSelection()?.toString() || '';
  window.electronAPI?.showContextMenu({
    clientX: e.clientX,
    clientY: e.clientY,
    selectionText: selection,
    isEditable: false
  });
});

// Handle commands from main process triggered by context menu
window.addEventListener('nebula-context-command', (e) => {
  const { cmd, url } = e.detail || {};
  if (!cmd) return;
  switch (cmd) {
    case 'open-link-new-tab':
      if (url) createTab(url);
      break;
    case 'open-image-new-tab':
      if (url) createTab(url);
      break;
    case 'save-image':
      if (!url) return;
      // Try direct network save first (http/file/data)
      if (/^(https?:|file:|data:)/i.test(url)) {
        window.electronAPI.saveImageFromNet(url);
        return;
      }
      // For blob: URLs we need to resolve inside the active webview by converting to dataURL
      if (url.startsWith('blob:')) {
        if (activeTabId) {
          const code = `(async()=>{try{const r=await fetch('${url}');const b=await r.blob();return new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b);});}catch(e){return null;}})();`;
          ipcRenderer.invoke('browserview-execute-js', { tabId: activeTabId, code }).then(dataUrl => {
            if (dataUrl) {
              window.electronAPI.saveImageToDisk('image', dataUrl);
            }
          });
        }
      }
      break;
  }
});

// ------------------------------
// Downloads mini UI helpers
// ------------------------------
function toggleDownloadsPopup() {
  if (!downloadsPopupEl) return;
  if (downloadsPopupEl.classList.contains('hidden')) showDownloadsPopup(); else hideDownloadsPopup();
}
function showDownloadsPopup() {
  if (!downloadsPopupEl) return;
  downloadsPopupEl.classList.remove('hidden');
}
function hideDownloadsPopup() {
  if (!downloadsPopupEl) return;
  downloadsPopupEl.classList.add('hidden');
}

function fmtBytesMini(n) {
  if (!n || n <= 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(n)/Math.log(1024));
  return (n/Math.pow(1024,i)).toFixed(i===0?0:1) + ' ' + u[i];
}

async function refreshDownloadsMini() {
  if (!window.downloadsAPI) return;
  const items = await window.downloadsAPI.list();
  const has = items && items.length > 0;
  if (downloadsEmptyEl) downloadsEmptyEl.style.display = has ? 'none' : 'block';
  if (downloadsListEl) downloadsListEl.innerHTML = (items||[]).slice(0,5).map(d => {
    const pct = d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes||0)*100/d.totalBytes)) : (d.state==='completed'?100:0);
    return `
      <div class="dl-item" data-id="${d.id}">
        <div class="dl-file" title="${d.filename}">${d.filename}</div>
        <div class="dl-actions">
          ${d.state==='in-progress' ? `
            <button data-act="${d.paused?'resume':'pause'}">${d.paused?'Resume':'Pause'}</button>
            <button data-act="cancel">Cancel</button>
          ` : `
            <button data-act="open-file" ${d.state!=='completed'?'disabled':''}>Open</button>
            <button data-act="show-in-folder">Show</button>
          `}
        </div>
        <div class="dl-meta">${d.state} · ${fmtBytesMini(d.receivedBytes||0)} / ${fmtBytesMini(d.totalBytes||0)}</div>
        <div class="dl-progress"><div class="dl-bar" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');

  if (downloadsListEl) {
    downloadsListEl.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const itemEl = btn.closest('.dl-item');
      const id = itemEl?.getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (!id || !act) return;
      await window.downloadsAPI.action(id, act);
      if (act==='cancel') refreshDownloadsMini();
    };
  }

  updateDownloadsRing(items||[]);
}

function updateDownloadsRing(items) {
  if (!ringSvgEl) return;
  // Compute aggregate progress for in-progress downloads
  const inprog = items.filter(d => d.state === 'in-progress');
  const total = inprog.reduce((a,d)=> a + (d.totalBytes||0), 0);
  const done = inprog.reduce((a,d)=> a + (d.receivedBytes||0), 0);
  let pct = 0;
  if (total > 0) pct = Math.max(0, Math.min(1, done/total));
  // If none in progress but some completed recently, show full ring briefly; else hide
  const circumference = 103.67; // 2 * PI * r (r=16.5)
  const offset = circumference * (1 - pct);
  ringSvgEl.style.strokeDasharray = `${circumference}`;
  ringSvgEl.style.strokeDashoffset = `${offset}`;
  // Hide ring when no active downloads
  const show = inprog.length > 0;
  ringSvgEl.style.opacity = show ? '1' : '0';
}
