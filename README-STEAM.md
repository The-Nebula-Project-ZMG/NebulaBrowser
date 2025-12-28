Converting extracted AppImage (`squashfs-root`) into a distributable AppDir for Steam

If your environment lacks `rsync`, use `cp -a` to copy the extracted AppImage into a clean AppDir and prepare it for upload to Steam.

1) Copy the extracted AppImage to an AppDir folder
```bash
cp -a squashfs-root/ nebula-appdir
```

2) Unpack `app.asar` to edit or include app sources (optional; requires `npx asar`)
```bash
cd nebula-appdir/resources
npx asar extract app.asar app
# keep a backup if you want
mv app app.orig && rm app.asar
cd ../../
```

3) Add/verify launcher (we added `nebula-appdir/Nebula`):
```bash
chmod +x nebula-appdir/Nebula
```
Run locally:
```bash
cd nebula-appdir
./Nebula
```

4) Ensure binary & permissions are correct
```bash
chmod +x nebula-appdir/nebula
```

5) Package or upload to Steam
- Create a tarball to upload as game files, or upload the AppDir contents as the depot.
```bash
tar -czf nebula-appdir.tar.gz -C nebula-appdir .
```
- In Steamworks, set the launch command to `./Nebula` (or `./nebula`).

Notes
- `--no-sandbox` reduces Chromium sandboxing; prefer fixing `chrome-sandbox` and enabling sandboxing when possible.
- Using the AppDir avoids AppImage/FUSE dependency on target systems.
- Test on a clean SteamOS/Deck image before publishing.

Big Picture auto-start (SteamOS Gaming Mode)
- If Nebula is launched from SteamOS Gaming Mode, it will auto-start in Big Picture Mode.
- To force/disable via Steam Launch Options: `--big-picture` or `--no-big-picture`.
