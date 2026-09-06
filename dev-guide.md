# 开发者地图（dev-guide）

这份文档说明当前项目的架构、文件职责、功能入口和卡牌效果扩展方式。
项目现在以 Web UI 为唯一的游戏操作和可视化测试入口；CLI 已删除，不再维护。

## 架构概览

`aeons-end-engine` 是纯 TypeScript 规则引擎，原地修改一个 `GameState` 对象；
`aeons-end-ui` 是 Vue 3 前端，通过 `@engine` 别名直接引用引擎源码。UI 用
Vue `reactive()` 包装 GameState，把点击、选择和阶段操作交给引擎处理，再渲染结果。

规则逻辑应放在引擎，UI 只负责展示状态、收集输入和调用引擎。不要为了适应某个
组件而在 UI 中复制卡牌规则。

## 文件地图

### 引擎：`aeons-end-engine/src/`

| 文件 | 职责 |
| --- | --- |
| `types.ts` | GameState、玩家、裂隙、卡牌、效果模块、Pending Decision 类型 |
| `data.ts` | 统一卡牌数据出口和全局 Breach 配置 |
| `data/wave1/gems.ts` | Wave 1 的初始 Gem 与市场 Gem 数据 |
| `data/wave1/relics.ts` | Wave 1 的市场 Relic 数据 |
| `data/wave1/spells.ts` | Wave 1 的初始 Spell 与市场 Spell 数据 |
| `data/wave1/mage.ts` | Wave 1 法师定义和法师专属卡牌关系 |
| `data/wave1/nemesis.ts` | Wave 1 Nemesis 卡牌和 Nemesis 定义 |
| `engine.ts` | 回合流程、资源、卡牌效果解释器、目标选择、伤害、抽牌和胜负 |
| `tests/stage7.test.ts` | 当前玩家卡、关键词、边界和 JSON 暂停恢复的引擎回归测试 |

### 前端：`aeons-end-ui/src/`

| 文件 | 职责 |
| --- | --- |
| `game/useGame.ts` | 响应式状态封装、UI 阶段流转、操作入口、自动存档、撤销 |
| `App.vue` | 全屏布局、快捷键、退出提示、Nemesis 目标和胜负弹窗 |
| `components/GameTopArea.vue` | 顶部 Nemesis 区域和 Turn Order Bar 的组合 |
| `components/NemesisArea.vue` | Nemesis 牌库、弃牌堆和场上区域 |
| `components/TurnOrderBar.vue` | 六个回合槽、Nemesis/Gravehold HP、Round |
| `components/PlayerArea.vue` | 法师选择、裂隙、施法、Played、手牌、牌库和控制栏 |
| `components/MarketPanel.vue` | 九个固定位置的市场牌堆；耗尽后保留不可见空槽 |
| `components/CardDecisionModal.vue` | 通用分支、Yes/No、牌卡、玩家和伤害目标选择 UI |
| `components/CardHoverPreview.vue` | 卡牌/裂隙悬停预览 |
| `components/PileModal.vue` | 牌库、弃牌堆查看和抽牌分组注释 |
| `components/SetupScreen.vue` | 新游戏、多存档 Resume 和删除存档 |
| `components/DebugPanel.vue` | Ctrl+D 调试面板 |
| `style.css` | 全部布局、层级、边框、悬停、滚动条和选择行为 |

## 改功能去哪找

| 需求 | 首要修改位置 |
| --- | --- |
| 新增或修改 Gem | `aeons-end-engine/src/data/wave1/gems.ts` |
| 新增或修改 Relic | `aeons-end-engine/src/data/wave1/relics.ts` |
| 新增或修改 Spell | `aeons-end-engine/src/data/wave1/spells.ts` |
| 新增或修改法师/Nemesis | 对应 `aeons-end-engine/src/data/wave1/` 文件 |
| 新增一种可复用卡牌效果模块 | `types.ts` 定义 + `engine.ts` 解释器 + 引擎测试 |
| 修改普通规则判定、资源或目标 | `aeons-end-engine/src/engine.ts` |
| 修改回合/阶段转换 | `engine.ts` + `aeons-end-ui/src/game/useGame.ts` |
| 修改按钮、边框、布局和显示 | 对应 Vue 组件 + `style.css` |
| 修改玩家选择弹窗 | `CardDecisionModal.vue`；规则仍在 `engine.ts` |
| 修改存档、恢复、撤销 | `useGame.ts` |
| 修改市场固定槽或预览 | `MarketPanel.vue` + `style.css` |

## 卡牌效果系统

卡牌通过 `CardDef.effects` 声明效果块：一个效果块包含触发时机、可选条件、
一次性标记和一组按顺序执行的 `CardEffect`。解释器不按卡牌 ID 写分支，而是
依次执行这些模块。

核心入口：

- `resolveCardEffects()`：执行 `on_gain`、`on_play`、`on_cast` 效果。
- `resolvePreppedEffects()`：执行 `while_prepped` 效果。
- `runEffectResolution()`：执行效果序列，遇到玩家操作时暂停。
- `resolvePendingDecision()`：校验答案并从暂停位置继续执行。
- `getPreppedCardActions()` / `activatePreppedCardAction()`：处理主阶段可随时
  点击的非阻塞预备法术动作。

