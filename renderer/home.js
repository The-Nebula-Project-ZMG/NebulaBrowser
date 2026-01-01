import { icons as initialIcons, fetchAllIcons } from './icons.js';
import { iconSets } from './iconSets.js';

const bookmarkList      = document.getElementById('bookmarkList');
const titleInput        = document.getElementById('titleInput');
const urlInput          = document.getElementById('urlInput');
const saveBookmarkBtn   = document.getElementById('saveBookmarkBtn');
const cancelBtn         = document.getElementById('cancelBtn');
const addPopup          = document.getElementById('addPopup');
const searchBtn         = document.getElementById('searchBtn');
const searchInput       = document.getElementById('searchInput');
const searchEngineBtn   = document.getElementById('searchEngineBtn');
const searchEngineDropdown = document.getElementById('searchEngineDropdown');
const searchEngineLogo  = document.getElementById('searchEngineLogo');
const iconFilter       = document.getElementById('iconFilter');
const iconGrid         = document.getElementById('iconGrid');
const selectedIconInput= document.getElementById('selectedIcon');
const iconCategoryNav  = document.getElementById('iconCategoryNav');
const useFaviconCheckbox = document.getElementById('useFavicon');
const greetingEl        = document.getElementById('greeting');
const resetTopSitesBtn  = document.getElementById('resetTopSites');
const clockEl           = document.getElementById('clock');
const weatherEl         = document.getElementById('weather');
const glanceEl          = document.querySelector('.glance');
const searchContainerEl = document.querySelector('.search-container');
const topSitesEl        = document.querySelector('.top-sites-card');
const editBtn           = document.getElementById('editLayoutBtn');
const greetingTitleEl   = document.getElementById('greeting');
const editToolbar       = document.getElementById('editToolbar');
const saveEditBtn       = document.getElementById('saveEditBtn');
const cancelEditBtn     = document.getElementById('cancelEditBtn');
const toggleShowGreeting = document.getElementById('toggleShowGreeting');
const toggleShowBookmarks= document.getElementById('toggleShowBookmarks');
const toggleShowGlance   = document.getElementById('toggleShowGlance');
let selectedIcon       = initialIcons[0];
let availableIcons     = initialIcons;
let currentIconSetKey  = 'material';
const loadedSetsCache  = new Map(); // key -> array
let unifiedCatalog     = []; // aggregated icons with categories
// Semantic icon categories (ordered) with predicate tests
const iconCategories = [
  { id: 'services', label: 'Services', test: (n, set) => set === 'simple' || /(github|gitlab|google|twitter|facebook|discord|slack|whatsapp|youtube|spotify|apple|microsoft|aws|azure|gcp|cloudflare|figma|notion|paypal|stripe|reddit|steam|xbox|playstation|nintendo|openai|vercel|netlify|docker|kubernetes)/.test(n), icon: 'cloud' },
  { id: 'settings', label: 'Settings', test: n => /(setting|settings|cog|gear|tools?|wrench|sliders?|command|preferences?)/.test(n), icon: 'settings' },
  { id: 'files', label: 'Files & Data', test: n => /(file|folder|archive|book|bookmark|save|upload|download|cloud|database|server)/.test(n), icon: 'folder' },
  { id: 'media', label: 'Media', test: n => /(camera|video|film|image|photo|music|play|pause|mic|microphone|volume|speaker)/.test(n), icon: 'video_camera_front' },
  { id: 'social', label: 'Social & Communication', test: n => /(chat|message|mail|envelope|phone|comment|share|rss)/.test(n), icon: 'chat' },
  { id: 'nav', label: 'Navigation', test: n => /(map|compass|globe|route|pin|location|world|earth)/.test(n), icon: 'explore' },
  { id: 'security', label: 'Security', test: n => /(lock|shield|key|alert|warning|info|question|bug)/.test(n), icon: 'security' },
  { id: 'commerce', label: 'Commerce', test: n => /(cart|shopping|wallet|credit|bank|price|tag|sale|bag|store|shop)/.test(n), icon: 'shopping_cart' },
  { id: 'status', label: 'Status', test: n => /(star|heart|award|trophy|badge|bell|notification)/.test(n), icon: 'star' },
  { id: 'food', label: 'Food', test: n => /(apple|cake|coffee|cookie|beer|wine|food|restaurant|cup|tea)/.test(n), icon: 'restaurant' },
  { id: 'devices', label: 'Devices', test: n => /(cpu|laptop|desktop|tablet|phone|smartphone|device|monitor|tv)/.test(n), icon: 'devices' },
  { id: 'other', label: 'Other', test: () => true, icon: 'more_horiz' }
];

const searchEngines = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q='
};
let selectedSearchEngine = 'google';

let bookmarks = [];

// Load bookmarks from main via Electron IPC
// Load bookmarks via contextBridge API
async function loadBookmarks() {
  try {
    let data = [];
    // Use bookmarksAPI if available
    if (window.bookmarksAPI && typeof window.bookmarksAPI.load === 'function') {
      data = await window.bookmarksAPI.load();
    } else if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      data = await window.electronAPI.invoke('load-bookmarks');
    } else {
      console.error('No API available to load bookmarks');
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    return [];
  }
}

