# 卡牌效果系统实施计划

> 状态：阶段 7 已完成，进入后续卡牌内容扩展  
> 创建日期：2026-09-06  
> 适用范围：`aeons-end-engine` + `aeons-end-ui`

## 目标

为市场卡牌建立可扩展的效果系统，使新增卡牌主要通过数据配置完成，并让引擎与 Web UI 共用同一套规则与玩家选择流程。

## 当前已知问题

- Gem 目前只有统一的 Aether 结算，无法表达获得卡牌后的特殊效果或条件效果。
- Relic 的部分结算逻辑在 UI 的 `useGame.ts` 中，不适合作为长期架构。
- Spell 目前直接对 Nemesis 造成伤害，尚无通用目标选择和 Minion 目标支持。
- `may`、`or`、`destroy`、`while prepped`、`gain life` 尚无通用结算机制。
- 尚无“本回合一次”的持续效果状态。
- 尚无永久销毁卡牌的记录和统一牌区操作。
- 现有卡牌数据中的部分费用与最新描述不一致。

## 七阶段实施方案

### 阶段 1：确认卡牌清单与规则基线

- 确认每张卡的名称、图片、费用、类型和完整效果。
- 修正当前数据中的费用差异：Flexing Dagger、Lava Tendril、Essence Theft、Planar Insight、Arcane Nexus。
- 第三张 Gem 已确认是 `Burning Opal`；后续以用户提供的效果和费用为准。
- 明确伤害目标、销毁来源、玩家选择取消、触发时机等边界规则。

**阶段状态：已确认。规则数据以用户提供的描述为准；现有代码中的卡牌费用和效果不作为基线。**

### 阶段 2：设计类型化卡牌效果数据模型

- 在 `types.ts` 中定义可复用的效果联合类型，而不是为每张卡写独立分支。
- 区分效果触发时机：`gain`、`play`、`cast`、`while_prepped`、回合/阶段结束等。
- 保留必要的通用数据字段，同时让特殊效果由结构化 `effects` 描述。
- 为未来卡牌预留条件、序列、选择、目标和一次性效果表达能力。

**阶段状态：已完成。类型定义见 `aeons-end-engine/src/types.ts`，设计说明见 `design/card-effects-model.md`。本阶段未执行效果。**

### 阶段 3：建立引擎基础规则与 Pending Decision

- 增加统一的 `gainCard`、牌库/手牌/弃牌堆操作和牌卡销毁辅助函数。
- 默认将 `gain` 的卡牌放入弃牌堆顶；V'riswood Amber 再通过选择放到牌库顶。
- 增加 `pendingDecision`，表达 `may`、`or`、弃牌、销毁、选玩家和选伤害目标。
- 增加本回合效果状态，并在回合结束时重置。
- 增加伤害目标抽象，支持 Nemesis、Gravehold 和未来的 Minion。
- 保证生命值不会超过各自最大值。
- `gain_life` 适用于玩家、Nemesis 和 Gravehold；所有目标都不能超过各自的默认 `maxHp`。

**阶段状态：已完成。** 已在 `types.ts` 中补充可序列化的决策、牌区选择、生命目标、伤害目标和本回合效果状态模型；已在 `engine.ts` 中加入牌卡获得、牌区移除、永久销毁、生命值上限保护和目标枚举基础函数。`gain` 默认进入弃牌堆顶，也支持牌库顶；`pendingDecision` 已作为 `GameState` 的基础字段接入，但具体卡牌效果和选择器结算留待阶段 4。

### 阶段 4：实现通用关键词结算器

- 实现 `gain`、`may`、`ally`、`or`、`destroy`、`while prepped`、`cast`、`deal damage`、`gain life`。
- 将焦点/开启裂隙的下次费用减免纳入通用资源修改机制。
- 统一处理效果执行后的消息、后续选择和中断恢复。
- 保持引擎原地修改 `GameState` 的现有约定。

**阶段状态：已完成。** 通用效果解释器已加入 `engine.ts`，支持效果序列、条件过滤、`may`/`or` 决策暂停与续接、牌区选择、玩家/生命/伤害目标选择、`gain`/`destroy`/`draw`/`deal damage`/`gain life`、`while prepped` 触发，以及下一次 focus/open 费用减免。玩家选择 UI 留待阶段 6，具体 9 张市场卡的数据接入留待阶段 5。

### 阶段 5：按类型接入 9 张市场卡

- Gem：V'riswood Amber、Diamond Cluster、Burning Opal。
- Relic：Flexing Dagger、Bottled Vortex。
- Spell：Lava Tendril、Essence Theft、Planar Insight、Arcane Nexus。
- 先完成无选择的基础效果，再接入弃牌/销毁/目标选择和持续效果。
- 将 Relic 的抽牌与特殊效果从 UI 移回引擎。