需要玩家操作时，规则状态写入 `GameState.pendingDecision` 和
`GameState.pendingEffect`。这两个字段会进入自动存档、Resume 和 Ctrl+Z 快照。
UI 不直接修改效果结果。

### 新增卡牌时的推荐流程

1. 先在 `types.ts` 和 `design/card-effects-keywords.md` 确认现有模块是否足够。
2. 如果足够，只在对应的 `data/wave1/gems.ts`、`relics.ts` 或 `spells.ts`
   新增卡牌数据和效果组合，不修改 UI；`data.ts` 会继续提供统一出口。
3. 如果缺少规则词汇，先增加通用 `CardEffect` 类型，再在 `engine.ts` 的统一
   解释器中实现一次，之后所有卡牌都可以复用。
4. 如果效果需要选择，复用已有的 `choose_one`、`choose_optional`、
   `select_cards`、`select_player_target` 或 `select_damage_target`。
5. 在 `stage7.test.ts` 增加效果成功、跳过/边界、目标和 JSON 暂停恢复测试。
6. 最后通过 Web UI 和调试面板做可视化流程验证。

例如，一个造成伤害并让任意玩家获得生命的 Spell 可以直接组合已有模块：

```ts
export const exampleSpell: SpellCard = {
  id: 'example_spell',
  name: 'Example Spell',
  type: 'spell',
  cost: 5,
  set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
      { kind: 'gain_life', amount: 1, target: 'any_player' },
    ],
  }],
}
```

一个需要在 casting phase 结束时强制玩家确认的预备效果，可以这样组合：

```ts
{
  trigger: { kind: 'while_prepped', phase: 'casting_phase_end' },
  oncePerTurn: true,
  requiresConfirmation: true,
  effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
}
```

`requiresConfirmation` 会使用通用的 `confirm_prepped_effect` 暂停机制；UI 会在
对应法术上显示红色 2px 边框。主阶段的可选 `return_card_to_hand` 则由通用绿色
高亮动作处理。两者都不需要为具体卡牌增加 UI ID 分支。

详细模型、关键词、当前卡牌覆盖、进度和未实现边界见：
[`design/card-effects-keywords.md`](design/card-effects-keywords.md)。

## 已实现的核心机制

- Gem、Relic、Spell 的类型化效果、4 张初始玩家卡和 9 张 Wave 1 市场卡。
- `gain` 默认进入弃牌堆顶，也支持效果移动到牌库顶。
- `may`、`or`、卡牌/玩家/伤害目标选择和可序列化中断恢复。
- 永久销毁卡牌，并记录到 `destroyedCards`。
- Nemesis、Minion、Gravehold 和玩家的伤害/生命目标边界处理。
- 第三、第四裂隙施放法术时，每个独立伤害实例增加 1 点；无显式伤害的类型化
  Spell 会获得一次补充伤害。
- Arcane Nexus 的主阶段非阻塞动作和 Lava Tendril 的 casting phase 结束确认。
- 不洗牌抽牌、Played/弃牌排序、自动结束回合和多存档。
- Market 固定九宫格槽位；耗尽牌堆不补位且不显示卡图。
- Ctrl+Z 最多撤销五步、Ctrl+D 调试、ESC 保存并退出/直接退出。

## 调试与验证

```powershell
# 引擎类型检查和回归测试
cd aeons-end-engine
npm test

# 前端开发服务器
cd ..\aeons-end-ui
npm install
npm run dev

# 前端生产构建
npm run build
```

浏览器端 E2E 测试（首次使用需先执行 `npx playwright install chromium`）：

```powershell
cd ..\aeons-end-ui
npm run test:e2e
```

Playwright 配置位于 `aeons-end-ui/playwright.config.ts`，测试位于
`aeons-end-ui/tests/`。配置会自动启动 Vite 开发服务器；后续可在同一目录增加
游戏流程、存档恢复、决策弹窗和视觉截图测试。功能断言适合自动化，字体清晰度、
悬停层级和整体布局等视觉细节仍建议结合浏览器人工检查。

调试面板支持修改 HP/Charge、添加卡牌、开关裂隙、导出/导入 JSON 和清除全部
存档。浏览器端 localStorage 是当前唯一的存档介质；存档列表支持多条记录、
删除确认和按条目 Resume。

## 常见坑

- 引擎原地修改 GameState；不要通过返回新对象来替代引擎约定。
- UI 改动可能因为 `useGame.ts` 模块级状态而触发 HMR 重置；刷新后可从自动存档
  Resume。
- 牌堆数组约定：`[0]` 是顶部；抽牌使用 `shift()`，弃牌顶使用 `unshift()`，
  弃牌堆翻转时使用 `reverse()`。
- 只有在 `CardEffect` 确实无法表达新规则时才扩展引擎；新增卡牌优先组合已有
  模块。
- 所有 UI 字符串必须为英文；中文只用于内部文档。

## 当前缺口

1. Jian 的 Black Mirror 和 Brama 的 Brink Siphon 已接入类型化 Ability 效果；更多
   Ability 触发时机仍需继续扩展。
2. Nemesis 的 Minion/Power 完整规则和效果结算仍未完成。
3. 当前已配置引擎回归测试和基础浏览器 E2E；复杂 UI 视觉细节仍需要浏览器手动验证。
4. 后续新增卡牌、Nemesis 和更完整的胜负规则仍需继续扩展。
