// Prefer contextBridge-exposed API
const ipc = (window.electronAPI && typeof window.electronAPI.invoke === 'function')
  ? window.electronAPI
  : null;

let clearBtn = document.getElementById('clear-data-btn');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const TAB_STORAGE_KEY = 'nebula-settings-active-tab';
const WEATHER_UNIT_KEY = 'nebula-weather-unit'; // 'auto' | 'c' | 'f'
const HOME_SEARCH_Y_KEY = 'nebula-home-search-y'; // number (vh)
const HOME_BOOKMARKS_Y_KEY = 'nebula-home-bookmarks-y'; // number (vh)
const HOME_GLANCE_CORNER_KEY = 'nebula-home-glance-corner'; // 'br'|'bl'|'tr'|'tl'
const DISPLAY_SCALE_KEY = 'nebula-display-scale'; // number (50-300)

function showStatus(message) {
  if (statusText && statusDiv) {
    statusText.textContent = message;
    statusDiv.classList.remove('hidden');
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 2000);
  } else {
    console.log('[STATUS]', message);
  }
}

function showStatus(message) {
  statusText.textContent = message;
  statusDiv.classList.remove('hidden'); // Ensure the hidden class is removed
  setTimeout(() => {
    statusDiv.classList.add('hidden'); // Add the hidden class back after 2 seconds
  }, 2000);
}

function attachClearHandler(btn) {
  if (!btn) return;
  btn.onclick = async () => {
    if (statusDiv && statusText) {
      statusDiv.classList.remove('hidden');
      statusText.textContent = 'Clearing cookies, storage, cache, and history...';
    }

    try {
      if (ipc) {
        const ok = await ipc.invoke('clear-browser-data');
        // Also clear localStorage site history in this context
        try { localStorage.removeItem('siteHistory'); } catch {}
        // Try to refresh lists if present
        try { if (typeof loadHistories === 'function') await loadHistories(); } catch {}
        showStatus(ok
          ? 'All browser data cleared.'
          : 'Failed to clear browser data.');
      } else {
        showStatus('Clear data feature not available in this context.');
      }
    } catch (error) {
      console.error('Error clearing browser data:', error);
      showStatus('An error occurred while clearing data.');
    } finally {
      const currentTheme = window.browserCustomizer ? window.browserCustomizer.currentTheme : null;
      if (currentTheme && window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('theme-update', currentTheme);
      }
    }
  };
}

