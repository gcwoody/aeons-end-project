# 开发者地图（dev-guide）

> 这是给独立开发者和 Codex 使用的唯一主开发指南。需要查看弹窗遮挡、`z-index` 或
> stacking context 时，再打开 [`design/ui-layering-guide.md`](design/ui-layering-guide.md)。

更新时间：2026-09-12

## 先记住三条

1. 卡牌和 Ability 是数据；规则由引擎解释器执行；Vue 组件不复制卡牌规则。
2. 新卡优先组合现有 `CardEffect`。只有确实无法表达的新规则，才增加一种通用效果模块。
3. `effect.kind` 和 `decision.kind` 的集中分支是解释器/渲染器的正常分支；按具体卡牌
   ID 写规则，才是需要警惕的硬编码。

## 两层架构

`aeons-end-engine` 是纯 TypeScript 规则层，原地修改一个 `GameState`；
`aeons-end-ui` 是 Vue 3 展示层，通过 `@engine` 直接引用引擎源码。

```text
data/*.ts → CardEffect / MageDef / NemesisCardDef
                    ↓
engine.ts → 规则、资源、目标、阶段、中断和胜负
                    ↓
useGame.ts → 响应式状态、UI 阶段、存档、撤销、操作入口
                    ↓
Vue components + style.css → 显示、拖拽、弹窗和布局
```

引擎与 UI 的边界是最重要的扩展边界：规则结果必须由引擎决定，UI 只能提交操作。
需要玩家选择时，引擎写入 `pendingDecision` / `pendingEffect`；这两个字段可以被
JSON 存档、Resume 和 Ctrl+Z 恢复。

## 文件地图：改功能去哪找

| 需求 | 首要位置 |
| --- | --- |
| Gem / Relic / Spell 数据 | `aeons-end-engine/src/data/wave1/gems.ts`、`relics.ts`、`spells.ts` |
| Mage 数据和 Ability 组合 | `aeons-end-engine/src/data/wave1/mage.ts` |
| Nemesis 卡牌和定义 | `aeons-end-engine/src/data/wave1/nemesis.ts` |
| 统一出口、初始/市场卡表、Common Breach 费用 | `aeons-end-engine/src/data.ts` |
| 状态、效果、触发器、决策类型 | `aeons-end-engine/src/types.ts` |
| 回合流程、效果解释器、规则判定 | `aeons-end-engine/src/engine.ts` |
| 引擎回归 | `aeons-end-engine/src/tests/stage*.test.ts` |
| UI 状态、阶段流转、存档、撤销 | `aeons-end-ui/src/game/useGame.ts` |
| 卡牌选择弹窗 | `aeons-end-ui/src/components/CardDecisionModal.vue` + `CardSelectionPanel.vue` |
| 全局布局、悬停、层级、滚动条 | `aeons-end-ui/src/style.css` |
| 玩家区域、裂隙、手牌、施法拖拽 | `aeons-end-ui/src/components/PlayerArea.vue` |
| Nemesis 区域和专属牌堆显示 | `aeons-end-ui/src/components/NemesisArea.vue` + `game/nemesis-presentation.ts` |
| 卡图、Mage 图、Breach 图路径 | `card-images.ts`、`mage-images.ts`、`breach-images.ts` |
| 浏览器流程测试 | `aeons-end-ui/tests/` |

## 当前哪些是真正可复用的

### 卡牌和 Ability：已经是模块化的

`CardDef.effects` 是一个效果块数组。效果块声明触发时机、条件、是否每回合一次，
内部再按顺序组合 `CardEffect[]`。核心入口是：

- `resolveCardEffects()`：`on_gain`、`on_play`、`on_cast`。
- `resolvePreppedEffects()`：`while_prepped`。
- `runEffectResolution()`：统一执行效果，遇到操作就暂停。
- `resolvePendingDecision()`：校验选择并从暂停点继续。
- `getPreppedCardActions()`：主阶段非阻塞的预备法术动作。

当前可以直接组合的模块包括：

| 规则类别 | 代表效果 |
| --- | --- |
| 资源 | `gain_aether`、`gain_conditional_aether`、`gain_charge`、`modify_next_breach_cost` |
| 生命与伤害 | `deal_damage`、`deal_player_damage`、`gain_life` |
| 牌区 | `draw_cards`、`discard_cards`、`destroy_cards`、`return_cards_to_hand`、`gain_card` |
| 选择 | `choose_one`、`choose_optional`、`select_*` Pending Decision |
| 施法 | `cast_prepped_spell`、`return_card_to_hand` |
| 回合顺序 | `reveal_turn_order_card`、`review_turn_order_deck`、`shuffle_turn_order_card` |
| 预备法术 | `while_prepped`、`set_prep_limit`、`prevent_damage_this_turn` |
| Nemesis 基础动作 | `unleash`、Nemesis counter、`resolve_strike` |

`CardDecisionModal.vue` 按决策类型渲染，`CardSelectionPanel.vue` 负责通用卡牌选择；
它们不应该出现 `if (cardId === 'new_card')`。同样，Ability 不维护一段仅供展示的
规则文本，而是复用同一套 `CardEffect[]`。

### UI：大部分交互也已经抽象

- 卡牌选择：通过 `PendingDecision` 参数描述来源、候选、最小/最大数量和布局。
- 牌库/弃牌查看：使用 `PileModal` 和 `pile-layout.ts`，这是“抽牌顺序展示”的专用布局，
  不应被 Kadir 这类普通弃牌选择复用。