// Save bookmarks to main process
// Save bookmarks via contextBridge API
async function saveBookmarks() {
  try {
    await window.bookmarksAPI.save(bookmarks);
  } catch (error) {
    console.error('Error saving bookmarks:', error);
  }
}

// Render bookmarks
function renderBookmarks() {
  bookmarkList.innerHTML = '';

  // Render each bookmark
  bookmarks.forEach((b, index) => {
    const box = document.createElement('div');
    box.className = 'bookmark';

    // prepend icon
    const iconVal = b.icon || 'bookmark';
    let iconEl;
    if (typeof iconVal === 'string' && /^(https?:|data:)/.test(iconVal)) {
      // Treat as favicon/image URL
      iconEl = document.createElement('img');
      iconEl.src = iconVal;
      iconEl.alt = 'favicon';
      iconEl.className = 'bookmark-favicon';
      iconEl.referrerPolicy = 'no-referrer';
      // Apply filter for dark backgrounds to ensure visibility
      if (isDarkBackground()) {
        iconEl.style.filter = 'brightness(0) saturate(100%) invert(100%)';
      }
      box.appendChild(iconEl);
    } else {
      iconEl = document.createElement('span');
      iconEl.className = 'material-symbols-outlined';
      iconEl.textContent = iconVal;
      box.appendChild(iconEl);
    }

    const label = document.createElement('span');
    label.className = 'bookmark-title';
    label.textContent = b.title;

    const close = document.createElement('button');
    close.textContent = '×';
    close.className = 'delete-btn';
    close.onclick = async (e) => {
      e.stopPropagation();
      bookmarks.splice(index, 1);
      await saveBookmarks();
      renderBookmarks();
    };

    // Navigate via IPC to host page
    box.onclick = () => {
      const url = b.url;
      if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('navigate', url);
      } else {
        console.error('Unable to send navigation IPC to host');
      }
      // Fallback: post message to embedding page
      if (window.parent && typeof window.parent.postMessage === 'function') {
        window.parent.postMessage({ type: 'navigate', url }, '*');
      }
    };

    box.appendChild(label);
    box.appendChild(close);
    bookmarkList.appendChild(box);
  });

  // Add "+" box
  const addBox = document.createElement('div');
  addBox.className = 'bookmark add-bookmark';
  addBox.textContent = '+';
  addBox.onclick = () => addPopup.classList.remove('hidden');

  bookmarkList.appendChild(addBox);
}

// Reset Top Sites (bookmarks) to empty state
if (resetTopSitesBtn) {
  resetTopSitesBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!bookmarks.length) return;
    const yes = confirm('Clear all Top Sites?');
    if (!yes) return;
    bookmarks = [];
    await saveBookmarks();
    renderBookmarks();
  });
}

// draw the icon‐grid, filtering by the search term
function renderIconGrid(filter = '') {
  const f = filter.toLowerCase();
  iconGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  let lastCat = null;
  const filtered = unifiedCatalog.filter(e => !f || e.name.includes(f));
  filtered.forEach(entry => {
    if (entry.category !== lastCat) {
      lastCat = entry.category;
      const anchor = document.createElement('div');
      anchor.className = 'icon-section-anchor';
      anchor.id = `section-${entry.category}`;
      frag.appendChild(anchor);
    }
    const span = document.createElement('span');
    span.className = 'icon-item';
    const def = iconSets[entry.set];
    if (entry.set === 'material') {
      span.classList.add('material-symbols-outlined');
      span.textContent = entry.name;
    } else if (def && def.fontClass) {
      const i = document.createElement('i');
      i.className = def.fontClass(entry.name);
      span.appendChild(i);
    } else if (entry.dataUrl) {
      const img = document.createElement('img');
      img.src = entry.dataUrl; img.alt = entry.name; img.className = 'grid-svg';
      span.appendChild(img);
    } else {
      span.textContent = '…';
      (async () => {
        if (def && def.fetchIcon) {
          const dataUrl = await def.fetchIcon(entry.name);
            if (dataUrl) {
              entry.dataUrl = dataUrl;
              if (span.isConnected) {
                span.textContent='';
                const img=document.createElement('img');
                img.src=dataUrl; img.alt=entry.name; img.className='grid-svg';
                span.appendChild(img);
              }
            } else {
              // If SVG fetch fails, try font class or show truncated name
              if (def.fontClass && span.isConnected) {
                span.textContent='';
                const i = document.createElement('i');
                i.className = def.fontClass(entry.name);
                span.appendChild(i);
              } else {
                span.textContent = entry.name.slice(0,3);
              }
            }
        } else {
          // No fetchIcon available, show name
          span.textContent = entry.name.slice(0,3);
        }
      })();
    }
    span.onclick = () => {
      const currentSelected = iconGrid.querySelector('.icon-item.selected');
      if (currentSelected) currentSelected.classList.remove('selected');
      span.classList.add('selected');
      selectedIcon = entry.name;
      selectedIconInput.value = entry.name;
      selectedIconInput.dataset.iconSet = entry.set;
      if (entry.dataUrl) selectedIconInput.dataset.dataUrl = entry.dataUrl; else delete selectedIconInput.dataset.dataUrl;
    };
    frag.appendChild(span);
  });
  iconGrid.appendChild(frag);
  // Don't auto-select first icon to allow favicon usage
}

