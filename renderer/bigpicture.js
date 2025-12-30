/**
 * Big Picture Mode - Controller-friendly UI for Steam Deck / Console
 * Supports gamepad navigation, on-screen keyboard, and touch input
 */

const ipcRenderer = window.electronAPI;

// =============================================================================
// SCROLL NORMALIZATION (consistent scroll speed across all sites)
// =============================================================================

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
    webview.insertCSS(SCROLL_NORMALIZATION_CSS);
    webview.executeJavaScript(SCROLL_NORMALIZATION_JS);
    console.log('[BigPicture] Applied scroll normalization to webview');
  } catch (err) {
    console.warn('[BigPicture] Failed to apply scroll normalization:', err);
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Navigation
  NAV_SOUND_ENABLED: true,
  HAPTIC_FEEDBACK: true,
  
  // Controller deadzone
  STICK_DEADZONE: 0.3,
  TRIGGER_DEADZONE: 0.1,
  
  // Timing
  REPEAT_DELAY: 500,    // Initial delay before key repeat
  REPEAT_RATE: 100,     // Rate of key repeat
  
  // Quick access sites
  DEFAULT_QUICK_ACCESS: [
    { title: 'Google', url: 'https://www.google.com', icon: 'search' },
    { title: 'YouTube', url: 'https://www.youtube.com', icon: 'play_circle' },
    { title: 'Reddit', url: 'https://www.reddit.com', icon: 'forum' },
    { title: 'Twitter', url: 'https://twitter.com', icon: 'tag' },
    { title: 'Wikipedia', url: 'https://www.wikipedia.org', icon: 'school' },
    { title: 'Netflix', url: 'https://www.netflix.com', icon: 'movie' },
  ]
};

// =============================================================================
// STATE
// =============================================================================

const state = {
  currentSection: 'home',
  focusedElement: null,
  focusableElements: [],
  focusIndex: 0,
  
  // Gamepad
  gamepadConnected: false,
  gamepadIndex: null,
  lastInput: { x: 0, y: 0 },
  inputRepeatTimer: null,
  
  // Virtual cursor for webview
  cursorEnabled: false,
  cursorX: 0,
  cursorY: 0,
  cursorSpeed: 15,
  cursorElement: null,
  
  // Sidebar visibility (for fullscreen webview)
  sidebarHidden: false,
  
  // OSK (On-Screen Keyboard)
  oskVisible: false,
  oskCallback: null,
  oskFocusIndex: 0,
  
  // Data
  bookmarks: [],
  history: [],
  
  // Mouse tracking
  mouseTimeout: null,
  
  // Webview for browsing
  currentWebview: null,
  webviewContentsId: null, // For native input event injection
  webviewStack: []  // Stack of webview instances for navigation history
};

// =============================================================================
// INITIALIZATION
// =============================================================================

function applyDisplayScale(scalePercent, reason = 'unknown') {
  const numeric = Number(scalePercent);
  if (!Number.isFinite(numeric)) return;

  const clampedPercent = Math.min(300, Math.max(50, Math.round(numeric)));
  const zoomFactor = Math.max(0.5, Math.min(3, clampedPercent / 100));

  // Prefer Electron zoom (consistent across Chromium) with CSS fallback.
  try {
    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      ipcRenderer.invoke('set-zoom-factor', zoomFactor).catch(err => {
        console.warn('[BigPicture] set-zoom-factor failed; falling back to CSS zoom:', err);
        applyCssZoom(zoomFactor);
      });
    } else {
      applyCssZoom(zoomFactor);
    }
    applyCssZoom(zoomFactor);
    console.log(`[BigPicture] Applied display scale ${clampedPercent}% (zoom=${zoomFactor}) via ${reason}`);
  } catch (err) {
    console.warn('[BigPicture] Failed applying display scale:', err);
  }
}

function applyCssZoom(factor) {
  try {
    document.documentElement.style.zoom = factor;
  } catch {}
  try {
    document.body.style.zoom = factor;
  } catch {}
  try {
    document.documentElement.style.setProperty('--bp-scale-factor', factor);
    document.body.style.setProperty('--bp-scale-factor', factor);
  } catch {}
}

function applyDisplayScaleFromStorage(reason = 'startup') {
  try {
    const savedScale = localStorage.getItem(DISPLAY_SCALE_KEY);
    if (!savedScale) return;
    const parsed = parseInt(savedScale, 10);
    if (Number.isFinite(parsed)) {
      currentDisplayScale = Math.min(300, Math.max(50, parsed));
      applyDisplayScale(currentDisplayScale, `${reason}-storage`);
      updateScaleDisplay();
    }
  } catch (err) {
    console.warn('[BigPicture] Failed to read display scale from storage:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[BigPicture] Initializing Big Picture Mode');

  // Apply saved display scale as early as possible for this window.
  applyDisplayScaleFromStorage('DOMContentLoaded');
  
  initClock();
  initNavigation();
  initGamepadSupport();
  initMouseTracking();
  initKeyboardShortcuts();
  initOSK();
  loadData();
  
  // Set initial focus
  setTimeout(() => {
    updateFocusableElements();
    focusFirstElement();
  }, 100);
});

// =============================================================================
// CLOCK & DATE
// =============================================================================

function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('bp-time');
  const dateEl = document.getElementById('bp-date');
  
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }
  
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString([], { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  // Update greeting based on time
  const greetingEl = document.getElementById('greeting-text');
  if (greetingEl) {
    const hour = now.getHours();
    let greeting = 'Welcome back';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else greeting = 'Good evening';
    greetingEl.textContent = greeting;
  }
}

// =============================================================================
// NAVIGATION
// =============================================================================

function initNavigation() {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (section) {
        switchSection(section);
      }
    });
  });
  
  // Exit button
  const exitBtn = document.getElementById('exitBigPicture');
  if (exitBtn) {
    exitBtn.addEventListener('click', exitBigPictureMode);
  }
  
  // Search card click
  const searchCard = document.querySelector('.search-card');
  if (searchCard) {
    searchCard.addEventListener('click', () => openOSK('search'));
  }
  
  // Search input
  const searchInput = document.getElementById('bp-search');
  if (searchInput) {
    searchInput.addEventListener('focus', () => openOSK('search'));
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch(searchInput.value);
      }
    });
  }
  
  // NeBot launch
  const launchNebot = document.getElementById('launchNebot');
  if (launchNebot) {
    launchNebot.addEventListener('click', () => navigateTo('browser://nebot'));
  }
  
  // History section buttons
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }
  
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', async () => {
      await loadHistory();
      showToast('History refreshed');
    });
  }
  
  // Settings cards
  document.querySelectorAll('.settings-card').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      handleSettingsAction(action);
    });
  });
}

// =============================================================================
// SIDEBAR TOGGLE (for fullscreen webview)
// =============================================================================

function toggleSidebar() {
  state.sidebarHidden = !state.sidebarHidden;
  
  const sidebar = document.querySelector('.bp-sidebar');
  const content = document.querySelector('.bp-content');
  const header = document.querySelector('.bp-header');
  
  if (state.sidebarHidden) {
    sidebar?.classList.add('sidebar-hidden');
    content?.classList.add('fullscreen');
    header?.classList.add('sidebar-hidden');
    showToast('📺 Fullscreen mode | Press ☰ to show sidebar');
  } else {
    sidebar?.classList.remove('sidebar-hidden');
    content?.classList.remove('fullscreen');
    header?.classList.remove('sidebar-hidden');
    showToast('Sidebar restored');
  }
}

function showSidebar() {
  if (state.sidebarHidden) {
    toggleSidebar();
  }
}

function switchSection(sectionId) {
  console.log('[BigPicture] Switching to section:', sectionId);
  
  // Restore sidebar when leaving browse section
  if (sectionId !== 'browse' && state.sidebarHidden) {
    showSidebar();
  }
  
  // Handle webview container visibility (preserve state instead of destroying)
  const webviewContainer = document.getElementById('webview-container');
  if (webviewContainer) {
    if (sectionId === 'browse' && state.currentWebview) {
      // Show the preserved webview when going back to browse
      webviewContainer.classList.remove('hidden');
      // Re-enable cursor when returning to browse
      enableCursor();
    } else if (sectionId !== 'browse') {
      // Just hide the webview, don't destroy it
      webviewContainer.classList.add('hidden');
      // Disable cursor when leaving browse
      disableCursor();
    }
  }
  
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });
  
  // Update sections
  document.querySelectorAll('.bp-section').forEach(section => {
    section.classList.toggle('active', section.id === `section-${sectionId}`);
  });
  
  state.currentSection = sectionId;
  
  // Update focusable elements for new section
  setTimeout(() => {
    updateFocusableElements();
    focusFirstInContent();
  }, 50);
  
  playNavSound();
}

