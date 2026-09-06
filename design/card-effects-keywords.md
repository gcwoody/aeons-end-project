# 卡牌效果关键词实现状态与扩展参考

> 更新时间：2026-09-06
> 范围：`aeons-end-engine/src/types.ts`、`engine.ts`、`data.ts` 和 Web UI

这份文档是规则文本、类型化卡牌数据、引擎解释器和 UI 决策流程之间的共同词汇表。
它同时记录当前实现了多少，以及新增卡牌时哪些模块可以直接复用。

## 实现总览

| 层 | 当前实现数量 | 说明 |
| --- | ---: | --- |
| 触发时机 `CardEffectTrigger` | 4 类 | `on_gain`、`on_play`、`on_cast`、`while_prepped` |
| 公开效果模块 `CardEffect` | 14 类 | 可直接在新卡牌或 Ability `effects` 中组合 |
| 条件模块 `CardEffectCondition` | 2 类 | 本回合打出次数、开放 breach 数量 |
| 玩家决策 `PendingDecision` | 7 类 + 1 内部确认 | 统一由引擎暂停、UI 展示并恢复 |

`confirm_prepped_effect` 是引擎内部的控制效果，不建议卡牌数据直接使用；卡牌
数据应使用 `CardEffectBlock.requiresConfirmation: true` 触发它。

## 关键词与实现映射

| 规则关键词 | 当前状态 | 数据模块/引擎入口 | 当前语义 |
| --- | --- | --- | --- |
| `gain` | 已实现 | `gain_card`、`gainCard()` | 默认把卡牌放入自己的弃牌堆顶；支持市场/指定卡牌和牌库顶目的地 |
| 条件 Aether | 已实现 | `gain_conditional_aether` | 将指定条件资源写入本回合状态，只能由对应资源类型消费 |
| `may` | 已实现 | `choose_optional`、`pendingDecision` | 创建 Yes/No 决策；选择 No 时跳过嵌套效果 |
| `ally` | 已实现 | `PlayerTargetScope = 'ally'` | 排除效果来源玩家的其他玩家；多个 Ally 时要求选择 |
| `or` | 已实现 | `choose_one` | 在多个互斥效果分支中选择一个 |
| `destroy` | 已实现 | `destroy_cards`、`destroyedCards` | 从当前牌区永久移除，不进入弃牌堆或牌库 |
| `while prepped` | 已实现 | `while_prepped`、`resolvePreppedEffects()` | 根据 casting phase 结束或 main phase 触发；主阶段可做非阻塞动作 |
| `cast` | 已实现 | `on_cast`、`castSpell()` | Spell 被施放后执行对应效果块 |
| `deal X damage` | 已实现 | `deal_damage`、`dealDamage()` | 支持 Nemesis、Minion、Gravehold 和 Nemesis/Minion 目标选择 |
| `gain X life` | 已实现 | `gain_life`、`gainLife()` | 支持玩家、Nemesis、Gravehold；各自不超过 `maxHp` |
| `draw` | 已实现 | `draw_cards`、`drawCardsForPlayer()` | 支持自己、Ally、任意玩家；多个目标时暂停选择 |
| `focus/open` 减免 | 已实现 | `modify_next_breach_cost` | 保存本回合下一次 focus/open 的费用减免并在使用时消耗 |
| 返回手牌 | 已实现 | `return_card_to_hand` | 当前支持本回合打出的 Gem，Arcane Nexus 使用此模块 |
| 复制施放预备法术 | 已实现 | `cast_prepped_spell` | 支持选择任意玩家的预备法术，并控制本次施放是否弃牌；由触发能力的玩家作为施法者承接该法术的玩家增益 |

## Ability

角色能力使用和卡牌相同的 `CardEffect[]` 效果队列，不再维护一段仅用于展示的
`abilityDesc` 文本。当前已实现的能力如下：

| Ability | 触发时机 | 类型化效果组合 |
| --- | --- | --- |
| Brama — Brink Siphon | `main_phase` | `gain_life(amount: 4, target: any_player)` |
| Jian — Black Mirror | `main_phase` | 选择预备法术；第一次 `cast_prepped_spell(discard: false)`，第二次 `discard: true` |

`AbilityTrigger` 已为 `casting_phase`、`ally_turn_end` 和 Nemesis 抽牌等未来时机
预留类型，但目前只有 `main_phase` 有主动触发入口。

