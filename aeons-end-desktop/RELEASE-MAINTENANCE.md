# 本地版本更新与发布流程

## 日常更新

1. 在 `aeons-end-engine/` 或 `aeons-end-ui/` 修改规则和界面；先通过浏览器开发版检查需要的功能。
2. 在 `aeons-end-desktop/` 执行 `npm run package:share`。该命令会重建本地网页、生成带 UTC 构建时间的更新清单、封装单文件 Electron 客户端，并输出 `out/Aeons-End-Digital-Windows-x64.zip`。
3. 检查 ZIP 根目录：应有 `AeonsEnd.exe`、`Play Aeon's End Demo.cmd`、中文 `START-HERE.txt`、启动脚本、`local-demo-site/` 和 `image-database/`；图片只打包一份。
4. 分别打开 `AeonsEnd.exe` 和 `Play Aeon's End Demo.cmd` 做启动检查。CMD 版检查主菜单、金色主题、图片读取和浏览器存档；Win7 兼容性需在 Win7 环境单独确认。
5. 将源码、`local-demo-site/` 新构建文件、`local-update-manifest.tsv`、启动脚本和维护文档一起提交并推送到 `friend-preview`。CMD 更新器只从该分支读取文件；不要只推源码而漏掉网页构建和清单。
6. 检查 GitHub 分支提交已更新。若 Vercel 绑定了 `friend-preview`，确认自动部署完成；否则从最新分支手动部署。最后将本次 ZIP 分享给本地玩家。

## 后续更新行为

- CMD 启动时从 GitHub `friend-preview` 的 `local-update-manifest.tsv` 检查 `local-demo-site/` 和图片文件，只下载有变化的文件；离线时使用 ZIP 中的本地版本。版本 2 清单含构建时间，较旧的更新源不会覆盖较新的 ZIP。
- Electron 的启动程序目前不做在线自更新。游戏网页和图片更新可由 CMD 更新器处理；若 Electron 外壳、图标或主进程代码改变，必须重新生成并分发完整 ZIP。
- 网页主菜单中的 **Check for Updates** 目前只是演示交互：显示约一秒的检查动画后报告演示检查完成，没有连接 GitHub，也不会下载或安装更新。