// Try attaching immediately, and again on DOMContentLoaded
attachClearHandler(clearBtn);
window.addEventListener('DOMContentLoaded', () => {
  if (!clearBtn) {
    clearBtn = document.getElementById('clear-data-btn');
    attachClearHandler(clearBtn);
  }

  // Wire per-section clear buttons to main when possible
  const clearSiteBtn = document.getElementById('clear-site-history-btn');
  if (clearSiteBtn) {
    clearSiteBtn.addEventListener('click', async () => {
      try {
        // Clear localStorage copy
        try { localStorage.removeItem('siteHistory'); } catch {}
        // Ask main to clear file-based history for consistency
        if (ipc) { await ipc.invoke('clear-site-history'); }
        showStatus('Site history cleared');
        try { if (typeof loadHistories === 'function') await loadHistories(); } catch {}
      } catch (e) {
        console.error('Clear site history error:', e);
        showStatus('Failed clearing site history');
      }
    });
  }
  const clearSearchBtn = document.getElementById('clear-search-history-btn');
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', async () => {
      try {
        // Clear from localStorage in this context
        try { localStorage.removeItem('searchHistory'); } catch {}
        
        if (ipc) { await ipc.invoke('clear-search-history'); }
        showStatus('Search history cleared');
      } catch (e) {
        console.error('Clear search history error:', e);
        showStatus('Failed clearing search history');
      }
    });
  }

  // Weather unit controls
  try {
    const stored = localStorage.getItem(WEATHER_UNIT_KEY) || 'auto';
    const radios = document.querySelectorAll('input[name="weather-unit"]');
    radios.forEach(r => r.checked = (r.value === stored));
    radios.forEach(radio => radio.addEventListener('change', () => {
      const val = document.querySelector('input[name="weather-unit"]:checked')?.value || 'auto';
      localStorage.setItem(WEATHER_UNIT_KEY, val);
      showStatus(`Weather units set to ${val === 'c' ? 'Celsius' : val === 'f' ? 'Fahrenheit' : 'Auto'}`);
      // Hint home page to refresh weather if it listens to storage events
      try { window.dispatchEvent(new StorageEvent('storage', { key: WEATHER_UNIT_KEY, newValue: val })); } catch {}
      if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('settings-update', { weatherUnit: val });
      }
    }));
  } catch (e) { console.warn('Weather unit setup failed', e); }

  // Home layout controls
  try {
    const searchRange = document.getElementById('home-search-y');
    const searchVal = document.getElementById('home-search-y-val');
    const bmRange = document.getElementById('home-bookmarks-y');
    const bmVal = document.getElementById('home-bookmarks-y-val');
    const cornerRadios = document.querySelectorAll('input[name="home-glance-corner"]');

    const initNum = (key, def, input, label) => {
      const v = Number(localStorage.getItem(key) || def);
      if (input) input.value = String(v);
      if (label) label.textContent = v + 'vh';
      return v;
    };
    initNum(HOME_SEARCH_Y_KEY, 22, searchRange, searchVal);
    initNum(HOME_BOOKMARKS_Y_KEY, 40, bmRange, bmVal);
    const storedCorner = localStorage.getItem(HOME_GLANCE_CORNER_KEY) || 'br';
    cornerRadios.forEach(r => r.checked = (r.value === storedCorner));

    const notify = () => {
      if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('settings-update', {
          searchY: Number(localStorage.getItem(HOME_SEARCH_Y_KEY) || 22),
          bookmarksY: Number(localStorage.getItem(HOME_BOOKMARKS_Y_KEY) || 40),
          glanceCorner: localStorage.getItem(HOME_GLANCE_CORNER_KEY) || 'br'
        });
      }
    };

    if (searchRange) searchRange.addEventListener('input', () => {
      const val = Number(searchRange.value);
      searchVal.textContent = val + 'vh';
      localStorage.setItem(HOME_SEARCH_Y_KEY, String(val));
      notify();
    });
    if (bmRange) bmRange.addEventListener('input', () => {
      const val = Number(bmRange.value);
      bmVal.textContent = val + 'vh';
      localStorage.setItem(HOME_BOOKMARKS_Y_KEY, String(val));
      notify();
    });
    cornerRadios.forEach(r => r.addEventListener('change', () => {
      const val = document.querySelector('input[name="home-glance-corner"]:checked')?.value || 'br';
      localStorage.setItem(HOME_GLANCE_CORNER_KEY, val);
      notify();
    }));
  } catch (e) { console.warn('Home layout control setup failed', e); }

  // Display scale controls
  try {
    const scaleValue = document.getElementById('display-scale-value');
    const zoomDecrease = document.getElementById('zoom-decrease');
    const zoomIncrease = document.getElementById('zoom-increase');
    const zoomPresets = document.querySelectorAll('.zoom-preset-btn');
    
    let currentScale = Number(localStorage.getItem(DISPLAY_SCALE_KEY) || 100);
    
    // Function to apply zoom
    async function applyZoom(scale) {
      currentScale = Math.max(50, Math.min(300, scale));
      if (scaleValue) scaleValue.textContent = currentScale + '%';
      localStorage.setItem(DISPLAY_SCALE_KEY, String(currentScale));
      
      // Highlight active preset
      zoomPresets.forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.zoom) === currentScale);
      });
      
      if (ipc && typeof ipc.invoke === 'function') {
        try {
          const zoomFactor = currentScale / 100;
          await ipc.invoke('set-zoom-factor', zoomFactor);
          showStatus(`Zoom set to ${currentScale}%`);
        } catch (err) {
          console.warn('Failed to apply zoom:', err);
          showStatus(`Zoom saved to ${currentScale}%`);
        }
      }
    }
    
    // Initialize display
    if (scaleValue) scaleValue.textContent = currentScale + '%';
    zoomPresets.forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.zoom) === currentScale);
    });
    
    // Apply saved zoom on load
    if (ipc && typeof ipc.invoke === 'function' && currentScale !== 100) {
      try {
        const zoomFactor = currentScale / 100;
        ipc.invoke('set-zoom-factor', zoomFactor).catch(err => {
          console.warn('Failed to apply initial zoom:', err);
        });
      } catch (err) {
        console.warn('Failed to apply initial zoom:', err);
      }
    }
    
    // Decrease button
    if (zoomDecrease) {
      zoomDecrease.addEventListener('click', () => {
        applyZoom(currentScale - 10);
      });
    }
    
    // Increase button
    if (zoomIncrease) {
      zoomIncrease.addEventListener('click', () => {
        applyZoom(currentScale + 10);
      });
    }
    
    // Preset buttons
    zoomPresets.forEach(btn => {
      btn.addEventListener('click', () => {
        const zoom = Number(btn.dataset.zoom);
        applyZoom(zoom);
      });
    });
  } catch (e) { console.warn('Display scale setup failed', e); }

  // Big Picture Mode controls
  try {
    const bigPictureBtn = document.getElementById('launch-bigpicture-btn');
    const bigPictureStatus = document.getElementById('bigpicture-status');
    
    // Check if Big Picture Mode is recommended for this display
    if (window.bigPictureAPI && typeof window.bigPictureAPI.isSuggested === 'function') {
      window.bigPictureAPI.isSuggested().then(suggested => {
        if (suggested && bigPictureStatus) {
          bigPictureStatus.textContent = '✓ Recommended for your display';
          bigPictureStatus.style.color = '#4ade80';
        }
      }).catch(() => {});
      
      // Get screen info for display
      window.bigPictureAPI.getScreenInfo().then(info => {
        if (info && bigPictureStatus) {
          const hint = info.isSteamDeck ? 'Steam Deck detected' : 
                       info.isSmallScreen ? 'Small screen detected' : '';
          if (hint && !bigPictureStatus.textContent) {
            bigPictureStatus.textContent = hint;
          }
        }
      }).catch(() => {});
    }
    
    if (bigPictureBtn) {
      bigPictureBtn.addEventListener('click', async () => {
        try {
          if (window.bigPictureAPI && typeof window.bigPictureAPI.launch === 'function') {
            showStatus('Launching Big Picture Mode...');
            await window.bigPictureAPI.launch();
          } else {
            showStatus('Big Picture Mode not available');
          }
        } catch (e) {
          console.error('Big Picture Mode launch error:', e);
          showStatus('Failed to launch Big Picture Mode');
        }
      });
    }
  } catch (e) { console.warn('Big Picture Mode setup failed', e); }
});

