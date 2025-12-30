/**
 * Portable Data Manager for Nebula Browser
 * 
 * Handles portable user data storage on Linux when running from extracted AppImage
 * or portable installations. Does not affect Windows or macOS behavior.
 * 
 * Security considerations:
 * - Data is stored with restricted permissions (0700 for directories, 0600 for files)
 * - Path validation prevents directory traversal attacks
 * - Only enabled when explicitly set via NEBULA_PORTABLE environment variable
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
   * Check if we're running in portable mode on Linux
   * Portable mode is determined by:
   * 1. NEBULA_PORTABLE environment variable is set and truthy
   * 2. NEBULA_PORTABLE_PATH environment variable provides the data path
   * 3. Platform must be Linux (does not affect Windows or macOS)
   */
  isPortableMode() {
    if (this._isPortable !== null) {
      return this._isPortable;
    }

    // Only portable mode on Linux
    if (process.platform !== 'linux') {
      this._isPortable = false;
      return false;
    }

    // Check if NEBULA_PORTABLE is set and truthy
    const portableEnv = process.env.NEBULA_PORTABLE;
    const isTruthy = portableEnv && 
      (portableEnv === '1' || 
       portableEnv.toLowerCase() === 'true' || 
       portableEnv.toLowerCase() === 'yes');

    this._isPortable = isTruthy;
    return this._isPortable;
  }

  /**
   * Get the portable data directory path
   * Uses NEBULA_PORTABLE_PATH if set, otherwise returns null
   */
  getPortableDataPath() {
    if (this._portableDataPath !== null) {
      return this._portableDataPath;
    }

    if (!this.isPortableMode()) {
      this._portableDataPath = '';
      return '';
    }

    const portablePath = process.env.NEBULA_PORTABLE_PATH;
    if (!portablePath) {
      console.warn('[Portable] NEBULA_PORTABLE is set but NEBULA_PORTABLE_PATH is missing');
      this._portableDataPath = '';
      return '';
    }

    // Validate and resolve the path
    const resolvedPath = path.resolve(portablePath);
    
    // Security: ensure path doesn't contain suspicious patterns
    if (this._isPathSafe(resolvedPath)) {
      this._portableDataPath = resolvedPath;
    } else {
      console.error('[Portable] Unsafe path detected, falling back to default');
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
      const subdirs = ['Cache', 'Cookies', 'Local Storage', 'Session Storage', 'IndexedDB'];
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
   */
  _ensureSecureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      // Create with restricted permissions (owner only: rwx------)
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      console.log(`[Portable] Created secure directory: ${dirPath}`);
    } else {
      // Verify and fix permissions on existing directory
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

  /**
   * Write a file with secure permissions
   */
  writeSecureFile(filePath, data) {
    // Ensure parent directory exists with secure permissions
    const dir = path.dirname(filePath);
    this._ensureSecureDirectory(dir);

    // Write file
    fs.writeFileSync(filePath, data, { mode: 0o600 });
  }

  /**
   * Async version of secure file write
   */
  async writeSecureFileAsync(filePath, data) {
    // Ensure parent directory exists with secure permissions
    const dir = path.dirname(filePath);
    this._ensureSecureDirectory(dir);

    // Write file with restricted permissions (owner only: rw-------)
    await fs.promises.writeFile(filePath, data, { mode: 0o600 });
  }

  /**
   * Validate path safety (prevent directory traversal)
   */
  _isPathSafe(testPath) {
    // Resolve to absolute path
    const resolved = path.resolve(testPath);
    
    // Check for suspicious patterns
    const dangerous = ['..', '~root', '/etc', '/var/run', '/proc', '/sys', '/dev'];
    for (const pattern of dangerous) {
      if (resolved.includes(pattern)) {
        return false;
      }
    }

    // Ensure it's not trying to write to system directories
    const systemPaths = ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/boot', '/lib', '/lib64'];
    for (const sysPath of systemPaths) {
      if (resolved.startsWith(sysPath)) {
        return false;
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
      initialized: this._initialized,
      platform: process.platform,
      envPortable: process.env.NEBULA_PORTABLE,
      envPath: process.env.NEBULA_PORTABLE_PATH
    };
  }
}

// Export singleton instance
const portableDataManager = new PortableDataManager();
module.exports = portableDataManager;