## 触发时机

- `on_gain`：卡牌进入目标牌区后立即触发。`gainCard()` 会先移动卡牌，再调用
  `on_gain`，所以 V'riswood Amber 能移动“刚获得的自己”。
- `on_play`：Gem 或 Relic 从手牌打出并进入 Played 后触发。
- `on_cast`：Spell 从 breach 施放后触发。
- `cast_prepped_spell` 的施法者规则：被选择的法术可以属于任意玩家，但该
  效果模块的 `resolution.playerId` 才是本次施法者。因此，法术带来的 `gain_aether`、
  `gain_life`、抽牌、弃牌等面向玩家的效果，以及“your open breaches”等施法者条件，
  都以施法者为准；法术仍从原拥有者的 breach 施放，并在 `discard: true` 时进入原
  拥有者的弃牌堆。Jian 用 Black Mirror 施放 Brama 的 Buried Light 时，Aether 会给 Jian。
- `while_prepped` + `casting_phase_end`：Casting Phase 结束点结算。若效果块
  设置 `requiresConfirmation`，UI 在对应 Spell 上显示红色 2px 边框，点击后才
  继续结算；没有 `may` 时不能跳过。
- `while_prepped` + `main_phase`：主阶段提供持续或可重复检查的动作。当前仅包含
  可选 `return_card_to_hand` 的动作会以绿色边框显示在合法目标上，不阻塞其他主
  阶段操作；不点击即代表不执行。

## 条件与状态

目前有两种通用条件：

```ts
type CardEffectCondition =
  | {
      kind: 'card_play_count_this_turn'
      cardId: string
      comparison: 'equals' | 'at_least'
      count: number
    }
  | {
      kind: 'open_breach_count'
      comparison: 'equals' | 'at_least'
      count: number
    }
```

`card_play_count_this_turn` 使用 `PlayerState.cardPlayCountsThisTurn`，而不是
直接数 `playedThisTurn`。因此牌被 Arcane Nexus 返回手牌后再次打出，Diamond
Cluster 仍然能正确识别本回合的历史次数。

`oncePerTurn` 的使用记录保存在玩家的 `turnEffects.usedPreppedEffects`，抽牌阶段
清除；不会修改全局卡牌定义。

## 可复用的目标和牌区模块

- 生命目标：`self`、`ally`、`any_player`、`nemesis`、`gravehold`。
- 伤害目标：`nemesis`、`minion`、`gravehold`、`nemesis_or_minion`。
- 卡牌选择来源：`hand`、`discard`、`hand_or_discard`、`played_gem_this_turn`。
- `gain_card` 来源：`market` 或 `specific`。
- `gain_card` 目的地：`discard_top` 或 `deck_top`。

所有需要多个候选目标的效果都使用 `pendingDecision`，候选项包含牌区、索引和
卡牌 ID。这样 UI 可以把 Hand 与 Discard Pile 分成不同区域展示，引擎也能在
恢复时重新校验选择是否仍然有效。

## 当前卡牌覆盖矩阵

| 卡牌 | 类型化效果组合 |
| --- | --- |
| Spark | `on_cast` + `deal_damage` |
| Crystal | `on_play` + `gain_aether` |
| Moonstone Shard | `on_play` + `gain_aether` + `gain_conditional_aether(gem)` |
| V'riswood Amber | `on_play` + `gain_aether`；`on_gain` + `choose_optional` + `move_gained_card` |
| Diamond Cluster | `on_play` + `gain_aether` + `card_play_count_this_turn` |
| Burning Opal | `on_play` + `gain_aether` + `choose_optional` + `discard_cards` + Ally `draw_cards` |
| Flexing Dagger | `on_play` + `choose_one`；费用减免分支或 `destroy_cards` + `deal_damage` |
| Bottled Vortex | `on_play` + 自身销毁 + `hand_or_discard` 销毁 + `draw_cards` |
| Lava Tendril | `while_prepped/casting_phase_end` 强制确认 + `deal_damage`；`on_cast` + 伤害 |
| Essence Theft | `on_cast` + 伤害 + `choose_optional` + 弃牌 + `gain_life` |
| Planar Insight | `on_cast` + `per_open_breach` 动态伤害 |
| Arcane Nexus | `while_prepped/main_phase` + 可选返回 Gem；`on_cast` + 伤害 |

