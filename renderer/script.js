const ipcRenderer = window.electronAPI;
// Lightweight debug logger (toggleable)
const DEBUG = false;
const debug = (...args) => { if (DEBUG) console.log(...args); };

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

// 1) cache hot DOM references
const urlBox       = document.getElementById('url');
const tabBarEl     = document.getElementById('tab-bar');
const webviewsEl   = document.getElementById('webviews');
const menuPopup    = document.getElementById('menu-popup');
// (Removed old custom HTML context menu in favor of native Electron menu)

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

// Fetch plugin-provided pages (browser://<id>) once on startup
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
    if (u.startsWith('browser://')) return u.replace('browser://', '');
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
ipcRenderer.on('record-site-history', (event, url) => {
  debug('[DEBUG] Received site history update:', url);
  addToSiteHistory(url);
});

// Auto-open on download start is disabled by design now.

function createTab(inputUrl) {
  inputUrl = inputUrl || 'browser://home';
  console.log('[DEBUG] createTab() inputUrl =', inputUrl);
  const id = crypto.randomUUID();
  if (inputUrl.startsWith('browser://') && !pluginPagesReady) {
    // Defer creation until plugin pages known to avoid 404 race
    console.log('[DEBUG] Deferring createTab until pluginPagesReady');
    pendingInternalNavigations.push(() => createTab(inputUrl));
    return id;
  }
  
  // Handle home page specially
  if (inputUrl === 'browser://home') {
    // Show home container and hide webviews
    const homeContainer = document.getElementById('home-container');
    const webviewsEl = document.getElementById('webviews');
    if (homeContainer) homeContainer.classList.add('active');
    if (webviewsEl) webviewsEl.classList.add('hidden');
    const tab = {
        id,
        url: inputUrl,
        title: 'New Tab',
        favicon: '',
        history: [inputUrl],
        historyIndex: 0,
        isHome: true
    };
    tabs.push(tab);
  setActiveTab(id);
  // Render the tab bar so the new home tab appears
  scheduleRenderTabs();
    return id;
  }
  
  // For all other URLs, use webview
  let resolvedUrl = resolveInternalUrl(inputUrl);
  console.log('[DEBUG] createTab resolvedUrl:', resolvedUrl, 'from inputUrl:', inputUrl);
  // If it's a raw data: URL (image) keep as is; blob: will only resolve within its origin context (may fail)
  // For very long data URLs we could embed them in a minimal viewer page for cleaner rendering.
  if (resolvedUrl.startsWith('data:') && resolvedUrl.length > 4096) {
    // Create a simple object URL page to avoid huge URL in the address bar (cannot easily persist across restarts).
    const html = `<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;">`+
      `<img src="${resolvedUrl}" style="max-width:100%;max-height:100%;object-fit:contain;"/>`+
      `</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    resolvedUrl = URL.createObjectURL(blob);
  }
  debug('[DEBUG] createTab() resolvedUrl =', resolvedUrl);

  const webview = document.createElement('webview');
  // give the webview an id and set its source and attributes so it actually loads and can be managed
  webview.id = `tab-${id}`;
  webview.src = resolvedUrl;
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('partition', 'persist:main');
  webview.setAttribute('preload', '../preload.js');
  // Add attributes needed for Google OAuth and sign-in flows
  webview.setAttribute('webpreferences', 'allowRunningInsecureContent=false,javascript=true,webSecurity=true');
  try {
    const baseUA = navigator.userAgent.includes('Nebula/') ? navigator.userAgent : navigator.userAgent + ' Nebula/1.0.0';
    webview.setAttribute('useragent', baseUA);
  } catch {
    // fallback: let Electron supply default UA
  }

  webview.addEventListener('page-favicon-updated', e => {
    if (e.favicons.length > 0) updateTabMetadata(id, 'favicon', e.favicons[0]);
  });

  // Send bookmarks to home page when it loads
  webview.addEventListener('dom-ready', () => {
    if (inputUrl === 'browser://home') {
      webview.executeJavaScript(`
        if (window.receiveBookmarks) {
          window.receiveBookmarks(${JSON.stringify(bookmarks)});
        } else {
          // Store bookmarks for when the page script loads
          window._pendingBookmarks = ${JSON.stringify(bookmarks)};
        }
      `);
    }
  });

  // Consolidated navigation recording - only use did-navigate to avoid duplicates
  webview.addEventListener('did-navigate', e => {
    handleNavigation(id, e.url);
    if (e.url.startsWith('http')) debug('[DEBUG] Recording navigation to:', e.url);
    if (/\/cdn-cgi\//.test(e.url) || /challenge/i.test(e.url)) {
      console.log('[Nebula] Cloudflare challenge detected at', e.url);
    }
  });
  
  webview.addEventListener('did-navigate-in-page', e => {
    handleNavigation(id, e.url);
    if (e.url.startsWith('http')) debug('[DEBUG] Recording in-page navigation to:', e.url);
  });

  // After load, just refresh nav buttons to avoid jank
  webview.addEventListener('did-finish-load', () => {
    scheduleUpdateNavButtons();
  });

  // catch any target="_blank" or window.open() calls and open them as new tabs
  webview.addEventListener('new-window', e => {
    // Allow auth / SSO popup windows (don't preventDefault) when target is http(s)
    // so form POST + redirect chains stay intact. For simple links attempting to
    // open a new tab, we create an in-app tab instead. Heuristic: if disposition
    // is 'foreground-tab' or 'background-tab', treat as tab; otherwise allow popup.
    if (e.url && (e.url.startsWith('http://') || e.url.startsWith('https://'))) {
      if (e.disposition && e.disposition.includes('tab')) {
        e.preventDefault();
        createTab(e.url);
      } // else let Electron create a real popup window
    } else {
      e.preventDefault();
    }
  });

  // After creating dynamic webview:
  webview.addEventListener('ipc-message', e => {
    if (e.channel === 'navigate' && e.args[0]) {
      const targetUrl = e.args[0];
      const opts = e.args[1] || {};
      // If user accepted insecure warning, record host to bypass for session
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
    } else if (e.channel === 'theme-update') {
      const home = document.getElementById('home-webview');
      if (home) home.send('theme-update', ...e.args);
    }
  });

  // Ensure interacting with the webview closes any open menu popup
  attachCloseMenuOnInteract(webview);

  webviewsEl.appendChild(webview);

  tabs.push({
    id,
    url: inputUrl, // ← save the original input like "browser://home"
    title: 'New Tab',
    favicon: null,
    history: [inputUrl],
    historyIndex: 0
  });

  setActiveTab(id);
  scheduleRenderTabs();
}

// Expose for plugin usage (e.g., Nebot panel "Open Page")
try { window.createTab = createTab; } catch {}



function resolveInternalUrl(url) {
  console.log('[DEBUG] resolveInternalUrl called with:', url);
  if (url.startsWith('browser://')) {
    // Support query / hash on internal pages (e.g., browser://insecure?target=...)
    const tail = url.replace('browser://', '');
    const page = tail.split(/[?#]/)[0];
    const suffix = tail.slice(page.length); // includes ? and/or # if present
    console.log('[DEBUG] Extracted page:', page);
    // Fast path: if user typed browser://nebot and plugin page exists, return immediately
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
      console.log('[DEBUG] Resolving browser://' + page, 'plug:', plug);
      if (plug && (plug.fileUrl || plug.file)) {
        // Prefer pre-built fileUrl for correctness across platforms
        const resolved = plug.fileUrl ? plug.fileUrl : (plug.file.startsWith('file://') ? plug.file : 'file://' + plug.file.replace(/\\/g,'/'));
        console.log('[DEBUG] Resolved plugin page', page, '->', resolved);
        return resolved + suffix;
      }
  // Fallback: built-in renderer copy (e.g., renderer/nebot.html)
  console.log('[DEBUG] Using fallback for page:', page);
      if (page === 'nebot') return 'nebot.html' + suffix;
      return `${page}.html${suffix}`;
    }
    console.log('[DEBUG] Page not in allowedInternalPages, returning 404');
    return '404.html';
  }
  // Allow direct loading of common schemes without forcing https://
  if (/^(https?:|file:|data:|blob:)/i.test(url)) return url;
  return `https://${url}`;
}


function handleLoadFail(tabId) {
  return (event) => {
    if (!event.validatedURL.includes('browser://') && event.errorCode !== -3) {
      const webview = document.getElementById(`tab-${tabId}`);
      webview.src = `404.html?url=${encodeURIComponent(tabs.find(t => t.id === tabId).url)}`;
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
  const isInternal = input.startsWith('browser://');
  const isLikelyUrl = hasProtocol || input.includes('.');
  let resolved;
  if (isFileProtocol) {
    resolved = input;
  } else if (looksLikeLocalPath) {
    let p = input.replace(/\\/g,'/');
    if (/^[A-Za-z]:\//.test(p)) resolved = 'file:///' + encodeURI(p); else if (p.startsWith('/')) resolved = 'file://' + encodeURI(p); else resolved = 'file://' + encodeURI(p);
  } else if (!isInternal && !isLikelyUrl) {
    resolved = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  } else {
    resolved = resolveInternalUrl(input);
  }

  console.log('[DEBUG] performNavigation input:', input, 'resolved:', resolved, 'tab.isHome:', tab.isHome, 'isInternal:', isInternal);

  // Intercept plain HTTP (not HTTPS) navigations (excluding localhost / 127.* / internal pages)
  try {
    if (!isInternal && /^http:\/\//i.test(resolved)) {
      const u = new URL(resolved);
      const host = u.hostname;
      const isLoopback = /^(localhost|127\.0\.0\.1|::1)$/.test(host);
      if (!isLoopback && !insecureBypassedHosts.has(host)) {
        const encoded = encodeURIComponent(resolved);
        // Directly load insecure.html (avoid custom scheme so OS doesn't try to resolve an external handler)
        const interstitial = `insecure.html?target=${encoded}`;
        // For a fresh home tab, convert directly to webview showing the interstitial
        if (tab.isHome) {
          convertHomeTabToWebview(tab.id, originalInputForHistory, interstitial);
          return;
        }
        // Navigate existing webview to interstitial instead
        const webviewExisting = document.getElementById(`tab-${activeTabId}`);
        if (webviewExisting) webviewExisting.src = interstitial;
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
        tab.history.push(originalInputForHistory);
        tab.historyIndex++;
        tab.url = originalInputForHistory;
        scheduleRenderTabs();
        scheduleUpdateNavButtons();
        return;
      }
    }
  } catch (e) { debug('[DEBUG] HTTP interception error', e); }

  if (tab.isHome && !isInternal) {
    convertHomeTabToWebview(tab.id, originalInputForHistory, resolved);
    return;
  }

  // If this is a home tab and we're navigating to an internal page, convert to webview
  if (tab.isHome && isInternal) {
    convertHomeTabToWebview(tab.id, originalInputForHistory, resolved);
    return;
  }

  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!webview) {
    console.log('[DEBUG] No webview found for tab', activeTabId, 'creating new tab instead');
    createTab(input);
    return;
  }
  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(originalInputForHistory);
  tab.historyIndex++;
  tab.url = originalInputForHistory;
  webview.src = resolved;
  scheduleRenderTabs();
  scheduleUpdateNavButtons();
}

function navigate() {
  const rawInput = urlBox.value.trim();
  let input = rawInput;
  if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) input = input.slice(1, -1);
  if (input !== rawInput) urlBox.value = input;
  const isInternal = input.startsWith('browser://');
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

function convertHomeTabToWebview(tabId, inputUrl, resolvedUrl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Ensure webviews container is visible
  const webviewsEl = document.getElementById('webviews');
  if (webviewsEl) webviewsEl.classList.remove('hidden');
  // Create a new webview for this tab
  const webview = document.createElement('webview');
  webview.id = `tab-${tabId}`;
  webview.src = resolvedUrl;
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('partition', 'persist:main');
  webview.setAttribute('preload', '../preload.js');
  // Add attributes needed for Google OAuth and sign-in flows
  webview.setAttribute('webpreferences', 'allowRunningInsecureContent=false,javascript=true,webSecurity=true');
  try {
    const baseUA2 = navigator.userAgent.includes('Nebula/') ? navigator.userAgent : navigator.userAgent + ' Nebula/1.0.0';
    webview.setAttribute('useragent', baseUA2);
  } catch {}

  // Add event listeners
  webview.addEventListener('did-fail-load', handleLoadFail(tabId));
  webview.addEventListener('page-title-updated', e => updateTabMetadata(tabId, 'title', e.title));
  webview.addEventListener('page-favicon-updated', e => {
    if (e.favicons.length > 0) updateTabMetadata(tabId, 'favicon', e.favicons[0]);
  });

  webview.addEventListener('did-navigate', e => {
    handleNavigation(tabId, e.url);
    if (/\/cdn-cgi\//.test(e.url) || /challenge/i.test(e.url)) {
      console.log('[Nebula] Cloudflare challenge detected at', e.url);
    }
  });
  webview.addEventListener('did-navigate-in-page', e => {
    handleNavigation(tabId, e.url);
  });
  webview.addEventListener('did-finish-load', () => {
    scheduleUpdateNavButtons();
  });

  webview.addEventListener('new-window', e => {
    if (e.url && (e.url.startsWith('http://') || e.url.startsWith('https://'))) {
      if (e.disposition && e.disposition.includes('tab')) {
        e.preventDefault();
        createTab(e.url);
      }
      // otherwise allow popup for auth
    } else {
      e.preventDefault();
    }
  });

  // After creating dynamic webview:
  webview.addEventListener('ipc-message', e => {
    if (e.channel === 'theme-update') {
      const home = document.getElementById('home-webview');
      if (home) home.send('theme-update', ...e.args);
    } else if (e.channel === 'navigate' && e.args[0]) {
      const targetUrl = e.args[0];
      const opts = e.args[1] || {};
      try {
        if (opts.insecureBypass && /^http:\/\//i.test(targetUrl)) {
          const h = new URL(targetUrl).hostname;
          insecureBypassedHosts.add(h);
        }
      } catch {}
      urlBox.value = targetUrl;
      navigate();
    }
  });

  // Add webview to DOM
  webviewsEl.appendChild(webview);

  // Ensure interacting with the webview closes any open menu popup
  attachCloseMenuOnInteract(webview);

  // Update tab properties
  tab.isHome = false;
  tab.webview = webview;
  tab.url = inputUrl;
  tab.history = [inputUrl];
  tab.historyIndex = 0;

  // Hide home container and show webview
  const homeContainer = document.getElementById('home-container');
  if (homeContainer) homeContainer.classList.remove('active');
  webview.classList.add('active');

  scheduleUpdateNavButtons();
  // Activate converted webview tab and update UI
  setActiveTab(tabId);
  scheduleRenderTabs();
}

function handleNavigation(tabId, newUrl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  debug('[DEBUG] handleNavigation called with:', newUrl);

  // --- record every real navigation into history ---
  if (tab.history[tab.historyIndex] !== newUrl) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(newUrl);
    tab.historyIndex++;
  }

  // Record site history in localStorage (skip internal pages and file:// URLs)
  if (!newUrl.endsWith('home.html') && 
      !newUrl.endsWith('settings.html') && 
      !newUrl.startsWith('file://') && 
      !newUrl.includes('browser://') &&
      newUrl.startsWith('http')) {
  debug('[DEBUG] Adding to site history:', newUrl);
    addToSiteHistory(newUrl);
    // Also send to main process for file storage
    ipcRenderer.invoke('save-site-history-entry', newUrl);
  }

  // translate local files back to our browser:// scheme
  const isHome     = newUrl.endsWith('home.html');
  const isSettings = newUrl.endsWith('settings.html');
  const displayUrl = isHome
    ? 'browser://home'
    : isSettings
      ? 'browser://settings'
      : newUrl;

  tab.url = displayUrl;

  if (tabId === activeTabId) {
    urlBox.value = displayUrl === 'browser://home' ? '' : displayUrl;
  }

  scheduleRenderTabs();
  scheduleUpdateNavButtons();
}


function setActiveTab(id) {
  // hide all individual webviews
  tabs.forEach(t => {
    const w = document.getElementById(`tab-${t.id}`);
    if (w) w.classList.remove('active');
  });
  // toggle containers
  const homeContainer = document.getElementById('home-container');
  const webviewsEl = document.getElementById('webviews');

  const tab = tabs.find(t => t.id === id);
  if (tab) {
    if (tab.isHome) {
      homeContainer.classList.add('active');
      webviewsEl.classList.add('hidden');
    } else {
      if (homeContainer) homeContainer.classList.remove('active');
      webviewsEl.classList.remove('hidden');
      const activeWebview = document.getElementById(`tab-${id}`);
      if (activeWebview) activeWebview.classList.add('active');
    }
  }

  activeTabId = id;

  if (tab) {
    // If the tab URL represents the home page, keep the URL bar blank.
    urlBox.value = tab.url === 'browser://home' ? '' : tab.url;
  scheduleRenderTabs();
    updateNavButtons();
    updateZoomUI();            // ← update zoom display for new active tab
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
      // Remove webview
      const w = document.getElementById(`tab-${id}`);
      if (w) w.remove();
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
  const w = document.getElementById(`tab-${id}`);
  if (w) w.remove();
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

    if (!lastTabOrder.includes(tab.id)) {
      // New tab enters with animation
      el.classList.add('tab--enter');
    }

    if (tab.favicon) {
      const icon = document.createElement('img');
      icon.src = tab.favicon;
      icon.className = 'tab-favicon';
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
ipcRenderer.on('open-url', (event, url) => {
  tabs = [];
  activeTabId = null;
  webviewsEl.innerHTML = '';
  tabBarEl.innerHTML = '';
  createTab(url);
});

function goBack() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview && webview.canGoBack()) {
    webview.goBack();
  }
}

function goForward() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview && webview.canGoForward()) {
    webview.goForward();
  }
}

function updateNavButtons() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!backBtnCached || !fwdBtnCached) {
    backBtnCached = document.querySelector('.nav-left button:nth-child(1)');
    fwdBtnCached  = document.querySelector('.nav-left button:nth-child(2)');
  }
  if (backBtnCached) backBtnCached.disabled = !webview || !webview.canGoBack();
  if (fwdBtnCached)  fwdBtnCached.disabled  = !webview || !webview.canGoForward();
}

