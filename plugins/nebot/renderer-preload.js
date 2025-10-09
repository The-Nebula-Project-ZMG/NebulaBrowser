// Renderer preload for Nebot plugin
const { contextBridge, ipcRenderer } = require('electron');
// Markdown rendering & sanitization
let marked, hljs, createDOMPurify, DOMPurify;
try {
  // These will be available after adding dependencies to package.json
  marked = require('marked');
  hljs = require('highlight.js');
  createDOMPurify = require('dompurify');
  // Defer DOMPurify creation until DOM is ready to avoid early failures in some contexts
  try {
    DOMPurify = createDOMPurify(window);
  } catch {}
  marked.setOptions({
    breaks: true,
    highlight(code, lang) {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
      } catch {}
      try {
        return hljs.highlightAuto(code).value;
      } catch { return code; }
    }
  });
  // Expose to page context so page.html no longer needs CDN scripts
  try {
    if (typeof window !== 'undefined') {
      // Note: with contextIsolation enabled, assigning to window does not expose to main world.
      // Keep assignments for same-world consumers, but also expose explicitly via contextBridge below.
      window.marked = marked;
      window.DOMPurify = DOMPurify;
      window.hljs = hljs;
    }
  } catch {}
  // Explicitly expose to main world so internal pages (browser://nebot) can use these libs
  try {
    if (marked) contextBridge.exposeInMainWorld('marked', marked);
    if (hljs) contextBridge.exposeInMainWorld('hljs', hljs);
    if (DOMPurify) contextBridge.exposeInMainWorld('DOMPurify', DOMPurify);
  } catch {}
} catch (e) {
  // If libs aren't available yet, we'll gracefully render as plain text.
}

// If DOMPurify wasn't ready, create and expose it after DOM is ready
try {
  window.addEventListener('DOMContentLoaded', () => {
    try {
      if (!DOMPurify && createDOMPurify) {
        DOMPurify = createDOMPurify(window);
      }
      if (DOMPurify) {
        try { contextBridge.exposeInMainWorld('DOMPurify', DOMPurify); } catch {}
        try { window.DOMPurify = DOMPurify; } catch {}
      }
    } catch {}
  });
} catch {}

const pluginId = 'ollama-chat';

// Expose minimal API for page scripts (optional)
contextBridge.exposeInMainWorld('ollamaChat', {
  toggle: () => ipcRenderer.send(`${pluginId}:toggle`),
  listChats: () => ipcRenderer.invoke(`${pluginId}:list-chats`),
  getChat: (id) => ipcRenderer.invoke(`${pluginId}:get-chat`, { id }),
  createChat: (title) => ipcRenderer.invoke(`${pluginId}:create-chat`, { title }),
  deleteChat: (id) => ipcRenderer.invoke(`${pluginId}:delete-chat`, { id }),
  getSettings: () => ipcRenderer.invoke(`${pluginId}:get-settings`),
  setSettings: (s) => ipcRenderer.invoke(`${pluginId}:set-settings`, s),
  send: (id, content) => ipcRenderer.invoke(`${pluginId}:send`, { id, content }),
});

