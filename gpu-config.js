// gpu-config.js - Comprehensive GPU configuration manager
const { app } = require('electron');

class GPUConfig {
  constructor() {
    this.isGPUSupported = false;
    this.fallbackApplied = false;
  }

  // Apply GPU configuration based on system capabilities
  configure() {
    console.log('Configuring GPU settings...');
    
    // Try to detect if we're on a system that supports GPU acceleration
    const platform = process.platform;
    const arch = process.arch;
    
    console.log(`Platform: ${platform}, Architecture: ${arch}`);
    
    // Start with conservative settings that usually work
    this.applyConservativeSettings();

    // On Linux/SteamOS, force disable GPU and sandbox to ensure webview stability
    if (platform === 'linux') {
      console.log('Linux detected: Disabling GPU and enforcing no-sandbox');
      app.commandLine.appendSwitch('disable-gpu');
      app.commandLine.appendSwitch('no-sandbox');
      this.fallbackApplied = true;
      return;
    }
    
    // Try to enable GPU features progressively
    this.tryEnableGPU();
  }

  applyConservativeSettings() {
    // Essential switches that usually don't cause issues
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    
    // Performance improvements that don't rely on GPU
    app.commandLine.appendSwitch('disable-background-timer-throttling');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('enable-quic');
    app.commandLine.appendSwitch('max_old_space_size', '4096');
  }

  tryEnableGPU() {
    try {
      // GPU acceleration switches
      app.commandLine.appendSwitch('ignore-gpu-blacklist');
      app.commandLine.appendSwitch('ignore-gpu-blocklist');

      // On Linux/SteamOS, these aggressive flags can cause webview rendering issues (black screen)
      // We disable them for Linux to ensure stability
      if (process.platform !== 'linux') {
        app.commandLine.appendSwitch('enable-gpu-rasterization');
        app.commandLine.appendSwitch('enable-zero-copy');
      }
      
      // Video acceleration (usually safer than full GPU)
      app.commandLine.appendSwitch('enable-accelerated-video-decode');
      app.commandLine.appendSwitch('enable-accelerated-mjpeg-decode');
      
      // Conservative feature enabling
      app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
      
      console.log('GPU acceleration switches applied');
    } catch (err) {
      console.error('Error applying GPU switches:', err);
      this.applyFallback();
    }
  }

  applyFallback() {
    console.log('Applying GPU fallback configuration...');
    
    // Force software rendering if GPU fails
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    
    this.fallbackApplied = true;
    this.isGPUSupported = false;
  }

  // Check if GPU is working after app starts
  async checkGPUStatus() {
    try {
      const gpuInfo = app.getGPUFeatureStatus();
      
      // Check if any critical GPU features are enabled
      const enabledFeatures = Object.entries(gpuInfo)
        .filter(([key, value]) => !value.includes('disabled'))
        .map(([key]) => key);
      
      this.isGPUSupported = enabledFeatures.length > 2; // At least some features working
      
      console.log('GPU Status Check:');
      console.log('- Enabled features:', enabledFeatures);
      console.log('- GPU supported:', this.isGPUSupported);
      
      return {
        isSupported: this.isGPUSupported,
        enabledFeatures,
        fullStatus: gpuInfo
      };
    } catch (err) {
      console.error('GPU status check failed:', err);
      return { isSupported: false, error: err.message };
    }
  }

  getRecommendations() {
    const recommendations = [];
    
    if (!this.isGPUSupported) {
      recommendations.push('GPU acceleration is not available on this system');
      recommendations.push('The browser will use software rendering (slower but stable)');
      recommendations.push('Consider updating your graphics drivers');
      recommendations.push('Check if your system supports hardware acceleration');
    } else {
      recommendations.push('GPU acceleration is working');
      recommendations.push('Browser should have good performance');
    }
    
    if (this.fallbackApplied) {
      recommendations.push('Fallback mode is active due to GPU issues');
      recommendations.push('Performance may be reduced but stability improved');
    }
    
    return recommendations;
  }
}

module.exports = GPUConfig;