// Tabs: simple controller
function activateTab(tabName) {
  const links = document.querySelectorAll('.tab-link');
  const panels = document.querySelectorAll('.tab-panel');
  
  links.forEach(l => {
    const isActive = l.dataset.tab === tabName;
    l.classList.toggle('active', isActive);
    l.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) l.focus({ preventScroll: true });
  });
  panels.forEach(p => {
    const isActive = p.id === `panel-${tabName}`;
    p.classList.toggle('active', isActive);
    p.hidden = !isActive;
  // noop
  });
  try { localStorage.setItem(TAB_STORAGE_KEY, tabName); } catch {}
}

function initTabs() {
  const links = document.querySelectorAll('.tab-link');

  const getFocusableElements = (container) => {
    if (!container) return [];
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector))
      .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null);
  };

  const focusFirstInActivePanel = () => {
    const activePanel = document.querySelector('.tab-panel.active') || null;
    const focusables = getFocusableElements(activePanel);
    if (focusables.length > 0) {
      focusables[0].focus({ preventScroll: true });
      return true;
    }
    if (activePanel) {
      if (!activePanel.hasAttribute('tabindex')) {
        activePanel.setAttribute('tabindex', '-1');
      }
      activePanel.focus({ preventScroll: true });
      return true;
    }
    return false;
  };
  
  // Direct listeners (for accessibility focus handling)
  links.forEach((link, index) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const name = link.dataset.tab;
      if (!name) return;
      if (location.hash !== `#${name}`) {
        history.replaceState(null, '', `#${name}`);
      }
      activateTab(name);
    });

    // Controller/keyboard: move from tab to panel content
    link.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        const moved = focusFirstInActivePanel();
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });
  });
  
  // Delegation as a fallback if elements are re-rendered
  const tabContainer = document.querySelector('.tabs');
  if (tabContainer) {
    tabContainer.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.tab-link') : null;
      if (!btn || !tabContainer.contains(btn)) return;
      const name = btn.dataset.tab;
      if (!name) return;
      if (location.hash !== `#${name}`) {
        history.replaceState(null, '', `#${name}`);
      }
      activateTab(name);
    });
  }

  // Global fallback: if focus is on sidebar tabs, move into active panel on down/right
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowRight') return;

    const activeEl = document.activeElement;
    const inTabs = activeEl && (activeEl.classList?.contains('tab-link') || activeEl.closest?.('.tabs'));
    const inSidebar = activeEl && activeEl.closest?.('.sidebar');

    if (inTabs || inSidebar) {
      const moved = focusFirstInActivePanel();
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  // Resolve initial tab: hash > storage > default 'general'
  let initial = (location.hash || '').replace('#', '') || null;
  if (!initial) {
    try { initial = localStorage.getItem(TAB_STORAGE_KEY) || null; } catch {}
  }
  if (!initial) initial = 'general';
  activateTab(initial);
}

