# Nemesis 效果可执行性审查

更新时间：2026-10-11

本文件记录已实现的 Nemesis 效果可执行性检查及重要边界。稳定规则见[重要规则与裁定](../game-rulings.md)。适用范围包括 Wave 1 / Wave 9 基础 Nemesis 卡、Rageborne、Prince of Gluttons、Crooked Mask 及其 Corruption。当前项目接入了 Rageborne、Prince of Gluttons 和 Crooked Mask。

## `OR` 选项

| 卡牌 / 选项 | 可用条件与处理 | 状态 |
| --- | --- | --- |
| Venomite：弃费用至少 3 的已准备法术 | 任一玩家至少有一张符合费用条件的预备法术；否则禁用弃牌选项。 | 已实现 |
| Awaken：返回最近弃掉的 Minion | Nemesis 弃牌堆有 Minion 时可选。 | 已实现 |
| Sunder：洗入 Nemesis 回合顺序牌 | 回合顺序弃牌堆有 Nemesis 牌时可选。 | 已实现 |
| Lobotomize：Devour 3 张法术供给牌 | 至少一个非空法术堆即可；数量不足时 Devour 剩余牌，并按 Nemesis 规则让 Gravehold 受伤。 | 已实现 |
| Thought Biter：Devour 最便宜 Relic 堆中的 2 张 | 至少一个非空 Relic 堆即可；最低费用只在非空堆中比较；数量不足时使用 Devour 补偿规则。 | 已实现 |
| Tear Apart：全体玩家 collectively 弃 5 张 | 所有玩家手牌合计至少 5 张时可选；不足时禁用此选项。 | 已实现 |
| Obliterate（Wave 1 / Wave 9） | 目标玩家至少有 4 张手牌时可摧毁；否则只能选伤害。各波次各自保留卡牌数据，共享池只收录 Wave 9 版本。 | 已实现 |
| Persist：放回 Nemesis 回合顺序牌 / Unleash 并失去 3 Charge | 回合顺序牌分支要求 Nemesis 回合顺序牌在弃牌堆；Charge 分支要求有玩家能失去 3。若两项都无法完整执行，保留 Unleash 并失去现有 Charge 数量的分支作为最佳努力选项。 | 已实现 |
| Punish：结算弃牌堆底部 Attack 两次 | 底部 Attack 必须存在即时效果；否则禁用 Attack 分支，只能 Unleash 四次。 | 已实现 |
| Dismal Outcome、Scorn、Digest | 两个选项都按其文本可执行；Digest 的结果为 0 仍是完整执行，不禁用。 | 保留原逻辑 |

## 玩家目标与集合选择

- Agony Field / Desperate Hour：优先保留能弃掉要求数量的玩家；若无人满足，则只保留可弃数量最多的玩家。Desperate Hour 的弃牌后续伤害仅在实际弃掉费用为 0 的卡时触发。
- Ruin Priest：按非 Corruption 手牌数量筛目标；无人能弃足三张时，选择能弃最多张数的玩家。
- Persist：按可失去的 Charge 数量筛目标；无人能失去三点时，选择 Charge 最多的玩家。
- Gather Darkness 与 Crooked Mask Unleash：弃牌堆为空不影响目标合法性。
- Doom Aegis：失去 Charge 的玩家必须是 Charge 最多者；并列最高者均可选，最高值为 0 也仍有效。
- Seize：把全体玩家预备法术作为一个集合，整体选费用最高的两张；不是先选一位玩家。
- Blind Abandon：没有非 Corruption 手牌可摧毁时，跳过可选确认。

## 通用引擎入口

- 条件、Nemesis 牌数据与效果解析：`aeons-end-engine/src/types.ts`、`aeons-end-engine/src/engine/effect-conditions.ts`、`aeons-end-engine/src/engine/effect-resolution.ts`、`aeons-end-engine/src/engine/decision-resolution.ts`。
- Nemesis `OR` 条件以类型化 `CardEffectCondition` 表达；提交选择时重新计算。全分支不可完整执行时，卡牌数据可用 `fallbackPriority` 指定最佳努力分支。
- 目标数量策略由共享目标筛选工具处理，保留所有完整目标；若不存在完整目标，则保留可处理数量最多的并列目标。
- Devour 的非空牌堆筛选、数量不足补偿伤害由通用 Devour 规则处理；牌效可用性只检查是否存在可选的非空目标堆。
