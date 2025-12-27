/**
 * Browser Customization System
 * Allows users to customize themes, colors, and layouts non-destructively
 */

class BrowserCustomizer {
  constructor() {
    this.defaultTheme = {
      name: 'Default',
      colors: {
        bg: '#121418',
        darkBlue: '#0B1C2B',
        darkPurple: '#1B1035',
        primary: '#7B2EFF',
        accent: '#00C6FF',
        text: '#E0E0E0',
        urlBarBg: '#1C2030',
        urlBarText: '#E0E0E0',
        urlBarBorder: '#3E4652',
        tabBg: '#161925',
        tabText: '#A4A7B3',
        tabActive: '#1C2030',
        tabActiveText: '#E0E0E0',
        tabBorder: '#2B3040'
      },
      layout: 'centered',
      showLogo: true,
      customTitle: 'Nebula Browser',
      gradient: 'linear-gradient(145deg, #121418 0%, #1B1035 100%)'
    };

    this.predefinedThemes = {
      default: this.defaultTheme,
      ocean: {
        name: 'Ocean',
        colors: {
          bg: '#1a365d',
          darkBlue: '#2a4365',
          darkPurple: '#2c5282',
          primary: '#3182ce',
          accent: '#00d9ff',
          text: '#e2e8f0',
          urlBarBg: '#2d5282',
          urlBarText: '#e2e8f0',
          urlBarBorder: '#1e3a5f',
          tabBg: '#2a4365',
          tabText: '#cbd5e0',
          tabActive: '#2d5282',
          tabActiveText: '#e2e8f0',
          tabBorder: '#1a365d'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #1a365d 0%, #2c5282 100%)'
      },
      forest: {
        name: 'Forest',
        colors: {
          bg: '#1a202c',
          darkBlue: '#2d3748',
          darkPurple: '#4a5568',
          primary: '#68d391',
          accent: '#9ae6b4',
          text: '#f7fafc',
          urlBarBg: '#2d3748',
          urlBarText: '#f7fafc',
          urlBarBorder: '#4a5568',
          tabBg: '#2d3748',
          tabText: '#cbd5e0',
          tabActive: '#4a5568',
          tabActiveText: '#f7fafc',
          tabBorder: '#1a202c'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #1a202c 0%, #2d3748 100%)'
      },
      sunset: {
        name: 'Sunset',
        colors: {
          bg: '#744210',
          darkBlue: '#975a16',
          darkPurple: '#c05621',
          primary: '#ed8936',
          accent: '#fbb040',
          text: '#fffaf0',
          urlBarBg: '#975a16',
          urlBarText: '#fffaf0',
          urlBarBorder: '#c05621',
          tabBg: '#975a16',
          tabText: '#fde4b6',
          tabActive: '#c05621',
          tabActiveText: '#fffaf0',
          tabBorder: '#744210'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #744210 0%, #c05621 100%)'
      },
      cyberpunk: {
        name: 'Cyberpunk Neon',
        colors: {
          bg: '#0a0a0a',
          darkBlue: '#1a0520',
          darkPurple: '#2a0a3a',
          primary: '#ff0080',
          accent: '#00ffff',
          text: '#ffffff',
          urlBarBg: '#1a0520',
          urlBarText: '#ffffff',
          urlBarBorder: '#ff0080',
          tabBg: '#1a0520',
          tabText: '#00ffff',
          tabActive: '#2a0a3a',
          tabActiveText: '#ff0080',
          tabBorder: '#ff0080'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #0a0a0a 0%, #2a0a3a 50%, #1a0520 100%)'
      },
      'midnight-rose': {
        name: 'Midnight Rose',
        colors: {
          bg: '#1c1820',
          darkBlue: '#2d2433',
          darkPurple: '#3d3046',
          primary: '#d4af37',
          accent: '#ffd700',
          text: '#f5f5dc',
          urlBarBg: '#3d3046',
          urlBarText: '#f5f5dc',
          urlBarBorder: '#d4af37',
          tabBg: '#2d2433',
          tabText: '#d4af37',
          tabActive: '#3d3046',
          tabActiveText: '#ffd700',
          tabBorder: '#1c1820'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #1c1820 0%, #3d3046 100%)'
      },
      'arctic-ice': {
        name: 'Arctic Ice',
        colors: {
          bg: '#f0f8ff',
          darkBlue: '#e6f3ff',
          darkPurple: '#d1e7ff',
          primary: '#4169e1',
          accent: '#87ceeb',
          text: '#2f4f4f',
          urlBarBg: '#e6f3ff',
          urlBarText: '#2f4f4f',
          urlBarBorder: '#4169e1',
          tabBg: '#e6f3ff',
          tabText: '#4169e1',
          tabActive: '#d1e7ff',
          tabActiveText: '#2f4f4f',
          tabBorder: '#f0f8ff'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #f0f8ff 0%, #d1e7ff 100%)'
      },
      'cherry-blossom': {
        name: 'Cherry Blossom',
        colors: {
          bg: '#fff5f8',
          darkBlue: '#ffe4e8',
          darkPurple: '#ffd4db',
          primary: '#ff69b4',
          accent: '#ffb6c1',
          text: '#8b4513',
          urlBarBg: '#ffe4e8',
          urlBarText: '#8b4513',
          urlBarBorder: '#ff69b4',
          tabBg: '#ffe4e8',
          tabText: '#ff69b4',
          tabActive: '#ffd4db',
          tabActiveText: '#8b4513',
          tabBorder: '#fff5f8'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #fff5f8 0%, #ffd4db 100%)'
      },
      'cosmic-purple': {
        name: 'Cosmic Purple',
        colors: {
          bg: '#0f0524',
          darkBlue: '#1a0b3d',
          darkPurple: '#2d1b69',
          primary: '#8a2be2',
          accent: '#da70d6',
          text: '#e6e6fa',
          urlBarBg: '#1a0b3d',
          urlBarText: '#e6e6fa',
          urlBarBorder: '#8a2be2',
          tabBg: '#1a0b3d',
          tabText: '#da70d6',
          tabActive: '#2d1b69',
          tabActiveText: '#e6e6fa',
          tabBorder: '#0f0524'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #0f0524 0%, #2d1b69 50%, #4b0082 100%)'
      },
      'emerald-dream': {
        name: 'Emerald Dream',
        colors: {
          bg: '#0d2818',
          darkBlue: '#1a3a2e',
          darkPurple: '#2d5a44',
          primary: '#50c878',
          accent: '#98fb98',
          text: '#f0fff0',
          urlBarBg: '#1a3a2e',
          urlBarText: '#f0fff0',
          urlBarBorder: '#50c878',
          tabBg: '#1a3a2e',
          tabText: '#98fb98',
          tabActive: '#2d5a44',
          tabActiveText: '#f0fff0',
          tabBorder: '#0d2818'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #0d2818 0%, #2d5a44 100%)'
      },
      'mocha-coffee': {
        name: 'Mocha Coffee',
        colors: {
          bg: '#3c2414',
          darkBlue: '#4a2c1a',
          darkPurple: '#5d3a26',
          primary: '#d2691e',
          accent: '#daa520',
          text: '#faf0e6',
          urlBarBg: '#4a2c1a',
          urlBarText: '#faf0e6',
          urlBarBorder: '#d2691e',
          tabBg: '#4a2c1a',
          tabText: '#daa520',
          tabActive: '#5d3a26',
          tabActiveText: '#faf0e6',
          tabBorder: '#3c2414'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #3c2414 0%, #5d3a26 100%)'
      },
      'lavender-fields': {
        name: 'Lavender Fields',
        colors: {
          bg: '#f8f4ff',
          darkBlue: '#ede4ff',
          darkPurple: '#e6d8ff',
          primary: '#9370db',
          accent: '#dda0dd',
          text: '#4b0082',
          urlBarBg: '#ede4ff',
          urlBarText: '#4b0082',
          urlBarBorder: '#9370db',
          tabBg: '#ede4ff',
          tabText: '#9370db',
          tabActive: '#e6d8ff',
          tabActiveText: '#4b0082',
          tabBorder: '#f8f4ff'
        },
        layout: 'centered',
        showLogo: true,
        customTitle: 'Nebula Browser',
        gradient: 'linear-gradient(145deg, #f8f4ff 0%, #e6d8ff 100%)'
      }
    };

    this.currentTheme = this.loadTheme();
    this.activeThemeName = this.loadActiveThemeName();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadCurrentTheme();
    this.restoreActiveThemeButton();
    this.updatePreview();
    this.updateCustomThemeButton();
  }

  setupEventListeners() {
    // Theme preset buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const themeName = e.currentTarget.dataset.theme;
        this.applyPredefinedTheme(themeName);
      });
    });

    // Color inputs
    const colorInputs = ['bg-color', 'gradient-color', 'accent-color', 'secondary-color', 'text-color'];
    colorInputs.forEach(inputId => {
      const input = document.getElementById(inputId);
      if (input) {
        input.addEventListener('input', (e) => {
          this.updateColorFromInput(inputId, e.target.value);
        });
      }
    });

    // Layout options
    document.querySelectorAll('input[name="layout"]').forEach(input => {
      input.addEventListener('change', (e) => {
        this.currentTheme.layout = e.target.value;
        
        // Clear active theme name since this is now a custom theme
        this.activeThemeName = 'custom';
        this.saveActiveThemeName('custom');
        
        // Remove active class from all theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        
        this.saveTheme();
        this.updatePreview();
        this.applyThemeToPages();
        this.updateCustomThemeButton();
      });
    });

    // Logo options
    const showLogoInput = document.getElementById('show-logo');
    if (showLogoInput) {
      showLogoInput.addEventListener('change', (e) => {
        this.currentTheme.showLogo = e.target.checked;
        
        // Clear active theme name since this is now a custom theme
        this.activeThemeName = 'custom';
        this.saveActiveThemeName('custom');
        
        // Remove active class from all theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        
        this.saveTheme();
        this.updatePreview();
        this.applyThemeToPages();
        this.updateCustomThemeButton();
      });
    }

    const customTitleInput = document.getElementById('custom-title');
    if (customTitleInput) {
      customTitleInput.addEventListener('input', (e) => {
        this.currentTheme.customTitle = e.target.value || 'Nebula Browser';
        
        // Clear active theme name since this is now a custom theme
        this.activeThemeName = 'custom';
        this.saveActiveThemeName('custom');
        
        // Remove active class from all theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        
        this.saveTheme();
        this.updatePreview();
        this.applyThemeToPages();
        this.updateCustomThemeButton();
      });
    }

    // Theme management buttons
    this.setupThemeManagementButtons();
  }

  setupThemeManagementButtons() {
    const saveBtn = document.getElementById('save-custom-theme');
    const exportBtn = document.getElementById('export-theme');
    const importBtn = document.getElementById('import-theme');
    const resetBtn = document.getElementById('reset-to-default');
    const fileInput = document.getElementById('theme-file-input');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveCustomTheme());
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportTheme());
    }

    if (importBtn) {
      importBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.importTheme(e));
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetToDefault());
    }
  }

  updateColorFromInput(inputId, color) {
    const colorMap = {
      'bg-color': 'bg',
      'gradient-color': 'darkPurple',
      'accent-color': 'primary',
      'secondary-color': 'accent',
      'text-color': 'text'
    };

    const colorKey = colorMap[inputId];
    if (colorKey) {
      this.currentTheme.colors[colorKey] = color;
      
      // Update gradient for background or gradient changes
      if (colorKey === 'bg' || colorKey === 'darkPurple') {
        this.currentTheme.gradient = `linear-gradient(145deg, ${this.currentTheme.colors.bg} 0%, ${this.currentTheme.colors.darkPurple} 100%)`;
      }

      // Clear active theme name since this is now a custom theme
      this.activeThemeName = 'custom';
      this.saveActiveThemeName('custom');
      
      // Remove active class from all theme buttons
      document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
      });

      this.saveTheme();
      this.updatePreview();
      this.applyThemeToPages();
      this.updateCustomThemeButton();
    }
  }

  applyPredefinedTheme(themeName) {
    if (themeName === 'custom') {
      // For custom theme, just activate the button but don't change the current theme
      this.activeThemeName = 'custom';
      this.saveActiveThemeName('custom');
      this.updateThemeButtons('custom');
      this.updateCustomThemeButton();
    } else if (this.predefinedThemes[themeName]) {
      this.currentTheme = { ...this.predefinedThemes[themeName] };
      this.activeThemeName = themeName;
      this.saveTheme();
      this.saveActiveThemeName(themeName);
      this.loadCurrentTheme();
      this.updatePreview();
      this.applyThemeToCurrentPage();
      this.applyThemeToPages();
      this.updateThemeButtons(themeName);
      this.updateCustomThemeButton();
    }
  }

  updateThemeButtons(activeTheme) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.theme === activeTheme) {
        btn.classList.add('active');
      }
    });
  }

  updateCustomThemeButton() {
    const customBtn = document.getElementById('theme-custom');
    if (!customBtn) return;

    // Check if current theme matches any predefined theme
    const matchingTheme = this.detectMatchingPredefinedTheme();
    const isCustomTheme = !matchingTheme;
    
    if (isCustomTheme) {
      customBtn.style.display = 'flex';
      // Update the preview to show current colors
      const preview = customBtn.querySelector('.theme-preview');
      if (preview && this.currentTheme) {
        preview.style.background = this.currentTheme.gradient || 
          `linear-gradient(145deg, ${this.currentTheme.colors.bg}, ${this.currentTheme.colors.darkPurple})`;
      }
      // Set active theme name to custom if it's not already set to a predefined theme
      if (this.activeThemeName !== 'custom') {
        this.activeThemeName = 'custom';
        this.saveActiveThemeName('custom');
      }
    } else {
      customBtn.style.display = 'none';
      // If we found a matching predefined theme, update activeThemeName if it was set to custom
      if (this.activeThemeName === 'custom') {
        this.activeThemeName = matchingTheme;
        this.saveActiveThemeName(matchingTheme);
      }
    }
  }

  loadCurrentTheme() {
    // Update color inputs
    document.getElementById('bg-color').value = this.currentTheme.colors.bg;
    document.getElementById('gradient-color').value = this.currentTheme.colors.darkPurple;
    document.getElementById('accent-color').value = this.currentTheme.colors.primary;
    document.getElementById('secondary-color').value = this.currentTheme.colors.accent;
    document.getElementById('text-color').value = this.currentTheme.colors.text;

    // Update layout radio
    const layoutInput = document.querySelector(`input[name="layout"][value="${this.currentTheme.layout}"]`);
    if (layoutInput) layoutInput.checked = true;

    // Update logo options
    document.getElementById('show-logo').checked = this.currentTheme.showLogo;
    document.getElementById('custom-title').value = this.currentTheme.customTitle;
  }

  updatePreview() {
    const preview = document.getElementById('preview-container');
    const previewHome = preview.querySelector('.preview-home');
    const previewLogo = preview.querySelector('.preview-logo');
    const previewText = preview.querySelector('.preview-text');

    // Apply colors to preview
    previewHome.style.background = this.currentTheme.gradient;
    
    // Handle logo visibility
    if (this.currentTheme.showLogo) {
      previewLogo.style.display = 'block';
      previewLogo.style.color = this.currentTheme.colors.primary;
      previewLogo.textContent = '🌌';
    } else {
      previewLogo.style.display = 'none';
    }
    
    // Always show preview text with custom title
    if (previewText) {
      previewText.style.color = this.currentTheme.colors.primary;
      previewText.textContent = this.currentTheme.customTitle;
    }

    // Update CSS custom properties for live preview
    this.applyThemeToCurrentPage();
  }

  applyThemeToCurrentPage() {
    const root = document.documentElement;
    root.style.setProperty('--bg', this.currentTheme.colors.bg);
    root.style.setProperty('--dark-blue', this.currentTheme.colors.darkBlue);
    root.style.setProperty('--dark-purple', this.currentTheme.colors.darkPurple);
    root.style.setProperty('--primary', this.currentTheme.colors.primary);
    root.style.setProperty('--accent', this.currentTheme.colors.accent);
    root.style.setProperty('--text', this.currentTheme.colors.text);
    root.style.setProperty('--url-bar-bg', this.currentTheme.colors.urlBarBg);
    root.style.setProperty('--url-bar-text', this.currentTheme.colors.urlBarText);
    root.style.setProperty('--url-bar-border', this.currentTheme.colors.urlBarBorder);
    root.style.setProperty('--tab-bg', this.currentTheme.colors.tabBg);
    root.style.setProperty('--tab-text', this.currentTheme.colors.tabText);
    root.style.setProperty('--tab-active', this.currentTheme.colors.tabActive);
    root.style.setProperty('--tab-active-text', this.currentTheme.colors.tabActiveText);
    root.style.setProperty('--tab-border', this.currentTheme.colors.tabBorder);

    // Apply gradient to body if it exists
    const body = document.body;
    if (body && this.currentTheme.gradient) {
      body.style.background = this.currentTheme.gradient;
      console.log('[THEME] Applied gradient:', this.currentTheme.gradient);
    }
  }

  applyThemeToPages() {
    // This will be called to apply theme to home.html and other pages
    this.saveTheme();

    // Send theme update to host (for settings webview)
    if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
      window.electronAPI.sendToHost('theme-update', this.currentTheme);
    }
    // Fallback: send via postMessage (for iframe embedding)
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'theme-update',
          theme: this.currentTheme
        }, '*');
      }
    } catch (e) {
      console.log('Could not send theme update to parent window');
    }
  }

  saveCustomTheme() {
    const themeName = prompt('Enter a name for your custom theme:', 'My Custom Theme');
    if (themeName) {
      const customThemes = this.getCustomThemes();
      customThemes[themeName.toLowerCase().replace(/\s+/g, '-')] = {
        ...this.currentTheme,
        name: themeName
      };
      localStorage.setItem('customThemes', JSON.stringify(customThemes));
      
      // Show success message
      this.showMessage('Custom theme saved successfully!', 'success');
    }
  }

  exportTheme() {
    const themeData = {
      ...this.currentTheme,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(themeData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nebula-theme-${themeData.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showMessage('Theme exported successfully!', 'success');
  }

  importTheme(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const themeData = JSON.parse(e.target.result);
        
        // Validate theme structure
        if (this.validateTheme(themeData)) {
          this.currentTheme = themeData;
          this.saveTheme();
          this.loadCurrentTheme();
          this.updatePreview();
          this.applyThemeToCurrentPage();
          this.applyThemeToPages();
          this.showMessage('Theme imported successfully!', 'success');
        } else {
          this.showMessage('Invalid theme file format.', 'error');
        }
      } catch (error) {
        this.showMessage('Error reading theme file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  validateTheme(theme) {
    return theme && 
           theme.colors && 
           theme.colors.bg && 
           theme.colors.primary && 
           theme.colors.accent && 
           theme.colors.text;
  }

  resetToDefault() {
    if (confirm('Are you sure you want to reset to the default theme? This will lose your current customizations.')) {
      this.currentTheme = { ...this.defaultTheme };
      this.activeThemeName = 'default';
      this.saveTheme();
      this.saveActiveThemeName('default');
      this.loadCurrentTheme();
      this.updatePreview();
      this.applyThemeToCurrentPage();
      this.applyThemeToPages();
      this.updateThemeButtons('default');
      this.showMessage('Theme reset to default.', 'success');
    }
  }

  saveTheme() {
    localStorage.setItem('currentTheme', JSON.stringify(this.currentTheme));
  }

  loadTheme() {
    const savedTheme = localStorage.getItem('currentTheme');
    return savedTheme ? JSON.parse(savedTheme) : { ...this.defaultTheme };
  }

  saveActiveThemeName(themeName) {
    localStorage.setItem('activeThemeName', themeName);
  }

  loadActiveThemeName() {
    return localStorage.getItem('activeThemeName') || 'default';
  }

  restoreActiveThemeButton() {
    // First, remove active class from all buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // If no active theme name is saved, try to detect which predefined theme matches current theme
    if (!this.activeThemeName) {
      this.activeThemeName = this.detectMatchingPredefinedTheme();
      if (this.activeThemeName) {
        this.saveActiveThemeName(this.activeThemeName);
      } else {
        // If no predefined theme matches, this is a custom theme
        this.activeThemeName = 'custom';
        this.saveActiveThemeName('custom');
      }
    }

    // Update the custom theme button visibility
    this.updateCustomThemeButton();

    // Then, add active class to the currently active theme button
    const activeBtn = document.querySelector(`[data-theme="${this.activeThemeName}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  detectMatchingPredefinedTheme() {
    // Check if current theme matches any predefined theme
    for (const [themeName, themeData] of Object.entries(this.predefinedThemes)) {
      if (this.themesMatch(this.currentTheme, themeData)) {
        return themeName;
      }
    }
    return null;
  }

  themesMatch(theme1, theme2) {
    // Compare essential properties to determine if themes match
    return theme1.colors.bg === theme2.colors.bg &&
           theme1.colors.darkPurple === theme2.colors.darkPurple &&
           theme1.colors.primary === theme2.colors.primary &&
           theme1.colors.accent === theme2.colors.accent &&
           theme1.colors.text === theme2.colors.text &&
           theme1.layout === theme2.layout &&
           theme1.showLogo === theme2.showLogo &&
           theme1.customTitle === theme2.customTitle;
  }

  getCustomThemes() {
    const customThemes = localStorage.getItem('customThemes');
    return customThemes ? JSON.parse(customThemes) : {};
  }

  showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#e53e3e' : '#4299e1'};
    `;

    document.body.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.parentNode.removeChild(messageDiv);
        }
      }, 300);
    }, 3000);
  }

  // Static method to apply theme to any page
  static applyThemeToPage() {
    const savedTheme = localStorage.getItem('currentTheme');
    if (savedTheme) {
      const theme = JSON.parse(savedTheme);
      const root = document.documentElement;
      
      root.style.setProperty('--bg', theme.colors.bg);
      root.style.setProperty('--dark-blue', theme.colors.darkBlue);
      root.style.setProperty('--dark-purple', theme.colors.darkPurple);
      root.style.setProperty('--primary', theme.colors.primary);
      root.style.setProperty('--accent', theme.colors.accent);
      root.style.setProperty('--text', theme.colors.text);
      root.style.setProperty('--url-bar-bg', theme.colors.urlBarBg);
      root.style.setProperty('--url-bar-text', theme.colors.urlBarText);
      root.style.setProperty('--url-bar-border', theme.colors.urlBarBorder);
      root.style.setProperty('--tab-bg', theme.colors.tabBg);
      root.style.setProperty('--tab-text', theme.colors.tabText);
      root.style.setProperty('--tab-active', theme.colors.tabActive);
      root.style.setProperty('--tab-active-text', theme.colors.tabActiveText);
      root.style.setProperty('--tab-border', theme.colors.tabBorder);

      // Apply gradient to body if it exists
      const body = document.body;
      if (body && theme.gradient) {
        body.style.background = theme.gradient;
        console.log('[THEME] Applied gradient from storage:', theme.gradient);
      }

      return theme;
    }
    return null;
  }
}

// Auto-initialize on settings page
if (window.location.pathname.includes('settings.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    window.browserCustomizer = new BrowserCustomizer();
  });
}

// Add keyframe animations for messages
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);