// filter as the user types
iconFilter.addEventListener('input', () => renderIconGrid(iconFilter.value.trim()));

// initial render
renderIconGrid();

// Asynchronously fetch all icons and update the grid
async function buildUnifiedCatalog() {
  const keys = Object.keys(iconSets);
  for (const k of keys) {
    if (!loadedSetsCache.has(k)) {
      try { loadedSetsCache.set(k, await iconSets[k].loader()); }
      catch(e) { console.warn('Icon set load failed', k, e); loadedSetsCache.set(k, []); }
    }
  }
  const temp = [];
  for (const k of keys) {
    const arr = loadedSetsCache.get(k) || [];
    for (const name of arr) {
      const lower = name.toLowerCase();
      const category = iconCategories.find(c => c.test(lower, k)).id;
      temp.push({ set: k, name, category });
    }
  }
  // order by category then by name
  unifiedCatalog = temp.sort((a,b)=> {
    if (a.category === b.category) return a.name.localeCompare(b.name);
    return iconCategories.findIndex(c=>c.id===a.category) - iconCategories.findIndex(c=>c.id===b.category);
  });
  buildCategoryNav();
  renderIconGrid(iconFilter.value.trim());
}
buildUnifiedCatalog();

// --- Favicon resolution helpers ---
async function resolveFavicon(rawUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url; // assume https if protocol missing
  }
  try {
    const u = new URL(url);
    // Prefer Google favicon service for simplicity & size; fall back to /favicon.ico
    const googleService = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(u.origin)}`;
    // We'll optimisticly use google service; optionally we could verify it loads, but browsers will handle 404 gracefully.
    return googleService;
  } catch (_) {
    return null;
  }
}

// Helper function to detect if background is dark
function isDarkBackground() {
  // For SVG color modification, check if we have a dark theme
  const rootStyles = window.getComputedStyle(document.documentElement);
  const bgVar = rootStyles.getPropertyValue('--bg').trim();
  
  if (bgVar && bgVar.startsWith('#')) {
    const hex = bgVar.slice(1);
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16); 
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }
  
  // Fallback: assume dark theme for this app
  return true;
}

saveBookmarkBtn.onclick = async () => {
  const title = titleInput.value.trim();
  const url   = urlInput.value.trim();
  let icon  = selectedIcon;
  if (!title || !url) return;

  // Check if user wants to use favicon via checkbox
  const wantFavicon = useFaviconCheckbox.checked;
  
  if (wantFavicon) {
    try {
      const faviconUrl = await resolveFavicon(url);
      if (faviconUrl) icon = faviconUrl;
    } catch (e) {
      console.warn('Favicon fetch failed, falling back to icon symbol:', e);
    }
  } else {
    // Use selected icon if available
    const hasSelectedIcon = document.querySelector('.icon-item.selected');
    if (hasSelectedIcon) {
      if (selectedIconInput.dataset.iconSet && selectedIconInput.dataset.iconSet !== 'material') {
        if (selectedIconInput.dataset.dataUrl) {
          icon = selectedIconInput.dataset.dataUrl;
          
          // For SVG icons, modify color based on background
          if (icon.startsWith('data:image/svg+xml') && isDarkBackground()) {
            try {
              // Decode the SVG and modify its color
              const svgData = decodeURIComponent(icon.split(',')[1]);
              const modifiedSvg = svgData.replace(/fill="[^"]*"/g, 'fill="white"')
                                        .replace(/stroke="[^"]*"/g, 'stroke="white"')
                                        .replace(/<svg([^>]*)>/, '<svg$1 style="color: white;">');
              icon = 'data:image/svg+xml;utf8,' + encodeURIComponent(modifiedSvg);
            } catch (e) {
              console.warn('Failed to modify SVG color:', e);
            }
          }
        } else {
          const def = iconSets[selectedIconInput.dataset.iconSet];
          if (def && def.fetchIcon) {
            const dataUrl = await def.fetchIcon(selectedIcon);
            if (dataUrl) {
              icon = dataUrl;
              
              // Apply same color modification for fetched SVGs
              if (icon.startsWith('data:image/svg+xml') && isDarkBackground()) {
                try {
                  const svgData = decodeURIComponent(icon.split(',')[1]);
                  const modifiedSvg = svgData.replace(/fill="[^"]*"/g, 'fill="white"')
                                            .replace(/stroke="[^"]*"/g, 'stroke="white"')
                                            .replace(/<svg([^>]*)>/, '<svg$1 style="color: white;">');
                  icon = 'data:image/svg+xml;utf8,' + encodeURIComponent(modifiedSvg);
                } catch (e) {
                  console.warn('Failed to modify fetched SVG color:', e);
                }
              }
            }
          }
        }
      } else {
        // For Material icons, just use the icon name - CSS will handle color
        icon = selectedIcon;
      }
    } else {
      // No icon selected and no favicon requested, use default bookmark icon
      icon = 'bookmark';
    }
  }

  bookmarks.push({ title, url, icon, iconSet: selectedIconInput.dataset.iconSet || 'material' });
  await saveBookmarks();
  renderBookmarks();

  titleInput.value = '';
  urlInput.value = '';
  iconFilter.value = '';
  useFaviconCheckbox.checked = false;
  // Clear any selected icon
  const selected = document.querySelector('.icon-item.selected');
  if (selected) selected.classList.remove('selected');
  addPopup.classList.add('hidden');
};

// Disable icon selection when favicon toggle is checked
useFaviconCheckbox.addEventListener('change', () => {
  const iconItems = document.querySelectorAll('.icon-item');
  if (useFaviconCheckbox.checked) {
    iconItems.forEach(item => {
      item.style.opacity = '0.5';
      item.style.pointerEvents = 'none';
    });
    // Clear any selection
    const selected = document.querySelector('.icon-item.selected');
    if (selected) selected.classList.remove('selected');
  } else {
    iconItems.forEach(item => {
      item.style.opacity = '';
      item.style.pointerEvents = '';
    });
  }
});

cancelBtn.onclick = () => {
  addPopup.classList.add('hidden');
};

// --- Search Engine Dropdown Logic ---
searchEngineBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  searchEngineDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  if (!searchEngineDropdown.classList.contains('hidden')) {
    searchEngineDropdown.classList.add('hidden');
  }
});

searchEngineDropdown.addEventListener('click', (e) => {
  const option = e.target.closest('.search-engine-option');
  if (option) {
    selectedSearchEngine = option.dataset.engine;
    const newLogoSrc = option.querySelector('img').src;
    searchEngineLogo.src = newLogoSrc;
    searchEngineDropdown.classList.add('hidden');
  }
});
// --- End Search Engine Dropdown Logic ---

searchBtn.addEventListener('click', () => {
  const input = searchInput.value.trim();
  const hasProtocol = /^https?:\/\//i.test(input);
  const looksLikeUrl = hasProtocol || /\./.test(input);
  let target;
  if (looksLikeUrl) {
    target = hasProtocol ? input : `https://${input}`;
  } else {
    const searchEngineUrl = searchEngines[selectedSearchEngine];
    target = `${searchEngineUrl}${encodeURIComponent(input)}`;
  }
  // Always send navigation request to host
  if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
    window.electronAPI.sendToHost('navigate', target);
    return;
  }
  // Fallback: post message to embedding page
  if (window.parent && typeof window.parent.postMessage === 'function') {
    window.parent.postMessage({ type: 'navigate', url: target }, '*');
    return;
  }
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchBtn.click();
});