// Initialize tabs after DOM is ready but before customization init uses the DOM
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
});

// Apply current theme to settings page
function applyCurrentThemeToSettings() {
  if (!window.BrowserCustomizer) return;
  
  const savedTheme = localStorage.getItem('nebula-theme');
  let theme = null;
  
  if (savedTheme) {
    try {
      theme = JSON.parse(savedTheme);
    } catch (e) {
      console.warn('Failed to parse saved theme', e);
    }
  }
  
  if (!theme || !theme.colors) return;
  
  // Apply theme colors to CSS variables
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.colors.bg || '#121418');
  root.style.setProperty('--gradient-end', theme.colors.darkPurple || '#1B1035');
  root.style.setProperty('--primary', theme.colors.primary || '#7B2EFF');
  root.style.setProperty('--accent', theme.colors.accent || '#00C6FF');
  root.style.setProperty('--text', theme.colors.text || '#E0E0E0');
  
  // Update glow colors based on theme
  const primaryRgb = hexToRgb(theme.colors.primary || '#7B2EFF');
  if (primaryRgb) {
    root.style.setProperty('--ring', `0 0 0 2px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.4)`);
    root.style.setProperty('--glow-subtle', `0 4px 20px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.15)`);
  }
}

// Helper to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Listen for theme changes
window.addEventListener('storage', (e) => {
  if (e.key === 'nebula-theme') {
    applyCurrentThemeToSettings();
  }
});

// About tab population
async function populateAbout() {
  try {
    const info = (window.aboutAPI && typeof window.aboutAPI.getInfo === 'function')
      ? await window.aboutAPI.getInfo()
      : null;
    if (!info || info.error) {
      console.warn('[ABOUT] Unable to load about info', info && info.error);
      return;
    }
    const byId = (id) => document.getElementById(id);
    byId('about-app-name').textContent = info.appName;
    byId('about-app-version').textContent = info.appVersion;
    byId('about-packaged').textContent = info.isPackaged ? 'Yes' : 'No';
    byId('about-userdata').textContent = info.userDataPath;

    byId('about-electron').textContent = info.electronVersion;
    byId('about-chrome').textContent = info.chromeVersion;
    byId('about-node').textContent = info.nodeVersion;
    byId('about-v8').textContent = info.v8Version;

    byId('about-os').textContent = `${info.osType} ${info.osRelease}`;
    byId('about-cpu').textContent = info.cpu;
    byId('about-arch').textContent = info.arch;
    byId('about-mem').textContent = `${info.totalMemGB} GB`;

    const copyBtn = document.getElementById('copy-about-btn');
    if (copyBtn && !copyBtn.dataset.listenerAttached) {
      copyBtn.dataset.listenerAttached = 'true';
      copyBtn.addEventListener('click', async () => {
        const payload = [
          `Nebula ${info.appVersion} (${info.isPackaged ? 'packaged' : 'dev'})`,
          `Electron ${info.electronVersion} | Chromium ${info.chromeVersion} | Node ${info.nodeVersion} | V8 ${info.v8Version}`,
          `${info.osType} ${info.osRelease} ${info.arch}`,
          `CPU: ${info.cpu}`,
          `RAM: ${info.totalMemGB} GB`,
          `UserData: ${info.userDataPath}`
        ].join('\n');
        try {
          await navigator.clipboard.writeText(payload);
          showStatus('Diagnostics copied');
        } catch (err) {
          console.error('Clipboard error:', err);
          showStatus('Failed to copy diagnostics');
        }
      });
    }
  } catch (err) {
    console.error('[ABOUT] Error populating about info:', err);
  }
}