// UI Injection: floating panel
function ensureStyles() {
  if (document.getElementById(`${pluginId}-styles`)) return;
  const style = document.createElement('style');
  style.id = `${pluginId}-styles`;
  style.textContent = `
  .${pluginId}-panel { position: fixed; background:
      linear-gradient(180deg, rgba(22,25,37,0.8), rgba(16,18,26,0.82)) padding-box,
      linear-gradient(135deg, rgba(140,86,255,0.22), rgba(62,149,255,0.18)) border-box;
    color: var(--text, #e8e8f0); border: 1px solid transparent; display: flex; flex-direction: column; overflow: hidden; z-index: 999999; position: fixed; overscroll-behavior: contain;
    -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-shadow: var(--shadow-1, 0 6px 20px rgba(0,0,0,.35)); }
  .${pluginId}-panel.floating { right: 16px; bottom: 16px; width: var(--ollama-chat-width, 460px); height: 70vh; max-height: 92vh; border-radius: var(--radius-lg, 16px); }
  .${pluginId}-panel.docked { right: 0; top: var(--nebula-header-height, 0px); bottom: 0; width: var(--ollama-chat-width, 460px); height: calc(100vh - var(--nebula-header-height, 0px)); border-left: 1px solid rgba(255,255,255,0.06); border-radius: 0; box-shadow: none; }
  .${pluginId}-resizer { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; cursor: ew-resize; background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0)); opacity: 0.25; }
  .${pluginId}-resizer:hover { opacity: 0.5; }
  .${pluginId}-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background:
      linear-gradient(180deg, rgba(24,26,36,0.7), rgba(24,26,36,0.62)); border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: 600; }
  .${pluginId}-btn { background: var(--accent, #7b61ff); color: #fff; border: 1px solid transparent; padding: 6px 10px; border-radius: 8px; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
  .${pluginId}-btn:hover { filter: brightness(1.05); }
  .${pluginId}-btn:active { transform: translateY(1px); }
  .${pluginId}-btn.secondary { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.14); color: var(--text, #e8e8f0); }
  .${pluginId}-body { display: grid; grid-template-columns: 260px 1fr; flex: 1 1 auto; min-height: 0; height: auto; }
  .${pluginId}-sidebar { border-right: 1px solid rgba(255,255,255,0.06); overflow: auto; background: rgba(0,0,0,0.08); min-height: 0; }
  .${pluginId}-chatlist { list-style: none; margin: 0; padding: 8px; }
  .${pluginId}-chatlist li { display: flex; align-items: center; gap: 8px; padding: 10px 10px; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.03); }
  .${pluginId}-chatlist li:hover { background: rgba(255,255,255,0.06); }
  .${pluginId}-chatlist li.active { background: rgba(123,97,255,0.16); border-color: rgba(123,97,255,0.38); }
  .${pluginId}-chat-item-main { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
  .${pluginId}-chat-title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .${pluginId}-chat-meta { font-size: 11px; color: var(--muted, #a4a7b3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .${pluginId}-chat-actions { display: flex; align-items: center; gap: 4px; }
  .${pluginId}-icon-btn { background: transparent; color: var(--text, #e8e8f0); border: 1px solid rgba(255,255,255,0.14); width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .${pluginId}-icon-btn:hover { background: rgba(255,255,255,0.12); }
  .${pluginId}-main { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
  .${pluginId}-msgs { flex: 1 1 auto; overflow: auto; padding: 14px 12px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.25) transparent; min-height: 0; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
  .${pluginId}-msgs::-webkit-scrollbar { width: 10px; }
  .${pluginId}-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 10px; }
  .${pluginId}-msgs::-webkit-scrollbar-track { background: transparent; }
  .${pluginId}-msg { margin: 8px 0; padding: 10px 12px; border-radius: 12px; max-width: 88%; line-height: 1.5; }
  .${pluginId}-msg.user { background:
      linear-gradient(180deg, rgba(36,40,66,0.8), rgba(28,32,52,0.78)); border: 1px solid rgba(123,97,255,0.28); align-self: flex-end; }
  .${pluginId}-msg.assistant { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); align-self: flex-start; }
  /* Rich content styles */
  .${pluginId}-msg * { color: inherit; }
  .${pluginId}-msg p { margin: 0.6em 0; line-height: 1.6; }
  .${pluginId}-msg h1, .${pluginId}-msg h2, .${pluginId}-msg h3, .${pluginId}-msg h4, .${pluginId}-msg h5, .${pluginId}-msg h6 { margin: 0.8em 0 0.4em; font-weight: 600; line-height: 1.25; }
  .${pluginId}-msg h1 { font-size: 1.4em; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 0.3em; }
  .${pluginId}-msg h2 { font-size: 1.2em; }
  .${pluginId}-msg h3 { font-size: 1.1em; }
  .${pluginId}-msg ul, .${pluginId}-msg ol { padding-left: 1.2em; margin: 0.6em 0; }
  .${pluginId}-msg li { margin: 0.25em 0; line-height: 1.5; }
  .${pluginId}-msg blockquote { margin: 0.8em 0; padding: 0.6em 1em; border-left: 4px solid rgba(123,97,255,0.6); background: rgba(123,97,255,0.08); border-radius: 0 8px 8px 0; font-style: italic; }
  .${pluginId}-msg code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; background: rgba(0,0,0,0.4); padding: 0.15em 0.35em; border-radius: 6px; font-size: 0.9em; border: 1px solid rgba(255,255,255,0.1); }
  .${pluginId}-msg pre { background: rgba(0,0,0,0.5); padding: 12px 14px; border-radius: 10px; overflow: auto; border: 1px solid rgba(255,255,255,0.12); margin: 0.8em 0; line-height: 1.45; }
  .${pluginId}-msg pre code { background: transparent; padding: 0; border: none; font-size: 0.85em; }
  .${pluginId}-msg a { color: #6cb6ff; text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
  .${pluginId}-msg a:hover { border-bottom-color: #6cb6ff; }
  .${pluginId}-msg table { border-collapse: collapse; margin: 0.8em 0; width: 100%; font-size: 0.9em; }
  .${pluginId}-msg th, .${pluginId}-msg td { border: 1px solid rgba(255,255,255,0.15); padding: 0.5em 0.7em; text-align: left; }
  .${pluginId}-msg th { background: rgba(255,255,255,0.05); font-weight: 600; }
  .${pluginId}-msg hr { border: none; height: 1px; background: rgba(255,255,255,0.15); margin: 1.5em 0; }
  .${pluginId}-msg strong { font-weight: 600; }
  .${pluginId}-msg em { font-style: italic; }
  /* Enhanced highlight colors aligned to theme */
  .${pluginId}-msg .hljs { color: var(--text, #e8e8f0); background: transparent !important; }
  .${pluginId}-msg .hljs-keyword, .${pluginId}-msg .hljs-selector-tag { color: #c792ea; }
  .${pluginId}-msg .hljs-string, .${pluginId}-msg .hljs-attr { color: #ecc48d; }
  .${pluginId}-msg .hljs-number, .${pluginId}-msg .hljs-literal { color: #f78c6c; }
  .${pluginId}-msg .hljs-comment { color: #7f848e; }
  .${pluginId}-msg .hljs-function { color: #82aaff; }
  .${pluginId}-msg .hljs-variable { color: #ffcb6b; }
  .${pluginId}-msg .hljs-type { color: #c3e88d; }
  .${pluginId}-msg .hljs-built_in { color: #ff5370; }
  .${pluginId}-composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.06); }
  .${pluginId}-composer textarea { flex: 1; resize: vertical; min-height: 44px; max-height: 140px; background: rgba(0,0,0,0.28); color: var(--text, #e8e8f0); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px 12px; outline: none; }
  .${pluginId}-composer textarea:focus { border-color: rgba(123,97,255,0.45); box-shadow: 0 0 0 3px rgba(123,97,255,0.18); }
  .${pluginId}-footer { display: flex; gap: 6px; align-items: center; padding: 8px 10px; background: rgba(0,0,0,0.08); border-top: 1px solid rgba(255,255,255,0.06); color: var(--muted, #a4a7b3); font-size: 12px; }
  /* Shrink main page content when docked panel is open */
  #webviews { width: calc(100% - var(--ollama-right-offset, 0px)) !important; }
  #home-container { width: calc(100% - var(--ollama-right-offset, 0px)) !important; }
  `;
  document.head.appendChild(style);
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'onclick') el.addEventListener('click', v);
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

