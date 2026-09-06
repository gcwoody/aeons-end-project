# 卡牌效果关键词参考

这份文档是卡牌效果数据模型和 UI 决策流程的共同词汇表。规则引擎负责规则结算，UI 只负责展示待决策内容并提交结构化答案。

## 关键词

| 关键词 | 规则含义 | 数据/引擎映射 |
| --- | --- | --- |
| `gain` | 获得一张卡牌；默认进入自己弃牌堆顶，除非效果明确改变目的地 | `gain_card`、`gainCard()`；`on_gain` 在获得后立即触发 |
| `may` | 可选效果，必须暂停并等待玩家接受或跳过 | `choose_optional`、`pendingDecision` |
| `ally` | 除当前效果来源玩家以外的其他玩家 | `PlayerTargetScope = 'ally'` |
| `or` | 多个互斥效果中选择一个 | `choose_one` |
| `destroy` | 将卡牌从本局牌库循环中永久移除，不进入弃牌堆或牌库 | `destroy_cards`、`PlayerState.destroyedCards` |
| `while prepped` | Spell 位于 breach 上且满足指定阶段时触发；不是打出或施放时触发。主阶段可选卡牌动作可以保持非阻塞，由玩家点击高亮目标执行 | `CardEffectTrigger.kind = 'while_prepped'`、`resolvePreppedEffects()`、`getPreppedCardActions()` |
| `cast` | Spell 被施放并结算时触发 | `CardEffectTrigger.kind = 'on_cast'` |
| `deal X damage` | 先让玩家选择合法的伤害目标，再对目标造成伤害 | `deal_damage`、`select_damage_target`、`dealDamage()` |
| `gain X life` | 让合法生命目标恢复生命，结果不能超过该对象的 `maxHp` | `gain_life`、`select_life_target`、`gainLife()` |

## 结算约定

1. 需要玩家选择时，引擎把剩余效果写入 `pendingEffect`，并把可序列化的选择写入 `pendingDecision`；UI 不直接修改游戏状态。
2. 决策答案带有决策 ID 和类型校验。刷新页面后，自动存档中的两个字段可以继续完成被暂停的效果。
3. `gain_card` 先把卡牌放入目的区域，再触发该卡的 `on_gain`；因此 `V'riswood Amber` 可以把刚获得的自己移动到牌库顶。
4. `destroy_cards` 的选择会从手牌或弃牌堆移除并记录到 `destroyedCards`；销毁不等同于弃牌。
5. `deal_damage` 和 `gain_life` 都使用目标引用，而不是把目标写死为当前玩家。生命目标可以是玩家、盟军、Gravehold 或 Nemesis；所有对象均执行 `maxHp` 上限保护。
6. `while_prepped` 的 `oncePerTurn` 标记保存在当前玩家的 `turnEffects` 中，并在新回合开始时清除。
7. 主阶段的非阻塞预备法术动作不使用阻塞式 `pendingDecision`；UI 只在目标仍然合法时显示绿色边框，点击后由引擎校验并执行。
8. `playedThisTurn` 是当前 Played 区的牌，不能直接作为“本回合打出次数”的统计；`card_play_count_this_turn` 使用 `cardPlayCountsThisTurn`，覆盖被返回手牌后再次打出的情况。

## 新卡牌接入清单

- 在 `aeons-end-engine/src/data.ts` 中只描述卡牌数据和效果块，不在 UI 中写卡牌 ID 分支。
- 复用已有 `CardEffect`；若出现新规则词汇，先扩展 `types.ts` 的类型，再在 `engine.ts` 的通用解释器中实现。
- 若效果需要玩家决定，确保候选项可从当前 `GameState` 重建，并通过 `CardDecisionModal.vue` 展示。
- 为新效果增加引擎回归测试，同时验证 JSON 序列化后的 `pendingDecision`/`pendingEffect` 可以恢复。