// Populate about info after DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  populateAbout();
  setupElectronUpdater();
  applyCurrentThemeToSettings();

  // Refresh about info when About tab is clicked
  const aboutTabBtn = document.getElementById('tab-about');
  if (aboutTabBtn) {
    aboutTabBtn.addEventListener('click', () => {
      // Refresh after a short delay to allow tab transition
      setTimeout(() => {
        populateAbout();
        // Auto-check for updates when About tab is opened
        const checkBtn = document.getElementById('check-electron-versions');
        if (checkBtn && !checkBtn.disabled) {
          checkBtn.click();
        }
      }, 100);
    });
  }
});

// Electron updater feature setup (for security updates)
async function setupElectronUpdater() {
  const securityUpdatesSection = document.querySelector('.customization-group:has(#electron-update-banner)');
  const banner = document.getElementById('electron-update-banner');
  const statusSpan = document.getElementById('electron-update-status');
  const detailsDiv = document.getElementById('electron-update-details');
  const progressDiv = document.getElementById('electron-update-progress');
  const checkBtn = document.getElementById('check-electron-versions');
  const upgradeBtn = document.getElementById('electron-upgrade-btn');
  const versionSelect = document.getElementById('electron-version-select');
  const currentVersionSpan = document.getElementById('electron-current-version');
  const appVersionSpan = document.getElementById('about-app-version-copy');

  if (!ipc) {
    console.warn('[ELECTRON-UPDATER] IPC not available');
    return;
  }

  // Check if app is packaged - if so, hide the entire Security Updates section
  try {
    const appInfo = await ipc.invoke('get-app-info');
    console.log('[ELECTRON-UPDATER] App info:', appInfo);

    if (appInfo && appInfo.isPackaged) {
      console.log('[ELECTRON-UPDATER] Packaged build detected - hiding Security Updates section');
      if (securityUpdatesSection) {
        securityUpdatesSection.style.display = 'none';
      }
      return;
    }

    console.log('[ELECTRON-UPDATER] Development mode - showing Security Updates section');
  } catch (err) {
    console.error('[ELECTRON-UPDATER] Failed to get app info:', err);
    // On error, hide the section to be safe
    if (securityUpdatesSection) {
      securityUpdatesSection.style.display = 'none';
    }
    return;
  }

  let availableVersion = null;
  let currentVersion = null;
  let isUpgrading = false;

  // Get current app version
  try {
    const info = await window.aboutAPI?.getInfo();
    if (info && appVersionSpan) {
      appVersionSpan.textContent = info.appVersion || 'Unknown';
    }
  } catch (err) {
    console.error('[ELECTRON-UPDATER] Failed to get app version:', err);
  }

  // Check for Electron updates
  const checkVersions = async () => {
    if (isUpgrading) return;

    try {
      checkBtn.disabled = true;
      banner.style.display = 'block';
      statusSpan.textContent = 'Checking for updates...';
      detailsDiv.textContent = '';
      progressDiv.style.display = 'none';
      upgradeBtn.style.display = 'none';
      banner.style.borderColor = 'rgba(123, 46, 255, 0.3)';
      banner.style.background = 'rgba(123, 46, 255, 0.1)';

      const buildType = versionSelect.value;
      const result = await ipc.invoke('get-electron-versions', buildType);

      if (result.error) {
        statusSpan.textContent = 'Update check failed';
        detailsDiv.textContent = result.error;
        banner.style.borderColor = 'rgba(244, 67, 54, 0.5)';
        banner.style.background = 'rgba(244, 67, 54, 0.1)';
        showStatus(`Failed: ${result.error}`);
      } else {
        availableVersion = result.available;
        currentVersion = result.current;

        if (currentVersionSpan) {
          currentVersionSpan.textContent = currentVersion || 'Unknown';
        }

        const isNewer = compareVersions(availableVersion, currentVersion) > 0;

        if (isNewer) {
          statusSpan.textContent = 'Security update available';
          detailsDiv.textContent = `Electron ${availableVersion} is available (you have ${currentVersion}). This update includes security patches and performance improvements.`;
          upgradeBtn.style.display = 'inline-block';
          upgradeBtn.disabled = false;
          banner.style.borderColor = 'rgba(76, 175, 80, 0.5)';
          banner.style.background = 'rgba(76, 175, 80, 0.1)';
          showStatus(`Update available: ${availableVersion}`);
        } else {
          statusSpan.textContent = 'Up to date';
          detailsDiv.textContent = `You are running the latest ${buildType} version of Electron (${currentVersion}).`;
          upgradeBtn.style.display = 'none';
          banner.style.borderColor = 'rgba(100, 100, 100, 0.3)';
          banner.style.background = 'rgba(100, 100, 100, 0.1)';
          showStatus('Electron is up to date');
        }
      }
    } catch (err) {
      console.error('[ELECTRON-UPDATER] Check failed:', err);
      statusSpan.textContent = 'Update check failed';
      detailsDiv.textContent = err.message;
      banner.style.borderColor = 'rgba(244, 67, 54, 0.5)';
      banner.style.background = 'rgba(244, 67, 54, 0.1)';
      showStatus('Check failed');
    } finally {
      checkBtn.disabled = false;
    }
  };

  // Install Electron update
  const handleUpgrade = async () => {
    if (isUpgrading) return;

    const buildType = versionSelect.value;
    if (!availableVersion) {
      showStatus('No update available');
      return;
    }

    const confirmed = confirm(
      `Update Electron from ${currentVersion} to ${availableVersion}?\n\nThis will download and install the ${buildType} version, then restart the application.\n\nThis process may take a few minutes.`
    );

    if (!confirmed) return;

    try {
      isUpgrading = true;
      upgradeBtn.disabled = true;
      checkBtn.disabled = true;
      versionSelect.disabled = true;

      statusSpan.textContent = 'Installing update...';
      detailsDiv.textContent = `Downloading and installing Electron ${availableVersion}. Please wait...`;
      progressDiv.style.display = 'block';
      banner.style.borderColor = 'rgba(255, 193, 7, 0.5)';
      banner.style.background = 'rgba(255, 193, 7, 0.1)';
      showStatus('Installing Electron update...');

      const result = await ipc.invoke('upgrade-electron', buildType);

      if (result.success) {
        statusSpan.textContent = 'Update installed';
        detailsDiv.textContent = 'Electron has been updated successfully. The application will restart now.';
        progressDiv.style.display = 'none';
        banner.style.borderColor = 'rgba(76, 175, 80, 0.5)';
        banner.style.background = 'rgba(76, 175, 80, 0.1)';
        showStatus('Update complete - restarting...');

        // Restart the app
        setTimeout(() => {
          if (ipc) {
            ipc.invoke('restart-app').catch(err => {
              console.error('Restart failed:', err);
              showStatus('Please restart the app manually');
            });
          }
        }, 2000);
      } else {
        throw new Error(result.error || 'Upgrade failed');
      }
    } catch (err) {
      console.error('[ELECTRON-UPDATER] Upgrade failed:', err);
      statusSpan.textContent = 'Update failed';
      detailsDiv.textContent = `Failed to install update: ${err.message}`;
      progressDiv.style.display = 'none';
      banner.style.borderColor = 'rgba(244, 67, 54, 0.5)';
      banner.style.background = 'rgba(244, 67, 54, 0.1)';
      showStatus(`Update failed: ${err.message}`);

      isUpgrading = false;
      upgradeBtn.disabled = false;
      checkBtn.disabled = false;
      versionSelect.disabled = false;
    }
  };

  // Wire up event handlers
  if (checkBtn) {
    checkBtn.addEventListener('click', checkVersions);
  }

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', handleUpgrade);
  }

  if (versionSelect) {
    versionSelect.addEventListener('change', () => {
      // Reset UI when build type changes
      banner.style.display = 'none';
      upgradeBtn.style.display = 'none';
      upgradeBtn.disabled = true;
      availableVersion = null;
    });
  }
}


