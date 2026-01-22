const zoomPercentEl = document.getElementById('zoom-percent');

function setCssVar(name, value, fallback) {
  const val = value || fallback;
  if (val) document.documentElement.style.setProperty(name, val);
}

function applyTheme(theme) {
  const colors = theme?.colors || theme || {};
  setCssVar('--bg', colors.bg, '#0b0d10');
  setCssVar('--dark-blue', colors.darkBlue, '#0b1c2b');
  setCssVar('--dark-purple', colors.darkPurple, '#1b1035');
  setCssVar('--primary', colors.primary, '#7b2eff');
  setCssVar('--accent', colors.accent, '#00c6ff');
  setCssVar('--text', colors.text, '#e0e0e0');
  setCssVar('--url-bar-bg', colors.urlBarBg, '#1c2030');
  setCssVar('--url-bar-border', colors.urlBarBorder, '#3e4652');
}

async function refreshZoom() {
  if (!window.electronAPI?.invoke || !zoomPercentEl) return;
  try {
    const z = await window.electronAPI.invoke('get-zoom-factor');
    zoomPercentEl.textContent = `${Math.round(z * 100)}%`;
  } catch {}
}

window.electronAPI?.on?.('menu-popup-init', (payload) => {
  applyTheme(payload?.theme);
  refreshZoom();
});

window.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-cmd]');
  if (!btn) return;
  const cmd = btn.getAttribute('data-cmd');
  window.electronAPI?.send?.('menu-popup-command', { cmd });
  if (cmd === 'zoom-in' || cmd === 'zoom-out') {
    setTimeout(refreshZoom, 50);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.electronAPI?.send?.('menu-popup-command', { cmd: 'close' });
  }
});

refreshZoom();