function updateFocusableElements() {
  // If OSK is visible, only include OSK elements
  if (state.oskVisible) {
    const oskOverlay = document.getElementById('osk-overlay');
    if (oskOverlay) {
      state.focusableElements = [...oskOverlay.querySelectorAll('[data-focusable]')];
      console.log('[BigPicture] OSK focusable elements:', state.focusableElements.length);
      return;
    }
  }
  
  // When in webview mode, only sidebar navigation is available
  if (state.cursorEnabled && state.currentWebview) {
    state.focusableElements = [
      ...document.querySelectorAll('.bp-sidebar [data-focusable]'),
      ...document.querySelectorAll('.bp-header [data-focusable]')
    ];
    console.log('[BigPicture] Webview mode - sidebar focusable elements:', state.focusableElements.length);
    return;
  }
  
  const activeSection = document.querySelector('.bp-section.active');
  if (!activeSection) return;
  
  // Get all focusable elements in sidebar and active section
  state.focusableElements = [
    ...document.querySelectorAll('.bp-sidebar [data-focusable]'),
    ...activeSection.querySelectorAll('[data-focusable]'),
    ...document.querySelectorAll('.bp-header [data-focusable]')
  ];
  
  console.log('[BigPicture] Focusable elements:', state.focusableElements.length);
}

function focusFirstElement() {
  if (state.focusableElements.length > 0) {
    focusElement(state.focusableElements[0]);
    state.focusIndex = 0;
  }
}

function focusFirstInContent() {
  const activeSection = document.querySelector('.bp-section.active');
  if (!activeSection) return;
  
  const firstFocusable = activeSection.querySelector('[data-focusable]');
  if (firstFocusable) {
    const index = state.focusableElements.indexOf(firstFocusable);
    if (index !== -1) {
      focusElement(firstFocusable);
      state.focusIndex = index;
    }
  }
}

function focusElement(element) {
  if (!element) return;
  
  // Remove focus from previous
  if (state.focusedElement) {
    state.focusedElement.classList.remove('focused');
  }
  
  // Add focus to new element
  element.classList.add('focused');
  element.focus();
  state.focusedElement = element;
  
  // Scroll into view if needed
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function navigateFocus(direction) {
  if (state.focusableElements.length === 0) return;
  
  let newIndex = state.focusIndex;
  
  switch (direction) {
    case 'up':
      newIndex = findElementInDirection('up');
      break;
    case 'down':
      newIndex = findElementInDirection('down');
      break;
    case 'left':
      newIndex = findElementInDirection('left');
      break;
    case 'right':
      newIndex = findElementInDirection('right');
      break;
  }
  
  if (newIndex !== state.focusIndex && newIndex >= 0 && newIndex < state.focusableElements.length) {
    state.focusIndex = newIndex;
    focusElement(state.focusableElements[newIndex]);
    playNavSound();
  }
}

function findElementInDirection(direction) {
  const current = state.focusedElement;
  if (!current) return 0;
  
  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2
  };
  
  let bestIndex = state.focusIndex;
  let bestDistance = Infinity;
  
  state.focusableElements.forEach((element, index) => {
    if (element === current) return;
    
    const rect = element.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    
    // Check if element is in the correct direction
    let isValid = false;
    switch (direction) {
      case 'up':
        isValid = center.y < currentCenter.y - 10;
        break;
      case 'down':
        isValid = center.y > currentCenter.y + 10;
        break;
      case 'left':
        isValid = center.x < currentCenter.x - 10;
        break;
      case 'right':
        isValid = center.x > currentCenter.x + 10;
        break;
    }
    
    if (isValid) {
      const distance = Math.sqrt(
        Math.pow(center.x - currentCenter.x, 2) + 
        Math.pow(center.y - currentCenter.y, 2)
      );
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
  });
  
  return bestIndex;
}

function activateFocused() {
  if (state.focusedElement) {
    state.focusedElement.click();
    playSelectSound();
  }
}

function goBack() {
  // If OSK is open, close it
  if (state.oskVisible) {
    closeOSK();
    return;
  }
  
  // If viewing a website, go back in browsing history
  if (state.currentSection === 'browse' && state.currentWebview) {
    if (state.currentWebview.canGoBack()) {
      state.currentWebview.goBack();
      return;
    }
  }
  
  // If not on home, go to home
  if (state.currentSection !== 'home') {
    switchSection('home');
    // Cleanup webview
    const container = document.getElementById('webview-container');
    if (container) {
      const webview = container.querySelector('webview');
      if (webview) webview.remove();
      container.classList.add('hidden');
    }
    state.currentWebview = null;
    // Focus the home nav item
    const homeNav = document.querySelector('.nav-item[data-section="home"]');
    if (homeNav) {
      const index = state.focusableElements.indexOf(homeNav);
      if (index !== -1) {
        state.focusIndex = index;
        focusElement(homeNav);
      }
    }
  }
}

function goForward() {
  // If viewing a website, go forward in browsing history
  if (state.currentSection === 'browse' && state.currentWebview) {
    if (state.currentWebview.canGoForward()) {
      state.currentWebview.goForward();
    }
  }
}

// =============================================================================
// GAMEPAD SUPPORT
// =============================================================================

function initGamepadSupport() {
  if (!navigator.getGamepads) {
    console.warn('[BigPicture] Gamepad API not available in this environment');
    return;
  }

  // Note: On Linux (and some controllers like handheld integrated gamepads),
  // the `gamepadconnected` event may not fire until the first button press,
  // or at all. We rely on continuous polling for robustness.
  window.addEventListener('gamepadconnected', (e) => {
    console.log('[BigPicture] Gamepad connected:', e.gamepad?.id || 'unknown');
    // Prefer the first connected controller as the active one.
    if (state.gamepadIndex === null) {
      state.gamepadConnected = true;
      state.gamepadIndex = e.gamepad.index;
      showToast('Controller connected');
    }
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    console.log('[BigPicture] Gamepad disconnected:', e.gamepad?.id || 'unknown');
    // If the active controller disconnected, clear it; polling will auto-select another.
    if (state.gamepadIndex === e.gamepad.index) {
      state.gamepadConnected = false;
      state.gamepadIndex = null;
      showToast('Controller disconnected');
    }
  });

  // Initial scan (covers controllers that are already connected at load).
  refreshActiveGamepad(true);

  // Start polling for gamepad input
  requestAnimationFrame(pollGamepad);
}

function getFirstConnectedGamepad(gamepads) {
  if (!gamepads) return null;
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (gp) return gp;
  }
  return null;
}

function refreshActiveGamepad(isInitial = false) {
  const gamepads = navigator.getGamepads();

  // If we have an index, verify it still points to a real gamepad.
  let active = null;
  if (state.gamepadIndex !== null) {
    active = gamepads[state.gamepadIndex] || null;
  }

  // Fallback: pick the first connected controller.
  if (!active) {
    active = getFirstConnectedGamepad(gamepads);
  }

  if (active) {
    const changed = !state.gamepadConnected || state.gamepadIndex !== active.index;
    state.gamepadConnected = true;
    state.gamepadIndex = active.index;
    if (changed && !isInitial) {
      console.log('[BigPicture] Active gamepad selected:', active.id);
      showToast('Controller connected');
    }
  } else {
    if (state.gamepadConnected) {
      state.gamepadConnected = false;
      state.gamepadIndex = null;
      if (!isInitial) {
        showToast('Controller disconnected');
      }
    }
    state.gamepadConnected = false;
    state.gamepadIndex = null;
  }

  return { gamepads, active };
}

function pollGamepad() {
  const { active } = refreshActiveGamepad(false);
  if (active) {
    handleGamepadInput(active);
  }

  requestAnimationFrame(pollGamepad);
}