// Helper function to compare semantic versions
function compareVersions(v1, v2) {
  const parts1 = v1.split('-')[0].split('.').map(x => parseInt(x, 10));
  const parts2 = v2.split('-')[0].split('.').map(x => parseInt(x, 10));
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// Keep settings open when clicking GitHub by asking host to open externally/new tab
window.addEventListener('DOMContentLoaded', () => {
  const gh = document.getElementById('github-link');
  if (gh) {
    gh.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        const url = gh.getAttribute('href');
        if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
          window.electronAPI.sendToHost('navigate', url, { newTab: true });
        } else if (window.parent) {
          window.parent.postMessage({ type: 'navigate', url, newTab: true }, '*');
        } else {
          window.open(url, '_blank', 'noopener');
        }
      } catch (err) {
        console.error('Failed to open GitHub link:', err);
        window.open(gh.getAttribute('href'), '_blank');
      }
    });
  }
  const help = document.getElementById('help-link');
  if (help) {
    help.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        const url = help.getAttribute('href');
        if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
          window.electronAPI.sendToHost('navigate', url, { newTab: true });
        } else if (window.parent) {
          window.parent.postMessage({ type: 'navigate', url, newTab: true }, '*');
        } else {
          window.open(url, '_blank', 'noopener');
        }
      } catch (err) {
        console.error('Failed to open Help link:', err);
        window.open(help.getAttribute('href'), '_blank');
      }
    });
  }
});