let state = { chats: [], currentId: null, streaming: false, docked: true, width: 0 };
let els = {};

function getSavedWidth() {
  const v = Number(localStorage.getItem(`${pluginId}:width`) || '0');
  return Number.isFinite(v) && v >= 300 ? v : 460;
}

function saveWidth(w) {
  try { localStorage.setItem(`${pluginId}:width`, String(w)); } catch {}
}

function applyWidth(root, w) {
  const min = 320, max = 1024;
  const clamped = Math.max(min, Math.min(max, Math.round(w)));
  state.width = clamped;
  root.style.setProperty('--ollama-chat-width', `${clamped}px`);
  setPageOffset(root);
}

function initResizer(root) {
  const handle = h('div', { class: `${pluginId}-resizer` });
  root.appendChild(handle);
  let startX = 0, startW = 0, moving = false;
  const onMove = (e) => {
    if (!moving) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - startX;
    const next = startW - deltaX; // anchored to right, dragging left increases width
    applyWidth(root, next);
  };
  const onUp = () => {
    if (!moving) return;
    moving = false;
    document.body.style.userSelect = '';
    saveWidth(state.width);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
  };
  const onDown = (e) => {
    e.preventDefault();
    const rect = root.getBoundingClientRect();
    startW = rect.width;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    moving = true;
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
}

function setPageOffset(root) {
  try {
    // Only offset when docked so the page remains fully visible behind the panel
    const px = (state.docked && root && document.body.contains(root)) ? state.width : 0;
    document.documentElement.style.setProperty('--ollama-right-offset', `${px}px`);
  // Force a reflow so <webview> and layout pick up the width change immediately
  // by reading offsetWidth of an affected element.
  const target = document.getElementById('webviews') || document.getElementById('home-container');
  if (target) void target.offsetWidth; // reflow hint
  } catch {}
}

function closePanel(root) {
  setTimeout(() => {
    try { document.documentElement.style.setProperty('--ollama-right-offset', '0px'); } catch {}
  }, 0);
  root.remove();
}

function mdToHtml(md) {
  // Fall back to simple escape if libs not present
  if (!marked || !DOMPurify) {
    const div = document.createElement('div');
    div.textContent = md;
    return div.innerHTML;
  }
  const raw = marked.parse(md || '');
  const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel', 'class'] });
  return clean;
}

function setRichContent(el, md) {
  el.innerHTML = mdToHtml(md);
  // Enhance links to open in new tab and be safe
  el.querySelectorAll('a[href]').forEach(a => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
}

async function refreshList() {
  const { chats } = await ipcRenderer.invoke(`${pluginId}:list-chats`);
  state.chats = chats || [];
  renderList();
}

async function openChat(id) {
  state.currentId = id;
  const { chat, error } = await ipcRenderer.invoke(`${pluginId}:get-chat`, { id });
  if (error) return;
  renderMessages(chat);
  renderList();
  subscribeStream(id);
}

async function newChat() {
  const { chat } = await ipcRenderer.invoke(`${pluginId}:create-chat`, { title: 'Chat ' + new Date().toLocaleTimeString() });
  await refreshList();
  await openChat(chat.id);
}

async function deleteChat(id) {
  await ipcRenderer.invoke(`${pluginId}:delete-chat`, { id });
  await refreshList();
  if (state.currentId === id) {
    state.currentId = state.chats[0]?.id || null;
    if (state.currentId) openChat(state.currentId); else renderMessages(null);
  }
}

function subscribeStream(id) {
  // Remove previous
  ipcRenderer.removeAllListeners(`${pluginId}:stream:${id}`);
  let buffer = '';
  let scheduled = null;
  const scheduleRender = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      const last = els.msgs && els.msgs.querySelector('.streaming');
      if (last) setRichContent(last, buffer);
      scheduled = null;
    });
  };
  ipcRenderer.on(`${pluginId}:stream:${id}`, (_e, payload) => {
    if (!els.msgs) return;
    if (payload.type === 'token') {
      let last = els.msgs.querySelector('.streaming');
      if (!last) {
        last = h('div', { class: `${pluginId}-msg assistant streaming` });
        els.msgs.appendChild(last);
        buffer = '';
      }
      buffer += payload.token || '';
      scheduleRender();
      els.msgs.scrollTop = els.msgs.scrollHeight;
    } else if (payload.type === 'done') {
      const last = els.msgs.querySelector('.streaming');
      if (last) {
        setRichContent(last, buffer);
        last.classList.remove('streaming');
      }
      buffer = '';
    }
  });
}

