/**
 * First-Time Setup Script for Nebula Browser
 * Handles theme selection, default browser setup, and first-run completion
 */

// State management
const setupState = {
  currentStep: 1,
  selectedTheme: 'default',
  defaultBrowserSet: false,
  skipped: false,
  themes: []
};

// Initialize setup when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Setup] Initializing first-time setup...');
  
  // Load available themes
  await loadThemes();
  
  // Initialize button handlers
  initializeButtons();
  
  // Check default browser status
  checkDefaultBrowserStatus();
});

/**
 * Load available themes from main process
 */
async function loadThemes() {
  try {
    const themes = await window.api.getAllThemes();
    console.log('[Setup] Loaded themes:', themes);
    setupState.themes = themes;
    
    // Render theme grid
    renderThemeGrid(themes);
  } catch (error) {
    console.error('[Setup] Error loading themes:', error);
    // Fallback to a default theme
    setupState.themes = {
      default: {
        default: { name: 'Default', description: 'Classic Nebula theme', colors: { bg: '#121418', primary: '#7B2EFF', accent: '#00C6FF' } }
      }
    };
    renderThemeGrid(setupState.themes);
  }
}

/**
 * Render theme selection grid
 */
function renderThemeGrid(themes) {
  const themeGrid = document.getElementById('theme-grid');
  if (!themeGrid) return;
  
  themeGrid.innerHTML = '';
  
  // Convert themes object to array
  let themeArray = [];
  
  if (Array.isArray(themes)) {
    // Already an array
    themeArray = themes;
  } else if (themes.default) {
    // Has default property, extract themes from it
    themeArray = Object.entries(themes.default).map(([id, data]) => ({
      id,
      name: data.name || id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
      description: data.description || 'A beautiful color scheme',
      colors: data.colors || {}
    }));
  } else {
    // Direct object of themes
    themeArray = Object.entries(themes).map(([id, data]) => ({
      id,
      name: data.name || id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
      description: data.description || 'A beautiful color scheme',
      colors: data.colors || {}
    }));
  }
  
  console.log('[Setup] Rendering', themeArray.length, 'themes');
  
  // If no themes found, add a default one
  if (themeArray.length === 0) {
    themeArray = [{
      id: 'default',
      name: 'Default',
      description: 'Classic Nebula theme',
      colors: { bg: '#121418', primary: '#7B2EFF', accent: '#00C6FF', text: '#E0E0E0' }
    }];
  }
  
  themeArray.forEach(theme => {
    const themeCard = createThemeCard(theme);
    themeGrid.appendChild(themeCard);
  });
  
  // Select default theme
  const defaultCard = themeGrid.querySelector('[data-theme-id="default"]');
  if (defaultCard) {
    defaultCard.classList.add('selected');
    const defaultTheme = getThemeById('default');
    if (defaultTheme) {
      applyThemeToSetupPage(defaultTheme, 'default');
    }
  }
}

/**
 * Get a theme by id from loaded theme sets
 */
function getThemeById(themeId) {
  const themes = setupState.themes || {};
  if (themes.default && themes.default[themeId]) return themes.default[themeId];
  if (themes.user && themes.user[themeId]) return themes.user[themeId];
  if (themes.downloaded && themes.downloaded[themeId]) return themes.downloaded[themeId];
  return null;
}

/**
 * Apply theme to the setup page UI and persist selection
 */
function applyThemeToSetupPage(theme, themeId = null) {
  if (!theme || !theme.colors) return;
  const colors = theme.colors;
  const root = document.documentElement;

  const setVar = (cssVar, value, fallback) => {
    const val = value || fallback;
    if (val) root.style.setProperty(cssVar, val);
  };

  setVar('--bg', colors.bg, '#121418');
  setVar('--dark-blue', colors.darkBlue, '#0B1C2B');
  setVar('--dark-purple', colors.darkPurple, '#1B1035');
  setVar('--primary', colors.primary, '#7B2EFF');
  setVar('--accent', colors.accent, '#00C6FF');
  setVar('--text', colors.text, '#E0E0E0');

  if (theme.gradient) {
    document.body.style.background = theme.gradient;
  } else if (colors.bg) {
    document.body.style.background = colors.bg;
  }

  // Persist for main UI to pick up on first load
  try {
    localStorage.setItem('currentTheme', JSON.stringify(theme));
    if (themeId) localStorage.setItem('activeThemeName', themeId);
  } catch (err) {
    console.warn('[Setup] Failed to persist theme:', err);
  }
}

/**
 * Create a theme card element
 */