当前所有初始 Gem/Spell（Spark、Crystal、Moonstone Shard、Buried Light）都已经
使用类型化效果。旧 Gem/Spell/Relic 字段和 demo 专用 Relic 抽牌弃牌逻辑已经删除；
当前玩家卡牌的结算只经过类型化效果解释器。

## 伤害相关的全局规则

第三、第四 breach 开启后，在其上施放的 Spell 获得全局伤害加成。加成按每个独立
的 `deal_damage` 效果实例计算，而不是每张 Spell 只计算一次。如果类型化 Spell
的 `on_cast` 没有显式 `deal_damage`，引擎会补充一次 1 点普通伤害，并沿用目标
选择流程。`while_prepped` 不是施放，不触发这项施法增伤。

## 新增卡牌：优先组合已有模块

### 只有已有模块时：只改对应的卡牌数据文件

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
      { kind: 'draw_cards', amount: 1, target: 'self' },
    ],
  }],
}
```

组合 `effects` 数组会按顺序结算；效果中途需要选择时，引擎自动暂停，选择完成
后继续后面的模块。

### 新增强制预备效果

```ts
{
  trigger: { kind: 'while_prepped', phase: 'casting_phase_end' },
  oncePerTurn: true,
  requiresConfirmation: true,
  effects: [{ kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' }],
}
```

不要在 UI 中增加 `if (cardId === 'new_card')`。`requiresConfirmation` 会生成
通用 `confirm_prepped_effect`，UI 只根据 pending decision 中的 `cardId` 和
`breachIndex` 显示可点击的红框。

### 出现全新关键词时

1. 在 `types.ts` 增加最小、可序列化的 `CardEffect` 数据结构。
2. 在 `engine.ts` 的 `runEffectResolution()` 增加一次通用解释逻辑。
3. 如果需要选择，复用已有决策类型；只有现有决策无法表达时才增加新的
   `PendingDecision` 类型。
4. 让 `CardDecisionModal.vue` 只增加该决策类型的通用展示，不写卡牌 ID 分支。
5. 为成功、跳过、无目标、上限、重复触发和 JSON 恢复增加测试。
6. 更新本文件的数量、映射和当前卡牌覆盖矩阵。

## 当前未实现或仅部分实现的范围

- 更多角色 Ability 触发时机，以及更复杂的复制施法规则。
- Nemesis Minion/Power 的完整持续效果和规则文本解释。
- 更复杂的“每个/所有/直到”等集合操作和通用计数表达式。
- 更广泛的任意牌区移动、获得多张牌和复杂嵌套目标规则。
- 更完整的 UI 自动化测试；目前已有基础 Playwright smoke test，复杂视觉细节仍需浏览器手动验证。

这些缺口不应通过给单张卡牌增加特殊分支来解决；应先抽象成新的可复用模块。

## 项目进度与设计决策

七阶段主计划已经完成，当前进入持续扩展阶段：

1. **规则基线**：以用户确认的卡牌名称、费用、类型和效果为准。
2. **类型化模型**：建立可序列化的 `CardEffect`、触发时机、条件、目标和决策类型。
3. **引擎基础**：统一处理 gain、牌区操作、销毁、生命上限和可恢复的 Pending Decision。
4. **通用解释器**：在 `engine.ts` 中按效果序列执行规则，不按卡牌 ID 写分支。
5. **卡牌接入**：4 张初始玩家卡和 9 张 Wave 1 市场卡全部迁移到类型化 `effects`。
6. **Web UI**：通过统一的 `CardDecisionModal` 展示选择，并支持存档恢复和撤销。
7. **回归验证**：引擎测试覆盖当前玩家卡、关键词、边界、JSON 暂停恢复和存档形状。

关键约定：

- CLI 已删除；可视化流程通过 Web UI 和 Ctrl+D 调试面板验证，引擎规则仍保持独立。
- 新卡优先只修改 `data.ts` 组合现有模块；只有新规则无法表达时，才扩展类型、解释器、UI 决策和测试。
- 当前玩家卡牌不保留旧的 `damage`、`aetherValue`、`drawCount` 等效果字段；所有卡牌效果都声明在 `effects` 中。
- `gain_conditional_aether` 会把条件资源独立记录在玩家本回合状态中；购买符合条件的卡牌时优先消耗条件资源，再消耗通用 Aether。
- 规则状态由引擎原地修改；UI 不复制卡牌效果，也不增加按卡牌 ID 编写的特殊分支。
