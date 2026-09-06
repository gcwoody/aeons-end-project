# 类型化卡牌效果模型

> 状态：阶段 4 基础解释器已实现  
> 创建日期：2026-09-06  
> 所属计划：[`card-effects-implementation-plan.md`](card-effects-implementation-plan.md)

## 设计目标

卡牌效果以可序列化的 TypeScript 联合类型保存。卡牌数据声明“何时触发”和“执行哪些效果”，引擎负责解释这些效果；新增卡牌不应要求在引擎中增加一个按卡牌 ID 分支。

## 基本结构

每张卡通过 `CardDef.effects` 声明一个或多个 `CardEffectBlock`：

```ts
{
  trigger: { kind: 'on_cast' },
  effects: [
    { kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' },
  ],
}
```

可用触发时机：

- `on_gain`：卡牌被 gain 后。
- `on_play`：Gem 或 Relic 被打出后。
- `on_cast`：Spell 被施放后。
- `while_prepped` + `casting_phase_end`：Spell 预备在 breach 上，并在施法阶段结束时触发。
- `while_prepped` + `main_phase`：Spell 预备在 breach 上，并在主阶段提供动作。

## 效果词汇

- `gain_aether`：获得 Aether。
- `deal_damage`：对指定范围的伤害目标造成伤害。
- `draw_cards`：抽牌；可指定 `self`、`ally` 或 `any_player`，未指定时默认为自己。
- `gain_life`：让自己、Ally、任意玩家、Nemesis 或 Gravehold 获得生命；结算后的生命值不得超过目标对象各自的默认生命值上限 `maxHp`。
- `gain_card`：从市场或指定来源 gain 卡牌，并指定进入弃牌堆顶或牌库顶。
- `move_gained_card`：将刚 gain 的卡牌从弃牌堆顶移动到牌库顶。
- `discard_cards`：从手牌弃牌。
- `destroy_cards`：从指定牌区永久销毁卡牌。
- `choose_one`：在多个效果分支中选择一个，对应 `or`。
- `choose_optional`：玩家可以执行或跳过效果，对应 `may`。
- `modify_next_breach_cost`：修改下一次 focus/open 裂隙动作的费用。
- `return_card_to_hand`：将本回合打出的指定牌返回手牌。

对于 `while_prepped` + `main_phase` 中仅包含可选 `return_card_to_hand` 的效果，主阶段不创建阻塞式 `pendingDecision`。引擎通过 `getPreppedCardActions()` 暴露当前可执行目标，UI 用绿色边框标记目标牌，点击后调用 `activatePreppedCardAction()`；玩家不点击即代表跳过，且 `oncePerTurn` 标记在成功执行后记录。

对于必须执行但需要玩家确认的预备效果，`CardEffectBlock.requiresConfirmation` 设为 `true`。引擎在对应时机将效果包装为可序列化的 `confirm_prepped_effect`，写入 `pendingDecision` 与 `pendingEffect` 并暂停结算；UI 不使用会遮挡牌区的普通弹窗，而是在对应的预备法术上显示 2px 红色边框，玩家点击该牌后继续结算。该机制适用于所有未来的强制预备效果，`Lava Tendril` 是当前示例。此类效果通常应同时设置 `oncePerTurn: true`，避免确认后重新进入阶段时重复触发。

## 条件与一次性效果

`CardEffectBlock.condition` 用于表达“本回合第二次打出某牌”和“开放裂隙数量”等条件。`oncePerTurn` 表示该 `while_prepped` 效果每回合最多执行一次；具体使用记录属于 `GameState`，不写回卡牌定义。

伤害数值可以是固定数字，也可以使用 `per_open_breach` 表达“基础伤害 + 每个开放裂隙增加的伤害”。

裂隙的全局规则也在施法结算中统一处理：第三、第四裂隙开启后，任何准备在其上的法术被施放时，每个独立的伤害实例都额外造成 1 点伤害。如果卡牌的 `on_cast` 没有 `deal_damage` 效果，引擎会补充一次 1 点的普通伤害，并沿用法术伤害目标选择流程。`while_prepped` 效果本身不是施放，因此不触发该增伤。

## 目标和牌区

- 生命值目标：`self`、`ally`、`any_player`、`nemesis`、`gravehold`。
- 伤害目标：`nemesis`、`minion`、`gravehold`、`nemesis_or_minion`。
- 卡牌选择来源：`hand`、`discard`、`hand_or_discard`、`played_gem_this_turn`。
- `destroy_cards` 不等于弃牌；引擎执行时必须从牌区永久移除，并记录销毁结果。
- 所有 `gain_life` 目标都必须使用各自的默认 `maxHp` 进行封顶，不能因为效果重复结算而突破上限。