function buildCategoryNav() {
  iconCategoryNav.innerHTML = '';
  const usedCategories = [...new Set(unifiedCatalog.map(e=>e.category))];
  iconCategories.filter(c=>usedCategories.includes(c.id)).forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-cat-btn';
    
    // Create icon element
    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined';
    iconSpan.textContent = cat.icon;
    
    // Create text element  
    const textSpan = document.createElement('span');
    textSpan.textContent = cat.label;
    
    btn.appendChild(iconSpan);
    btn.appendChild(textSpan);
    
    btn.onclick = () => {
      const target = document.getElementById(`section-${cat.id}`);
      if (target) {
        const top = target.offsetTop;
        iconGrid.scrollTo({ top: top - 4, behavior: 'smooth' });
        iconCategoryNav.querySelectorAll('.icon-cat-btn').forEach(b => b.classList.toggle('active', b === btn));
      }
    };
    iconCategoryNav.appendChild(btn);
  });
  setupSectionObserver();
}

function setupSectionObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
  const id = entry.target.id.replace('section-','');
  const cat = iconCategories.find(c=>c.id===id);
  if (!cat) return;
  iconCategoryNav.querySelectorAll('.icon-cat-btn').forEach(b => {
    const isActive = b.querySelector('span:last-child').textContent === cat.label;
    b.classList.toggle('active', isActive);
  });
      }
    });
  }, { root: iconGrid, threshold: 0, rootMargin: '0px 0px -85% 0px' });
  // Observe after grid populated
  const watch = () => {
    iconGrid.querySelectorAll('.icon-section-anchor').forEach(l => observer.observe(l));
  };
  // Re-run after each render
  const origRender = renderIconGrid;
  renderIconGrid = function(filter='') { origRender(filter); watch(); };
  watch();
}

