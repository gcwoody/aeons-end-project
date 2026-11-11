# Windows 桌面客户端方案

状态：阶段 1 已验证；阶段 2 的图标和便携启动包原型已搭建并启动验证。启动更新界面、游戏内容自动更新和存档迁移尚未实现。
目标平台：Windows 10 / 11
更新来源：GitHub `friend-preview`
Windows 7：继续使用现有 CMD、PowerShell 和外部浏览器启动方式

## 目标

- 玩家双击带游戏图标的客户端后，在游戏自己的窗口中游玩，不需要单独打开浏览器或保留黑色命令窗口。
- 启动时显示版本检查、下载进度和离线回退状态。
- 复用现有 `aeons-end-engine/`、`aeons-end-ui/` 和本地图片，不复制游戏规则，也不维护第二套游戏界面。
- 保持现有浏览器开发和验证流程；Electron 是额外运行目标，不替代 Chrome。
- 自动更新的网页、图片、暂存、备份及本地资料都限制在玩家解压的桌面客户端目录中。

## 决策

1. 桌面客户端只支持 Windows 10 / 11。Windows 7 玩家继续使用现有本地浏览器版。
2. 第一阶段只从 GitHub 获取更新。无法连接 GitHub 时，允许启动已安装的本地版本。
3. 第一版优先发布便携目录压缩包，玩家解压到可写目录后运行客户端。暂不安装到 `Program Files`，以避免更新目录不可写。
4. 游戏网页和图片仍使用现有 TSV 清单与逐文件 SHA-256 校验。Electron 程序本身与游戏内容采用分开的更新流程。

## 现有项目可复用部分

- `aeons-end-engine/` 是纯 TypeScript 规则引擎，可继续由 Vue UI 直接调用。
- `aeons-end-ui/` 是 Vue 3 / Vite 客户端。浏览器仍是日常开发和快速验证环境。
- `npm run build:local-demo` 会生成 `local-demo-site/` 和 `local-update-manifest.tsv`。
- `play-local-demo.ps1` 已提供本地静态文件服务，只监听 `127.0.0.1:47381`，并从项目目录读取 `local-demo-site/` 和 `image-database/`。阶段 1 的 Electron 原型使用独立的 Node.js 服务和 `127.0.0.1:47382`，两种启动方式可以并行运行。
- Vite 的本地试玩构建使用根路径 `/image-database/...`，因此继续通过固定本地 HTTP 来源加载时，不需要先改造图片引用。

上述结构足以开始 Electron 原型。游戏 UI、规则引擎和卡牌数据不需要先做大范围重构。

## 目录和进程边界

新增一个独立的桌面入口目录，例如 `aeons-end-desktop/`，只放 Electron 主进程、预加载脚本、窗口启动界面和打包配置。首版便携包按以下职责组织：

```text
Aeons-End-Desktop/
  AeonsEnd.exe
  resources/                  Electron 程序文件
  local-demo-site/            Vue/Vite 本地试玩构建
  image-database/             本地卡牌图片
  local-update-manifest.tsv   游戏内容清单
  .aeons-end-update/          更新状态、暂存与回滚文件
  profile/                    Electron 浏览器资料、缓存与本地存档
```

Electron 主进程管理窗口、本地服务、更新流程和退出清理。Renderer 只显示 Vue 游戏或更新界面，不直接读写文件。Electron 的 `userData` 路径应在应用初始化时指向便携目录内的 `profile/`，而不是使用默认的 `%APPDATA%`。该目录必须可写；不要把便携包放进只读安装位置。

桌面客户端由 Electron 主进程创建和停止 Node.js HTTP 服务；Win7 继续使用现有 PowerShell 服务和启动器。两者监听不同的回环端口，避免客户端同时启动时互相占用。

