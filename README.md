# Aeon's End Digital Demo

这是一个本地单机网页版 Demo：两名 Mage 对抗一名 Nemesis。规则由共享的 TypeScript 引擎处理，Vue 前端负责显示棋盘、收集操作和保存本地进度。

> 本项目是非官方个人项目，不代表 Aeon's End 官方。卡牌、角色和图片素材用于 Demo 与朋友试玩；公开发布或商业化前，需要另行确认素材授权、版权和商标范围。

## 当前内容

- 固定双人场景：两名不同的 Mage 对抗一名 Nemesis；目前没有账号、联机或跨设备同步。
- 已接入 8 位 Wave 1 Mage、10 位 Wave 9 Mage，以及 Rageborne、Prince of Gluttons 和 Wave 9 重制版 Crooked Mask。
- 可使用 Wave 1 与 Wave 9 的 Gems、Relics、Spells 和 Wave 9 Trinket deck。22 张 Wave 9 Basic Nemesis Cards 已并入所有 Nemesis 共用的基础牌池；游戏暂不提供按 Wave 筛选基础牌的设置。
- Wave 9 的 Friends、Foes、Banners 和 Crooked Mask 以外的 Nemesis 尚未接入对局。详细状态见 [Wave 9 接入状态](design/wave9-plan.md)。
- Setup 支持选择或随机选择 Mage/Nemesis、设置 Nemesis 难度，以及使用 Template 1 市场并逐槽替换卡牌。
- 支持卡牌效果与目标决策、Breach、Nemesis Attack/Power/Minion、Unleash、存档恢复和最多 20 步的 Ctrl+Z 撤销；按 `A` 可打出当前 Mage 手中的所有 Gems。
- 棋盘包含卡牌飞行、手牌平滑收拢、Breach Focus/Open、回合切换、Nemesis 抽牌翻面，以及伤害、治疗、抽牌和 Charge 反馈等效果。卡牌移动按引擎记录的实体卡移动来播放，不再靠比较牌区数量猜测；代码职责和交互约定见 [UI 开发指南](ui/ui-guide.md)。
- Debug Tools（`Ctrl+D`）用于调整游戏状态、牌序和调试操作。

存档只保存在当前浏览器的 `localStorage` 中；清除网站数据会删除存档。

## 建议游玩尺寸

面向桌面浏览器，建议最大化窗口或按 `F11` 全屏，以 16:9 横屏游玩；推荐 1920×1080 或更高分辨率。最低设计目标是浏览器内容区 1440×900 CSS 像素；小于此尺寸不保证布局和操作体验。

## 启动项目

在仓库根目录的 PowerShell 中运行：

```powershell
cd aeons-end-engine
npm ci
npm test

cd ..\aeons-end-ui
npm ci
npm run dev        # http://localhost:5173
```

首次运行浏览器测试时安装 Playwright 浏览器：

```powershell
cd aeons-end-ui
npx playwright install chromium
```

## 验证改动

```powershell
# 引擎类型检查和回归测试
cd aeons-end-engine
npm test

# 前端类型检查与生产构建
cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build

# 浏览器流程与交互测试
npm run test:e2e -- --workers=2

# UI Gallery 回归
npm run test:ui-gallery
```

前端 `npm run build` 会先运行 `npm run generate:images`，从 `image-database/` 生成图片导入映射。不要手动编辑 `aeons-end-ui/src/generated-image-imports.ts`。

## 代码入口

```text
aeons-end-engine/src/data/   按 Wave 和内容类型组织的 Mage、卡牌与牌堆资料
aeons-end-engine/src/engine/ 共享规则模块；engine.ts 保留公开入口
aeons-end-engine/src/nemesis/ Nemesis 专属规则模块
aeons-end-ui/src/components/ Vue 棋盘、卡牌、弹窗和 UI Gallery
aeons-end-ui/src/game/       游戏操作、阶段、存档和撤销协调
aeons-end-ui/src/game/card-motion-*.ts  按职责拆分的卡牌动效策略、展示状态和等待逻辑
aeons-end-ui/src/game/card-zone-motion.ts  根据引擎移动记录播放牌区转移动效
aeons-end-ui/src/styles/     按职责拆分的样式；tokens.css 保存全局变量
documents/                   游戏卡牌与 Mage 的基础资料
design/                      Wave 9 接入状态计划
```

引擎原地修改一个 `GameState`；前端直接通过 `@engine` 引用引擎，并用 Vue `reactive()` 追踪状态。规则结果由引擎决定，组件只显示状态、收集输入并调用引擎。

## 开发入口

- 卡牌、Mage、Nemesis 与引擎规则：先读 [dev-guide.md](dev-guide.md)，再读对应的 `documents/` 资料和引擎数据/测试。
- 重要且易错的游戏规则与裁定：[game-rulings.md](game-rulings.md)。
- 布局、组件、弹窗、动效、拖拽和层级：[ui/ui-guide.md](ui/ui-guide.md)。
- 只在检查 Wave 9 接入进度时阅读 [design/wave9-plan.md](design/wave9-plan.md)。
- 跨对话继续项目时，可先读 [HANDOFF.md](HANDOFF.md) 获取简短进度摘要；它是快照，具体行为以当前代码和上述指南为准。

## 浏览器快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Z` | 撤销最近操作，最多 20 步 |
| `Ctrl+D` | 打开或关闭 Debug Tools |
| `A` | 打出当前 Mage 手牌中的所有 Gems |
| `1`、`2` | 切换到对应玩家的 Mage 视角 |
| `Tab` | 切换当前显示的玩家 |
| `Q` / `W` | 查看当前 Mage 的抽牌堆 / 弃牌堆 |
| `Space` | 确认可用的决策、确认 Nemesis 抽牌、确认待结算法术伤害，或推进支持空格操作的阶段 |
| `Esc` | 打开或关闭退出菜单；阻塞式决策弹窗不会被它取消 |

Debug Tools 文本框聚焦时，普通快捷键交给文本输入；`Esc` 关闭工具，`Tab` 仍切换玩家视角。

## 试玩部署

项目可以通过 Vercel Preview 分享静态前端。存档仍在玩家当前浏览器本地，不会因为托管而变成云存档。部署构建需要能读取 `aeons-end-engine/`、`aeons-end-ui/` 和根目录 `scripts/`；分享试玩地址即可，不要分享部署 Token 或项目管理权限。建议保留前一版 Preview，方便必要时回退。
