# NEBULA BROWSER

*A controller-first browser, now re-focused as a Linux-first project*

---

### Limited Development • Project in Maintenance Mode 

Nebula Browser is no longer under active, full-time development.
The project is maintained on an occasional basis, with updates made when time and interest allow.

---

# Nebula

![Nebula Logo](assets/images/Logos/Nebula-Logo.svg)

Nebula is a customizable and privacy-focused web browser built with Electron. It is designed to be lightweight, secure, and user-friendly, with a strong emphasis on **controller-first and keyboard-driven interaction**, performance, and privacy.

While originally conceived for SteamOS and the Steam Deck, Nebula has since evolved into a **Linux-first experimental browser**, aimed at alternative input setups, handheld PCs, accessibility use cases, and living room environments.

---

## Project Status

**Status:** Maintenance Mode
**Maintenance:** Occasional updates
**Development:** No active roadmap
**Focus:** Linux-first (desktop, handhelds, and alternative input setups)

Nebula is not a primary or actively scheduled project. Updates may occur sporadically and are not guaranteed. The repository remains open for use, modification, and experimentation under the MIT license.

This repository reflects a stable snapshot of the project, with incremental improvements added when appropriate.

---

## Why the Project Changed Direction

Nebula was originally created with a very specific goal: to be a **controller-first browser designed to live inside the Steam ecosystem**, especially for Steam Deck and SteamOS users who wanted a seamless web experience without relying on desktop mode, keyboards, or external workarounds.

During the Steam review process, Valve determined that Nebula does not fit within Steam’s allowed categories for non-game software. As a result, the browser could not be distributed on the Steam Store.

At the time, Steam distribution was considered a core pillar of the project, and development was paused as the original vision could no longer be fulfilled in its intended form.

Since then, community feedback has highlighted broader interest in Nebula’s **input model and interaction design**, beyond Steam or SteamOS alone. Because of this, Nebula has been re-contextualized as a Linux-first project rather than a Steam-native application.

---

## What This Means Now

* Nebula is **not abandoned**
* It is **no longer a main or priority project**
* Development happens **occasionally and without a fixed schedule**
* The project is no longer tied to Steam or SteamOS
* Linux desktop users, handhelds, and alternative input setups are the primary audience

Nebula exists as an ongoing experiment in controller- and keyboard-driven web navigation. It may evolve further, remain stable, or inspire forks and derivative projects.

---

## Distribution

Nebula may be distributed outside of Steam through platforms such as:

* GitHub (source and releases)
* itch.io
* Flatpak / Flathub

Availability and packaging may change over time and are not guaranteed.

---

## Licensing

Nebula Browser is licensed under the MIT License.
You are free to use, modify, and build upon the project.



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