// Load and render bookmarks immediately
(async () => {
  bookmarks = await loadBookmarks();
 
  setTimeout(() => {
    renderBookmarks();
  }, 100);
})();

// ---- Greeting / Clock / Weather widgets ----
function computeGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Good Night';
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function startClock() {
  const format = { hour: 'numeric', minute: '2-digit', hour12: true };
  const update = () => {
    const now = new Date();
    if (greetingEl) greetingEl.textContent = computeGreeting(now);
    if (clockEl) clockEl.textContent = now.toLocaleTimeString([], format);
  };
  // Initial draw
  update();
  // Align updates to the start of each minute
  const now = new Date();
  const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
  setTimeout(() => {
    update();
    setInterval(update, 60000);
  }, delay);
}

// Unit helpers
const WEATHER_UNIT_KEY = 'nebula-weather-unit'; // 'auto' | 'c' | 'f'
const COUNTRIES_FAHRENHEIT = new Set(['US','BS','KY','LR','PW','FM','MH']);
function useFahrenheit() {
  try {
    const pref = localStorage.getItem(WEATHER_UNIT_KEY);
    if (pref === 'c') return false; if (pref === 'f') return true;
  } catch {}
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || '';
    const region = loc.split('-')[1];
    return region ? COUNTRIES_FAHRENHEIT.has(region.toUpperCase()) : false;
  } catch { return false; }
}

function getPosition(timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('geolocation unavailable'));
    const opts = { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 };
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      opts
    );
  });
}

async function geoByIP() {
  // Try a couple of CORS-friendly IP services
  try {
    const r = await fetch('https://ipapi.co/json/');
    if (r.ok) {
      const j = await r.json();
      if (j && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
        return { lat: j.latitude, lon: j.longitude, city: j.city, country: j.country_code };
      }
    }
  } catch {}
  try {
    const r = await fetch('https://ipwho.is/');
    if (r.ok) {
      const j = await r.json();
      if (j && j.success && j.latitude && j.longitude) {
        return { lat: j.latitude, lon: j.longitude, city: j.city, country: j.country_code }; 
      }
    }
  } catch {}
  return null;
}

async function fetchOpenMeteo(lat, lon, fahrenheit) {
  const tUnit = fahrenheit ? 'fahrenheit' : 'celsius';
  const wUnit = fahrenheit ? 'mph' : 'kmh';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=${tUnit}&windspeed_unit=${wUnit}&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather fetch failed');
  const j = await r.json();
  return {
    temp: j?.current?.temperature_2m,
    wind: j?.current?.wind_speed_10m,
    code: j?.current?.weather_code,
    tUnit: fahrenheit ? '°F' : '°C',
    wUnit: fahrenheit ? 'mph' : 'km/h',
  };
}

function codeToSummary(code) {
  // Minimal Open‑Meteo WMO code mapping
  const m = new Map([
    [0,'Clear'], [1,'Mainly clear'], [2,'Partly cloudy'], [3,'Cloudy'],
    [45,'Fog'], [48,'Rime fog'], [51,'Drizzle'], [53,'Drizzle'], [55,'Drizzle'],
    [56,'Freezing drizzle'], [57,'Freezing drizzle'],
    [61,'Rain'], [63,'Rain'], [65,'Rain'],
    [66,'Freezing rain'], [67,'Freezing rain'],
    [71,'Snow'], [73,'Snow'], [75,'Snow'], [77,'Snow grains'],
    [80,'Showers'], [81,'Showers'], [82,'Heavy showers'],
    [85,'Snow showers'], [86,'Snow showers'],
    [95,'Thunderstorm'], [96,'Storm'], [99,'Severe storm']
  ]);
  return m.get(Number(code)) || 'Weather';
}

async function loadWeather() {
  if (!weatherEl) return;
  // Prefer an app-provided IPC source if available
  try {
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      const res = await window.electronAPI.invoke('get-weather');
      if (res && (res.temp || res.summary)) {
        const summaryText = res.summary || '';
        const tempText = typeof res.temp === 'number' ? `${Math.round(res.temp)}°` : '';
        const windText = res.wind ? ` · Wind ${Math.round(res.wind)} ${res.wUnit || 'km/h'}` : '';
        weatherEl.textContent = `${tempText}${summaryText ? ' · ' + summaryText : ''}${windText}`.trim() || '—';
        return;
      }
    }
  } catch (e) { console.warn('IPC weather failed', e); }

  try {
    // 1) Try browser geolocation
    let loc = null;
    try { loc = await getPosition(); } catch {}
    if (!loc) loc = await geoByIP();
    if (!loc) throw new Error('no location');
    const f = useFahrenheit();
    const data = await fetchOpenMeteo(loc.lat, loc.lon, f);
    const summary = codeToSummary(data.code);
    const temp = typeof data.temp === 'number' ? Math.round(data.temp) : data.temp;
    const wind = typeof data.wind === 'number' ? Math.round(data.wind) : data.wind;
    weatherEl.textContent = `${temp}${data.tUnit} · Wind ${wind} ${data.wUnit}`;
  } catch (err) {
    console.warn('Weather fetch failed', err);
    weatherEl.textContent = '—';
  }
}