## 九张卡的模型映射方向

后续阶段将按以下方式配置，不在类型定义中写死具体卡牌：

- V'riswood Amber：`on_gain` + `choose_optional` + `move_gained_card`。
- Diamond Cluster：`on_play` + `gain_aether` + `card_play_count_this_turn` 条件。
- Burning Opal：`on_play` + `gain_aether` + 可选弃牌/Ally 抽牌组合。
- Flexing Dagger：`on_play` + `choose_one`，选择费用减免或销毁自身并造成伤害。
- Bottled Vortex：`on_play` + 销毁自身、最多销毁两张手牌/弃牌堆卡牌、抽一张牌。
- Lava Tendril：`while_prepped/casting_phase_end` 与 `on_cast` 两个效果块。
- Essence Theft：`on_cast` + 伤害 + 可选弃牌/任意玩家获得生命。
- Planar Insight：`on_cast` + `per_open_breach` 动态伤害。
- Arcane Nexus：`on_cast` + `while_prepped/main_phase` + `oncePerTurn` + 返回本回合打出的 Gem。

## 阶段 2 的边界

本阶段只建立类型和模型文档，不执行效果、不改变费用、不增加玩家选择 UI，也不改变当前引擎行为。效果解释器、Pending Decision 和具体卡牌接入分别属于后续阶段。

## 阶段 4 的解释器约定

- `resolveCardEffects(g, playerId, sourceCardId, trigger)` 负责执行某张卡在指定事件下匹配的效果块。
- `resolvePreppedEffects(g, playerId, phase)` 负责执行当前玩家已预备法术的 `while_prepped` 效果；`oncePerTurn` 使用玩家回合状态记录，而不是修改卡牌定义。
- 主阶段可随时执行的预备法术卡牌动作使用 `getPreppedCardActions()` / `activatePreppedCardAction()`，不会阻塞玩家继续进行其他主阶段操作。
- `playedThisTurn` 只表示当前仍位于 Played 区的卡牌；涉及“本回合打出次数”的条件使用玩家状态中的 `cardPlayCountsThisTurn`，因此卡牌被返回手牌后再次打出仍会保留历史次数。
- 当效果需要玩家操作时，引擎把决策写入 `GameState.pendingDecision`，同时把剩余效果和当前等待的效果写入 `GameState.pendingEffect`。调用 `resolvePendingDecision` 后，已选分支会与剩余效果重新串接执行。
- `requiresConfirmation` 产生的 `confirm_prepped_effect` 也是上述 pending 机制的一种；它只暂停并等待点击确认，不代表 `may`，因此不能被跳过。
- `gainCard` 统一处理 gain 的牌堆位置和市场数量扣减，并触发获得卡牌的 `on_gain` 效果。效果内部调用 gain 时使用同一条解释器链，避免重复触发。
- `dealDamage` 接收已解析的 Nemesis、Minion 或 Gravehold 目标；生命值和伤害均在目标对象层面进行边界保护。
- `modify_next_breach_cost` 写入玩家本回合状态，并由 `focusBreach`/`openBreachDirect` 消耗；费用减免不会跨回合保留。

阶段 4 仍不包含玩家选择 UI；通用决策展示与输入属于阶段 6，并统一由 Web UI 承担。强制预备效果的卡牌点击确认属于同一套 Web UI 决策入口。

## 阶段 5 的九张卡配置

九张市场卡已经在 `aeons-end-engine/src/data.ts` 中使用上述效果模型配置。卡牌的固定 Aether/伤害字段保留用于兼容旧数据，但只要存在对应的类型化触发块，引擎就使用效果块结算，避免重复获得 Aether 或重复造成伤害。

- Gem：V'riswood Amber、Diamond Cluster、Burning Opal。
- Relic：Flexing Dagger、Bottled Vortex；这两张卡不再走 UI 中旧的抽牌/弃牌特判。
- Spell：Lava Tendril、Essence Theft、Planar Insight、Arcane Nexus。
- `Burning Opal` 的 `any ally draws a card` 使用 `draw_cards` 的 `target: 'ally'` 表达；多玩家场景下会产生玩家目标决策。
- `Planar Insight` 使用 `per_open_breach` 动态伤害；`Diamond Cluster` 使用本回合打出次数条件。

## 阶段 6 的 UI 决策约定

`CardDecisionModal.vue` 根据 `pendingDecision.kind` 渲染统一的选择界面，提交后由 `useGame.ts` 调用 `resolvePendingDecision`。决策本身和 `pendingEffect` 都属于 `GameState`，因此会自动进入 localStorage 存档和 Ctrl+Z 快照；UI 不复制规则，也不按卡牌 ID 写分支。