function renderList() {
  if (!els.chatlist) return;
  els.chatlist.innerHTML = '';
  for (const c of state.chats) {
    const li = h('li', { class: state.currentId === c.id ? 'active' : '', onclick: () => openChat(c.id) });
    const updated = new Date(c.updatedAt || Date.now()).toLocaleString();
    const main = h('div', { class: `${pluginId}-chat-item-main` },
      h('div', { class: `${pluginId}-chat-title` }, c.title || 'Untitled Chat'),
      h('div', { class: `${pluginId}-chat-meta` }, updated)
    );
    const actions = h('div', { class: `${pluginId}-chat-actions` });
    const del = h('button', { class: `${pluginId}-icon-btn`, title: 'Delete chat', onclick: (e) => { e.stopPropagation(); deleteChat(c.id); } }, '🗑');
    actions.appendChild(del);
    li.appendChild(main);
    li.appendChild(actions);
    els.chatlist.appendChild(li);
  }
}

function renderMessages(chat) {
  if (!els.msgs) return;
  els.msgs.innerHTML = '';
  if (!chat) return;
  for (const m of chat.messages) {
  const div = h('div', { class: `${pluginId}-msg ${m.role}` });
  setRichContent(div, m.content);
    els.msgs.appendChild(div);
  }
  els.msgs.scrollTop = els.msgs.scrollHeight;
}

