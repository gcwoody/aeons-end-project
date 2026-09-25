# Aeon's End Digital Demo

这是一个本地单机 Web Demo：两名 Mage 对抗一名 Nemesis。项目使用 Vue 3 + Vite 前端和共享的 TypeScript 规则引擎，当前版本主要覆盖 Wave 1，以及已经接入的 Wave 9 内容。

> 本项目是非官方的个人项目，不代表 Aeon's End 官方。项目中的卡牌、角色和相关图片素材仅用于当前 Demo 的测试与朋友试玩；公开发布或商业化前需要重新确认素材的授权、版权和商标范围。

## 当前范围

- 固定的双人场景：两名不同的 Mage，对抗一名 Nemesis。
- 已注册 8 个 Wave 1 Mage：Jian、Brama、Xaxos、Adelheim、Kadir、Lash、Mist、Phaedraxa。
- 已注册 Nemesis：Rageborne、Prince of Gluttons。
- Wave 1 的 27 张市场候选牌：Gems、Relics 和 Spells。
- Setup 支持 Mage/Nemesis 图片选择、随机选择、Nemesis 难度，以及 Template 1 市场九宫格和逐槽位替换。
- 支持卡牌效果、目标决策、Breach、Nemesis 的 Attack/Power/Minion、Unleash 和当前已接入的 Nemesis 专属规则。
- 支持 Save & Exit、Resume、浏览器刷新恢复，以及最多 10 步的 Ctrl+Z 撤销；撤销历史会随存档保留。
- 支持 Ctrl+D 调试面板，用于调整生命、Aether、充能、Knowledge、卡牌、Breach 和 JSON 存档。
- Wave 9 已接入 Nook、Indira、Dezmodia、Remnant、Stake、Wolf 及其对应的 Swap、Conjure、Specific Deck、Treasure、Rift/Prototype Breach、Breach-only Aether、Knowledge、Breach Upgrade 和 Doom 等机制。

当前不是联机游戏：没有账号、服务器、数据库或多人同步。存档只保存在当前浏览器的 `localStorage` 中，清除网站数据会删除存档。

## 快速开始

在仓库根目录打开 PowerShell：

```powershell
cd aeons-end-engine
npm ci
npm test

cd ..\aeons-end-ui
npm ci
npm run dev        # http://localhost:5173
```

首次运行浏览器测试时，还需要安装 Playwright 浏览器：

```powershell
cd aeons-end-ui
npx playwright install chromium
```

## 常用验证

```powershell
# 规则引擎：类型检查并运行 stage1、stage2、stage3、stage4、stage7、stage8 回归测试
cd aeons-end-engine
npm test

# 前端类型检查和生产构建
cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build

# 浏览器流程测试
npm run test:e2e
```

`npm run build` 会先运行 `npm run generate:images`，从 `image-database/` 重新生成实际使用图片的导入映射。不要手动编辑 `aeons-end-ui/src/generated-image-imports.ts`。

## 项目结构

```
aeons-end-engine/  纯 TypeScript 规则引擎和游戏数据
aeons-end-ui/      Vue 3 + Vite 展示层，通过 @engine 直接引用引擎源码
scripts/           图片映射生成脚本
image-database/    卡牌、Mage Mat、Nemesis Mat 和 Breach 素材
documents/         卡牌资料和抓取结果
design/            当前有效的设计、发布和部署文档
ui/                UI 统一开发指南和截图
```

引擎原地修改一个 `GameState`；UI 使用 Vue `reactive()` 追踪状态。规则、资源、目标选择和中断恢复由引擎决定，组件只负责显示状态、收集输入并调用引擎。

## 开发入口

- 新增卡牌、Mage、Nemesis 或场景：先阅读 [dev-guide.md](dev-guide.md)。
- 处理 UI 组件、状态、布局、弹窗、悬停、拖拽和 `z-index`：阅读 [ui/ui-guide.md](ui/ui-guide.md)。
- 进行发布前准备：阅读 [design/release-readiness-plan.md](design/release-readiness-plan.md)。
- 配置或排查 Vercel：阅读 [design/deployment-guide.md](design/deployment-guide.md)。

## 浏览器快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Z` | 撤销最近一次操作，最多 10 步 |
| `Ctrl+D` | 打开或关闭 Debug Tools |
| `1`–`4` | 切换当前显示的 Mage |
| `Tab` | 循环切换当前显示的玩家 |
| `Q` | 查看当前 Mage 的抽牌堆 |
| `W` | 查看当前 Mage 的弃牌堆 |
| `Space` | 确认决策窗口中可用的 Confirm、确认 Nemesis 抽牌、结算红框标记的 Nemesis 主阶段卡牌，或推进当前阶段 |
| `Esc` | 打开或关闭退出菜单 |

## 发布说明

当前版本适合通过 Vercel Preview 分享给朋友试玩。Vercel 只负责托管静态前端，不会自动提供联机、账号或云端存档。由于 UI 构建需要读取 `aeons-end-engine/` 和 `scripts/`，部署时必须按照 [design/deployment-guide.md](design/deployment-guide.md) 配置 Monorepo Root Directory 和构建权限。

分享时应提供网站地址，而不是部署 Token 或项目管理权限。建议保留上一版 Preview/Deployment，以便出现阻塞问题时回滚。