- 所有可拖动弹窗：使用 `useModalDrag.ts`；层级参数集中在 `style.css` 顶部。
- 卡牌预览：使用 `CardHoverPreview.vue`，特殊场景通过 props 禁用或调整延迟。

## 新增内容的实际流程

### 新增一张 Gem / Relic / Spell

1. 在 `types.ts` 查看触发器、目标和 `CardEffect` 是否已经能表达规则。
2. 如果能表达，只修改对应 Wave 的数据文件，组合已有效果。
3. 在引擎测试中覆盖成功分支、选择分支、无目标/上限、重复触发和 JSON 恢复。
4. 如果需要玩家操作，复用现有 Pending Decision；不要先为这张卡单独做弹窗。
5. 最后运行引擎测试、前端构建和相关 Playwright 用例。

示例：

```ts
export const exampleSpell: SpellCard = {
  id: 'example_spell', name: 'Example Spell', type: 'spell', cost: 5, set: 'wave1',
  effects: [{
    trigger: { kind: 'on_cast' },
    effects: [
      { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
      { kind: 'gain_life', amount: 1, target: 'any_player' },
    ],
  }],
}
```

### 新增 Mage

先在 `mage.ts` 加静态资料和 Ability 效果。若触发时机、目标和效果已有类型，通常不需要
改引擎或 UI；如果出现全新时机，才扩展 `AbilityTrigger`、引擎触发入口和测试。

### 新增 Nemesis

卡牌先在 `nemesis.ts` 用 `NemesisCardDef` 描述，公共动作尽量使用现有
`NemesisEffectBlock` 和 `CardEffect`。Nemesis 通过 `NEMESES` 注册表提供给
Setup 的选择器；定义可以提供 `deckBuilder` 和 `specificDeckBuilder`，没有专属牌组时
省略对应 builder 即可。

## 当前场景边界

当前产品范围是 `ScenarioConfig.id === 'two_player'`：

- 固定两名玩家、一个 Nemesis。
- 回合顺序牌固定 6 张：每名玩家 2 张，Nemesis 2 张；下一轮由玩家数组重新生成。
- Setup 可以从已注册的 Mage 和 Nemesis 中选择；目前 Nemesis 注册表只有 Rageborne。
- 玩家 ID 由 Mage 的 Wave 和类型生成，例如 `wave1_JIAN`。它会进入回合顺序牌、目标选择、
  存档和撤销快照，不要在新代码中写 `p1` / `p2`。
- 同一个 Mage 不能被两个玩家选择。UI 会过滤第二个选择框并显示错误，引擎的
  `createTwoPlayerScenario()` 和 `createGame(scenario)` 也会再次拒绝重复选择。
- 1、3、4 人规则暂不实现；不要为了提前支持它们给当前流程增加隐含分支。

存档使用当前 v3 结构。旧 v1/v2 存档不再迁移或读取；测试存档可以直接删除并重新开始。

## 哪些地方仍然是硬编码或过渡代码

以下是有意保留的边界，而不是卡牌级别的复制粘贴：

| 位置 | 当前情况 | 什么时候重构 |
| --- | --- | --- |
| `engine.ts:buildScenarioTurnOrder()` | 只接受双玩家配置，但牌数和玩家 ID 都来自 `ScenarioConfig`/`players` | 开始实现 1、3、4 人规则时扩展 Scenario 类型 |
| `engine.ts` 的 Rageborne 分支 | Fury、Strike 和结束回合 Strike 是 Rageborne 独有机制 | 第二个 Nemesis 实装后，再比较两者并抽取真正共用的 Nemesis hooks |
| `engine.ts:nemesisDrawCard()` 与 `useGame.ts:pendingNemesis` | 为现有 UI/测试保留的 Nemesis 抽牌入口；主流程使用 `nemesisResolution` | 改动 Nemesis 抽牌流程时先确认调用者，再统一入口 |
| `card-images.ts`、`mage-images.ts` | 当前用显式 import 和映射 | 图片数量明显增大时使用目录扫描脚本生成映射，并加入缺图校验 |

以下不算坏的硬编码：卡牌费用、起始牌、Breach 方向和图片文件名属于数据配置；
`switch/if effect.kind` 属于统一解释器；`decision.kind` 属于通用 UI 渲染分派。

## 后续扩展顺序

两人场景和稳定玩家 ID 已完成，接下来按小步推进：

1. 新增第二个 Nemesis，验证 Nemesis 选择、牌组 builder、通用抽牌/结算 UI 是否足够。
2. 对比两个 Nemesis 后，只把确实共用的 Fury/Strike 之外的行为抽成 Nemesis hooks；
   Rageborne 的专属规则继续留在其定义或专属模块中。
3. 使用脚本从图片目录生成 import 映射，并在构建/测试阶段检查数据卡牌与图片是否一致。
4. 最后再设计 1、3、4 人场景的 ScenarioConfig，而不是现在为未确定的规则预留行为。

## 测试和验收

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npm run build
npx playwright test --workers=1
```

Playwright 适合验证按钮状态、弹窗流程、拖拽、存档和 DOM 几何关系；它不能完全替代人工
检查字体清晰度、动画观感和真实 Chrome 窗口中的层级。配置默认不复用旧开发服务器；若
确认 `5173` 就是当前项目，可临时使用：

```powershell
$env:PLAYWRIGHT_REUSE_SERVER='true'
npx playwright test --workers=1
```

常见约定：牌堆 `[0]` 是顶部；抽牌用 `shift()`，弃牌顶用 `unshift()`；引擎原地修改
状态；所有 UI 字符串用英文，中文只写在内部文档中。
