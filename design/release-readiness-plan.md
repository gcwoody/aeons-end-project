# Aeon's End Digital Demo 发布准备计划

## 目标

在将当前 Wave 1 Demo 分享给朋友试玩之前，完成以下工作：

- 整理过时的开发文档和历史计划；
- 固化一个可复现的发布版本；
- 确认项目适合使用 Vercel 托管；
- 检查源码、素材、存档和调试功能带来的安全与隐私风险；
- 在 Preview 部署中完成完整验收后，再发布 Production 版本。

本计划只针对当前的单机、单浏览器 Demo。它不包含联机、账号系统、云端存档或多人同步。

## 当前项目盘点

### 当前架构

```text
aeons-end-engine/  纯 TypeScript 规则引擎和游戏数据
aeons-end-ui/      Vue 3 + Vite 前端
scripts/           图片映射生成脚本
image-database/    本地卡牌、Mage Mat、Nemesis Mat 等素材
design/            设计和开发计划
```

当前 UI 的构建依赖 UI 目录之外的文件：

- `aeons-end-ui/vite.config.ts` 引用了 `../aeons-end-engine/src`；
- `aeons-end-ui/package.json` 的 `prebuild` 会执行 `../scripts/generate-image-imports.mjs`。

因此部署时不能把 `aeons-end-ui` 当成完全独立、无法访问父目录的项目。

### 当前功能边界

- 当前是本地单人操作两个 Mage 对抗一个 Nemesis 的 Demo；
- 当前游戏存档保存在浏览器 `localStorage`；
- 每个浏览器的存档互相独立，不支持在线同步；
- Wave 1 的 Gems、Relics、Spells、Mage 和目前已接入的 Nemesis 已经进入主流程；
- 仍有少量 Nemesis 尚未加入；
- Ctrl+D 调试面板仍然可以直接修改游戏状态；
- Vercel 部署只会让页面可以在线访问，不会自动提供联机能力。

### 当前文档问题

当前 `README.md` 中仍有与实际代码不一致的描述，例如 Nemesis 范围和 Undo 次数。`design/` 中也存在已经完成的阶段性计划。当前工作区还存在最近功能修改以及临时交接文件删除状态，发布前必须先明确哪些修改属于最终版本。

## 阶段 0：冻结发布范围

### 工作内容

1. 审查当前工作区的所有修改，不使用破坏性 Git 操作覆盖用户代码。
2. 确认 Mage Mat、Nemesis Mat、Market Setup 等最近 UI 修改是否属于发布版本。
3. 确认 `handoff.md` 等临时交接文档是否彻底移除，不重新放回正式项目文档。
4. 在所有检查通过后创建发布分支或 Git tag，例如：

   ```text
   friend-preview-v0.1.0
   ```

5. 发布版本之后只处理阻塞游玩的 Bug，不再混入大型新功能。

### 阶段出口

- 工作区修改已经被逐项确认；
- 发布范围明确；
- 可以从 Git tag 重现同一个版本。

## 阶段 1：整理正式文档

### 保留并更新

- `README.md`
  - 更新当前功能范围；
  - 更新本地启动、测试和构建命令；
  - 增加 Vercel 部署说明；
  - 明确说明本地存档、单机 Demo 和不支持联机的限制；
  - 增加快捷键和已知问题说明。

- `dev-guide.md`
  - 更新当前架构和决策上下文约定；
  - 更新 Wave 1 卡牌、Mage、Nemesis 的实际注册情况；
  - 更新 Undo、存档、调试面板和测试流程；
  - 删除已经失效的旧流程说明。

- `design/ui-layering-guide.md`
  - 继续作为悬停、弹窗和 z-index 的维护指南。

### 从主目录移除或归档

以下文件属于已经完成的阶段性计划，发布准备完成后不应继续作为当前计划使用：

- `design/decision-context-phase0-audit.md`；
- `design/decision-context-refactor-plan.md`；
- `design/wave1-supply-expansion-plan.md`。

如果需要保留历史，可放入 `design/archive/`；否则直接从主目录删除，Git 历史仍然可以追溯。

### 新增

- `design/release-readiness-plan.md`：本文件；
- `design/deployment-guide.md`：部署完成后记录实际 Vercel 项目配置和故障排查方法。

### 阶段出口

- README 和 dev-guide 与当前代码一致；
- 只有仍然有效的设计文档留在 `design/` 主目录；
- 新开发者可以仅通过 README 和 dev-guide 启动、构建和测试项目。

## 阶段 2：整理生产构建和部署配置

### 本地构建检查