function handleGamepadInput(gamepad) {
  // D-pad and left stick for navigation
  const leftX = gamepad.axes[0];
  const leftY = gamepad.axes[1];
  
  // D-pad buttons (indices may vary by controller)
  const dpadUp = gamepad.buttons[12]?.pressed;
  const dpadDown = gamepad.buttons[13]?.pressed;
  const dpadLeft = gamepad.buttons[14]?.pressed;
  const dpadRight = gamepad.buttons[15]?.pressed;
  
  // Analog stick with deadzone
  const stickUp = leftY < -CONFIG.STICK_DEADZONE;
  const stickDown = leftY > CONFIG.STICK_DEADZONE;
  const stickLeft = leftX < -CONFIG.STICK_DEADZONE;
  const stickRight = leftX > CONFIG.STICK_DEADZONE;
  
  // When cursor is enabled (viewing a webpage), only D-Pad navigates sidebar
  // Left stick is ignored for UI navigation in webview mode
  const inWebviewMode = state.cursorEnabled && state.currentWebview;
  
  // Combine inputs - but only use D-Pad when in webview mode
  const up = inWebviewMode ? dpadUp : (dpadUp || stickUp);
  const down = inWebviewMode ? dpadDown : (dpadDown || stickDown);
  const left = inWebviewMode ? dpadLeft : (dpadLeft || stickLeft);
  const right = inWebviewMode ? dpadRight : (dpadRight || stickRight);
  
  // Navigation with repeat prevention
  const now = Date.now();
  
  if (up && !state.lastInput.up) {
    navigateFocus('up');
    state.lastInput.up = now;
  } else if (!up) {
    state.lastInput.up = 0;
  }
  
  if (down && !state.lastInput.down) {
    navigateFocus('down');
    state.lastInput.down = now;
  } else if (!down) {
    state.lastInput.down = 0;
  }
  
  if (left && !state.lastInput.left) {
    navigateFocus('left');
    state.lastInput.left = now;
  } else if (!left) {
    state.lastInput.left = 0;
  }
  
  if (right && !state.lastInput.right) {
    navigateFocus('right');
    state.lastInput.right = now;
  } else if (!right) {
    state.lastInput.right = 0;
  }
  
  // A button (usually index 0) - Always select/activate focused menu item
  if (gamepad.buttons[0]?.pressed && !state.lastInput.a) {
    activateFocused();
    state.lastInput.a = true;
  } else if (!gamepad.buttons[0]?.pressed) {
    state.lastInput.a = false;
  }
  
  // B button (usually index 1) - Back/Close OSK
  if (gamepad.buttons[1]?.pressed && !state.lastInput.b) {
    goBack();
    state.lastInput.b = true;
  } else if (!gamepad.buttons[1]?.pressed) {
    state.lastInput.b = false;
  }
  
  // X button (usually index 2) - Backspace when OSK is open
  if (gamepad.buttons[2]?.pressed && !state.lastInput.x) {
    if (state.oskVisible) {
      backspaceOSK();
    }
    state.lastInput.x = true;
  } else if (!gamepad.buttons[2]?.pressed) {
    state.lastInput.x = false;
  }
  
  // Y button (usually index 3) - Space when OSK open, otherwise open search
  if (gamepad.buttons[3]?.pressed && !state.lastInput.y) {
    if (state.oskVisible) {
      appendToOSK(' ');
    } else {
      openOSK('search');
    }
    state.lastInput.y = true;
  } else if (!gamepad.buttons[3]?.pressed) {
    state.lastInput.y = false;
  }
  
  // LB button (usually index 4) - Go back in webview / clear OSK
  if (gamepad.buttons[4]?.pressed && !state.lastInput.lb) {
    if (state.oskVisible) {
      clearOSK();
    } else if (state.currentSection === 'browse' && state.currentWebview) {
      goBack();
    }
    state.lastInput.lb = true;
  } else if (!gamepad.buttons[4]?.pressed) {
    state.lastInput.lb = false;
  }
  
  // RB button (usually index 5) - Go forward in webview / submit OSK
  if (gamepad.buttons[5]?.pressed && !state.lastInput.rb) {
    if (state.oskVisible) {
      submitOSK();
    } else if (state.currentSection === 'browse' && state.currentWebview) {
      goForward();
    }
    state.lastInput.rb = true;
  } else if (!gamepad.buttons[5]?.pressed) {
    state.lastInput.rb = false;
  }
  
  // Back/Select button (usually index 8) - Toggle sidebar when in webview
  if (gamepad.buttons[8]?.pressed && !state.lastInput.select) {
    if (state.currentSection === 'browse' && state.currentWebview) {
      toggleSidebar();
    }
    state.lastInput.select = true;
  } else if (!gamepad.buttons[8]?.pressed) {
    state.lastInput.select = false;
  }
  
  // Start button (usually index 9) - Menu / Toggle sidebar when viewing webpage
  if (gamepad.buttons[9]?.pressed && !state.lastInput.start) {
    // If viewing a webpage, toggle sidebar instead of going to settings
    if (state.currentSection === 'browse' && state.currentWebview) {
      toggleSidebar();
    } else if (state.currentSection !== 'settings') {
      switchSection('settings');
    } else {
      switchSection('home');
    }
    state.lastInput.start = true;
  } else if (!gamepad.buttons[9]?.pressed) {
    state.lastInput.start = false;
  }
  
  // Virtual cursor handling when webview is active
  if (state.cursorEnabled && state.currentWebview) {
    // Right stick for cursor movement
    const rightX = gamepad.axes[2] || 0;
    const rightY = gamepad.axes[3] || 0;
    
    // Apply deadzone
    const deadzone = 0.15;
    const moveX = Math.abs(rightX) > deadzone ? rightX : 0;
    const moveY = Math.abs(rightY) > deadzone ? rightY : 0;
    
    if (moveX !== 0 || moveY !== 0) {
      moveCursor(moveX * state.cursorSpeed, moveY * state.cursorSpeed);
    }
    
    // Left stick for scrolling in webview mode
    const scrollDeadzone = 0.25;
    const scrollX = Math.abs(leftX) > scrollDeadzone ? leftX : 0;
    const scrollY = Math.abs(leftY) > scrollDeadzone ? leftY : 0;
    
    if (scrollX !== 0 || scrollY !== 0) {
      scrollWebview(scrollY * 20, scrollX * 20);
    }
    
    // Right trigger (index 7) - Left click
    if (gamepad.buttons[7]?.pressed && !state.lastInput.rt) {
      virtualClick();
      state.lastInput.rt = true;
    } else if (!gamepad.buttons[7]?.pressed) {
      state.lastInput.rt = false;
    }
    
    // Left trigger (index 6) - Right click
    if (gamepad.buttons[6]?.pressed && !state.lastInput.lt) {
      virtualClick(true);
      state.lastInput.lt = true;
    } else if (!gamepad.buttons[6]?.pressed) {
      state.lastInput.lt = false;
    }
    
    // Right stick click (index 11) - Toggle cursor speed
    if (gamepad.buttons[11]?.pressed && !state.lastInput.rs) {
      state.cursorSpeed = state.cursorSpeed === 15 ? 8 : (state.cursorSpeed === 8 ? 25 : 15);
      showToast(`Cursor speed: ${state.cursorSpeed === 8 ? 'Slow' : state.cursorSpeed === 15 ? 'Normal' : 'Fast'}`);
      state.lastInput.rs = true;
    } else if (!gamepad.buttons[11]?.pressed) {
      state.lastInput.rs = false;
    }
  }
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't handle if OSK is visible and we're typing
    if (state.oskVisible) {
      handleOSKKeyboard(e);
      return;
    }
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        navigateFocus('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateFocus('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateFocus('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateFocus('right');
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activateFocused();
        break;
      case 'Escape':
      case 'Backspace':
        e.preventDefault();
        goBack();
        break;
      case 'Tab':
        // Allow tab navigation
        break;
    }
  });
}

// =============================================================================
// MOUSE TRACKING
// =============================================================================

function initMouseTracking() {
  document.addEventListener('mousemove', () => {
    document.body.classList.add('mouse-active');
    
    clearTimeout(state.mouseTimeout);
    state.mouseTimeout = setTimeout(() => {
      document.body.classList.remove('mouse-active');
    }, 3000);
  });
  
  // Add hover focus for mouse
  document.addEventListener('mouseover', (e) => {
    const focusable = e.target.closest('[data-focusable]');
    if (focusable && state.focusableElements.includes(focusable)) {
      const index = state.focusableElements.indexOf(focusable);
      state.focusIndex = index;
      focusElement(focusable);
    }
  });
}

// =============================================================================
// ON-SCREEN KEYBOARD
// =============================================================================

function initOSK() {
  const keyboard = document.getElementById('osk-keyboard');
  if (!keyboard) return;
  
  const rows = [
    '1234567890',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
  ];
  
  rows.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'osk-row';
    
    [...row].forEach(char => {
      const key = document.createElement('button');
      key.className = 'osk-key';
      key.textContent = char;
      key.dataset.focusable = '';
      key.tabIndex = 0;
      key.addEventListener('click', () => appendToOSK(char));
      rowEl.appendChild(key);
    });
    
    keyboard.appendChild(rowEl);
  });
  
  // Special keys
  const specialRow = document.createElement('div');
  specialRow.className = 'osk-row';
  
  ['.', '-', '_', '@', '/', ':', '.com'].forEach(char => {
    const key = document.createElement('button');
    key.className = 'osk-key' + (char === '.com' ? ' wide' : '');
    key.textContent = char;
    key.dataset.focusable = '';
    key.tabIndex = 0;
    key.addEventListener('click', () => appendToOSK(char));
    specialRow.appendChild(key);
  });
  
  keyboard.appendChild(specialRow);
  
  // Action buttons
  document.getElementById('osk-space')?.addEventListener('click', () => appendToOSK(' '));
  document.getElementById('osk-backspace')?.addEventListener('click', () => backspaceOSK());
  document.getElementById('osk-clear')?.addEventListener('click', () => clearOSK());
  document.getElementById('osk-submit')?.addEventListener('click', () => submitOSK());
  
  // Close button
  document.querySelector('.osk-close')?.addEventListener('click', () => closeOSK());
}