function reload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview) {
    webview.reload();
  scheduleUpdateNavButtons();    // keep back/forward buttons in sync after a reload
  }
}

function hardReload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview && typeof webview.reloadIgnoringCache === 'function') {
    webview.reloadIgnoringCache();
    scheduleUpdateNavButtons();
  } else if (webview) {
    // Fallback
    webview.reload();
  }
}

function freshReload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!webview) return;
  try {
    const u = new URL(webview.getURL());
    u.searchParams.set('_bust', Date.now().toString());
    webview.src = u.toString();
  } catch {
    // If URL parsing fails (e.g., internal pages), fall back to hard reload
    hardReload();
  }
}

// Function to open the Settings page
function openSettings() {
  createTab('browser://settings');
}

// Open Downloads manager page
function openDownloads() {
  createTab('browser://downloads');
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
  menuPopup.classList.toggle('hidden');
  if (!menuPopup.classList.contains('hidden')) {
    updateZoomUI();          // ← refresh zoom % whenever menu opens
  }
});

// Prevent clicks inside the popup from bubbling to the document
if (menuPopup) {
  menuPopup.addEventListener('click', (e) => e.stopPropagation());
}

// Close when clicking anywhere outside the menu wrapper
document.addEventListener('click', (e) => {
  if (!menuPopup || menuPopup.classList.contains('hidden')) return;
  if (menuWrapper && !menuWrapper.contains(e.target)) {
    menuPopup.classList.add('hidden');
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuPopup && !menuPopup.classList.contains('hidden')) {
    menuPopup.classList.add('hidden');
  }
  if (e.key === 'Escape' && downloadsPopupEl && !downloadsPopupEl.classList.contains('hidden')) {
    hideDownloadsPopup();
  }
});