function createThemeCard(theme) {
  const card = document.createElement('div');
  card.className = 'theme-card';
  card.dataset.themeId = theme.id;
  
  // Create color preview
  const preview = document.createElement('div');
  preview.className = 'theme-preview';
  
  const colors = theme.colors || {};
  
  // Get color values, trying multiple property naming conventions
  const getColor = (keys, fallback) => {
    for (const key of keys) {
      if (colors[key]) return colors[key];
    }
    return fallback;
  };
  
  const previewColors = [
    getColor(['bg', '--bg', 'background'], '#121418'),
    getColor(['primary', '--primary'], '#7B2EFF'),
    getColor(['accent', '--accent'], '#00C6FF'),
    getColor(['text', '--text'], '#E0E0E0')
  ];
  
  previewColors.forEach(color => {
    const colorDiv = document.createElement('div');
    colorDiv.className = 'theme-color';
    colorDiv.style.backgroundColor = color;
    preview.appendChild(colorDiv);
  });
  
  // Create theme info
  const name = document.createElement('div');
  name.className = 'theme-name';
  name.textContent = theme.name || theme.id;
  
  const description = document.createElement('div');
  description.className = 'theme-description';
  description.textContent = theme.description || 'A beautiful color scheme';
  
  // Assemble card
  card.appendChild(preview);
  card.appendChild(name);
  card.appendChild(description);
  
  // Add click handler
  card.addEventListener('click', () => selectTheme(theme.id, card));
  
  return card;
}

/**
 * Select a theme
 */
function selectTheme(themeId, cardElement) {
  // Update state
  setupState.selectedTheme = themeId;
  
  // Update UI
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.remove('selected');
  });
  cardElement.classList.add('selected');

  const theme = getThemeById(themeId);
  if (theme) {
    applyThemeToSetupPage(theme, themeId);
  }
  
  console.log('[Setup] Selected theme:', themeId);
}

/**
 * Check if Nebula is the default browser
 */
async function checkDefaultBrowserStatus() {
  const statusEl = document.getElementById('default-status');
  if (!statusEl) return;
  
  statusEl.classList.add('checking');
  
  try {
    const isDefault = await window.api.isDefaultBrowser();
    
    statusEl.classList.remove('checking');
    
    if (isDefault) {
      statusEl.classList.add('is-default');
      statusEl.innerHTML = `
        <div class="status-icon">✓</div>
        <p class="status-text">Nebula is already your default browser</p>
      `;
      setupState.defaultBrowserSet = true;
      
      // Update button
      const setDefaultBtn = document.getElementById('btn-set-default');
      if (setDefaultBtn) {
        setDefaultBtn.textContent = '✓ Already Default';
        setDefaultBtn.disabled = true;
      }
    } else {
      statusEl.classList.add('not-default');
      statusEl.innerHTML = `
        <div class="status-icon">ℹ️</div>
        <p class="status-text">Nebula is not your default browser</p>
      `;
    }
  } catch (error) {
    console.error('[Setup] Error checking default browser status:', error);
    statusEl.classList.remove('checking');
    statusEl.innerHTML = `
      <div class="status-icon">⚠️</div>
      <p class="status-text">Unable to check default browser status</p>
    `;
  }
}

/**
 * Set Nebula as default browser
 */