function openOSK(mode = 'search') {
  const overlay = document.getElementById('osk-overlay');
  const input = document.getElementById('osk-input');
  const label = document.getElementById('osk-label');
  
  if (!overlay || !input) return;
  
  state.oskVisible = true;
  state.oskMode = mode;
  overlay.classList.remove('hidden');
  
  // Clear input
  input.value = '';
  
  // Reset cursor position
  updateOSKCursorPosition();
  
  // Update label based on mode
  if (label) {
    label.textContent = mode === 'search' ? 'Search or enter URL' : 'Enter text';
  }
  
  // Update focusable elements to only include OSK keys
  updateFocusableElements();
  
  // Focus first key
  setTimeout(() => {
    const firstKey = overlay.querySelector('.osk-key');
    if (firstKey) {
      const index = state.focusableElements.indexOf(firstKey);
      if (index !== -1) {
        state.focusIndex = index;
        focusElement(firstKey);
      } else {
        firstKey.focus();
      }
    }
  }, 100);
}

/**
 * Open OSK for typing into a focused input field in the webview
 */
function openOSKForWebview() {
  const overlay = document.getElementById('osk-overlay');
  const input = document.getElementById('osk-input');
  const label = document.getElementById('osk-label');
  
  if (!overlay || !input) return;
  
  state.oskVisible = true;
  state.oskMode = 'webview'; // Special mode for webview input
  overlay.classList.remove('hidden');
  
  // Clear input (could optionally preserve current input value)
  input.value = '';
  
  // Reset cursor position
  updateOSKCursorPosition();
  
  // Update the label to indicate webview mode
  if (label) {
    label.textContent = 'Type your text';
  }
  
  // Update focusable elements to only include OSK keys
  updateFocusableElements();
  
  // Focus first key
  setTimeout(() => {
    const firstKey = overlay.querySelector('.osk-key');
    if (firstKey) {
      const index = state.focusableElements.indexOf(firstKey);
      if (index !== -1) {
        state.focusIndex = index;
        focusElement(firstKey);
      } else {
        firstKey.focus();
      }
    }
  }, 100);
  
  showToast('📝 Type and press Submit to enter text');
}

function closeOSK() {
  const overlay = document.getElementById('osk-overlay');
  if (!overlay) return;
  
  state.oskVisible = false;
  overlay.classList.add('hidden');
  
  // Return focus to main content
  setTimeout(() => {
    updateFocusableElements();
    focusFirstInContent();
  }, 100);
}

function appendToOSK(char) {
  const input = document.getElementById('osk-input');
  if (input) {
    input.value += char;
    updateOSKCursorPosition();
  }
}

function backspaceOSK() {
  const input = document.getElementById('osk-input');
  if (input && input.value.length > 0) {
    input.value = input.value.slice(0, -1);
    updateOSKCursorPosition();
    playNavSound();
  }
}

function clearOSK() {
  const input = document.getElementById('osk-input');
  if (input) {
    input.value = '';
    updateOSKCursorPosition();
    playNavSound();
  }
}

/**
 * Update the blinking cursor position to follow the text
 */
function updateOSKCursorPosition() {
  const input = document.getElementById('osk-input');
  const cursor = document.getElementById('osk-cursor');
  const measure = document.getElementById('osk-text-measure');
  
  if (!input || !cursor || !measure) return;
  
  // Copy the input text to the measure element
  measure.textContent = input.value || '';
  
  // Get the text width + padding offset
  const textWidth = measure.offsetWidth;
  const paddingLeft = 32; // var(--bp-spacing-lg) = 32px
  
  // Position cursor right after the text
  cursor.style.left = `${paddingLeft + textWidth}px`;
}

function submitOSK() {
  const input = document.getElementById('osk-input');
  if (!input) return;
  
  const value = input.value;
  
  if (state.oskMode === 'search') {
    if (!value.trim()) return;
    performSearch(value.trim());
  } else if (state.oskMode === 'webview' && state.currentWebview) {
    // Send the typed text to the webview's focused input
    sendTextToWebview(value, true); // true = submit after setting
  }
  
  closeOSK();
}

/**
 * Send typed text from OSK to the focused input field in webview
 */
function sendTextToWebview(text, submit = false) {
  if (!state.currentWebview) return;
  
  try {
    // Send the text value to the webview
    const script = submit ? `
      (function() {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
          activeEl.value = ${JSON.stringify(text)};
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Trigger Enter key to submit
          setTimeout(() => {
            activeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            activeEl.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
            activeEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
            
            // Also try form submission
            const form = activeEl.closest('form');
            if (form) {
              const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
              if (submitBtn) submitBtn.click();
            }
          }, 50);
        }
      })();
    ` : `
      (function() {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
          activeEl.value = ${JSON.stringify(text)};
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    `;
    
    state.currentWebview.executeJavaScript(script).catch(err => {
      console.log('[BigPicture] Send text error:', err);
    });
  } catch (err) {
    console.log('[BigPicture] sendTextToWebview error:', err);
  }
}

function handleOSKKeyboard(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeOSK();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submitOSK();
  } else if (e.key === 'Backspace') {
    backspaceOSK();
  } else if (e.key.length === 1) {
    appendToOSK(e.key);
  }
}

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadData() {
  await loadBookmarks();
  await loadHistory();
  renderQuickAccess();
  initSettings();
}

async function loadBookmarks() {
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      state.bookmarks = await ipcRenderer.invoke('load-bookmarks') || [];
    } else {
      // Fallback to localStorage
      const stored = localStorage.getItem('bookmarks');
      state.bookmarks = stored ? JSON.parse(stored) : [];
    }
    renderBookmarks();
  } catch (err) {
    console.error('[BigPicture] Failed to load bookmarks:', err);
    state.bookmarks = [];
  }
}

async function loadHistory() {
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      state.history = await ipcRenderer.invoke('load-site-history') || [];
    } else {
      // Fallback to localStorage
      const stored = localStorage.getItem('siteHistory');
      state.history = stored ? JSON.parse(stored) : [];
    }
    renderHistory();
    renderRecentSites();
  } catch (err) {
    console.error('[BigPicture] Failed to load history:', err);
    state.history = [];
  }
}

// Save a site to history
async function saveToHistory(url) {
  if (!url || url.startsWith('browser://')) return;
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      await ipcRenderer.invoke('save-site-history-entry', url);
      // Refresh history after saving
      await loadHistory();
    } else {
      // Fallback to localStorage
      let history = state.history;
      history = history.filter(item => item !== url);
      history.unshift(url);
      if (history.length > 100) history = history.slice(0, 100);
      localStorage.setItem('siteHistory', JSON.stringify(history));
      state.history = history;
      renderHistory();
      renderRecentSites();
    }
  } catch (err) {
    console.error('[BigPicture] Failed to save history:', err);
  }
}

// Clear all browsing history
async function clearHistory() {
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      await ipcRenderer.invoke('clear-site-history');
    } else {
      localStorage.removeItem('siteHistory');
    }
    state.history = [];
    renderHistory();
    renderRecentSites();
    showToast('History cleared');
  } catch (err) {
    console.error('[BigPicture] Failed to clear history:', err);
    showToast('Failed to clear history');
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderQuickAccess() {
  const grid = document.getElementById('quickAccessGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  CONFIG.DEFAULT_QUICK_ACCESS.forEach(site => {
    const tile = createTile(site.title, site.url, site.icon);
    grid.appendChild(tile);
  });
  
  // Add "Add" tile
  const addTile = document.createElement('div');
  addTile.className = 'tile add-tile';
  addTile.dataset.focusable = '';
  addTile.tabIndex = 0;
  addTile.innerHTML = `<span class="material-symbols-outlined">add</span>`;
  addTile.addEventListener('click', () => showToast('Add bookmark coming soon'));
  grid.appendChild(addTile);
  
  updateFocusableElements();
}