固定使用锁文件安装依赖，并确认以下命令可以成功执行：

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npm ci
npx vue-tsc --noEmit
npm run generate:images
npm run build
```

不要提交以下内容：

- `node_modules/`；
- `dist/`；
- Playwright 测试输出；
- 本地存档；
- `.env` 和任何密钥文件。

### Vercel 项目配置

推荐将 Vercel 项目的 Root Directory 设置为 `aeons-end-ui`，并启用允许构建阶段读取 Root Directory 外部源码的选项。

建议配置：

```text
Framework Preset: Vite
Root Directory: aeons-end-ui
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

由于当前应用是 Vite SPA，在 `aeons-end-ui/vercel.json` 中增加 SPA rewrite：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

参考：

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq)
- [Configuring a Build](https://vercel.com/docs/builds/configure-a-build)

### 阶段出口

- 本地生产构建成功；
- Vercel 的 Build Command 和 Output Directory 已明确；
- 能够解释为什么构建需要访问 UI 目录之外的引擎和脚本文件；
- SPA 刷新不会因为路径解析而返回 404。

## 阶段 3：安全、隐私和公开范围检查

### 源码和密钥

1. 搜索 `.env`、API Key、Token、密码、私有链接和 Vercel Token。
2. 确认没有将秘密写入前端代码或会被打包到浏览器的环境变量。
3. 确认 GitHub 仓库是否保持私有。
4. 不向朋友提供 Vercel 项目管理权限或部署 Token，只分享网站地址。

Vercel 会负责 HTTPS 和平台侧基础设施，但应用代码、客户端数据和第三方素材仍由项目开发者负责保护。参考：[Vercel Shared Responsibility](https://vercel.com/docs/security/shared-responsibility)。

### 调试和客户端状态

需要明确朋友版本是否保留 Ctrl+D：

- 普通试玩版本：建议默认隐藏调试面板，避免误操作；
- 内部测试版本：可以保留 Ctrl+D；
- 无论是否隐藏，客户端游戏状态都可以被浏览器开发者工具修改，因此不能把前端状态当作可信数据。

同时确认：

- `localStorage` 中没有密码或个人隐私；
- 存档损坏时有明确的恢复方式；
- 未来存档结构变化时是否需要清理旧存档或变更 Save Key。

### 素材和分享范围

当前项目包含 Aeon's End 的卡牌和角色图片。上线前应确认这些素材的使用范围。对于朋友试玩，建议：

- 使用私有源码仓库；
- 分享 Vercel 网站地址，而不是公开整个源码仓库；
- 暂不宣传为官方产品，也不进行商业化；
- 如果将来公开发布或收费，先重新检查版权、商标和托管条款。

Vercel Hobby 计划面向个人、非商业用途，超出免费额度后通常会暂停或等待周期恢复。参考：[Hobby Plan](https://vercel.com/docs/plans/hobby)。

### 阶段出口

- 没有密钥和私密数据进入发布内容；
- 调试能力是否开放已经做出明确决定；
- 朋友试玩范围和素材公开范围已经明确。

## 阶段 4：发布前测试

### 自动化检查

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build
npm run test:e2e
```

### 手动验收清单

- 清空浏览器数据后可以正常打开 Setup；
- Mage Mat 图片选择和下拉框同步正常；
- Nemesis Mat 图片选择和下拉框同步正常；
- Market 九宫格、候选牌和 Refresh 正常；
- Rageborne 和 Prince of Gluttons 都能开始游戏；
- 至少完成一轮完整的玩家阶段和 Nemesis 阶段；
- Power、Attack、Minion 和 Unleash 流程正常；
- Save & Exit、Resume、刷新页面恢复正常；
- Ctrl+Z、Tab、数字键、Q/W、空格快捷键正常；
- 桌面端和窄窗口布局正常；
- 所有图片加载成功，没有 404 或布局溢出。

### 阶段出口

- 自动化测试通过；
- 手动验收清单逐项记录结果；
- 未解决问题已经分类为“发布阻塞”或“已知限制”。

## 阶段 5：Vercel Preview 部署

1. 将 Git 仓库连接到 Vercel。
2. 先创建 Preview Deployment，不直接发布 Production。
3. 检查 Build Logs，确认图片生成脚本、引擎源码和生产构建都被正确读取。
4. 在 Preview 地址执行完整手动验收。
5. 验证直接刷新页面、静态资源加载和浏览器本地存档。
6. 只在 Preview 通过后创建 Production Deployment。

当前阶段不需要配置数据库、API、账号、Webhook 或自定义域名。

## 阶段 6：朋友试玩交付

给朋友的说明应包含：

- 网站地址；
- 推荐使用 Chrome 或 Edge；
- 当前是单机 Demo，不支持联机；
- 存档只保存在当前浏览器；
- 不建议使用无痕窗口；
- 清除网站数据会删除本地存档；
- 报告问题时提供 Mage、Nemesis、操作步骤和截图。

发布后保留上一版 Vercel Deployment，出现严重问题时可以快速回滚。后续反馈应先记录到 issue 或测试清单，再决定是否进入下一版本。

## 推荐执行顺序

```text
阶段 0 冻结版本
    ↓
阶段 1 清理文档
    ↓
阶段 2 固化生产构建和 Vercel 配置
    ↓
阶段 3 安全、隐私和公开范围检查
    ↓
阶段 4 自动化与手动验收
    ↓
阶段 5 Preview 部署
    ↓
阶段 6 Production 发布并交付朋友试玩
```

在阶段 0 和阶段 1 完成之前，不建议直接把当前工作区连接到 Vercel。

## 执行进度（持续更新）

更新时间：2026-09-19

| 阶段 | 状态 | 当前结果 |
| --- | --- | --- |
| 阶段 0：冻结发布范围 | 已完成 | 工作区已确认干净；`handoff.md` 已移除；已创建并推送 `friend-preview` 分支。 |
| 阶段 1：整理正式文档 | 已完成 | README、dev-guide 已更新；已新增 `design/deployment-guide.md`；三个过时的阶段性 plan 已从 `design/` 主目录移除。提交为 `195e6f0`。 |
| 阶段 2：生产构建和部署配置 | 已完成 | 已新增 `aeons-end-ui/vercel.json` SPA rewrite；引擎测试、前端锁定依赖安装、`vue-tsc`、图片映射生成和 Vite production build 全部通过。尚未连接 Vercel。 |
| 阶段 3：安全、隐私和公开范围 | 进行中 | 本地源码、存储、网络和依赖审计已完成；运行时依赖无漏洞，开发依赖的 esbuild/Vite 告警已记录并通过本地绑定缓解。仍待确认 GitHub 仓库 Private 状态和素材使用范围。 |
| 阶段 4：发布前测试 | 待执行 | 尚未完成本轮发布验收。 |
| 阶段 5：Vercel Preview 部署 | 待执行 | 尚未创建 Vercel Preview。 |
| 阶段 6：朋友试玩交付 | 待执行 | 尚未向朋友提供试玩地址。 |

阶段二执行备注：引擎测试首先发现 `stage8.test.ts` 缺少 Node 环境下的 `console` 类型声明，已用测试文件内的最小声明修复；修复后所有引擎回归测试通过。前端依赖安装曾被本机残留的 esbuild/Rollup 构建进程锁定，结束明确属于本项目的进程后，`npm ci`、类型检查和生产构建均成功。

阶段三执行备注：已扫描工作区和 Git 跟踪文件，没有发现 `.env`、密钥、证书、凭据或 Token；应用没有 API、账号、Cookie 或 WebSocket，存档只写入浏览器 `localStorage`。前端运行时依赖的 `npm audit --omit=dev` 结果为 0 个漏洞；完整开发依赖的 esbuild/Vite 告警只影响本地开发服务器，已让 Vite 默认绑定 `127.0.0.1`。当前 friend preview 保留 Ctrl+D 作为信任测试功能，但不把它当作安全边界。GitHub 仓库权限和素材授权需要仓库所有者在外部确认。

## Git 版本约定（发布完成后仍需保留）

当前采用轻量的“开发主线 + 试玩冻结版本”约定：

- `main` 作为后续开发主线；
- `friend-preview` 作为当前朋友试玩版本，只接受阻塞游玩的修复；
- 新的 Nemesis、Wave 或较大的功能默认从 `main` 继续开发；
- 每个可分享版本应使用 Git tag 固定，例如 `friend-preview-v0.1.0`，不要只依赖会继续移动的分支名；
- 朋友反馈的阻塞 Bug 可以从 `friend-preview` 修复，然后同步回 `main`；
- 当前 `main` 仍指向 `98223c5`，`friend-preview` 已指向 `195e6f0`。开始下一轮正式开发前，应先将 `main` 快进到 `195e6f0`，这样可以同步阶段一的文档而不改变游戏逻辑。

一人开发不强制要求每个小改动都创建功能分支。若只是连续开发、随时可以撤销的低风险改动，可以直接在 `main` 上进行；只有准备保留一个稳定试玩版本、进行较大或高风险实验、或需要同时维护多个版本时，才需要额外创建功能分支或发布分支。