async function sendCurrent() {
  const content = els.input.value.trim();
  if (!content) return;
  // If no chat selected, create one on first send
  if (!state.currentId) {
    const { chat } = await ipcRenderer.invoke(`${pluginId}:create-chat`, { title: 'New chat' });
    await refreshList();
    state.currentId = chat.id;
    await openChat(state.currentId);
  }
  els.input.value = '';
  // echo user message into UI immediately
  const userDiv = h('div', { class: `${pluginId}-msg user` });
  // Render user content as plain text to avoid accidental HTML
  userDiv.textContent = content;
  els.msgs.appendChild(userDiv);
  els.msgs.scrollTop = els.msgs.scrollHeight;
  await ipcRenderer.invoke(`${pluginId}:send`, { id: state.currentId, content });
}

function setDockClass(root) {
  root.classList.remove('floating', 'docked');
  root.classList.add(state.docked ? 'docked' : 'floating');
}

function toggleDock(root) {
  state.docked = !state.docked;
  setDockClass(root);
  if (els.dockBtn) els.dockBtn.textContent = state.docked ? 'Undock' : 'Dock';
  setPageOffset(root);
  applyHeaderOffset();
}

function panelEl() {
  ensureStyles();
  applyHeaderOffset();
  let root = document.getElementById(`${pluginId}-panel`);
  if (root) return root;
  state.width = getSavedWidth();
  function openFullPage() {
    console.log('[Nebot] Open Page button clicked');
    try {
      const target = 'browser://nebot';
      let opened = false;
      // 0) Try window.postMessage bridge (works across contextIsolation)
      try {
        window.postMessage({ type: 'open-internal-page', url: target }, '*');
        opened = true;
        console.log('[Nebot] Posted message to open internal page', target);
      } catch {}
      // 1) Preferred path: ask host (tab manager) via sendToHost so this works inside any webview
      try {
        if (!opened && ipcRenderer && typeof ipcRenderer.sendToHost === 'function') {
          ipcRenderer.sendToHost('navigate', target, { newTab: true });
          opened = true;
          console.log('[Nebot] Requested host to open new tab for', target);
        }
      } catch {}
      // 2) If we're actually in the top-level renderer (not a webview) window.createTab will exist
      if (!opened && typeof window.createTab === 'function') {
        window.createTab(target);
        opened = true;
        console.log('[Nebot] Used window.createTab fallback for', target);
      }
      // 3) Last resort: manipulate URL bar + navigate (top-level renderer only)
      if (!opened && typeof window.navigate === 'function') {
        const urlBox = document.getElementById('url');
        if (urlBox) { urlBox.value = target; window.navigate(); opened = true; }
        console.log('[Nebot] Used window.navigate fallback for', target);
      }
      if (!opened) console.warn('[Nebot] Failed to find a method to open full page Nebot');
    } catch (e) {
      console.warn('Failed to open full Nebot page', e);
    } finally {
      closePanel(document.getElementById(`${pluginId}-panel`));
    }
  }
  root = h('div', { id: `${pluginId}-panel`, class: `${pluginId}-panel ${state.docked ? 'docked' : 'floating'}` },
    h('div', { class: `${pluginId}-header` },
  h('span', {}, 'Nebot'),
      h('div', {},
        h('button', { class: `${pluginId}-btn secondary`, title: 'Open full-page Nebot (browser://nebot)', onclick: openFullPage }, 'Open Page'),
        h('button', { class: `${pluginId}-btn secondary`, onclick: () => closePanel(root) }, 'Close')
      )
    ),
    h('div', { class: `${pluginId}-body` },
      h('div', { class: `${pluginId}-sidebar` },
        h('div', { style: 'padding:6px;' },
          h('button', { class: `${pluginId}-btn`, onclick: newChat }, 'New chat')
        ),
        els.chatlist = h('ul', { class: `${pluginId}-chatlist` })
      ),
      h('div', { class: `${pluginId}-main` },
        els.msgs = h('div', { class: `${pluginId}-msgs` }),
        h('div', { class: `${pluginId}-composer` },
          els.input = h('textarea', { placeholder: 'Type a message to start a new chat…' }),
          h('button', { class: `${pluginId}-btn`, onclick: sendCurrent }, 'Send')
        ),
        h('div', { class: `${pluginId}-footer` },
          h('small', {}, 'Messages are stored locally in the plugin folder.')
        )
      )
    )
  );
  document.body.appendChild(root);
  // Route assistant links to open in a new browser tab via host
  const routeToNewTab = (url) => {
    try {
      // Prefer direct sendToHost when available
      ipcRenderer.sendToHost('navigate', url, { newTab: true });
    } catch {
      try {
        if (window.parent && typeof window.parent.postMessage === 'function') {
          window.parent.postMessage({ type: 'navigate', url, newTab: true }, '*');
        } else {
          window.open(url, '_blank', 'noopener');
        }
      } catch {
        window.open(url, '_blank', 'noopener');
      }
    }
  };
  // Delegate clicks from within messages area
  els.msgs.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.href || a.getAttribute('href');
    if (!href) return;
    // Only intercept http(s) links for in-browser tabs
    if (/^https?:\/\//i.test(href)) {
      e.preventDefault();
      routeToNewTab(href);
    }
  });
  // Middle-click support (auxclick)
  els.msgs.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.href || a.getAttribute('href');
    if (!href) return;
    if (/^https?:\/\//i.test(href)) {
      e.preventDefault();
      routeToNewTab(href);
    }
  });
  applyWidth(root, state.width);
  initResizer(root);
  refreshList().then(() => state.chats[0] && openChat(state.chats[0].id));
  return root;
}