function renderBookmarks() {
  const grid = document.getElementById('bookmarksGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  if (state.bookmarks.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">bookmark_border</span>
        <p>No bookmarks yet</p>
        <p class="empty-hint">Add bookmarks in desktop mode to see them here</p>
      </div>
    `;
    return;
  }
  
  state.bookmarks.forEach(bookmark => {
    const tile = createBookmarkTile(bookmark);
    grid.appendChild(tile);
  });
  
  updateFocusableElements();
}

function createBookmarkTile(bookmark) {
  const tile = document.createElement('div');
  tile.className = 'tile bookmark-tile';
  tile.dataset.focusable = '';
  tile.tabIndex = 0;
  tile.dataset.url = bookmark.url;
  
  const title = bookmark.title || bookmark.name || getDomainFromUrl(bookmark.url);
  const icon = bookmark.icon || 'bookmark';
  
  // Check if icon is a URL (favicon) or a material icon name
  const isIconUrl = typeof icon === 'string' && /^(https?:|data:)/.test(icon);
  
  let iconHtml;
  if (isIconUrl) {
    iconHtml = `<img src="${escapeHtml(icon)}" alt="" class="tile-favicon" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'material-symbols-outlined\\'>bookmark</span>'">`;
  } else {
    iconHtml = `<span class="material-symbols-outlined">${escapeHtml(icon)}</span>`;
  }
  
  tile.innerHTML = `
    <div class="tile-icon">
      ${iconHtml}
    </div>
    <div class="tile-title">${escapeHtml(title)}</div>
    <div class="tile-url">${getDomainFromUrl(bookmark.url)}</div>
  `;
  
  tile.addEventListener('click', () => navigateTo(bookmark.url));
  
  return tile;
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (state.history.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">history</span>
        <p>No browsing history</p>
        <p class="empty-hint">Sites you visit will appear here</p>
      </div>
    `;
    return;
  }
  
  // Show last 30 items
  state.history.slice(0, 30).forEach(url => {
    const item = createHistoryItem(url);
    list.appendChild(item);
  });
  
  updateFocusableElements();
}

function createHistoryItem(url) {
  const item = document.createElement('div');
  item.className = 'list-item history-item';
  item.dataset.focusable = '';
  item.tabIndex = 0;
  item.dataset.url = url;
  
  const domain = getDomainFromUrl(url);
  const faviconUrl = getFaviconUrl(url);
  
  item.innerHTML = `
    <div class="list-item-icon">
      <img src="${escapeHtml(faviconUrl)}" alt="" class="list-item-favicon" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
      <span class="material-symbols-outlined" style="display:none">public</span>
    </div>
    <div class="list-item-content">
      <div class="list-item-title">${escapeHtml(domain)}</div>
      <div class="list-item-meta">${escapeHtml(url)}</div>
    </div>
    <div class="list-item-action">
      <span class="key-hint">A</span>
    </div>
  `;
  
  item.addEventListener('click', () => navigateTo(url));
  
  return item;
}

function renderRecentSites() {
  const container = document.getElementById('recentSitesScroll');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.history.length === 0) {
    container.innerHTML = `
      <div class="empty-state compact">
        <span class="material-symbols-outlined">web</span>
        <p>Start browsing to see recent sites</p>
      </div>
    `;
    return;
  }
  
  // Show last 10 unique domains
  const seenDomains = new Set();
  const uniqueSites = [];
  
  for (const url of state.history) {
    const domain = getDomainFromUrl(url);
    if (!seenDomains.has(domain)) {
      seenDomains.add(domain);
      uniqueSites.push({ url, domain });
      if (uniqueSites.length >= 10) break;
    }
  }
  
  uniqueSites.forEach(site => {
    const card = createScrollCard(site.domain, site.url);
    container.appendChild(card);
  });
  
  updateFocusableElements();
}

function createTile(title, url, icon, useFavicon = false) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.focusable = '';
  tile.tabIndex = 0;
  tile.dataset.url = url;
  
  let iconHtml;
  const isIconUrl = typeof icon === 'string' && /^(https?:|data:)/.test(icon);
  
  if (isIconUrl || useFavicon) {
    const faviconUrl = isIconUrl ? icon : getFaviconUrl(url);
    iconHtml = `<img src="${escapeHtml(faviconUrl)}" alt="" class="tile-favicon" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'material-symbols-outlined\\'>public</span>'">`;
  } else {
    iconHtml = `<span class="material-symbols-outlined">${escapeHtml(icon)}</span>`;
  }
  
  tile.innerHTML = `
    <div class="tile-icon">
      ${iconHtml}
    </div>
    <div class="tile-title">${escapeHtml(title)}</div>
    <div class="tile-url">${getDomainFromUrl(url)}</div>
  `;
  
  tile.addEventListener('click', () => navigateTo(url));
  
  return tile;
}

function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
  } catch {
    return '';
  }
}

function createListItem(title, url) {
  const item = document.createElement('div');
  item.className = 'list-item';
  item.dataset.focusable = '';
  item.tabIndex = 0;
  item.dataset.url = url;
  
  item.innerHTML = `
    <div class="list-item-icon">
      <span class="material-symbols-outlined">public</span>
    </div>
    <div class="list-item-content">
      <div class="list-item-title">${escapeHtml(title)}</div>
      <div class="list-item-meta">${escapeHtml(url)}</div>
    </div>
    <div class="list-item-action">
      <span class="key-hint">A</span>
    </div>
  `;
  
  item.addEventListener('click', () => navigateTo(url));
  
  return item;
}

function createScrollCard(title, url) {
  const card = document.createElement('div');
  card.className = 'scroll-card';
  card.dataset.focusable = '';
  card.tabIndex = 0;
  card.dataset.url = url;
  
  const faviconUrl = getFaviconUrl(url);
  
  card.innerHTML = `
    <div class="scroll-card-preview">
      <img src="${escapeHtml(faviconUrl)}" alt="" class="scroll-card-favicon" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <span class="material-symbols-outlined scroll-card-icon" style="display:none;font-size: 48px; color: var(--bp-text-dim); align-items: center; justify-content: center; height: 100%;">public</span>
    </div>
    <div class="scroll-card-title">${escapeHtml(title)}</div>
    <div class="scroll-card-meta">Recently visited</div>
  `;
  
  card.addEventListener('click', () => navigateTo(url));
  
  return card;
}

// =============================================================================
// ACTIONS
// =============================================================================

function performSearch(query) {
  if (!query.trim()) return;
  
  // Check if it's a URL
  let url = query.trim();
  if (isUrl(url)) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    navigateTo(url);
  } else {
    // Search with default engine (Google)
    navigateTo(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }
}

function navigateTo(url) {
  console.log('[BigPicture] Navigating to:', url);
  
  // Create or reuse webview for browsing
  const container = document.getElementById('webview-container');
  if (!container) return;
  
  // Hide content and show webview
  document.querySelectorAll('.bp-section').forEach(s => s.classList.remove('active'));
  container.classList.remove('hidden');
  
  // Remove existing webview if any
  const existingWebview = container.querySelector('webview');
  if (existingWebview) {
    existingWebview.remove();
  }
  
  // Create new webview
  const webview = document.createElement('webview');
  webview.src = url;
  webview.style.width = '100%';
  webview.style.height = '100%';
  webview.style.border = 'none';
  webview.preload = '../preload.js';
  webview.partition = 'persist:main';
  webview.allowpopups = true;
  webview.webpreferences = 'allowRunningInsecureContent=false,javascript=true,webSecurity=true';
  
  container.appendChild(webview);
  state.currentWebview = webview;
  state.webviewContentsId = null; // Will be set when webview is ready
  
  // Save initial URL to history
  saveToHistory(url);
  
  // Get webContentsId when webview is ready for native input events
  webview.addEventListener('dom-ready', () => {
    try {
      // getWebContentsId is available on webview element
      state.webviewContentsId = webview.getWebContentsId();
      console.log('[BigPicture] WebContents ID:', state.webviewContentsId);
      
      // Apply scroll normalization for consistent scroll speed
      applyScrollNormalization(webview);
      
      // Inject script to detect input field focus and notify the host
      injectInputFocusDetection(webview);
    } catch (err) {
      console.log('[BigPicture] Could not get webContentsId:', err);
    }
  });
  
  // Save navigation to history
  webview.addEventListener('did-navigate', (event) => {
    const newUrl = event.url;
    if (newUrl && !newUrl.startsWith('about:')) {
      saveToHistory(newUrl);
    }
  });
  
  // Also save history on in-page navigations (e.g., SPA navigations)
  webview.addEventListener('did-navigate-in-page', (event) => {
    if (event.isMainFrame) {
      const newUrl = event.url;
      if (newUrl && !newUrl.startsWith('about:')) {
        saveToHistory(newUrl);
      }
    }
  });
  
  // Listen for IPC messages from webview (for OSK requests)
  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'bigpicture-input-focused') {
      // Input field was clicked/focused in webview - show OSK for webview input
      console.log('[BigPicture] Input focused in webview');
      openOSKForWebview();
    }
  });
  
  // Enable virtual cursor for webview interaction
  enableCursor();
  
  // Switch section to browse
  switchSection('browse');
  
  // Update focusable elements to include webview controls
  setTimeout(() => {
    updateFocusableElements();
  }, 100);
}

