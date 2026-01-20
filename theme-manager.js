/**
 * Theme Manager for Nebula Browser
 * Handles theme loading, saving, and management at the application level
 */

const fs = require('fs');
const path = require('path');

class ThemeManager {
  constructor() {
    this.themesDir = path.join(__dirname, 'themes');
    this.userThemesDir = path.join(this.themesDir, 'user');
    this.downloadedThemesDir = path.join(this.themesDir, 'downloaded');
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.userThemesDir, this.downloadedThemesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Get all available themes
   * @returns {Object} Object containing default, user, and downloaded themes
   */
  getAllThemes() {
    const themes = {
      default: this.loadDefaultThemes(),
      user: this.loadUserThemes(),
      downloaded: this.loadDownloadedThemes()
    };
    
    return themes;
  }

  loadDefaultThemes() {
    const defaultThemes = {};
    const defaultFiles = [
      'default.json', 
      'ocean.json', 
      'forest.json', 
      'sunset.json',
      'cyberpunk.json',
      'midnight-rose.json',
      'arctic-ice.json',
      'cherry-blossom.json',
      'cosmic-purple.json',
      'emerald-dream.json',
      'mocha-coffee.json',
      'lavender-fields.json'
    ];
    
    defaultFiles.forEach(file => {
      try {
        const themePath = path.join(this.themesDir, file);
        if (fs.existsSync(themePath)) {
          const themeData = JSON.parse(fs.readFileSync(themePath, 'utf8'));
          const themeName = path.basename(file, '.json');
          defaultThemes[themeName] = themeData;
        }
      } catch (error) {
        console.error(`Error loading default theme ${file}:`, error);
      }
    });
    
    return defaultThemes;
  }

  loadUserThemes() {
    return this.loadThemesFromDirectory(this.userThemesDir);
  }

  loadDownloadedThemes() {
    return this.loadThemesFromDirectory(this.downloadedThemesDir);
  }

  loadThemesFromDirectory(directory) {
    const themes = {};
    
    try {
      if (!fs.existsSync(directory)) {
        return themes;
      }

      const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
      
      files.forEach(file => {
        try {
          const themePath = path.join(directory, file);
          const themeData = JSON.parse(fs.readFileSync(themePath, 'utf8'));
          const themeName = path.basename(file, '.json');
          themes[themeName] = themeData;
        } catch (error) {
          console.error(`Error loading theme ${file}:`, error);
        }
      });
    } catch (error) {
      console.error(`Error reading themes directory ${directory}:`, error);
    }
    
    return themes;
  }

  /**
   * Save a user theme
   * @param {string} name - Theme name
   * @param {Object} themeData - Theme data
   * @returns {boolean} Success status
   */
  saveUserTheme(name, themeData) {
    try {
      const filename = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '.json';
      const filepath = path.join(this.userThemesDir, filename);
      
      const themeWithMetadata = {
        ...themeData,
        name: name,
        createdAt: new Date().toISOString(),
        type: 'user'
      };
      
      fs.writeFileSync(filepath, JSON.stringify(themeWithMetadata, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving user theme:', error);
      return false;
    }
  }

  /**
   * Delete a user theme
   * @param {string} filename - Theme filename
   * @returns {boolean} Success status
   */
  deleteUserTheme(filename) {
    try {
      const filepath = path.join(this.userThemesDir, filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting user theme:', error);
      return false;
    }
  }

  /**
   * Import a theme file to downloaded themes
   * @param {string} sourceFile - Source file path
   * @returns {boolean} Success status
   */
  importTheme(sourceFile) {
    try {
      const themeData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
      
      // Validate theme structure
      if (!this.validateTheme(themeData)) {
        throw new Error('Invalid theme structure');
      }
      
      const filename = (themeData.name || 'imported-theme')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-') + '.json';
      
      const destinationPath = path.join(this.downloadedThemesDir, filename);
      
      const themeWithMetadata = {
        ...themeData,
        importedAt: new Date().toISOString(),
        type: 'downloaded'
      };
      
      fs.writeFileSync(destinationPath, JSON.stringify(themeWithMetadata, null, 2));
      return true;
    } catch (error) {
      console.error('Error importing theme:', error);
      return false;
    }
  }

  /**
   * Validate theme structure
   * @param {Object} theme - Theme object to validate
   * @returns {boolean} Is valid
   */
  validateTheme(theme) {
    return theme &&
           theme.colors &&
           theme.colors.bg &&
           theme.colors.primary &&
           theme.colors.accent &&
           theme.colors.text &&
           typeof theme.showLogo === 'boolean' &&
           theme.layout &&
           theme.customTitle;
  }

  /**
   * Get theme by name and type
   * @param {string} name - Theme name
   * @param {string} type - Theme type (default, user, downloaded)
   * @returns {Object|null} Theme data or null
   */
  getTheme(name, type = 'default') {
    const themes = this.getAllThemes();
    return themes[type] && themes[type][name] ? themes[type][name] : null;
  }

  /**
   * Apply theme to application (for use in main process)
   * @param {Object} theme - Theme to apply
   */
  applyThemeToApp(theme) {
    // This would be used to apply themes at the application level
    // For example, updating window chrome colors, etc.
    console.log('Applying theme to application:', theme.name);
  }
}

module.exports = ThemeManager;