async function openSettings() {
  const { settings } = await ipcRenderer.invoke(`${pluginId}:get-settings`);
  const base = prompt('Ollama base URL', settings.ollamaBaseUrl || 'http://homelab.andrewzambazos.com:11434');
  if (base == null) return;
  // Model is fixed; show message for clarity
  alert('Model is fixed to deepseek-r1:8b');
  const systemPrompt = prompt('System prompt', settings.systemPrompt || 'You are a helpful assistant inside the Nebula browser.');
  await ipcRenderer.invoke(`${pluginId}:set-settings`, { ollamaBaseUrl: base, systemPrompt });
}

// Listen for toggle from main menu
ipcRenderer.on(`${pluginId}:toggle`, () => {
  const existing = document.getElementById(`${pluginId}-panel`);
  if (existing) closePanel(existing); else panelEl();
});

// When main updates a chat (e.g., after auto-title), refresh the list and keep selection
ipcRenderer.on('ollama-chat:chat-updated', (_e, { id, title }) => {
  if (!state.chats.length) return;
  const item = state.chats.find(c => c.id === id);
  if (item) item.title = title;
  renderList();
});

// Also expose a global keyboard shortcut inside renderer (optional, light)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    const existing = document.getElementById(`${pluginId}-panel`);
    if (existing) existing.remove(); else panelEl();
  }
});

// Compute header offset so docked panel doesn't overlap top UI
function applyHeaderOffset() {
  try {
    const tab = document.getElementById('tab-bar');
    const nav = document.getElementById('nav');
    let h = 0;
    if (tab) h += Math.max(0, tab.getBoundingClientRect().height || 0);
    if (nav) h += Math.max(0, nav.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty('--nebula-header-height', `${Math.round(h)}px`);
  } catch {}
}

window.addEventListener('resize', applyHeaderOffset);
window.addEventListener('resize', () => setPageOffset(document.getElementById(`${pluginId}-panel`)));
document.addEventListener('DOMContentLoaded', applyHeaderOffset);
// Watch for dynamic header size changes
(() => {
  try {
    const ro = new ResizeObserver(() => applyHeaderOffset());
    const tab = document.getElementById('tab-bar');
    const nav = document.getElementById('nav');
    if (tab) ro.observe(tab);
    if (nav) ro.observe(nav);
  } catch {}
})();