/**
 * Inject script to detect input focus in webview and send message to host
 */
function injectInputFocusDetection(webview) {
  const script = `
    (function() {
      if (window.__bigPictureInputDetection) return;
      window.__bigPictureInputDetection = true;
      
      // Track the last focused input
      let lastFocusedInput = null;
      
      document.addEventListener('focusin', (e) => {
        const el = e.target;
        const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
                       el.contentEditable === 'true' || el.isContentEditable ||
                       el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'searchbox';
        
        // Check input type - exclude non-text inputs
        if (el.tagName === 'INPUT') {
          const type = el.type.toLowerCase();
          if (['checkbox', 'radio', 'submit', 'button', 'image', 'file', 'hidden', 'reset', 'range', 'color'].includes(type)) {
            return;
          }
        }
        
        if (isInput) {
          lastFocusedInput = el;
          // Send message to host (Big Picture Mode) to show OSK
          try {
            if (window.electronAPI && window.electronAPI.sendToHost) {
              window.electronAPI.sendToHost('bigpicture-input-focused', {
                type: el.tagName,
                inputType: el.type || 'text',
                value: el.value || ''
              });
            }
          } catch(e) {
            console.log('BigPicture: Could not notify input focus', e);
          }
        }
      }, true);
      
      // Listen for text input from OSK
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'bigpicture-osk-input' && lastFocusedInput) {
          lastFocusedInput.value = e.data.value;
          lastFocusedInput.dispatchEvent(new Event('input', { bubbles: true }));
          lastFocusedInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (e.data && e.data.type === 'bigpicture-osk-submit' && lastFocusedInput) {
          // Submit the form or trigger search
          const form = lastFocusedInput.closest('form');
          if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            // Also try clicking any submit button
            const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            if (submitBtn) submitBtn.click();
          }
          // Trigger Enter key event
          lastFocusedInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          lastFocusedInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
          lastFocusedInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
      });
      
      console.log('[BigPicture] Input focus detection injected');
    })();
  `;
  
  webview.executeJavaScript(script).catch(err => {
    console.log('[BigPicture] Could not inject input detection:', err);
  });
}

function exitBigPictureMode() {
  console.log('[BigPicture] Exiting Big Picture Mode');
  
  if (ipcRenderer) {
    ipcRenderer.send('exit-bigpicture');
  } else if (window.opener) {
    window.opener.postMessage({ type: 'exit-bigpicture' }, '*');
    window.close();
  }
}

function handleSettingsAction(action) {
  switch (action) {
    case 'theme':
      switchSettingsTab('themes');
      break;
    case 'privacy':
      switchSettingsTab('privacy');
      break;
    case 'display':
      switchSettingsTab('display');
      break;
    case 'exit-bigpicture':
      exitBigPictureMode();
      break;
    default:
      console.log('[BigPicture] Unknown settings action:', action);
  }
}

// =============================================================================
// SETTINGS FUNCTIONALITY
// =============================================================================

const DISPLAY_SCALE_KEY = 'nebula-display-scale';
let currentDisplayScale = 100;
let currentThemeName = 'default';

// Theme definitions (matching customization.js)
const THEMES = {
  default: {
    name: 'Default',
    colors: {
      bg: '#121418',
      darkPurple: '#1B1035',
      primary: '#7B2EFF',
      accent: '#00C6FF',
      text: '#E0E0E0'
    }
  },
  ocean: {
    name: 'Ocean',
    colors: {
      bg: '#1a365d',
      darkPurple: '#2c5282',
      primary: '#3182ce',
      accent: '#00d9ff',
      text: '#e2e8f0'
    }
  },
  forest: {
    name: 'Forest',
    colors: {
      bg: '#1a202c',
      darkPurple: '#2d3748',
      primary: '#68d391',
      accent: '#9ae6b4',
      text: '#f7fafc'
    }
  },
  sunset: {
    name: 'Sunset',
    colors: {
      bg: '#744210',
      darkPurple: '#c05621',
      primary: '#ed8936',
      accent: '#fbb040',
      text: '#fffaf0'
    }
  },
  cyberpunk: {
    name: 'Cyberpunk',
    colors: {
      bg: '#0a0a0a',
      darkPurple: '#2a0a3a',
      primary: '#ff0080',
      accent: '#00ffff',
      text: '#ffffff'
    }
  },
  'midnight-rose': {
    name: 'Midnight Rose',
    colors: {
      bg: '#1c1820',
      darkPurple: '#3d3046',
      primary: '#d4af37',
      accent: '#ffd700',
      text: '#f5f5dc'
    }
  },
  'arctic-ice': {
    name: 'Arctic Ice',
    colors: {
      bg: '#f0f8ff',
      darkPurple: '#d1e7ff',
      primary: '#4169e1',
      accent: '#87ceeb',
      text: '#2f4f4f'
    }
  },
  'cherry-blossom': {
    name: 'Cherry Blossom',
    colors: {
      bg: '#fff5f8',
      darkPurple: '#ffd4db',
      primary: '#ff69b4',
      accent: '#ffb6c1',
      text: '#8b4513'
    }
  },
  'cosmic-purple': {
    name: 'Cosmic Purple',
    colors: {
      bg: '#0f0524',
      darkPurple: '#2d1b69',
      primary: '#9400d3',
      accent: '#da70d6',
      text: '#e6e6fa'
    }
  },
  'emerald-dream': {
    name: 'Emerald Dream',
    colors: {
      bg: '#0d2818',
      darkPurple: '#2d5a44',
      primary: '#50c878',
      accent: '#00fa9a',
      text: '#f0fff0'
    }
  },
  'mocha-coffee': {
    name: 'Mocha Coffee',
    colors: {
      bg: '#3c2414',
      darkPurple: '#5d3a26',
      primary: '#d2691e',
      accent: '#deb887',
      text: '#faf0e6'
    }
  },
  'lavender-fields': {
    name: 'Lavender Fields',
    colors: {
      bg: '#f8f4ff',
      darkPurple: '#e6d8ff',
      primary: '#9370db',
      accent: '#dda0dd',
      text: '#4b0082'
    }
  }
};

function initSettings() {
  console.log('[BigPicture] Initializing settings...');
  
  // Load saved settings
  loadSavedSettings();
  
  // Initialize settings tabs
  initSettingsTabs();
  
  // Initialize theme selection
  initThemeSelection();
  
  // Initialize display scale controls
  initDisplayScaleControls();
  
  // Initialize privacy controls
  initPrivacyControls();
  
  // Initialize about panel
  initAboutPanel();
}

function loadSavedSettings() {
  // Load display scale
  try {
    const savedScale = localStorage.getItem(DISPLAY_SCALE_KEY);
    if (savedScale) {
      const parsed = parseInt(savedScale, 10);
      if (Number.isFinite(parsed)) {
        currentDisplayScale = Math.min(300, Math.max(50, parsed));
        updateScaleDisplay();
        applyDisplayScale(currentDisplayScale, 'loadSavedSettings');
      }
    }
  } catch (err) {
    console.warn('[BigPicture] Failed to load display scale:', err);
  }
  
  // Load theme
  try {
    const savedTheme = localStorage.getItem('nebula-theme-name');
    if (savedTheme && THEMES[savedTheme]) {
      currentThemeName = savedTheme;
      applyTheme(THEMES[savedTheme]);
      highlightActiveTheme();
    }
  } catch (err) {
    console.warn('[BigPicture] Failed to load theme:', err);
  }
}

function initSettingsTabs() {
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.settingsTab;
      if (tabName) {
        switchSettingsTab(tabName);
      }
    });
  });
}

function switchSettingsTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.settingsTab === tabName);
  });
  
  // Update panels
  document.querySelectorAll('.settings-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `settings-panel-${tabName}`);
  });
  
  // Update focusable elements
  setTimeout(() => {
    updateFocusableElements();
  }, 50);
  
  playNavSound();
}

function initThemeSelection() {
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const themeName = card.dataset.theme;
      if (themeName && THEMES[themeName]) {
        selectTheme(themeName);
      }
    });
  });
  
  // Highlight current theme
  highlightActiveTheme();
}

