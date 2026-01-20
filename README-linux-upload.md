# Linux / SteamOS Build Upload Guide (SteamCMD)

This guide explains how to upload the **Linux / SteamOS** build of Nebula Browser to Steam using **SteamCMD**. It is tailored to the current project layout on Steam Deck / Linux.

---

## App & Depot IDs

* **App ID:** 4290110
* **Windows Depot:** 4290111
* **Linux / SteamOS Depot:** 4290112

This guide covers **Linux only (4290112)**.

---

## Current Folder Layout

Home directory layout expected by this guide:

```
/home/deck/
├── steamcmd/
│   └── steamcmd.sh
└── steam_build/
    ├── Nebula_SteamOS/
    │   ├── nebula-browser
    │   └── ...other runtime files...
    ├── output/
    └── app_4290110.vdf
```

---

## Step 1: Verify Executable Permissions

The main Linux binary **must** be executable.

```bash
cd ~/steam_build/Nebula_SteamOS
ls -la
```

Identify the main binary (for example `nebula-browser`) and run:

```bash
chmod +x nebula-browser
```

Optional quick test:

```bash
./nebula-browser
```

---

## Step 2: App Build VDF Configuration

Ensure `app_4290110.vdf` exists at:

```
/home/deck/steam_build/app_4290110.vdf
```

Its contents should be **exactly**:

```
"AppBuild"
{
  "AppID" "4290110"
  "Desc" "Nebula SteamOS build"
  "BuildOutput" "output/"
  "ContentRoot" "."
  "Preview" "0"

  "Depots"
  {
    "4290112"
    {
      "FileMapping"
      {
        "LocalPath" "Nebula_SteamOS/*"
        "DepotPath" "."
        "recursive" "1"
      }
    }
  }
}
```

Notes:

* `ContentRoot "."` maps to `/home/deck/steam_build`
* `Nebula_SteamOS/*` uploads everything inside that folder
* Depot **4290112** is the Linux / SteamOS depot

---

## Step 3: Launch SteamCMD

```bash
cd ~/steamcmd
./steamcmd.sh
```

You should now see:

```
Steam>
```

---

## Step 4: Log In

Inside SteamCMD:

```
login YOUR_STEAM_USERNAME
```

If Steam Guard is enabled, enter the code when prompted.

---

## Step 5: Upload the Linux Build

Inside SteamCMD, run **with full path** (no `~`):

```
run_app_build /home/deck/steam_build/app_4290110.vdf
```

Expected behavior:

* Content scan starts
* Files upload to depot 4290112
* A **BuildID** is printed on success

---

## Step 6: Exit SteamCMD

```
quit
```

---

## Step 7: Assign Build to a Branch (Required)

After upload completes:

1. Open **Steamworks**
2. Go to **Nebula Browser → Builds**
3. Find the new Build ID
4. Assign it to a branch (`internal`, `beta`, or `default`)

If this step is skipped, Steam Deck installs **0 bytes** even though upload succeeded.

---

## Common Issues

### App build file does not exist

* SteamCMD does **not** expand `~`
* Always use `/home/deck/...` absolute paths

### 0 bytes uploaded

* `LocalPath` is wrong
* Build not assigned to a branch
* Executable missing or filtered out

### Build installs but does not launch

* Binary not executable
* Missing runtime libraries
* Incorrect launch configuration in Steamworks

---

## Logs

If something fails, check:

```bash
tail -n 200 /home/deck/.local/share/Steam/logs/stderr.txt
tail -n 200 /home/deck/.local/share/Steam/logs/bootstrap_log.txt
```

---

## Notes for Steam Deck

* Test in **Desktop Mode** first
* Then test in **Gaming Mode**
* Steam Input and sandboxing differ between modes
* Avoid absolute paths inside the app

---

## Status

This process uploads **Linux / SteamOS depot 4290112 only**.
Windows builds should be uploaded separately using depot **4290111**.