async function setDefaultBrowser() {
  const btn = document.getElementById('btn-set-default');
  const statusEl = document.getElementById('default-status');
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Setting...';
  }
  
  try {
    const result = await window.api.setAsDefaultBrowser();
    
    if (result.success) {
      setupState.defaultBrowserSet = true;
      
      if (statusEl) {
        statusEl.classList.remove('not-default');
        statusEl.classList.add('is-default');
        statusEl.innerHTML = `
          <div class="status-icon">✓</div>
          <p class="status-text">Nebula is now your default browser!</p>
        `;
      }
      
      if (btn) {
        btn.innerHTML = '<span class="btn-icon">✓</span> Set Successfully';
      }
      
      // Auto-advance after a brief delay
      setTimeout(() => goToStep(4), 1500);
    } else {
      throw new Error(result.error || 'Failed to set default browser');
    }
  } catch (error) {
    console.error('[Setup] Error setting default browser:', error);
    
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="status-icon">⚠️</div>
        <p class="status-text">Failed to set default browser. You can try again from settings.</p>
      `;
    }
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">↻</span> Try Again';
    }
  }
}

/**
 * Navigate to a specific step
 */
function goToStep(stepNumber) {
  // Hide current step
  document.querySelectorAll('.setup-step').forEach(step => {
    step.classList.remove('active');
  });
  
  // Show target step
  const targetStep = document.querySelector(`.setup-step[data-step="${stepNumber}"]`);
  if (targetStep) {
    targetStep.classList.add('active');
  }
  
  // Update progress bar
  document.querySelectorAll('.progress-step').forEach((step, index) => {
    const stepNum = index + 1;
    if (stepNum < stepNumber) {
      step.classList.add('completed');
      step.classList.remove('active');
    } else if (stepNum === stepNumber) {
      step.classList.add('active');
      step.classList.remove('completed');
    } else {
      step.classList.remove('active', 'completed');
    }
  });
  
  setupState.currentStep = stepNumber;
  
  // Special handling for completion step
  if (stepNumber === 4) {
    renderCompletionSummary();
  }
  
  console.log('[Setup] Navigated to step:', stepNumber);
}

/**
 * Render completion summary
 */
function renderCompletionSummary() {
  const summaryEl = document.getElementById('completion-summary');
  if (!summaryEl) return;
  
  const selectedThemeName = setupState.themes.default?.[setupState.selectedTheme]?.name || 
                           setupState.selectedTheme.charAt(0).toUpperCase() + setupState.selectedTheme.slice(1);
  
  summaryEl.innerHTML = `
    <div class="summary-item">
      <div class="summary-icon">🎨</div>
      <div class="summary-content">
        <div class="summary-label">Selected Theme</div>
        <div class="summary-value">${selectedThemeName}</div>
      </div>
    </div>
    <div class="summary-item">
      <div class="summary-icon">🌐</div>
      <div class="summary-content">
        <div class="summary-label">Default Browser</div>
        <div class="summary-value">${setupState.defaultBrowserSet ? 'Set as Default' : 'Not Set'}</div>
      </div>
    </div>
    <div class="summary-item">
      <div class="summary-icon">☁️</div>
      <div class="summary-content">
        <div class="summary-label">Steam Cloud Sync</div>
        <div class="summary-value">Coming in Phase 2</div>
      </div>
    </div>
  `;
}

/**
 * Complete setup and save preferences
 */
async function completeSetup() {
  console.log('[Setup] Completing first-time setup...', setupState);
  
  try {
    // Apply selected theme
    await window.api.applyTheme(setupState.selectedTheme);
    
    // Save first-run completion
    await window.api.completeFirstRun({
      selectedTheme: setupState.selectedTheme,
      defaultBrowserSet: setupState.defaultBrowserSet,
      skipped: setupState.skipped
    });
    
    console.log('[Setup] First-time setup completed successfully');
    
    // Navigate to main browser interface (index.html has tabs and URL bar)
    window.location.href = 'index.html';
  } catch (error) {
    console.error('[Setup] Error completing setup:', error);
    alert('There was an error saving your preferences. Please try again.');
  }
}

/**
 * Skip setup and use defaults
 */
async function skipSetup() {
  setupState.skipped = true;
  
  try {
    // Save that first-run was completed (even if skipped)
    await window.api.completeFirstRun({
      selectedTheme: 'default',
      defaultBrowserSet: false,
      skipped: true
    });
    
    console.log('[Setup] Setup skipped, using defaults');
    
    // Navigate to main browser interface (index.html has tabs and URL bar)
    window.location.href = 'index.html';
  } catch (error) {
    console.error('[Setup] Error skipping setup:', error);
    window.location.href = 'index.html';
  }
}

/**
 * Initialize button event handlers
 */
function initializeButtons() {
  // Step 1: Welcome
  const btnStart = document.getElementById('btn-start');
  const btnSkipAll = document.getElementById('btn-skip-all');
  
  if (btnStart) {
    btnStart.addEventListener('click', () => goToStep(2));
  }
  
  if (btnSkipAll) {
    btnSkipAll.addEventListener('click', skipSetup);
  }
  
  // Step 2: Theme Selection
  const btnBack2 = document.getElementById('btn-back-2');
  const btnNext2 = document.getElementById('btn-next-2');
  
  if (btnBack2) {
    btnBack2.addEventListener('click', () => goToStep(1));
  }
  
  if (btnNext2) {
    btnNext2.addEventListener('click', () => goToStep(3));
  }
  
  // Step 3: Default Browser
  const btnBack3 = document.getElementById('btn-back-3');
  const btnSkip3 = document.getElementById('btn-skip-3');
  const btnSetDefault = document.getElementById('btn-set-default');
  
  if (btnBack3) {
    btnBack3.addEventListener('click', () => goToStep(2));
  }
  
  if (btnSkip3) {
    btnSkip3.addEventListener('click', () => goToStep(4));
  }
  
  if (btnSetDefault) {
    btnSetDefault.addEventListener('click', setDefaultBrowser);
  }
  
  // Step 4: Complete
  const btnFinish = document.getElementById('btn-finish');
  
  if (btnFinish) {
    btnFinish.addEventListener('click', completeSetup);
  }
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const currentStep = setupState.currentStep;
    
    switch (currentStep) {
      case 1:
        goToStep(2);
        break;
      case 2:
        goToStep(3);
        break;
      case 3:
        if (!setupState.defaultBrowserSet) {
          setDefaultBrowser();
        } else {
          goToStep(4);
        }
        break;
      case 4:
        completeSetup();
        break;
    }
  } else if (e.key === 'Escape' && setupState.currentStep > 1) {
    goToStep(setupState.currentStep - 1);
  }
});