// -----------------------------
// Plugins management (Settings)
// -----------------------------
async function loadPluginsUI() {
  const listEl = document.getElementById('plugins-list');
  const reloadAllBtn = document.getElementById('plugins-reload-all');
  if (!listEl) return;
  // Load list
  let items = [];
  try {
    items = (ipc ? await ipc.invoke('plugins-list') : []) || [];
  } catch (e) {
    console.warn('plugins-list failed', e);
  }
  listEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'plugin-item';
    empty.textContent = 'No plugins found';
    listEl.appendChild(empty);
  } else {
    for (const p of items) {
    const categories = Array.isArray(p.categories) ? p.categories.filter(x => x && typeof x === 'string') : [];
    const authors = Array.isArray(p.authors) ? p.authors.filter(x => x && typeof x === 'string') : [];
    const tagsHtml = categories.length ? `<div class="plugin-tags">${categories.map(c => `<span class=\"plugin-tag\">${escapeHtml(c)}</span>`).join('')}</div>` : '';
    const authorsHtml = authors.length ? `<div class=\"plugin-authors\"><span class=\"muted\">Authors:</span> ${authors.map(a => `<span class=\"plugin-author\">${escapeHtml(a)}</span>`).join(', ')}</div>` : '';
      const row = document.createElement('div');
      row.className = 'plugin-item';
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <div class="plugin-meta">
          <div class="plugin-title">${escapeHtml(p.name)} <span style="opacity:.7;font-weight:400">v${escapeHtml(p.version)}</span></div>
          <div class="plugin-desc">${escapeHtml(p.description || '')}</div>
      ${tagsHtml}
      ${authorsHtml}
          <div class="plugin-desc" style="opacity:.6; font-size:.85em;">${escapeHtml(p.dir)}</div>
        </div>
        <div class="plugin-actions">
          <label style="display:flex; align-items:center; gap:6px;">
            <input type="checkbox" class="plugin-enable" ${p.enabled ? 'checked' : ''}>
            <span>${p.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <span class="spacer"></span>
          <button class="plugin-reload">Reload</button>
        </div>`;
      // Wire actions
      const enableInput = row.querySelector('input.plugin-enable');
      const labelSpan = row.querySelector('label span');
      enableInput.addEventListener('change', async () => {
        const enabled = enableInput.checked;
        try {
          if (ipc) await ipc.invoke('plugins-set-enabled', { id: p.id, enabled });
          labelSpan.textContent = enabled ? 'Enabled' : 'Disabled';
          showStatus(`${p.name}: ${enabled ? 'Enabled' : 'Disabled'}.`);
        } catch (e) {
          console.error('Failed to toggle plugin', p.id, e);
          enableInput.checked = !enabled;
          labelSpan.textContent = enableInput.checked ? 'Enabled' : 'Disabled';
          showStatus('Failed updating plugin');
        }
      });
      const reloadBtn = row.querySelector('button.plugin-reload');
      reloadBtn.addEventListener('click', async () => {
        try {
          if (ipc) await ipc.invoke('plugins-reload', { id: p.id });
          showStatus(`${p.name} reloaded.`);
        } catch (e) {
          console.error('Plugin reload failed', e);
          showStatus('Reload failed');
        }
      });
      listEl.appendChild(row);
    }
  }
  if (reloadAllBtn) reloadAllBtn.onclick = async () => {
    try { if (ipc) await ipc.invoke('plugins-reload', {}); showStatus('Plugins reloaded.'); } catch { showStatus('Reload failed'); }
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

// Load when settings page shows Plugins tab for the first time
window.addEventListener('DOMContentLoaded', () => {
  const tabBtn = document.getElementById('tab-plugins');
  if (!tabBtn) return;
  let loaded = false;
  const ensureLoad = () => { if (!loaded) { loaded = true; loadPluginsUI(); } };
  tabBtn.addEventListener('click', ensureLoad);
  if (location.hash === '#plugins') ensureLoad();
});
