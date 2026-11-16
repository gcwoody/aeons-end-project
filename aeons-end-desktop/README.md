# Windows Desktop Client and Share Archive

This is the Windows 10/11 desktop client plus a portable browser launcher for Windows 7. `npm run package:share` creates one ZIP archive with both launchers at its root and one shared copy of the game and image files. Electron is built as a single portable executable, so its runtime DLLs are not scattered through the extracted folder.

## Build the share archive

From `aeons-end-desktop/` on Windows, run:

```powershell
npm ci
npm run package:share
```

The command builds the local game, packages the Electron shell, assembles the dual-launcher folder, and creates:

```text
out/Aeons-End-Digital-Windows-x64.zip
```

The archive root contains `AeonsEnd.exe`, `Play Aeon's End Demo.cmd`, `START-HERE.txt`, the launcher scripts, `local-demo-site/`, and `image-database/`. The Electron runtime is packed into the single executable. Images are included once and shared by both launch methods. Test-time `profile/` data is deliberately excluded from the archive.

## Player instructions

1. Extract the entire ZIP to a writable folder. Do not launch files from inside the ZIP preview. For Windows 7, use a short path such as `C:\Games\AeonsEnd` and avoid deeply nested folders.
2. On Windows 10/11, double-click `AeonsEnd.exe` to open the local Electron game window.
3. On Windows 7, double-click `Play Aeon's End Demo.cmd` to check/download changed game files and open the local game in the browser. Keep its command window open while playing.
4. The CMD updater follows the `friend-preview` branch on GitHub. The local manifest includes its build time; a legacy or older remote manifest cannot replace a newer packaged game. If GitHub is unreachable but a complete local game is present, the launcher starts that copy. To publish future CMD updates, rebuild the local game and commit the generated `local-demo-site/` and version 2 `local-update-manifest.tsv` to `friend-preview`.

Both launchers use the files in the extracted folder. Keep the complete folder together. Electron saves its local browser profile under `profile/` beside `AeonsEnd.exe`; preserve that directory when replacing the executable to retain saves. The browser launcher stores saves in the selected browser under the stable local address.

The Windows executable is unsigned, so Windows may show an unknown-publisher or SmartScreen warning.

For the repeatable update and release steps, see [RELEASE-MAINTENANCE.md](RELEASE-MAINTENANCE.md).

## Update the icon

Replace `assets/cover.png`, then run this from `aeons-end-desktop/` in Windows PowerShell:

```powershell
.\create-icon.ps1
```

Rebuild the Windows package after changing the source image.
