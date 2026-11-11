# Windows Desktop Client

This is the Windows 10/11 desktop launcher for Aeon's End Digital. The current portable prototype opens the locally packaged game in an Electron window. It does not yet check for or install game updates.

## Build

From the repository root, build the local game site and then package the desktop client:

```powershell
cd aeons-end-ui
npm run build:local-demo

cd ..\aeons-end-desktop
npm ci
npm run package:win
```

The Windows x64 output is written to `out/win-unpacked/`.

## Launch and distribute

- Double-click `out/win-unpacked/AeonsEnd.exe` to launch the game. Its executable icon and the Electron window icon use `assets/app-icon.ico`, generated from `assets/cover.png`.
- Keep the complete `win-unpacked` directory together. The executable depends on the adjacent `resources/`, local game site, and image database; do not distribute only `AeonsEnd.exe`.
- To share a portable build, compress the complete `win-unpacked` directory and have players extract it to a writable folder before launching it.
- The current executable is unsigned. Windows may identify it as an unknown publisher.

## Update the icon

Replace `assets/cover.png`, then run this from `aeons-end-desktop/` in Windows PowerShell:

```powershell
.\create-icon.ps1
```

Rebuild the Windows package after changing the source image.