// Also close when interacting with main content areas (covers webview clicks)
const homeContainerEl = document.getElementById('home-container');
if (webviewsEl) {
  webviewsEl.addEventListener('pointerdown', () => {
    if (!menuPopup.classList.contains('hidden')) menuPopup.classList.add('hidden');
  });
}
if (homeContainerEl) {
  homeContainerEl.addEventListener('pointerdown', () => {
    if (!menuPopup.classList.contains('hidden')) menuPopup.classList.add('hidden');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Initial boot
  createTab();
  // Handle IPC messages from the static home webview (bookmarks navigation)
  const staticHome = document.getElementById('home-webview');
  if (staticHome) {
  // Close menu when interacting with the home webview
  attachCloseMenuOnInteract(staticHome);
    staticHome.addEventListener('ipc-message', (e) => {
      if (e.channel === 'navigate' && e.args[0]) {
        urlBox.value = e.args[0];
        navigate();
      }
    });
  }
  // Listen for IPC messages from other webviews (e.g., settings)
  webviewsEl.addEventListener('ipc-message', (e) => {
    // Navigation messages from home or other pages
    if (e.channel === 'navigate' && e.args[0]) {
      const targetUrl = e.args[0];
      const opts = e.args[1] || {};
      if (opts.newTab) {
        // Open in a new tab, leaving settings/home intact
        createTab(targetUrl);
      } else {
        urlBox.value = targetUrl;
        navigate();
      }
    }
    // Theme update from settings webview
    if (e.channel === 'theme-update' && e.args[0]) {
      const homeWebview = document.getElementById('home-webview');
      if (homeWebview) {
        homeWebview.send('theme-update', e.args[0]);
      }
    }
  });
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

  // wire up back/forward buttons
  const backBtn = document.querySelector('.nav-left button:nth-child(1)');
  const forwardBtn = document.querySelector('.nav-left button:nth-child(2)');
  backBtn.addEventListener('click', goBack);
  forwardBtn.addEventListener('click', goForward);
  // cache for faster updates
  backBtnCached = backBtn;
  fwdBtnCached = forwardBtn;

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

  // window control bindings
  const minBtn   = document.getElementById('min-btn');
  const maxBtn   = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  if (minBtn && maxBtn && closeBtn) {
    if (process.platform !== 'darwin') {
      minBtn.addEventListener('click', () => ipcRenderer.invoke('window-minimize'));
      maxBtn.addEventListener('click', () => ipcRenderer.invoke('window-maximize'));
      closeBtn.addEventListener('click', () => ipcRenderer.invoke('window-close'));
    } else {
      document.getElementById('window-controls').style.display = 'none';
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
    if (menuPopup && !menuPopup.classList.contains('hidden')) {
      menuPopup.classList.add('hidden');
    }
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
        const webview = document.getElementById(`tab-${activeTabId}`);
        if (webview) {
          webview.executeJavaScript(`(async()=>{try{const r=await fetch('${url}');const b=await r.blob();return new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b);});}catch(e){return null;}})();`).then(dataUrl=>{
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
