# 重要规则与裁定（Rules & Rulings）

本文集中记录项目中必须一致实现、容易遗漏或容易误读的游戏规则。引擎负责判定规则和合法操作；UI 展示引擎给出的可选项，不自行复制规则。

## Nemesis 效果中的 `OR` 选项

### 规则

当卡牌使用全大写 `OR` 给出两个选项时，通常可以任选其一。若某个选项无法完整结算，而且该选项对玩家没有好处，则玩家必须选择能够完整结算的选项。如果两个选项都无法完整结算，则选择能够结算得更多的那个选项。

这项限制不应阻止玩家从有利效果中获得部分收益。**“无法完整结算”与“效果收益较低”不是一回事**：效果数值较小，甚至精确为 0，并不自动意味着选项不可选；要看它是否完成了卡面要求。

例如：

- **Venomite** 的两个选项分别是最低生命玩家受到 2 点伤害，或任意玩家弃掉一张费用至少为 3 的已准备法术。若没有符合条件的法术，弃法术选项无法结算且对玩家无益，必须选择伤害选项。
- **Digest** 的伤害量等于空置供给堆的数量。若数量为 0，造成 0 点伤害仍然完整满足了该选项的数值要求；不能只因为结果没有伤害，就据此判定它不可选。
- 若一个有利效果要求获得 3 点生命，而目标只缺 1 点，玩家仍可以选择并获得这 1 点；规则不强迫玩家改选别的选项。

规则依据：Aeon's End Wiki 的 [Rulings](https://aeonsend.wiki.gg/wiki/Rulings) 汇总了 Nemesis 效果和 `OR` 选项的规则及设计师裁定。印刷规则书也有相同的基础原则。

### 实现要求

1. 按**整组选项的所有效果**评估能否完整结算，而不是只看是否能打开一个后续弹窗。例如“先 Unleash，再弃牌”的分支要同时评估两个步骤。
2. 可用性必须从当前 `GameState` 推导。若选项不可用，保留选项说明并禁用按钮，让玩家看清原因；不得仅在 UI 隐藏或禁用后端仍接受该选项。
3. 决策提交时，引擎必须再次校验选项。按钮禁用是交互提示，不是规则校验的替代品。
4. 当存在一个完整可结算、且其他有害选项不能完整结算时，只允许选择完整可结算的选项。当所有选项都不能完整结算时，按“尽可能多地结算”的规则处理，不能简单地把所有按钮都禁用。
5. 可用性应表达为可复用的类型化条件或通用效果分析能力，不按单张卡牌 ID 写特殊分支。现有 `CardEffectOption.condition` 可以处理部分状态条件；遇到需要检查具体可选牌、供给堆剩余量或多个子效果的情况，应扩展通用模型。
6. 对有利效果保留规则允许的部分收益；不要把任何低于标称数值的效果都判成非法。

### 当前实现采用的具体判定

- 对有害的 `OR` 分支，只有当整组选项效果都能按规则完整结算时才视为完整可用。分支可用性从当前状态计算，并在提交选择时重新计算。若所有分支都不完整，卡牌数据可以为“尽可能结算”的分支提供优先级；优先级最高的分支仍可选。
- **Devour** 是 Nemesis 的特例：只要匹配的供给堆非空，就可以选择该牌堆，即使剩余数量低于要求。Devour 该堆中剩余的牌，并按 Nemesis 规则对不足数量造成 Gravehold 伤害。空牌堆不能成为 Devour 目标。
- **Tear Apart** 的弃牌选项要求所有玩家的手牌合计至少五张，才能与 Gravehold 受伤选项并列选择；不够五张时，弃牌分支不完整。
- **Obliterate** 的摧毁选项要求目标玩家手牌中至少有四张可摧毁牌；否则只能选择伤害。分波次牌库保留各自印刷版本的数据；共享基础 Nemesis 牌池只纳入 Wave 9 版本一次。

## Nemesis 强制效果的玩家目标

- 当效果要求指定玩家弃掉或失去固定数量时，若有玩家能完整承受该数量，只允许从这些玩家中选择；若无人能完整承受，则只允许选择能承受数量最多的玩家。并列时保留所有并列目标。
- **Agony Field**、**Desperate Hour** 按可弃手牌数量筛选目标；**Ruin Priest** 按非 Corruption 手牌数量筛选；**Persist** 按可失去的 Charge 数量筛选。若 Desperate Hour 没有实际弃牌，不触发“弃掉费用为 0 的牌”后的伤害。
- **Gather Darkness** 洗入弃牌堆以及 Crooked Mask Unleash 后洗入弃牌堆时，弃牌堆为空的玩家仍是有效目标。
- **Doom Aegis** 的失去全部 Charge 目标为 Charge 最多的玩家；最高数值并列时，由玩家在并列者中选择。即使最高值为 0，也仍有有效目标。
- **Seize** 把全体玩家预备的法术视为一个集合，按费用从高到低选出最贵的两张；不先选定单一玩家。
- 对玩家主动选择的有利效果，若没有合格卡牌可供选择，可以直接跳过决策，不弹出没有实际操作的确认框。例如 Blind Abandon 手牌中没有非 Corruption 卡时自动跳过。

## Nemesis 主阶段卡牌结算顺序

- Nemesis 主阶段按棋盘上的行从上到下处理卡牌；每一行内按从左到右处理。上方专用行的在场卡牌先于普通 Nemesis Play 行结算。
- 卡牌进入某一行时，追加在该行已有卡牌的最右侧。换行也视为新到达：例如 Unbroken Reign 耗尽 Power 后移到上排，应位于已经在上排的 Regeneration 右侧。
- 只有在本回合开始时已在场、且具有对应主阶段效果的卡牌才进入本回合队列；本回合刚进场的卡牌仍遵守其自身的入场规则。
- 队列开始后保持该顺序，即使前面的效果暂停等待玩家操作，也要先完成当前卡牌，再继续队列中的下一张。

