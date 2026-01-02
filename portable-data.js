/**
 * Portable Data Manager for Nebula Browser
 * 
 * Handles portable user data storage for all platforms (Windows, macOS, Linux).
 * Data is stored in a 'user-data' folder within the application directory,
 * keeping all user data local to the compiled project.
 * 
 * Security considerations:
 * - Data is stored with restricted permissions (0700 for directories, 0600 for files on Unix)
 * - Path validation prevents directory traversal attacks
 * - Portable mode is enabled by default on all platforms
 * - Can be disabled via NEBULA_PORTABLE=0 environment variable
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

class PortableDataManager {
  constructor() {
    this._isPortable = null;
    this._portableDataPath = null;
    this._initialized = false;
  }

  /**
   * Get the application's root directory
   * Works for both development and packaged builds
   */
  _getAppRootDir() {
    // In packaged app, process.resourcesPath points to resources folder
    // We want the parent directory (the app folder itself)
    if (app.isPackaged) {
      // For packaged apps:
      // - Windows: path\to\app\resources -> path\to\app
      // - macOS: path/to/App.app/Contents/Resources -> path/to/App.app/Contents
      // - Linux: path/to/app/resources -> path/to/app
      const resourcesPath = process.resourcesPath;
      
      if (process.platform === 'darwin') {
        // On macOS, go up two levels from Resources to get to App.app parent folder
        // But we want to store data inside the .app bundle's Contents folder for portability
        return path.dirname(resourcesPath); // Contents folder
      } else {
        // Windows and Linux: go up one level from resources
        return path.dirname(resourcesPath);
      }
    } else {
      // Development mode: use __dirname (the directory containing main.js)
      return __dirname;
    }
  }

  /**
   * Check if we're running in portable mode
   * Portable mode is enabled by default on all platforms.
   * 
   * Can be disabled by setting NEBULA_PORTABLE=0 or NEBULA_PORTABLE=false
   * Can specify custom path via NEBULA_PORTABLE_PATH environment variable
   */
  isPortableMode() {
    if (this._isPortable !== null) {
      return this._isPortable;
    }

    // Check if NEBULA_PORTABLE is explicitly set to disable
    const portableEnv = process.env.NEBULA_PORTABLE;
    if (portableEnv !== undefined) {
      const isDisabled = portableEnv === '0' || 
        portableEnv.toLowerCase() === 'false' || 
        portableEnv.toLowerCase() === 'no';
      
      if (isDisabled) {
        this._isPortable = false;
        console.log('[Portable] Portable mode disabled via NEBULA_PORTABLE environment variable');
        return false;
      }
    }

    // Portable mode is enabled by default on all platforms
    this._isPortable = true;
    return this._isPortable;
  }

  /**
   * Get the portable data directory path
   * Uses NEBULA_PORTABLE_PATH if set, otherwise creates 'user-data' folder in app directory
   */
  getPortableDataPath() {
    if (this._portableDataPath !== null) {
      return this._portableDataPath;
    }

    if (!this.isPortableMode()) {
      this._portableDataPath = '';
      return '';
    }

    // First, check if custom path is provided via environment variable
    const customPath = process.env.NEBULA_PORTABLE_PATH;
    if (customPath) {
      const resolvedPath = path.resolve(customPath);
      if (this._isPathSafe(resolvedPath)) {
        this._portableDataPath = resolvedPath;
        console.log(`[Portable] Using custom portable path: ${resolvedPath}`);
        return this._portableDataPath;
      } else {
        console.warn('[Portable] Custom path is unsafe, using default location');
      }
    }

    // Default: create 'user-data' folder in the application directory
    const appRoot = this._getAppRootDir();
    const dataPath = path.join(appRoot, 'user-data');
    
    // Validate the path
    if (this._isPathSafe(dataPath)) {
      this._portableDataPath = dataPath;
      console.log(`[Portable] Using portable data path: ${dataPath}`);
    } else {
      console.error('[Portable] Default path is unsafe, falling back to system default');
      this._portableDataPath = '';
    }

    return this._portableDataPath;
  }

  /**
   * Initialize portable data directory with secure permissions
   * Must be called before app.ready event
   */
  initialize() {
    if (this._initialized) {
      return true;
    }

    if (!this.isPortableMode()) {
      console.log('[Portable] Not in portable mode, using default paths');
      this._initialized = true;
      return true;
    }

    const dataPath = this.getPortableDataPath();
    if (!dataPath) {
      console.warn('[Portable] No valid portable path, using default paths');
      this._initialized = true;
      return false;
    }

    try {
      // Create the data directory with secure permissions (owner only: rwx)
      this._ensureSecureDirectory(dataPath);
      
      // Create subdirectories for organized storage
      // Note: Don't create 'Cache', 'Cookies', 'Network' - Electron manages these internally
      const subdirs = ['Local Storage', 'Session Storage', 'IndexedDB'];
      for (const subdir of subdirs) {
        this._ensureSecureDirectory(path.join(dataPath, subdir));
      }

      // Set Electron's user data path to our portable location
      // This must be done BEFORE app.ready event
      app.setPath('userData', dataPath);
      app.setPath('sessionData', dataPath);
      
      // Also redirect cache to be portable
      const cachePath = path.join(dataPath, 'Cache');
      app.setPath('cache', cachePath);

      console.log(`[Portable] User data path set to: ${dataPath}`);
      console.log(`[Portable] Cache path set to: ${cachePath}`);
      
      this._initialized = true;
      return true;
    } catch (err) {
      console.error('[Portable] Failed to initialize portable data:', err);
      this._initialized = true;
      return false;
    }
  }

  /**
   * Get the path for a data file (bookmarks, history, etc.)
   * Returns portable path if in portable mode, otherwise returns __dirname path
   */
  getDataFilePath(filename) {
    // Validate filename to prevent directory traversal
    if (!this._isFilenameSafe(filename)) {
      throw new Error(`Invalid filename: ${filename}`);
    }

    if (this.isPortableMode()) {
      const portablePath = this.getPortableDataPath();
      if (portablePath) {
        return path.join(portablePath, filename);
      }
    }
    
    // Fallback to __dirname (project directory) for non-portable or if portable not configured
    // Note: In production, you might want to use app.getPath('userData') as fallback
    return null; // Return null to indicate caller should use their default path
  }

  /**
   * Ensure a directory exists with secure permissions
   * On Unix systems (macOS, Linux), applies restricted permissions (0700)
   * On Windows, creates directory with default permissions (ACLs handle security)
   */
  _ensureSecureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      if (process.platform === 'win32') {
        // Windows: create directory with default permissions
        // Windows ACLs handle security through inheritance
        fs.mkdirSync(dirPath, { recursive: true });
      } else {
        // Unix (macOS, Linux): create with restricted permissions (owner only: rwx------)
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      }
      console.log(`[Portable] Created secure directory: ${dirPath}`);
    } else {
      // Verify and fix permissions on existing directory (Unix only)
      if (process.platform !== 'win32') {
        try {
          const stats = fs.statSync(dirPath);
          if (stats.isDirectory()) {
            // Set secure permissions
            fs.chmodSync(dirPath, 0o700);
          }
        } catch (err) {
          console.warn(`[Portable] Could not verify permissions for ${dirPath}:`, err.message);
        }
      }
    }
  }

  /**
   * Write a file with secure permissions
   * On Unix systems, applies restricted permissions (0600)
   * On Windows, writes with default permissions
   */
  writeSecureFile(filePath, data) {
    // Ensure parent directory exists with secure permissions
    const dir = path.dirname(filePath);
    this._ensureSecureDirectory(dir);

    // Write file
    if (process.platform === 'win32') {
      fs.writeFileSync(filePath, data);
    } else {
      fs.writeFileSync(filePath, data, { mode: 0o600 });
    }
  }

  /**
   * Async version of secure file write
   * On Unix systems, applies restricted permissions (0600)
   * On Windows, writes with default permissions
   */
  async writeSecureFileAsync(filePath, data) {
    // Ensure parent directory exists with secure permissions
    const dir = path.dirname(filePath);
    this._ensureSecureDirectory(dir);

    // Write file with restricted permissions (owner only: rw------- on Unix)
    if (process.platform === 'win32') {
      await fs.promises.writeFile(filePath, data);
    } else {
      await fs.promises.writeFile(filePath, data, { mode: 0o600 });
    }
  }

  /**
   * Validate path safety (prevent directory traversal)
   * Works across Windows, macOS, and Linux
   */
  _isPathSafe(testPath) {
    // Resolve to absolute path
    const resolved = path.resolve(testPath);
    
    // Check for directory traversal patterns
    if (resolved.includes('..')) {
      return false;
    }

    // Platform-specific system path checks
    if (process.platform === 'win32') {
      // Windows: block system directories
      const dangerousWin = [
        'C:\\Windows',
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        'C:\\ProgramData'
      ];
      const resolvedLower = resolved.toLowerCase();
      for (const pattern of dangerousWin) {
        if (resolvedLower.startsWith(pattern.toLowerCase())) {
          return false;
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS: block system directories
      const dangerousMac = ['/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/var'];
      for (const pattern of dangerousMac) {
        if (resolved.startsWith(pattern) && !resolved.includes('.app')) {
          return false;
        }
      }
    } else {
      // Linux: block system directories
      const dangerousLinux = ['~root', '/etc', '/var/run', '/proc', '/sys', '/dev'];
      for (const pattern of dangerousLinux) {
        if (resolved.includes(pattern)) {
          return false;
        }
      }
      
      const systemPaths = ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/boot', '/lib', '/lib64'];
      for (const sysPath of systemPaths) {
        if (resolved.startsWith(sysPath)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate filename safety
   */
  _isFilenameSafe(filename) {
    // Check for directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }
    
    // Check for hidden files that might be system files
    if (filename.startsWith('.') && !filename.endsWith('.json')) {
      return false;
    }

    return true;
  }

  /**
   * Get status information for debugging
   */
  getStatus() {
    return {
      isPortable: this.isPortableMode(),
      portablePath: this.getPortableDataPath(),
      appRootDir: this._getAppRootDir(),
      initialized: this._initialized,
      platform: process.platform,
      isPackaged: app.isPackaged,
      envPortable: process.env.NEBULA_PORTABLE,
      envPath: process.env.NEBULA_PORTABLE_PATH
    };
  }
}

// Export singleton instance
const portableDataManager = new PortableDataManager();
module.exports = portableDataManager;
