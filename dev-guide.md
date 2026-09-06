# 开发者地图（dev-guide）

> 给开发者的速查表：文件管什么、改功能去哪找、怎么调试。
> 配合 [README.md](README.md)（项目/玩法）和 [AGENTS.md](AGENTS.md)（协作约定）阅读。

## 架构一句话

引擎在 `aeons-end-engine/src/engine.ts` 里**原地改**一个 `GameState` 纯数据对象；UI 在 `aeons-end-ui/src/game/useGame.ts` 里用 `reactive()` 包住它，把玩家的点击翻译成对引擎函数的调用，再通过 Vue 组件渲染。引擎与 UI 之间用 `@engine/*` 别名直接引用源码，没有复制。

## 文件地图

### 引擎 `aeons-end-engine/src/`

| 文件 | 职责 |
|------|------|
| `types.ts` | 所有数据结构（卡牌、法师、裂隙、天罚、GameState） |
| `data.ts` | 卡牌数据、市场卡、法师定义、裂隙配置、怒煞定义 |
| `engine.ts` | ⭐ 全部规则逻辑：初始化、回合、以太、施法、主阶段、抽牌、天罚、胜负 |

### 前端 `aeons-end-ui/src/`

| 文件 | 职责 |
|------|------|
| `game/useGame.ts` | ⭐ 状态封装层：响应式 GameState + 全部操作函数 + 撤销/自动存档/调试开关 |
| `App.vue` | 全屏布局、Ctrl+Z / Ctrl+D 快捷键、天罚攻击/结算弹窗 |
| `components/GameTopArea.vue` | 顶部游戏区域：Nemesis 牌区、Nemesis 场上区，以及下方的 Turn Order Bar |
| `components/TurnOrderBar.vue` | GameTopArea 下方：6 个回合槽 + 左右 Nemesis/Gravehold 血条 |
| `components/NemesisArea.vue` | GameTopArea 上方：天罚弃/抽牌堆 + Minion/Power 场上区 |
| `components/PlayerArea.vue` | 角色点选 + 裂隙 + Played 区 + 手牌（含牌库/弃牌堆）+ 控制栏 |
| `components/MarketPanel.vue` | 市场 9 堆 |
| `components/LogPanel.vue` | 右侧竖向日志 |
| `components/PileModal.vue` | 点牌库/弃牌堆弹出的卡片列表（5 张/列） |
| `components/RelicModal.vue` | 遗物抽牌后选择弃牌弹窗 |
| `components/CardDecisionModal.vue` | 卡牌效果通用决策弹窗（分支、卡牌、玩家和伤害目标） |
| `components/DebugPanel.vue` | Ctrl+D 调试面板 |
| `components/SetupScreen.vue` | 开局选法师 + 多存档列表 + Resume |
| `style.css` | 全部样式 |

### 长期开发计划

- 卡牌效果系统的分阶段实施方案：[`design/card-effects-implementation-plan.md`](design/card-effects-implementation-plan.md)
- 类型化卡牌效果模型：[`design/card-effects-model.md`](design/card-effects-model.md)

## 改功能去哪找

| 想做什么 | 改哪里 |
|----------|--------|
| 加/改卡牌数据（费用、伤害、效果） | 引擎 `data.ts` |
| 改规则判定（能不能买/打/施放等） | 引擎 `engine.ts` |
| 改回合/阶段流程、自动结束 | 引擎 `engine.ts` + `useGame.ts` |
| 改某个按钮/交互/显示 | 对应组件 `components/*.vue` |
| 改整个游戏的响应式状态层 | `useGame.ts` |
| 加一种新的法术/遗物效果 | 引擎 `data.ts`（数据）+ `engine.ts`（结算逻辑） |

## 关键机制实现位置

- **以太系统**：`engine.ts` 的 `getTotalAether` / `getSpendableAether`（常规/条件分开统计）
- **卡牌效果解释器**：`engine.ts` 的 `resolveCardEffects` / `resolvePreppedEffects` / `resolvePendingDecision`（效果序列、暂停续接、目标选择）
- **卡牌效果状态**：`GameState.pendingDecision` + `pendingEffect`（可序列化的待决策与效果续接）
- **卡牌效果 UI**：`CardDecisionModal.vue` + `useGame.ts` 的 `resolveDecision`（选择结果进入引擎并支持存档/撤销）
- **裂隙 Focus/Open**：`engine.ts` 的 `focusBreach` / `openBreachDirect`（一次性费用公式）
- **裂隙 III/IV 伤害 +1**：`data.ts` 的 `makeBreach`（`damageBonus`）+ `engine.ts` 的 `castSpell`
- **弃牌排序**（Played → 弃牌堆点选顺序）：`useGame.ts` 的 `doEndTurn` / `clickDiscardCard` / `autoDiscardRemaining`
- **遗物即时生效**：类型化市场 Relic 由 `data.ts` + `engine.ts` 结算；旧式抽 X 弃 Y 遗物仍由 `useGame.ts` + `RelicModal.vue` 兼容处理
- **不洗牌翻转**：`engine.ts` 的 `drawFromDeck`
- **撤销 Ctrl+Z**：`useGame.ts` 的 `snapshot` / `beforeAction` / `undo`
- **ESC 退出**：`App.vue` 的退出提示 + `useGame.ts` 的 `saveAndExit` / `exitWithoutSaving`
- **自动存档**：`useGame.ts` 顶部的 `watch`（序列化快照写入 localStorage）
- **多存档**：`useGame.ts` 的 `aeons-end-saves-v2` 存档列表；新建游戏生成新条目，当前游戏状态自动更新当前条目
- **天罚回合**：`useGame.ts` 的 `nemesisReveal` / `nemesisChooseTarget`

## 调试指南

1. **自动存档**：游戏任何状态变化都会写入当前存档。按 ESC 可选择直接退出或 **Save & Exit**；设置页会列出每个存档的角色、Nemesis、轮次和回合，选择对应的 **Resume Game** 恢复。
2. **调试面板（Ctrl+D）**：
   - 直接改 Nemesis/墓都/玩家 HP、充能（数字输入框即时生效）
   - 开/关裂隙（点罗马数字按钮）、给玩家 +3 bonus 以太
   - **加卡**：选卡 id + 目标玩家 + 目标区（hand/deck/discard）
   - **导出/导入 JSON**：点 Load Current 把当前状态填进文本框 → 手动改 → Apply 载入（这是"跳到任意中间态"的手段）；Copy 复制
   - **Clear Saves**：删除全部存档
3. **引擎类型检查与回归**：`cd aeons-end-engine && npm run typecheck`；阶段 7 的行为回归使用 `npm test`，可视化行为验证统一通过 UI 和调试面板完成。

## 常见坑

- **改 `useGame.ts` 会触发 HMR 重置对局**（模块级状态），刷新页面即可恢复（配合自动存档可无缝续玩）。
- 编辑器里 `main.ts` 的 CSS 报错多为 tsserver 缓存残留，`npx tsc --noEmit -p aeons-end-ui/tsconfig.json` 零错误即正常。
- 引擎的牌堆约定：数组 `[0]` 是顶部（先摸到）；摸牌 `shift`、弃牌顶 `unshift`、翻转 `reverse`。
- 不要为迁就 UI 改引擎规则；UI 只负责展示状态和提交玩家选择。

## 待办（已知缺口）

1. Jian 的 Black Mirror 能力（引擎占位）
2. 天罚 Minion/Power 卡机制（`playArea` 逻辑）
3. 真实市场卡数据替换占位卡
4. 自动化测试
5. 卡牌图片（TTS 图包转 WebP/PNG）