startClock();
loadWeather();

// Refresh weather when unit preference changes
window.addEventListener('storage', (e) => {
  if (e && e.key === WEATHER_UNIT_KEY) {
    loadWeather();
  }
});

// ---- Home layout preferences ----
const HOME_SEARCH_Y_KEY = 'nebula-home-search-y';
const HOME_BOOKMARKS_Y_KEY = 'nebula-home-bookmarks-y';
const HOME_GLANCE_CORNER_KEY = 'nebula-home-glance-corner';
const HOME_GREETING_Y_KEY = 'nebula-home-greeting-y';

function applyHomeLayoutPrefs() {
  try {
    const root = document.documentElement;
  const greetY = Number(localStorage.getItem(HOME_GREETING_Y_KEY) || 12);
    const searchY = Number(localStorage.getItem(HOME_SEARCH_Y_KEY) || 22);
    const bmY = Number(localStorage.getItem(HOME_BOOKMARKS_Y_KEY) || 40);
  root.style.setProperty('--home-greeting-y', `${greetY}vh`);
    root.style.setProperty('--home-search-y', `${searchY}vh`);
    root.style.setProperty('--home-bookmarks-y', `${bmY}vh`);
    const corner = localStorage.getItem(HOME_GLANCE_CORNER_KEY) || 'br';
    if (glanceEl) {
      glanceEl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
      glanceEl.classList.add(`pos-${corner}`);
    }
  // Position edit controls at the opposite horizontal side of glance (X-only move)
  const oppositeHorizontal = (c) => ({ br:'bl', bl:'br', tr:'tl', tl:'tr' }[c] || 'tr');
  const editCorner = oppositeHorizontal(corner);
    [editBtn, editToolbar].forEach(ctrl => {
      if (!ctrl) return;
      ctrl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
      ctrl.classList.add(`pos-${editCorner}`);
    });
  } catch (e) { console.warn('applyHomeLayoutPrefs failed', e); }
}

applyHomeLayoutPrefs();

// React to settings updates via storage or host messages
window.addEventListener('storage', (e) => {
  if (!e) return;
  if ([HOME_SEARCH_Y_KEY, HOME_BOOKMARKS_Y_KEY, HOME_GLANCE_CORNER_KEY].includes(e.key)) {
    applyHomeLayoutPrefs();
  }
});

if (window.electronAPI && typeof window.electronAPI.on === 'function') {
  window.electronAPI.on('settings-update', (payload) => {
    if (!payload) return;
    if (payload.searchY != null) document.documentElement.style.setProperty('--home-search-y', `${payload.searchY}vh`);
    if (payload.bookmarksY != null) document.documentElement.style.setProperty('--home-bookmarks-y', `${payload.bookmarksY}vh`);
    if (payload.glanceCorner && glanceEl) {
      glanceEl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
      glanceEl.classList.add(`pos-${payload.glanceCorner}`);
      // Update edit controls to opposite horizontal side (X-only)
      const oppositeHorizontal = (c) => ({ br:'bl', bl:'br', tr:'tl', tl:'tr' }[c] || 'tr');
      const editCorner = oppositeHorizontal(payload.glanceCorner);
      [editBtn, editToolbar].forEach(ctrl => {
        if (!ctrl) return;
        ctrl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
        ctrl.classList.add(`pos-${editCorner}`);
      });
    }
  });
}

// ---- Edit mode drag support ----
let editMode = false;
let snapshot = null; // stores values before edits
function setEditMode(on) {
  editMode = !!on;
  document.body.classList.toggle('edit-mode', editMode);
  if (editBtn) editBtn.setAttribute('aria-pressed', String(editMode));
  if (editToolbar) editToolbar.hidden = !editMode;
  if (editMode) {
    // Take a snapshot of current persisted values
    snapshot = {
  greetY: Number(localStorage.getItem('nebula-home-greeting-y') || 12),
      searchY: Number(localStorage.getItem('nebula-home-search-y') || 22),
      bmY: Number(localStorage.getItem('nebula-home-bookmarks-y') || 40),
      corner: localStorage.getItem('nebula-home-glance-corner') || 'br',
      showGreeting: localStorage.getItem('nebula-show-greeting') !== 'false',
      showBookmarks: localStorage.getItem('nebula-show-bookmarks') !== 'false',
      showGlance: localStorage.getItem('nebula-show-glance') !== 'false'
    };
    // Initialize toggles to snapshot values
    if (toggleShowGreeting) toggleShowGreeting.checked = snapshot.showGreeting;
    if (toggleShowBookmarks) toggleShowBookmarks.checked = snapshot.showBookmarks;
    if (toggleShowGlance) toggleShowGlance.checked = snapshot.showGlance;
  } else {
    snapshot = null;
  }
}

