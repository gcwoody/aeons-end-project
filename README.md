# Aeon's End Digital Demo

## 中文

这是《Aeon's End》的非官方网页试玩版。目前由一名玩家控制两位 Mage，共同对抗 Nemesis。

在线游玩：[打开试玩页面](https://aeons-end-demo.xiaoas.xyz/)。

### Windows 本地游玩

1. [下载最新 friend-preview 项目压缩包](https://github.com/gcwoody/aeons-end-project/archive/refs/heads/friend-preview.zip)，并解压全部文件。
2. 双击项目根目录中的 `Play Aeon's End Demo.cmd`。
3. 首次启动会检查并下载缺少或有变化的游戏文件。之后每次启动都会检查更新，只下载有变化的文件；如果暂时无法联网，会尝试启动本地已有版本。
4. 游戏会自动在浏览器中打开。游玩时请保留弹出的命令窗口；关闭窗口即可停止游戏。

启动游戏不需要安装 Node.js 或 npm。卡牌图片从本地文件读取，以加快加载速度。存档保存在当前浏览器中。

已经下载过旧版本的玩家无需重新下载图片包：请分别下载最新的 [CMD 启动器](https://raw.githubusercontent.com/gcwoody/aeons-end-project/friend-preview/Play%20Aeon%27s%20End%20Demo.cmd) 和 [更新脚本](https://raw.githubusercontent.com/gcwoody/aeons-end-project/friend-preview/update-local-demo.ps1)，将它们放进已有项目根目录（替换旧 CMD），再运行启动器。后续启动会跟随 `friend-preview` 分支更新。

## English

This is an unofficial browser demo of *Aeon's End*. One player controls both Mages as they work together to defeat a Nemesis.

Play online: [Open the demo](https://aeons-end-demo.xiaoas.xyz/).

### Play locally on Windows

1. [Download the latest friend-preview project ZIP](https://github.com/gcwoody/aeons-end-project/archive/refs/heads/friend-preview.zip) and extract all files.
2. Double-click `Play Aeon's End Demo.cmd` in the project folder.
3. On first launch, the updater checks for missing or changed game files. Later launches download only changed files. If the network is unavailable, it tries to start the installed version.
4. The game opens in your browser. Keep the command window open while you play; close it to stop the game.

You do not need to install Node.js or npm. Card images load from local files for faster access. Saves are stored in your browser.

Players with an older local copy do not need to download the image package again. Download the latest [CMD launcher](https://raw.githubusercontent.com/gcwoody/aeons-end-project/friend-preview/Play%20Aeon%27s%20End%20Demo.cmd) and [updater script](https://raw.githubusercontent.com/gcwoody/aeons-end-project/friend-preview/update-local-demo.ps1), put them in the existing project folder (replace the old CMD), and run the launcher. Future launches follow the `friend-preview` branch.