function selectTheme(themeName) {
  if (!THEMES[themeName]) return;
  
  currentThemeName = themeName;
  const theme = THEMES[themeName];
  
  // Apply theme locally
  applyTheme(theme);
  
  // Save to localStorage
  try {
    localStorage.setItem('nebula-theme-name', themeName);
    
    // Also save the full theme data for other pages
    const fullThemeData = {
      name: theme.name,
      colors: {
        bg: theme.colors.bg,
        darkBlue: theme.colors.darkPurple,
        darkPurple: theme.colors.darkPurple,
        primary: theme.colors.primary,
        accent: theme.colors.accent,
        text: theme.colors.text,
        urlBarBg: theme.colors.darkPurple,
        urlBarText: theme.colors.text,
        urlBarBorder: theme.colors.primary,
        tabBg: theme.colors.darkPurple,
        tabText: theme.colors.text,
        tabActive: theme.colors.bg,
        tabActiveText: theme.colors.text,
        tabBorder: theme.colors.bg
      },
      gradient: `linear-gradient(145deg, ${theme.colors.bg} 0%, ${theme.colors.darkPurple} 100%)`
    };
    localStorage.setItem('browserTheme', JSON.stringify(fullThemeData));
  } catch (err) {
    console.warn('[BigPicture] Failed to save theme:', err);
  }
  
  // Notify main process
  if (ipcRenderer && ipcRenderer.send) {
    ipcRenderer.send('theme-changed', {
      name: themeName,
      colors: theme.colors
    });
  }
  
  highlightActiveTheme();
  showToast(`Theme changed to ${theme.name}`);
  playSelectSound();
}

function highlightActiveTheme() {
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === currentThemeName);
  });
}

function initDisplayScaleControls() {
  const scaleDown = document.getElementById('bp-scale-down');
  const scaleUp = document.getElementById('bp-scale-up');
  const exitDesktop = document.getElementById('bp-exit-desktop');
  
  if (scaleDown) {
    scaleDown.addEventListener('click', () => {
      adjustDisplayScale(-10);
    });
  }
  
  if (scaleUp) {
    scaleUp.addEventListener('click', () => {
      adjustDisplayScale(10);
    });
  }
  
  if (exitDesktop) {
    exitDesktop.addEventListener('click', () => {
      exitBigPictureMode();
    });
  }
  
  updateScaleDisplay();
  applyDisplayScale(currentDisplayScale, 'initDisplayScaleControls');
}

function adjustDisplayScale(delta) {
  const newScale = Math.min(300, Math.max(50, currentDisplayScale + delta));
  if (newScale !== currentDisplayScale) {
    currentDisplayScale = newScale;
    updateScaleDisplay();
    saveDisplayScale();
    showToast(`Display scale: ${currentDisplayScale}%`);
    playNavSound();
  }
}

function updateScaleDisplay() {
  const scaleValue = document.getElementById('bp-scale-value');
  if (scaleValue) {
    scaleValue.textContent = `${currentDisplayScale}%`;
  }
}

function saveDisplayScale() {
  try {
    localStorage.setItem(DISPLAY_SCALE_KEY, currentDisplayScale.toString());

    // Apply zoom immediately to Big Picture UI.
    applyDisplayScale(currentDisplayScale, 'saveDisplayScale');

    // Notify main process (legacy channel) for compatibility.
    if (ipcRenderer && typeof ipcRenderer.send === 'function') {
      ipcRenderer.send('set-display-scale', currentDisplayScale);
    }
  } catch (err) {
    console.warn('[BigPicture] Failed to save display scale:', err);
  }
}

function initPrivacyControls() {
  const clearDataBtn = document.getElementById('bp-clear-data');
  const clearHistoryBtn = document.getElementById('bp-clear-history');
  const clearSearchBtn = document.getElementById('bp-clear-search');
  
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
      if (await confirmAction('Clear all browsing data? This cannot be undone.')) {
        await clearAllBrowsingData();
      }
    });
  }
  
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      if (await confirmAction('Clear browsing history?')) {
        await clearBrowsingHistory();
      }
    });
  }
  
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', async () => {
      if (await confirmAction('Clear search history?')) {
        await clearSearchHistory();
      }
    });
  }
}

async function confirmAction(message) {
  // Simple confirmation using toast - could be enhanced with a modal
  showToast(message + ' Press A to confirm.');
  return true; // For now, auto-confirm. Could implement modal confirmation.
}

async function clearAllBrowsingData() {
  try {
    showToast('Clearing all browsing data...');
    
    if (ipcRenderer && ipcRenderer.invoke) {
      await ipcRenderer.invoke('clear-browser-data');
    }
    
    // Also clear localStorage
    localStorage.removeItem('siteHistory');
    state.history = [];
    renderHistory();
    renderRecentSites();
    
    showToast('All browsing data cleared');
    playSelectSound();
  } catch (err) {
    console.error('[BigPicture] Failed to clear browsing data:', err);
    showToast('Failed to clear data');
  }
}

async function clearBrowsingHistory() {
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      await ipcRenderer.invoke('clear-site-history');
    }
    
    localStorage.removeItem('siteHistory');
    state.history = [];
    renderHistory();
    renderRecentSites();
    
    showToast('Browsing history cleared');
    playSelectSound();
  } catch (err) {
    console.error('[BigPicture] Failed to clear history:', err);
    showToast('Failed to clear history');
  }
}

async function clearSearchHistory() {
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      await ipcRenderer.invoke('clear-search-history');
    }
    
    showToast('Search history cleared');
    playSelectSound();
  } catch (err) {
    console.error('[BigPicture] Failed to clear search history:', err);
    showToast('Failed to clear search history');
  }
}

async function initAboutPanel() {
  // Load version info
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      const appInfo = await ipcRenderer.invoke('get-app-info');
      
      if (appInfo) {
        const versionEl = document.getElementById('bp-version');
        const electronEl = document.getElementById('bp-electron-version');
        const chromiumEl = document.getElementById('bp-chromium-version');
        const nodeEl = document.getElementById('bp-node-version');
        const platformEl = document.getElementById('bp-platform');
        
        if (versionEl) versionEl.textContent = `Version ${appInfo.version || 'Unknown'}`;
        if (electronEl) electronEl.textContent = appInfo.electron || '--';
        if (chromiumEl) chromiumEl.textContent = appInfo.chrome || '--';
        if (nodeEl) nodeEl.textContent = appInfo.node || '--';
        if (platformEl) platformEl.textContent = `${appInfo.platform || ''} ${appInfo.arch || ''}`.trim() || '--';
      }
    }
  } catch (err) {
    console.warn('[BigPicture] Failed to load app info:', err);
  }
  
  // GitHub link
  const githubBtn = document.getElementById('bp-github-link');
  if (githubBtn) {
    githubBtn.addEventListener('click', () => {
      navigateTo('https://github.com/Bobbybear007/NebulaBrowser');
    });
  }
  
  // Copy diagnostics
  const copyBtn = document.getElementById('bp-copy-diagnostics');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      await copyDiagnostics();
    });
  }
}

