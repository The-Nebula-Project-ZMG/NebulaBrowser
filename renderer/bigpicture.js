/**
 * Big Picture Mode - Controller-friendly UI for Steam Deck / Console
 * Supports gamepad navigation, on-screen keyboard, and touch input
 */

const ipcRenderer = window.electronAPI;

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
  webviewStack: []  // Stack of webview instances for navigation history
};

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('[BigPicture] Initializing Big Picture Mode');
  
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
  
  // Settings cards
  document.querySelectorAll('.settings-card').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      handleSettingsAction(action);
    });
  });
}

function switchSection(sectionId) {
  console.log('[BigPicture] Switching to section:', sectionId);
  
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

// =============================================================================
// GAMEPAD SUPPORT
// =============================================================================

function initGamepadSupport() {
  window.addEventListener('gamepadconnected', (e) => {
    console.log('[BigPicture] Gamepad connected:', e.gamepad.id);
    state.gamepadConnected = true;
    state.gamepadIndex = e.gamepad.index;
    showToast('Controller connected');
  });
  
  window.addEventListener('gamepaddisconnected', (e) => {
    console.log('[BigPicture] Gamepad disconnected');
    state.gamepadConnected = false;
    state.gamepadIndex = null;
    showToast('Controller disconnected');
  });
  
  // Start polling for gamepad input
  requestAnimationFrame(pollGamepad);
}

function pollGamepad() {
  if (state.gamepadConnected && state.gamepadIndex !== null) {
    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[state.gamepadIndex];
    
    if (gamepad) {
      handleGamepadInput(gamepad);
    }
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
  
  // Combine inputs
  const up = dpadUp || stickUp;
  const down = dpadDown || stickDown;
  const left = dpadLeft || stickLeft;
  const right = dpadRight || stickRight;
  
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
  
  // A button (usually index 0) - Select/Type letter
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
  
  // LB button (usually index 4) - Move cursor left / clear all
  if (gamepad.buttons[4]?.pressed && !state.lastInput.lb) {
    if (state.oskVisible) {
      clearOSK();
    }
    state.lastInput.lb = true;
  } else if (!gamepad.buttons[4]?.pressed) {
    state.lastInput.lb = false;
  }
  
  // RB button (usually index 5) - Submit when OSK open
  if (gamepad.buttons[5]?.pressed && !state.lastInput.rb) {
    if (state.oskVisible) {
      submitOSK();
    }
    state.lastInput.rb = true;
  } else if (!gamepad.buttons[5]?.pressed) {
    state.lastInput.rb = false;
  }
  
  // Start button (usually index 9) - Menu
  if (gamepad.buttons[9]?.pressed && !state.lastInput.start) {
    // Toggle to settings
    if (state.currentSection !== 'settings') {
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
    
    // Left stick click (index 10) - Scroll mode toggle could go here
    if (gamepad.buttons[10]?.pressed && !state.lastInput.ls) {
      // Scroll the page
      scrollWebview(leftY * 100);
      state.lastInput.ls = true;
    } else if (!gamepad.buttons[10]?.pressed) {
      state.lastInput.ls = false;
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
  
  if (!overlay || !input) return;
  
  state.oskVisible = true;
  state.oskMode = mode;
  overlay.classList.remove('hidden');
  
  // Clear input
  input.value = '';
  
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
  }
}

function backspaceOSK() {
  const input = document.getElementById('osk-input');
  if (input && input.value.length > 0) {
    input.value = input.value.slice(0, -1);
    playNavSound();
  }
}

function clearOSK() {
  const input = document.getElementById('osk-input');
  if (input) {
    input.value = '';
    playNavSound();
  }
}

function submitOSK() {
  const input = document.getElementById('osk-input');
  if (!input || !input.value.trim()) return;
  
  const value = input.value.trim();
  
  if (state.oskMode === 'search') {
    performSearch(value);
  }
  
  closeOSK();
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
    const stored = localStorage.getItem('siteHistory');
    state.history = stored ? JSON.parse(stored) : [];
    renderHistory();
    renderRecentSites();
  } catch (err) {
    console.error('[BigPicture] Failed to load history:', err);
    state.history = [];
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
      </div>
    `;
    return;
  }
  
  state.bookmarks.forEach(bookmark => {
    const tile = createTile(
      bookmark.title || bookmark.name || getDomainFromUrl(bookmark.url),
      bookmark.url,
      'bookmark'
    );
    grid.appendChild(tile);
  });
  
  updateFocusableElements();
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
      </div>
    `;
    return;
  }
  
  // Show last 20 items
  state.history.slice(0, 20).forEach(url => {
    const item = createListItem(getDomainFromUrl(url), url);
    list.appendChild(item);
  });
  
  updateFocusableElements();
}

function renderRecentSites() {
  const container = document.getElementById('recentSitesScroll');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
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

function createTile(title, url, icon) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.focusable = '';
  tile.tabIndex = 0;
  tile.dataset.url = url;
  
  tile.innerHTML = `
    <div class="tile-icon">
      <span class="material-symbols-outlined">${icon}</span>
    </div>
    <div class="tile-title">${escapeHtml(title)}</div>
    <div class="tile-url">${getDomainFromUrl(url)}</div>
  `;
  
  tile.addEventListener('click', () => navigateTo(url));
  
  return tile;
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
  
  card.innerHTML = `
    <div class="scroll-card-preview">
      <span class="material-symbols-outlined" style="font-size: 48px; color: var(--bp-text-dim); display: flex; align-items: center; justify-content: center; height: 100%;">public</span>
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
  
  // Enable virtual cursor for webview interaction
  enableCursor();
  
  // Switch section to browse
  switchSection('browse');
  
  // Update focusable elements to include webview controls
  setTimeout(() => {
    updateFocusableElements();
  }, 100);
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
      showToast('Theme settings coming soon');
      break;
    case 'privacy':
      showToast('Privacy settings coming soon');
      break;
    case 'display':
      showToast('Display settings coming soon');
      break;
    case 'exit-bigpicture':
      exitBigPictureMode();
      break;
    default:
      console.log('[BigPicture] Unknown settings action:', action);
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
  
  // Show cursor hint
  showToast('🎮 Right stick: Move cursor | RT: Click | LT: Right-click | B: Back');
}

function disableCursor() {
  state.cursorEnabled = false;
  if (state.cursorElement) {
    state.cursorElement.classList.remove('active');
  }
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
  const x = state.cursorX - containerRect.left;
  const y = state.cursorY - containerRect.top;
  
  // Show click animation
  if (state.cursorElement) {
    state.cursorElement.classList.add('clicking');
    setTimeout(() => state.cursorElement.classList.remove('clicking'), 150);
  }
  
  // Send mouse event to webview
  try {
    const webContents = state.currentWebview;
    
    // Use executeJavaScript to simulate click at coordinates
    const clickScript = rightClick ? `
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
    ` : `
      (function() {
        const el = document.elementFromPoint(${x}, ${y});
        if (el) {
          // Try to focus if it's an input
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
            el.focus();
          }
          // Simulate full click sequence
          const rect = el.getBoundingClientRect();
          const events = ['mousedown', 'mouseup', 'click'];
          events.forEach(type => {
            const event = new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: ${x},
              clientY: ${y},
              button: 0
            });
            el.dispatchEvent(event);
          });
          // Also try clicking directly for links and buttons
          if (el.click) el.click();
        }
      })();
    `;
    
    webContents.executeJavaScript(clickScript).catch(err => {
      console.log('[BigPicture] Click injection error:', err);
    });
  } catch (err) {
    console.log('[BigPicture] Virtual click error:', err);
  }
}

function scrollWebview(amount) {
  if (!state.currentWebview) return;
  
  try {
    state.currentWebview.executeJavaScript(`window.scrollBy(0, ${amount})`);
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
