# NEBULA BROWSER

*A controller-first browser originally designed for SteamOS*

---

### ⚠️ Final Release • Project Archived ⚠️

Nebula Browser has reached end of support and is no longer under active development.
This repository represents the final archived state of the project.

---

# Nebula

![Nebula Logo](assets/images/Logos/Nebula-Logo.svg)

Nebula is a customizable and privacy-focused web browser built with Electron. It was designed to be a lightweight, secure, and user-friendly browser with a strong emphasis on controller-first interaction, performance, and privacy.

---

## Project Status

**Status:** Archived
**Maintenance:** Ended
**Future Updates:** None planned

Nebula is no longer actively maintained. The source code remains available for reference, learning, and archival purposes.

---

## Why Nebula Was Archived

Nebula was created with a very specific goal in mind: to be a **controller-first browser that lived inside the Steam ecosystem**, particularly for Steam Deck and SteamOS users who wanted a web experience without relying on desktop mode, keyboards, or external workarounds.

During the Steam review process, Valve determined that Nebula does not fit within Steam’s allowed categories for non-game software. As a result, the application was permanently retired from Steam and cannot be distributed on the platform.

While Nebula can function as a desktop browser, distributing it outside of Steam fundamentally changes the experience it was designed to provide. Requiring third-party installation methods or desktop mode defeats the core problem Nebula was built to solve.

Rather than ship a compromised version that no longer aligns with its original purpose, the decision was made to formally conclude development and archive the project.

This repository preserves Nebula in its final state as a complete exploration of controller-first browser design.

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

## License

This project is licensed under the MIT License. [Read More](documentation/MIT.md)


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
