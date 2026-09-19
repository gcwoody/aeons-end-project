# Wave 1 → Wave 9 交接文档

更新时间：2026-09-19

## 当前基线

- 当前开发分支：`main`。
- `friend-preview` 用于朋友试玩，Vercel 自定义域名绑定在该分支；后续 Wave 9 开发不要修改它。
- 当前项目是双 Mage 对抗单 Nemesis 的本地单机 Web Demo，不是联机服务。
- 存档保存在浏览器 `localStorage`，没有账号、服务器数据库或多人同步。

## Wave 1 已完成内容

- 8 个 Mage：Jian、Brama、Xaxos、Adelheim、Kadir、Lash、Mist、Phaedraxa。
- 2 个 Nemesis：Rageborne、Prince of Gluttons。
- Wave 1 的 27 张 Gem、Relic、Spell 市场卡牌。
- Setup：Mage/Nemesis 图片选择与 Reroll、Nemesis 难度、Template 1 市场九宫格和逐槽位替换。
- 基础游戏流程：Casting、Main、Discard、Nemesis phases、Breach、Attack/Power/Minion、Unleash、胜负和 Exhaust。
- 通用决策上下文、目标选择、牌堆/弃牌堆查看、卡牌悬停预览、Nemesis specific pile。
- Save & Exit、Resume、浏览器刷新恢复、最多 10 步 Ctrl+Z，以及 Ctrl+D Debug Tools。
- 快捷键：`Ctrl+Z`、`Ctrl+D`、`1`–`4`、`Tab`、`Q`、`W`、`Space`、`Esc`。

## 代码入口

- 规则类型和状态：`aeons-end-engine/src/types.ts`
- 回合流程与效果解释器：`aeons-end-engine/src/engine.ts`
- Wave 1 卡牌数据：`aeons-end-engine/src/data/wave1/`
- Nemesis 数据与专属模块：`aeons-end-engine/src/data/wave1/nemesis.ts`、`aeons-end-engine/src/nemesis/`
- UI 状态、阶段、存档和撤销：`aeons-end-ui/src/game/useGame.ts`
- 玩家区域、手牌、Breach、施法和拖拽：`aeons-end-ui/src/components/PlayerArea.vue`
- Nemesis 区域和专属牌堆：`aeons-end-ui/src/components/NemesisArea.vue`、`NemesisSpecificPile.vue`
- 全局布局、响应式尺寸和层级：`aeons-end-ui/src/style.css`
- 图片映射生成：`scripts/generate-image-imports.mjs`；不要手动编辑 `src/generated-image-imports.ts`。

## 扩展 Wave 9 前必须遵守

1. 先阅读根目录 `AGENTS.md`、`README.md`、`dev-guide.md`，再阅读 Wave 9 的规则资料。
2. 优先组合现有 `CardEffect`、`PendingDecision` 和通用 `unleash`；只有确实无法表达时才扩展引擎类型。
3. 规则结果放在 Engine，Vue 只负责显示状态和提交操作；不要在组件里按具体卡牌 ID 硬编码规则。
4. 新增卡牌和图片后同步更新对应资料文件，并运行图片导入生成脚本。
5. 每个阶段都验证：引擎测试、`npx vue-tsc --noEmit`、`npm run build`，以及相关 Playwright 测试。
6. 开始 Wave 9 前先检查 `git status`，将 Wave 1 的最终改动提交为一个清晰的基线提交；不要把未确认的临时调试状态带入新内容开发。

## 新对话启动提示

新对话开始时可以直接说明：

> 请先阅读 `AGENTS.md`、`README.md`、`dev-guide.md` 和 `design/wave1-handoff.md`。当前在 `main` 开发 Wave 9，不要修改 `friend-preview`。先整理 Wave 9 资料并给出实现计划，再开始编码。