if (editBtn) {
  editBtn.addEventListener('click', () => setEditMode(!editMode));
}

function vhFromPx(px) { return (px / window.innerHeight) * 100; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// Visibility helpers
function applyVisibilityFromStorage() {
  const showGreeting = localStorage.getItem('nebula-show-greeting') !== 'false';
  const showBookmarks = localStorage.getItem('nebula-show-bookmarks') !== 'false';
  const showGlance = localStorage.getItem('nebula-show-glance') !== 'false';
  if (greetingEl) greetingEl.classList.toggle('is-hidden', !showGreeting);
  if (topSitesEl) topSitesEl.classList.toggle('is-hidden', !showBookmarks);
  if (glanceEl) glanceEl.classList.toggle('is-hidden', !showGlance);
}

applyVisibilityFromStorage();

function makeDragY(el, storageKey, cssVar) {
  if (!el) return;
  let startY = 0; let startTopVh = 0; let dragging = false;
  // Cache geometry at drag start for consistent clamping in px
  let startRectTopPx = 0; let elHeightPx = 0; const MARGIN_PX = 12;
  const onDown = (ev) => {
    if (!editMode) return; dragging = true;
    const p = ev.touches ? ev.touches[0] : ev;
    startY = p.clientY;
    // current computed var (in vh)
    const current = Number((getComputedStyle(document.documentElement).getPropertyValue(cssVar) || '0vh').replace('vh',''));
    startTopVh = isNaN(current) ? 0 : current;
    // snapshot element geometry
    const rect = el.getBoundingClientRect();
    startRectTopPx = rect.top;
    elHeightPx = rect.height;
    ev.preventDefault();
  };
  const onMove = (ev) => {
    if (!dragging) return;
    const p = ev.touches ? ev.touches[0] : ev;
    const deltaPx = p.clientY - startY;
    // Clamp so the element stays within the viewport with a small margin
    const minTopPx = MARGIN_PX;
    const maxTopPx = Math.max(minTopPx, window.innerHeight - MARGIN_PX - elHeightPx);
    const desiredTopPx = startRectTopPx + deltaPx;
    const clampedTopPx = clamp(desiredTopPx, minTopPx, maxTopPx);
    const clampedDeltaPx = clampedTopPx - startRectTopPx;
    const deltaVh = vhFromPx(clampedDeltaPx);
    const nextVh = startTopVh + deltaVh;
    document.documentElement.style.setProperty(cssVar, `${nextVh}vh`);
  };
  const onUp = () => {
    if (!dragging) return; dragging = false;
    // Don't persist here; only on Save. Values still applied via CSS var.
  };
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive:false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive:false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

function makeDragGlance(el) {
  if (!el) return;
  let dragging = false; let start;
  const onDown = (ev) => {
    if (!editMode) return; dragging = true; el.classList.add('dragging');
    const p = ev.touches?ev.touches[0]:ev; start = { x:p.clientX, y:p.clientY };
    // reset any prior drag offsets
    el.style.setProperty('--drag-x','0px'); el.style.setProperty('--drag-y','0px');
    ev.preventDefault();
  };
  const onMove = (ev) => {
    if (!dragging) return; const p = ev.touches?ev.touches[0]:ev;
    const dx = p.clientX - start.x; const dy = p.clientY - start.y;
    el.style.setProperty('--drag-x', `${dx}px`);
    el.style.setProperty('--drag-y', `${dy}px`);
  };
  const onUp = (ev) => {
    if (!dragging) return; dragging = false; el.classList.remove('dragging');
    el.style.removeProperty('--drag-x'); el.style.removeProperty('--drag-y');
    const p = ev.changedTouches?ev.changedTouches[0]:ev;
    const x = p.clientX; const y = p.clientY;
    // snap to nearest corner
    const left = x < window.innerWidth/2;
    const top = y < window.innerHeight/2;
    const corner = top ? (left ? 'tl' : 'tr') : (left ? 'bl' : 'br');
    // Only store corner on Save; temporarily apply class for preview
    if (glanceEl) {
      glanceEl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
      glanceEl.classList.add(`pos-${corner}`);
      // Stash pending corner choice on the element during edit mode
      glanceEl.dataset.pendingCorner = corner;
    }
    // Also move edit controls to opposite corner during preview
    const opposite = (c) => ({ br:'tl', bl:'tr', tr:'bl', tl:'br' }[c] || 'tl');
    const editCorner = opposite(corner);
    [editBtn, editToolbar].forEach(ctrl => {
      if (!ctrl) return;
      ctrl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
      ctrl.classList.add(`pos-${editCorner}`);
    });
  };
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive:false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive:false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

makeDragY(searchContainerEl, 'nebula-home-search-y', '--home-search-y');
makeDragY(topSitesEl, 'nebula-home-bookmarks-y', '--home-bookmarks-y');
makeDragGlance(glanceEl);
// Restore greeting to Y-only drag
makeDragY(greetingTitleEl, 'nebula-home-greeting-y', '--home-greeting-y');

// Keep draggable blocks within viewport on resize
function keepVisibleWithinViewport() {
  const root = document.documentElement;
  const adjust = (el, cssVar) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const MARGIN_PX = 12;
    const minTopPx = MARGIN_PX;
    const maxTopPx = Math.max(minTopPx, window.innerHeight - MARGIN_PX - rect.height);
    let topPx = rect.top;
    if (topPx < minTopPx || topPx > maxTopPx) {
      const currentVh = Number((getComputedStyle(root).getPropertyValue(cssVar) || '0vh').replace('vh','')) || 0;
      // Compute how far to move (px) to bring within range, then convert to vh and adjust var
      const targetTopPx = clamp(topPx, minTopPx, maxTopPx);
      const deltaPx = targetTopPx - topPx;
      const nextVh = currentVh + vhFromPx(deltaPx);
      root.style.setProperty(cssVar, `${nextVh}vh`);
    }
  };
  adjust(greetingTitleEl, '--home-greeting-y');
  adjust(searchContainerEl, '--home-search-y');
  adjust(topSitesEl, '--home-bookmarks-y');
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(keepVisibleWithinViewport, 80);
});

// Toggle handlers (search cannot be hidden)
function bindVisibilityToggles() {
  if (toggleShowGreeting) toggleShowGreeting.addEventListener('change', () => {
    const val = toggleShowGreeting.checked;
    if (greetingEl) greetingEl.classList.toggle('is-hidden', !val);
  });
  if (toggleShowBookmarks) toggleShowBookmarks.addEventListener('change', () => {
    const val = toggleShowBookmarks.checked;
    if (topSitesEl) topSitesEl.classList.toggle('is-hidden', !val);
  });
  if (toggleShowGlance) toggleShowGlance.addEventListener('change', () => {
    const val = toggleShowGlance.checked;
    if (glanceEl) glanceEl.classList.toggle('is-hidden', !val);
  });
}

bindVisibilityToggles();

// Save/Cancel handlers
if (saveEditBtn) saveEditBtn.addEventListener('click', () => {
  // Persist current CSS variable values and pending corner
  const rootStyle = getComputedStyle(document.documentElement);
  const getVh = (v) => Math.round(Number((v || '0vh').replace('vh','')));
  const gy = getVh(rootStyle.getPropertyValue('--home-greeting-y'));
  const sy = getVh(rootStyle.getPropertyValue('--home-search-y'));
  const by = getVh(rootStyle.getPropertyValue('--home-bookmarks-y'));
  try {
    localStorage.setItem('nebula-home-greeting-y', String(gy));
    localStorage.setItem('nebula-home-search-y', String(sy));
    localStorage.setItem('nebula-home-bookmarks-y', String(by));
  // Persist visibility
  if (toggleShowGreeting) localStorage.setItem('nebula-show-greeting', String(!!toggleShowGreeting.checked));
  if (toggleShowBookmarks) localStorage.setItem('nebula-show-bookmarks', String(!!toggleShowBookmarks.checked));
  if (toggleShowGlance) localStorage.setItem('nebula-show-glance', String(!!toggleShowGlance.checked));
  } catch {}
  const corner = glanceEl?.dataset?.pendingCorner || localStorage.getItem(HOME_GLANCE_CORNER_KEY) || 'br';
  try { localStorage.setItem(HOME_GLANCE_CORNER_KEY, corner); } catch {}
  if (glanceEl) delete glanceEl.dataset.pendingCorner;
  setEditMode(false);
  // Re-apply from saved storage to ensure consistent state after exiting edit mode
  applyVisibilityFromStorage();
});

if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => {
  // Revert CSS vars and glance corner to snapshot
  if (snapshot) {
  document.documentElement.style.setProperty('--home-greeting-y', `${snapshot.greetY}vh`);
    document.documentElement.style.setProperty('--home-search-y', `${snapshot.searchY}vh`);
    document.documentElement.style.setProperty('--home-bookmarks-y', `${snapshot.bmY}vh`);
    if (glanceEl) {
      glanceEl.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
      glanceEl.classList.add(`pos-${snapshot.corner}`);
      delete glanceEl.dataset.pendingCorner;
    }
  } else {
    applyHomeLayoutPrefs();
  }
  setEditMode(false);
  // Revert visibility to snapshot
  if (snapshot) {
    if (greetingEl) greetingEl.classList.toggle('is-hidden', !snapshot.showGreeting);
    if (topSitesEl) topSitesEl.classList.toggle('is-hidden', !snapshot.showBookmarks);
    if (glanceEl) glanceEl.classList.toggle('is-hidden', !snapshot.showGlance);
    if (toggleShowGreeting) toggleShowGreeting.checked = snapshot.showGreeting;
    if (toggleShowBookmarks) toggleShowBookmarks.checked = snapshot.showBookmarks;
    if (toggleShowGlance) toggleShowGlance.checked = snapshot.showGlance;
  } else {
    applyVisibilityFromStorage();
  }
});