**阶段状态：已完成。** 9 张市场卡已按用户确认的名称、费用和效果写入 `data.ts`；Gem/Relic/Spell 的类型化触发均已接入引擎，Relic 的旧 UI 抽牌特判已对类型化效果卡关闭。阶段 6 负责把当前引擎决策接入可操作的 Web UI 选择流程。

### 阶段 6：接入 Web UI 的选择流程

- 在 `useGame.ts` 中统一处理引擎的 pending decision。
- 增加通用选择 UI：二选一、是/否、选择卡牌、选择玩家、选择伤害目标。
- 将选择状态纳入自动存档、恢复和 Ctrl+Z。
- 维持自动结束回合和当前阶段流转行为。

**阶段状态：已完成。** 已新增通用 `CardDecisionModal`，覆盖分支选择、Yes/No、牌卡选择、玩家目标和伤害目标；`useGame.ts` 通过 `resolveDecision` 将答案交给引擎，并复用现有自动存档、恢复、Ctrl+Z 和自动结束回合机制。CLI 已删除，不再维护终端选择流程。

### 阶段 7：测试、文档和回归验证

- 增加每个关键词的引擎测试，包括成功、取消和边界情况。
- 增加 9 张卡的独立行为测试。
- 添加关键词参考文档：`design/card-effects-keywords.md`。
- 验证 UI、存档恢复、撤销、自动结束回合和胜负判定。
- 每完成一个阶段更新本文档的状态和决策记录。

**阶段状态：已完成。** 已新增 `aeons-end-engine/src/tests/stage7.test.ts`，覆盖 9 张市场卡的效果数据、通用关键词结算、目标选择、一次性回合效果、永久销毁、生命上限，以及 JSON 序列化后的暂停决策续接；新增 `design/card-effects-keywords.md` 作为关键词参考。UI 生产构建通过，并完成浏览器端自动存档、刷新恢复和 Resume 流程回归验证。

## 推荐实现顺序

先完成阶段 1 和阶段 2，再实现阶段 3 的决策框架；之后按 Gem → Relic → Spell 的顺序推进。不要先为单张卡牌写 UI 特判。

## 待确认事项

1. 第三张 Gem 是 `Burning Opal`、`Searing Ruby`，还是确实存在两张不同费用的 `Diamond Cluster`？
2. Flexing Dagger 的“next time you focus or open”是否包括 direct open，以及 focus 后自动 open 的情况？
3. Spell 的伤害目标选择是否在每次施法时都必须出现，即使当前场上只有 Nemesis？

## 决策记录

- 2026-09-06：决定将 7 阶段计划保存到仓库，而不是只依赖聊天上下文。
- 2026-09-06：倾向采用类型化效果 DSL + 通用 Pending Decision，而不是按卡牌 ID 堆叠条件分支。
- 2026-09-06：阶段 2 完成；新增触发时机、条件、目标、牌区、选择、动态数值和一次性效果的类型化模型，暂不改变现有规则行为。
- 2026-09-06：阶段 3 完成；新增 `pendingDecision`/决策 ID、通用牌区选择、`gainCard`、永久销毁、生命目标与伤害目标辅助逻辑，并让本回合效果状态在新回合开始时重置。
- 2026-09-06：阶段 4 完成；新增效果序列解释器和 `pendingEffect` 续接状态，接入关键词结算、目标选择、`while_prepped` 触发和 focus/open 下一次费用减免；暂不加入 UI 选择器和具体市场卡配置。
- 2026-09-06：阶段 5 完成；按用户提供的数据接入 9 张市场卡，修正费用，配置 `on_gain`/`on_play`/`on_cast`/`while_prepped` 效果，并消除类型化 Gem/Spell 与旧字段的重复结算。
- 2026-09-06：决定删除 CLI；CLI 入口、命令行交互、CLI 专用存档和相关脚本将移除，后续测试与玩家选择统一通过 Web UI 和调试面板完成。
- 2026-09-06：阶段 6 完成；新增 `CardDecisionModal.vue` 和 `useGame.resolveDecision`，所有 `pendingDecision` 统一通过 Web UI 提交，决策续接纳入自动存档和撤销。
- 2026-09-06：阶段 7 完成；新增 9 张卡与关键词回归测试、关键词参考文档，并为旧存档补充新字段归一化恢复逻辑；浏览器端确认自动存档、刷新恢复和 Resume 流程可用。
- 2026-09-06：Arcane Nexus 主阶段效果改为可复用的非阻塞卡牌动作；`getPreppedCardActions()` 动态提供本回合已打出的 Gem，UI 以绿色 2px 边框标记，点击后由引擎执行回手并消耗本回合一次性标记。