async function copyDiagnostics() {
  try {
    const versionEl = document.getElementById('bp-version');
    const electronEl = document.getElementById('bp-electron-version');
    const chromiumEl = document.getElementById('bp-chromium-version');
    const nodeEl = document.getElementById('bp-node-version');
    const platformEl = document.getElementById('bp-platform');
    
    const diagnostics = [
      'Nebula Browser Diagnostics',
      '========================',
      versionEl ? versionEl.textContent : '',
      `Electron: ${electronEl ? electronEl.textContent : '--'}`,
      `Chromium: ${chromiumEl ? chromiumEl.textContent : '--'}`,
      `Node.js: ${nodeEl ? nodeEl.textContent : '--'}`,
      `Platform: ${platformEl ? platformEl.textContent : '--'}`,
      `Date: ${new Date().toISOString()}`
    ].join('\n');
    
    await navigator.clipboard.writeText(diagnostics);
    showToast('Diagnostics copied to clipboard');
    playSelectSound();
  } catch (err) {
    console.error('[BigPicture] Failed to copy diagnostics:', err);
    showToast('Failed to copy diagnostics');
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function isUrl(str) {
  // Simple URL detection
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(str) ||
         str.includes('.com') ||
         str.includes('.org') ||
         str.includes('.net') ||
         str.includes('.io') ||
         str.startsWith('browser://');
}

// =============================================================================
// VIRTUAL CURSOR (for webview interaction)
// =============================================================================

function createCursorElement() {
  if (state.cursorElement) return;
  
  const cursor = document.createElement('div');
  cursor.id = 'virtual-cursor';
  cursor.className = 'virtual-cursor';
  cursor.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z" 
            fill="white" stroke="black" stroke-width="1.5"/>
    </svg>
    <div class="cursor-click-indicator"></div>
  `;
  document.body.appendChild(cursor);
  state.cursorElement = cursor;
}

function enableCursor() {
  if (!state.cursorElement) {
    createCursorElement();
  }
  
  const container = document.getElementById('webview-container');
  if (container) {
    const rect = container.getBoundingClientRect();
    state.cursorX = rect.left + rect.width / 2;
    state.cursorY = rect.top + rect.height / 2;
  } else {
    state.cursorX = window.innerWidth / 2;
    state.cursorY = window.innerHeight / 2;
  }
  
  state.cursorEnabled = true;
  updateCursorPosition();
  state.cursorElement.classList.add('active');
  
  // Update focusable elements to only include sidebar when in webview mode
  updateFocusableElements();
  
  // Show cursor hint
  showToast('🎮 Right stick: Move cursor | RT: Click | Left stick: Scroll | B: Back');
}

function disableCursor() {
  state.cursorEnabled = false;
  if (state.cursorElement) {
    state.cursorElement.classList.remove('active');
  }
  
  // Restore full focusable elements
  updateFocusableElements();
}

function moveCursor(dx, dy) {
  if (!state.cursorEnabled) return;
  
  const container = document.getElementById('webview-container');
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  
  // Update cursor position with bounds checking
  state.cursorX = Math.max(rect.left, Math.min(rect.right - 10, state.cursorX + dx));
  state.cursorY = Math.max(rect.top, Math.min(rect.bottom - 10, state.cursorY + dy));
  
  updateCursorPosition();
}

function updateCursorPosition() {
  if (!state.cursorElement) return;
  
  state.cursorElement.style.left = `${state.cursorX}px`;
  state.cursorElement.style.top = `${state.cursorY}px`;
}

function virtualClick(rightClick = false) {
  if (!state.currentWebview || !state.cursorEnabled) return;
  
  const container = document.getElementById('webview-container');
  if (!container) return;
  
  const containerRect = container.getBoundingClientRect();
  
  // Calculate position relative to webview
  const x = Math.round(state.cursorX - containerRect.left);
  const y = Math.round(state.cursorY - containerRect.top);
  
  // Show click animation
  if (state.cursorElement) {
    state.cursorElement.classList.add('clicking');
    setTimeout(() => state.cursorElement.classList.remove('clicking'), 150);
  }
  
  const webview = state.currentWebview;
  
  // Try to use native input event injection via IPC (most reliable for complex sites)
  if (state.webviewContentsId && window.bigPictureAPI && window.bigPictureAPI.sendInputEvent) {
    const sendNativeClick = async () => {
      try {
        // Send mouseMove first to position the cursor
        await window.bigPictureAPI.sendInputEvent(state.webviewContentsId, {
          type: 'mouseMove',
          x: x,
          y: y
        });
        
        // Small delay then send mouseDown
        await new Promise(r => setTimeout(r, 10));
        
        await window.bigPictureAPI.sendInputEvent(state.webviewContentsId, {
          type: 'mouseDown',
          x: x,
          y: y,
          button: rightClick ? 'right' : 'left',
          clickCount: 1
        });
        
        // Small delay then send mouseUp
        await new Promise(r => setTimeout(r, 50));
        
        await window.bigPictureAPI.sendInputEvent(state.webviewContentsId, {
          type: 'mouseUp',
          x: x,
          y: y,
          button: rightClick ? 'right' : 'left',
          clickCount: 1
        });
        
        console.log('[BigPicture] Native click sent at', x, y);
      } catch (err) {
        console.log('[BigPicture] Native input error, falling back to JS:', err);
        fallbackJavaScriptClick(webview, x, y, rightClick);
      }
    };
    
    sendNativeClick();
    return;
  }
  
  // Fallback to JavaScript injection
  fallbackJavaScriptClick(webview, x, y, rightClick);
}

function fallbackJavaScriptClick(webview, x, y, rightClick) {
  try {
    if (rightClick) {
      // For right-click, use JavaScript injection
      const rightClickScript = `
        (function() {
          const el = document.elementFromPoint(${x}, ${y});
          if (el) {
            const event = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: ${x},
              clientY: ${y},
              button: 2
            });
            el.dispatchEvent(event);
          }
        })();
      `;
      webview.executeJavaScript(rightClickScript).catch(err => {
        console.log('[BigPicture] Right-click injection error:', err);
      });
    } else {
      // Comprehensive JavaScript injection with pointer events
      const clickScript = `
        (function() {
          const x = ${x};
          const y = ${y};
          const el = document.elementFromPoint(x, y);
          if (!el) return;
          
          // Check if we're clicking on YouTube player area
          const isYouTubePlayer = el.closest('.html5-video-player') || 
                                  el.closest('.ytp-player') ||
                                  el.closest('#movie_player') ||
                                  el.closest('.html5-main-video') ||
                                  el.closest('.video-stream') ||
                                  (window.location.hostname.includes('youtube.com') && 
                                   (el.tagName === 'VIDEO' || el.closest('#player')));
          
          if (isYouTubePlayer) {
            // For YouTube player, directly toggle playback
            const video = document.querySelector('video.html5-main-video') || 
                         document.querySelector('video.video-stream') ||
                         document.querySelector('#movie_player video') ||
                         document.querySelector('video');
            if (video) {
              if (video.paused) {
                video.play().catch(() => {});
              } else {
                video.pause();
              }
              return;
            }
          }
          
          // Find the actual clickable element (may be parent)
          let clickTarget = el;
          let current = el;
          for (let i = 0; i < 10 && current; i++) {
            if (current.tagName === 'A' || current.tagName === 'BUTTON' || 
                current.onclick || current.getAttribute('role') === 'button' ||
                window.getComputedStyle(current).cursor === 'pointer') {
              clickTarget = current;
              break;
            }
            current = current.parentElement;
          }
          
          // Common event options
          const eventOptions = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 0,
            buttons: 1,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            pressure: 0.5,
            width: 1,
            height: 1
          };
          
          // Handle input elements specially - focus first
          const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || 
                         el.contentEditable === 'true' || el.isContentEditable ||
                         el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'searchbox' ||
                         el.closest('[contenteditable="true"]');
          
          if (isInput) {
            // Focus the input element
            el.focus();
            // Dispatch proper focus sequence
            el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            // Dispatch click to activate any click handlers
            el.dispatchEvent(new MouseEvent('click', eventOptions));
            return;
          }
          
          // For general video elements (not YouTube specific)
          if (el.tagName === 'VIDEO') {
            if (el.paused) {
              el.play().catch(() => {});
            } else {
              el.pause();
            }
            return;
          }
          
          // Dispatch pointer events (used by modern sites)
          try {
            clickTarget.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
            clickTarget.dispatchEvent(new PointerEvent('pointerup', eventOptions));
          } catch(e) {}
          
          // Dispatch mouse events
          clickTarget.dispatchEvent(new MouseEvent('mousedown', eventOptions));
          clickTarget.dispatchEvent(new MouseEvent('mouseup', eventOptions));
          clickTarget.dispatchEvent(new MouseEvent('click', eventOptions));
          
          // Direct click as final fallback
          if (clickTarget.click) clickTarget.click();
        })();
      `;
      
      webview.executeJavaScript(clickScript).catch(err => {
        console.log('[BigPicture] Click injection error:', err);
      });
    }
  } catch (err) {
    console.log('[BigPicture] Virtual click error:', err);
  }
}

function scrollWebview(amountY, amountX = 0) {
  if (!state.currentWebview) return;
  
  try {
    state.currentWebview.executeJavaScript(`window.scrollBy(${amountX}, ${amountY})`);
  } catch (err) {
    console.log('[BigPicture] Scroll error:', err);
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function getDomainFromUrl(url) {
  try {
    if (url.startsWith('browser://')) {
      return url.replace('browser://', '').split('/')[0];
    }
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

function playNavSound() {
  if (!CONFIG.NAV_SOUND_ENABLED) return;
  
  // Simple beep using Web Audio API
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.05;
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.03);
  } catch (e) {
    // Audio not available
  }
}

function playSelectSound() {
  if (!CONFIG.NAV_SOUND_ENABLED) return;
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.08;
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    // Audio not available
  }
}

// =============================================================================
// IPC HANDLERS
// =============================================================================

if (ipcRenderer) {
  // Listen for theme changes
  ipcRenderer.on('theme-changed', (theme) => {
    if (theme && theme.colors) {
      applyTheme(theme);
    }
  });
}

function applyTheme(theme) {
  if (!theme || !theme.colors) return;
  
  const root = document.documentElement;
  
  if (theme.colors.bg) root.style.setProperty('--bp-bg', theme.colors.bg);
  if (theme.colors.darkPurple) root.style.setProperty('--bp-surface', theme.colors.darkPurple);
  if (theme.colors.primary) {
    root.style.setProperty('--bp-primary', theme.colors.primary);
    root.style.setProperty('--bp-primary-glow', `${theme.colors.primary}66`);
  }
  if (theme.colors.accent) {
    root.style.setProperty('--bp-accent', theme.colors.accent);
    root.style.setProperty('--bp-accent-glow', `${theme.colors.accent}4d`);
  }
  if (theme.colors.text) root.style.setProperty('--bp-text', theme.colors.text);
}

console.log('[BigPicture] Module loaded');
