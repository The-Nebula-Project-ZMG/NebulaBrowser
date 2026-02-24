# Nebula Plugins (Early Preview)

This document explains how to build simple plugins for Nebula. The initial API is intentionally small and will grow with feedback.

## Overview

- Plugins live under either of these folders:
  - App folder: `<app>/plugins/<plugin-id>/`
  - User folder: `%APPDATA%/Nebula/plugins/<plugin-id>/` (Windows) – preferred for user-installed plugins.
- Each plugin has a `plugin.json` manifest. Optional `main.js` runs in the main process. Optional `renderer-preload.js` runs in the renderer preload context and can expose safe APIs via `contextBridge`.
- Plugins are loaded on app start. Toggle a plugin by setting `"enabled": false` in its manifest.

## Manifest (plugin.json)

Example:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "What it does",
  "main": "main.js",
  "rendererPreload": "renderer-preload.js",
  "categories": ["Search", "Productivity"],
  "authors": ["Jane Doe", { "name": "Acme Labs", "email": "oss@acme.example" }],
  "enabled": true
}
```

Fields:
- id: Unique id. Defaults to folder name if omitted.
- main: Optional entry for main process integration.
- rendererPreload: Optional file injected into the preload. Use it to expose a safe surface to the page.
- categories: Optional string or array of strings used for organizing/filtering plugins in UI and APIs. Example: ["AI", "Utilities"].
- authors: Optional string or array of strings/objects describing authors. Objects support { name, email, url }. In APIs/UI, names are displayed.
- enabled: Defaults to true.

## Main process API (activate)

If `main` is present, export an `activate(ctx)` function. The `ctx` contains:
- Electron: `app`, `BrowserWindow`, `ipcMain`, `session`, `Menu`, `dialog`, `shell`
- paths: `{ appPath, userData, pluginDir }`
- log/warn/error: prefix logs with your plugin id
- on(event, cb): subscribe to lifecycle events (experimental)
- registerIPC(channel, handler): quickly expose an `ipcMain.handle`
- registerWebRequest(filter, listener): attach `session.webRequest.onBeforeRequest`

Example:

module.exports.activate = (ctx) => {
  ctx.log('hello');
  ctx.registerIPC('my-plugin:do', async (_evt, payload) => ({ ok: true }));
  ctx.registerWebRequest({ urls: ['*://*/*'] }, (details) => ({ cancel: false }));
};

## Renderer preload API

If `rendererPreload` is present, it will be `require()`-d from the app preload. You can use `contextBridge` to expose a safe surface to the page:

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('myPlugin', {
  hello: () => ipcRenderer.invoke('my-plugin:do'),
});

Your exposed API will be available on `window.myPlugin` in `renderer/` code (e.g., `script.js`).

## Sample plugin

A working sample is included at `plugins/sample-hello/`:
- Adds menu item "Say Hello (Sample Plugin)" under Help.
- Exposes `window.sampleHello.ping()` and `window.sampleHello.onHello(cb)`.

Try it from the DevTools console:

await window.sampleHello.ping();
window.sampleHello.onHello((m) => console.log('got hello', m));

Click Help -> Say Hello (Sample Plugin) to see the message delivered to the page.

## Loading order and safety

- Plugins load after the app is ready. Renderer preloads run after Nebula's own preload has exposed its APIs.
- Context isolation stays enabled. Only data explicitly exposed via `contextBridge` is available to pages.
- Avoid long blocking work in plugin activation.

## Debugging

- See logs with a `[Plugin:<id>]` prefix in the app console.
- Temporarily disable a plugin by setting `enabled: false` in `plugin.json`.

## Roadmap

This is a first pass. Planned next:
- Enable plugin settings UI
- Hot reload/reload button
- More lifecycle hooks (tab events, context menu contributions)
- Theming hooks