服务继续绑定 `127.0.0.1`，不监听局域网。桌面客户端使用固定端口 `47382` 和独立的 Electron 用户资料，保持稳定来源以便存档跨启动保存，同时不与 Win7 版 `47381` 冲突。端口被其他程序占用时，应在客户端显示明确错误，不应静默改成不固定的端口。桌面客户端应限制为单实例，关闭窗口时停止自己创建的服务。

## 开发流程

日常流程保持现状：

1. 在 `aeons-end-desktop/` 运行 `npm run dev`；脚本会启动 `aeons-end-ui/` 的 Vite 开发服务器，再启动加载该服务器的 Electron 窗口。
2. 继续用 Chrome 验证规则和 UI；需要检查桌面行为时再打开 Electron 开发窗口。
3. Electron 开发窗口直接使用 Vite 开发服务器，保留热更新；不需要每次为界面改动重新打包。
4. 准备本地试玩内容时，仍运行 `npm run build:local-demo`。

Electron npm 包首次运行时还会单独下载对应平台的 Electron 二进制；这与 npm 包走的 registry 是两条下载链路。开发脚本会在检测到 `HTTP_PROXY` 或 `HTTPS_PROXY` 时启用 Electron 下载器的代理支持。若仍无法访问 GitHub，可临时设置 Electron 官方支持的下载镜像，不改变玩家游戏更新源的 GitHub 决策。

只有窗口、主进程、更新流程、存档位置或打包方式变更时，才需要针对 Electron 做专门验证。常规 UI 开发仍以浏览器快速迭代为主，发布前增加桌面客户端检查。

## 图标和 Windows 便携包

桌面图标源图保存在 `aeons-end-desktop/assets/cover.png`。运行 `create-icon.ps1` 会生成 Windows 多尺寸 `app-icon.ico` 和预览用的 `app-icon.png`；Electron 窗口标题栏和打包后的 `AeonsEnd.exe` 共用该 ICO。源图更新后需要重新生成图标并重新打包。

生成 Windows x64 便携目录：

```powershell
cd aeons-end-ui
npm run build:local-demo

cd ..\aeons-end-desktop
npm ci
npm run package:win
```

输出位于 `aeons-end-desktop/out/win-unpacked/`。`AeonsEnd.exe` 是玩家双击启动文件；分发时必须把整个 `win-unpacked` 目录一起压缩，不能只提供 exe，因为游戏网页、图片和 Electron 运行资源都在目录的其他位置。便携包应解压到玩家有写入权限的目录再运行。当前原型没有接入游戏内容自动更新，生成的新包仍需通过完整目录替换旧版；Electron 程序也尚未签名。

## 启动和更新体验

桌面启动窗口至少显示以下状态，所有产品 UI 字符串使用英文：

- `Checking for updates...`
- `Downloading updates...`，显示文件数和下载进度
- `Starting game...`
- `Could not connect. Starting the installed version.`
- `Update failed. Your installed version is unchanged.`

版本检查和下载由 Electron 主进程负责，并将受限的进度事件发送给窗口。优先复用现有 TSV 清单格式及路径校验、SHA-256、项目目录内暂存和失败回滚策略。Electron 渲染器不得获得任意文件系统或命令执行权限。

### 游戏内容更新

沿用当前 `friend-preview` 分支上的 `local-update-manifest.tsv`。Electron 客户端只应用网页和图片条目；清单中的 `play-local-demo.ps1` 是 Win7 旧启动器使用的文件，不纳入 Electron 客户端的替换操作。

官方初始压缩包自带与其游戏文件对应的清单，首次启动时用它初始化本地版本记录，避免再次对约 373 MB 图片做全量哈希。已有旧目录若没有匹配清单，显示检查进度并做一次性文件校验。之后版本未变时快速启动；版本变化时按新旧清单哈希只下载变化的网页和图片。更新界面提供手动“Repair files”入口，以便恢复意外缺失或损坏的文件。

更新文件必须保留在桌面客户端根目录下；完整下载、SHA-256 校验、暂存、替换和回滚均在该目录中完成。GitHub 不可用时启动已有版本。

