# NEBULA BROWSER

*A controller-first browser originally designed for SteamOS*

---

### ⏸️ Development Paused • Project in Dormant State ⏸️

Nebula Browser is not under active development at this time.
The project is currently in a dormant state, with the code preserved and available.

---

# Nebula

![Nebula Logo](assets/images/Logos/Nebula-Logo.svg)

Nebula is a customizable and privacy-focused web browser built with Electron. It was designed to be lightweight, secure, and user-friendly, with a strong emphasis on **controller-first interaction**, performance, and privacy, particularly for handheld PCs and living room setups.

---

## Project Status

**Status:** Dormant
**Maintenance:** No active maintenance
**Development:** Paused
**Future Updates:** No active roadmap

Nebula is not currently being worked on, but the source code remains available for use, modification, and experimentation under the MIT license.

This repository reflects a stable snapshot of the project as it exists today.

---

## Why Development Is Paused

Nebula was created with a very specific goal: to be a **controller-first browser designed to live inside the Steam ecosystem**, especially for Steam Deck and SteamOS users who wanted a seamless web experience without relying on desktop mode, keyboards, or external workarounds.

During the Steam review process, Valve determined that Nebula does not fit within Steam’s allowed categories for non-game software. As a result, the browser could not be distributed on the Steam Store.

While Nebula can function as a desktop browser, distributing it outside of Steam fundamentally changes the experience it was designed to provide. Requiring third-party installation methods or desktop workflows compromises the original problem Nebula was built to solve.

Rather than continue active development in a direction that no longer aligned with that original vision, the project was placed into a dormant state.

---

## What This Means

* Nebula is **not deleted or abandoned**
* The codebase remains open and accessible
* Community use, forks, and experimentation are welcome
* There is currently **no commitment** to future updates

If the ecosystem, platform landscape, or community interest meaningfully changes in the future, the project’s status can be reassessed. Until then, Nebula stands as a complete exploration of controller-first browser design.

---

## Licensing

Nebula Browser is licensed under the MIT License.
You are free to use, modify, and build upon the project.

---


## Features

*   **Privacy Control:** Easily clear your browsing data (history, cookies, cache, local storage, and more).
*   **Tab Management:** Open new tabs, pop a tab out into a new window, and manage them efficiently.
*   **Bookmarks:** Save your favorite sites with automatic backup on save.
*   **History:** Keeps track of your browsing and search history with one-click clear.
*   **Downloads Manager:** Track downloads, pause/resume/cancel, and open or reveal completed files.
*   **Context Menu:** Native right‑click menu with Back/Forward/Reload, open/download links, image actions, and Inspect Element.
*   **Auth Compatibility:** Improved OAuth/SSO & WebAuthn support (popup windows enabled where needed).
*   **Performance Monitoring:** Built-in tools to monitor app performance and force GC when needed.
*   **GPU Acceleration Control:** Diagnostics and safe fallbacks to troubleshoot rendering issues.
*   **Themes & Customization:** Built-in themes and live editor to craft your own.
*   **Plugins:** Extend Nebula with custom or community plugins via a simple plugin API.
*   **Cross-Platform:** Runs on Windows, macOS, and Linux.

[**Learn more about Nebula's features.**](documentation/FEATURES.md)

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) installed.

### Installation

1.  Clone the repository:
    ```sh
    git clone https://github.com/Bobbybear007/NebulaBrowser.git
    ```
2.  Navigate to the project directory:
    ```sh
    cd NebulaBrowser
    ```
3.  Install dependencies:
    ```sh
    npm install
    ```

### Running the Application

To start the browser, run the following command:

```sh
npm start
```

## Building the Application

To build the application for your platform, run:

```sh
npm run dist
```

This will create a distributable file in the `dist` directory.

Tip (Windows): If you encounter GPU issues, try starting with `start-gpu-safe.bat` to launch in a safer rendering mode.

## Project Structure

An overview of the project's structure. For a more detailed explanation, please see the [Project Structure documentation](documentation/PROJECT_STRUCTURE.md).

-   `main.js`: The main entry point for the Electron application.
-   `renderer/`: Contains all the front-end files.
-   `preload.js`: Bridges the main and renderer processes.
-   `performance-monitor.js`: Module for monitoring performance.
-   `gpu-config.js` & `gpu-fallback.js`: Modules for managing GPU settings.
-   `assets/`: Contains static assets.
-   `documentation/`: Contains additional documentation.
-   `plugins/`: Sample plugins and scaffolding for developing your own.

## Core Concepts

Nebula is built on several core concepts that are essential to understanding how it works. For a deeper dive, read the [Core Concepts documentation](documentation/CORE_CONCEPTS.md).

-   **Main and Renderer Processes**
-   **Inter-Process Communication (IPC)**
-   **Performance and GPU Management**

## Contributing

Contributions are welcome! Please read our [contributing guidelines](documentation/CONTRIBUTING.md) to get started.

## Technologies Used

*   [Electron](https://www.electronjs.org/)
*   HTML, CSS, JavaScript




## Documentation

* [MIT License](documentation/MIT.md)
* [GPU Fix](documentation/GPU-FIX-README.md)
* [Features](documentation/FEATURES.md)
* [Customization](documentation/Customization.md)
* [Project Structure](documentation/PROJECT_STRUCTURE.md)
* [Core Concepts](documentation/CORE_CONCEPTS.md)
* [Contributing Guide](documentation/CONTRIBUTING.md)
* [OAuth Debug](documentation/oauth-debug.md)
* [Plugins Guide](README-PLUGINS.md)