## The Terror in Brass 的 Armor Chart 与 Worldsplitter Track

- 玩家只能在自己的 Main Phase 花费 3 Aether，把 Nemesis token 放在未覆盖的 Armor Chart 格子，并结算该格效果。Fang of the First 在场时禁止这种放置；Havoc Smith 在场时，仍能放置 token，但不结算 Armor Chart 格子效果。
- Armor Chart 五格全部被覆盖后，The Terror in Brass 进入 vulnerable 状态，并把 Regeneration 放入场上。若 Regeneration 此前已结算并被设在一旁，则再次进入 vulnerable 时仍会把同一张实体牌放回场上。
- 未 vulnerable 时，Nemesis 每次受到的正数伤害降为 1；vulnerable 时伤害加倍。伤害为 0 时不会变成 1。
- Worldsplitter Track 前进一次只移动一格，并结算落点效果。普通面上没有文字的格子只移动 token、不产生额外效果；抵达终点并结算后回到 Start。
- Regeneration 耗尽 Power token 后，移除 Armor Chart 上所有 Nemesis token 并将自身设在一旁。若 Cruel Majesty 已设在一旁，同一时点还要推进 Worldsplitter Track。

规则依据：[The Terror in Brass](https://aeonsend.wiki.gg/wiki/The_Terror_in_Brass)、[Regeneration](https://aeonsend.wiki.gg/wiki/Regeneration) 和 [Cruel Majesty](https://aeonsend.wiki.gg/wiki/Cruel_Majesty)。本项目开局把 Regeneration 放在 Nemesis specific deck 中，以符合项目约定；实体规则的默认设置是将它正面朝上放在 mat 旁。

## Mage 抽牌堆的可见状态

- 初始 Mage 抽牌堆中的卡牌内容和顺序已知，在查看牌堆时正面朝上显示；Crooked Mask 增加难度时放在牌堆底部的未揭示 Corruption 仍然背面朝上。
- Mage 抽牌堆洗牌后，牌堆中的卡牌位置未知，应全部背面朝上；卡牌之后被抽到或通过其他效果公开时，再逐张恢复正面可见。
- Nemesis 效果将 Corruption 放到 Mage 抽牌堆顶或底时，该 Corruption 以背面朝上的状态进入牌堆。它之后被抽到或公开后再显示正面。

## 没有伤害效果的法术与 Breach 伤害加成

- 施放法术时，若该法术实际选中的效果没有造成任何伤害，仍要检查施法的 Breach 和其他法术伤害加成。第三或第四个 Breach 的 +1 伤害，以及其他正数法术伤害加成，都要应用到这次施法；把基础伤害视为 0，再正常结算。
- 这次补出的伤害使用法术的常规敌方目标范围；若 Nemesis 和一个或多个 Minion 都可选，玩家需要选择目标。
- 若该次施法已经结算过至少一个伤害效果（包括基础数值为 0 的伤害效果），就不再额外补出一份 0 基础伤害。原有加成仍按各伤害效果的结算规则应用。
- 例如：Doom Howl 在第四个 Breach 施放时，若选择“Wolf loses 1 Doom”，该选项本身没有伤害，但第四个 Breach 的 +1 伤害仍会造成 1 点伤害，并让玩家选择 Nemesis 或 Minion 作为目标。若选了 Doom Howl 的 3 点伤害选项，则 Breach 加成作用于该伤害，不再额外产生第二次伤害。

### 实现要求

1. 伤害加成要绑定到整次法术施放，而不能只在扫描卡牌数据时寻找 `deal_damage`。玩家可能选择不含伤害效果的分支，嵌套效果也可能在施法过程中改变最终执行的伤害效果。
2. 引擎应记录当前法术施放已经结算的伤害效果数。施法效果和嵌套选择都结束后，如果数量仍为 0 且有正数伤害加成，才以 0 基础伤害补一次通用伤害结算。
3. 补出的伤害必须复用既有伤害目标决策、伤害函数和伤害反馈；不得按 Doom Howl 或其他单张牌写特例。
4. 记录状态要随施法上下文一起保存和恢复，避免嵌套施法或暂停选择导致重复补伤害、丢失伤害记录或串到另一张法术上。

## 代码入口

- Nemesis 卡牌数据：`aeons-end-engine/src/data/wave1/nemeses/cards.ts`、`aeons-end-engine/src/data/wave9/nemeses/basic-cards.ts`、`aeons-end-engine/src/data/wave9/nemeses/crooked-mask.ts`
- 通用选项和效果解析：`aeons-end-engine/src/types.ts`、`aeons-end-engine/src/engine/effect-resolution.ts`、`aeons-end-engine/src/engine/decision-resolution.ts`
- 法术伤害加成和施法收尾：`aeons-end-engine/src/types.ts`、`aeons-end-engine/src/engine.ts`、`aeons-end-engine/src/engine/effect-resolution.ts`、`aeons-end-engine/src/engine/spell-damage-preview.ts`
- Nemesis Power 的 `TO DISCARD` 当前会先验证费用/牌数，再进入行动；提交后也会重新验证付款条件，可作为复用该模式的参考。

## 维护约定

新增或修改重要规则时，先确认规则来源，再在此处记下规则和容易踩到的边界；详细开发步骤继续写在 [dev-guide.md](dev-guide.md)，UI 约定继续写在 [ui/ui-guide.md](ui/ui-guide.md)。