### Electron 程序更新

Electron 可执行程序、主进程和预加载脚本不属于当前游戏内容清单。它们不能由正在运行的客户端直接覆盖。第一阶段保留单独的桌面程序版本包；在 Electron 主进程稳定后，再选用适合 Windows 的重启安装或独立更新辅助进程。程序包更新同样从 GitHub 获取，并在发布前确定失败回滚和用户可写路径。

## 存档迁移

现有浏览器存档在 Chrome 自己的 `localStorage` 中。Electron 有单独的浏览器资料，即使页面来源同为 `http://127.0.0.1:47381`，也不会自动读取 Chrome 配置中的存档。

客户端正式发给玩家前，需要有存档 JSON 导入/导出流程。可先在现有网页版提供“导出存档”，再在桌面客户端提供“导入存档”；迁移完成前不删除旧浏览器存档。Electron 后续的存档和缓存保存在便携目录的 `profile/`，内容更新器不能触碰该目录。

## 安全和路径约束

- `BrowserWindow` 使用 `contextIsolation: true`、`nodeIntegration: false` 和 `sandbox: true`。
- 如更新 UI 需要主进程通知，只通过预加载脚本暴露有限、只读或类型明确的接口；不暴露通用 IPC、文件系统或 shell API。
- 页面只加载本地游戏来源；拦截未经许可的导航和新窗口。需要打开外部链接时，由主进程按允许的 HTTPS 域名调用系统浏览器。
- 本地服务只监听回环地址。检查路径穿越、重解析点和端口冲突；清单路径必须限定在允许更新的游戏内容目录中。
- 更新器只管理游戏网页、图片和更新状态目录，不能清理或覆盖 `profile/`、用户文件及客户端目录以外的内容。
- 官方 Electron 文档强调：启用安全窗口配置仍不足以自动保证安全，必须限制 Renderer 可访问的能力，并保持 Electron 及其 Chromium 运行时更新。

## 实施阶段

### 阶段 1：最小窗口原型

- 新建 Electron 桌面入口和开发脚本。
- 在开发模式加载 Vite `5173`；原型包加载本地游戏来源。
- 使用临时图标和简单窗口配置，确认启动、图片、刷新、存档、退出服务都可工作。
- 不接入自动更新，不改 Vue 游戏界面。

### 阶段 2：便携客户端和更新界面

- 添加正式图标、启动更新界面、下载进度和离线回退。
- 建立 Electron 主进程的安全本地服务和文件生命周期。
- 将游戏内容更新接入现有清单；暂时保留 Electron 程序本体的独立更新流程。
- 生成便携目录压缩包，在可写目录运行。

### 阶段 3：存档迁移和发布检查

- 实现旧网页存档导出与桌面客户端导入。
- 确认关闭客户端后服务进程结束，重新启动后存档仍存在。
- 检查断网回退、GitHub 更新、错误恢复、缺失图片和路径边界。
- 完成桌面程序本体的 GitHub 发布和回滚方案。

## 验收标准

1. 玩家双击客户端后只看到游戏客户端窗口，不需要另开浏览器或保留 CMD 窗口。
2. Electron Renderer 使用现有游戏 UI 和规则引擎，不出现桌面版专属的游戏规则副本。
3. 卡牌图片从本地 `image-database/` 读取；同一客户端的存档在退出后仍可恢复。
4. 更新界面显示检查、下载和离线回退状态；更新内容只写入客户端目录且校验失败不会留下半套游戏文件。
5. GitHub 暂时不可达时，已有本地版本仍能启动；Windows 7 原启动方式继续可用。
6. 从 Chrome 网页版迁移存档有明确的导入/导出步骤。

## 官方参考

- [Electron Documentation and Quick Start examples](https://www.electronjs.org/docs/latest)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Application Packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Electron app paths](https://www.electronjs.org/docs/latest/api/app)
