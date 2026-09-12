# Nemesis 实装计划：Rageborne

更新日期：2026-09-10。本文是实施计划，不代表以下功能已经完成。
每完成一个阶段，更新本文件的状态、实际验证结果和遗留项。

## 范围与当前进度

本轮目标：两人游戏中完整对战 Rageborne，包含标准模式、Increased Difficulty、
9 张专属 Nemesis 卡、6 张 Strike 卡、22 张 Basic Nemesis 候选卡、完整阶段流程和 UI。
实际每局 Nemesis Deck 为 24 张；Strike Deck 独立，不计入 24 张。
其余三个 Nemesis 仅保留资源，不在本轮实装；其他人数的配牌数量暂不猜测。

| 阶段 | 交付内容 | 状态 |
| --- | --- | --- |
| 0 | 卡面规则建档、缺口与交互约定 | Wiki 资料采集已完成；待人工核对规则冲突 |
| 1 | 类型化数据模型、牌库构建与初始化 | 已完成（两人 Rageborne 配牌与初始化已接入） |
| 2 | Nemesis 阶段推进、可暂停结算、三种卡生命周期 | 已完成（引擎状态机与生命周期已接入） |
| 3 | 通用效果、目标规则、To Discard 支付 | 已完成（通用引擎接口与测试已接入） |
| 4 | Rageborne、全部候选卡与 Mage 联动 | 已完成（引擎与类型化数据已接入） |
| 5 | 完整 UI、图片、阶段提示与交互 | 已完成（2026-09-11） |
| 6 | 存档、撤销、随机状态与旧 Demo 存档处理 | 待执行 |
| 7 | 引擎与浏览器验收、文档收尾 | 待执行 |

测试随阶段增加，不能等阶段 7 才验证。阶段 6 虽集中验收存档，但从阶段 1 开始
就要求全部运行状态可序列化。

## 已检查的代码现状

- `aeons-end-engine/src/data/wave1/nemesis.ts` 生成 24 张占位 Attack，只有伤害数值。
- `engine.ts/createGame()` 硬编码这 24 个 ID，没有从 Basic 候选池抽选。
- `types.ts/NemesisCard` 仍有 `damage`、字符串式 `persistentEffect/powerEffect`；
  这些没有构成完整的类型化 Nemesis 效果系统。
- `nemesisDrawCard()` 抽牌后直接将卡放入弃牌堆，不能表达入场及结算前响应。
- `NemesisCardInPlay` 和击杀 Minion 后弃置已有基础，但缺少主阶段顺序结算。
- `aeons-end-ui/src/game/useGame.ts` 用 `pendingNemesis` 和 `nemesis_target`
  处理简化 Attack；这部分流程需要移交引擎。
- `NemesisArea.vue` 只有牌堆数量和文字卡牌，没有完整 Mat、卡图、目标和指示物交互。
- 可复用：类型化效果解释器、Pending Decision、伤害/生命模块、卡牌选择、悬停预览、
  弹窗拖动、保存/恢复与撤销基础设施。需要审查目标上下文和嵌套暂停能力，不能直接假设适用。

## 已确认的通用规则

### 两人牌库

| 位置 | Tier | 专属卡 | 随机抽取 Basic 卡 | 合计 |
| --- | --- | ---: | ---: | ---: |
| 顶部 | 1 | 3 | 3（候选池 8 张） | 6 |
| 中部 | 2 | 3 | 5（候选池 7 张） | 8 |
| 底部 | 3 | 3 | 7（候选池 7 张） | 10 |

Basic 卡在同 Tier 候选池内不放回抽取；各 Tier 混入专属卡后独立洗牌，
最后按 Tier 1 → Tier 2 → Tier 3 拼接，不能整体再洗牌。

### 阶段与卡牌生命周期

1. Main Phase：按入场时间，从最老到最新逐张处理 Minion 和 Power。
2. Minion：结算 Persistent；本回合 Draw Phase 新入场的 Minion 不执行 Persistent。
3. Power：移除一个 Power 指示物；降至零才结算效果。新入场回合不倒数。
4. Draw Phase：通常抽一张，展示并处理结算前响应，然后按类型结算。
5. Attack：立即结算其效果。Minion/Power：入场并初始化指示物，执行 Immediately，
   不执行本应在后续 Main Phase 触发的效果。
6. Minion 生命降至零或以下，移入 Nemesis Discard。
7. To Discard：玩家自己的 Main Phase 可选择支付条件，成功后移除场上 Power。
8. 处理 Nemesis 回合结束规则后，才能翻下一张 Turn Order card。

规则建档时补充确认：Attack/Power 完整结算后的弃置时点、To Discard 移入弃牌堆的规则、
Nemesis 牌库耗尽时的处理与胜利条件、穷尽/超额伤害规则及特殊卡重写默认规则的情况。
这些不能沿用 Demo 行为当作规则依据。

## 阶段 0：核对完整资料

已完成资料采集：

- [Wave 1 Nemesis Wiki 规则资料库](../documents/wave1-nemesis-wiki-rules.md)
- [采集脚本](../image-database/collect_nemesis_wiki_rules.py)
- 采集范围：22 张 Basic Nemesis Cards、9 张 Rageborne Unique Cards、6 张 Strike Cards，
  以及 Rageborne Mat 的规则章节。
- 脚本已处理 Wiki 重定向（例如 `Bane Sire` → `Banesire`），并保留 canonical title 和来源链接。
- 文档包含类型、Tier、Life/Power、卡面效果及详情页中的规则段落；叙事章节未纳入规则摘要。

剩余工作是人工核对 Wiki 规则与本项目已经确认的规则是否存在冲突，尤其是 Basic 卡的
`To Discard`、Power 倒数、Rageborne 的 Fury/Strike 以及不同版本卡面的差异。

逐项核对 9 张 Rageborne 卡、6 张 Strike 卡、22 张 Basic 卡，共 37 张效果定义。
每张记录 ID、类型、Tier、Life/Power、触发时机、目标限制、效果顺序、To Discard 条件及图源。
以用户提供规则为准；本地卡面作为核对材料，有歧义或版本冲突时单独提出。

本地 Rageborne Mat 初读资料（具体实施前与其他规则一并核对）：

- Life 70；印刷 Difficulty Level 2，和玩家选择的难度模式是两个不同字段。
- Setup：洗混 6 张 Strike，初始获得 1 Fury。
- Unleash：获得 1 Fury。
- Strike：抽 Strike 并结算，将其洗回 Strike Deck，然后减少 3 Fury。
- 回合结束：Fury 至少为 4 时 Strike 一次。不能擅自改成循环 Strike 直到低于 4。
- Increased Difficulty：Strike 后只减少 1 Fury，替代标准的 3。

需要逐卡核对主动 Strike、Fury 不足时的减量下限、特殊目标、并列目标、强制选择不足额、
额外抽 Nemesis 卡及额外 Persistent 等情况。无明确资料不自行补效果。

验收：37 张卡都有可追踪规则条目；列出实际所需关键词；明确无法确认的规则点。
不要求把整段卡面描述复制为运行时代码字段。

## 阶段 1：数据模型与构建牌库

状态：已完成（2026-09-11）。

实际交付：

- `types.ts` 新增 `NemesisCardDef`、`StrikeCardDef`、`NemesisDef` 和 `NemesisDifficulty`，
  Minion 的 `life`、Power 的 `power` 已从运行时指示物字段中分离出来。
- `data/wave1/nemesis.ts` 已登记 22 张 Basic、9 张 Rageborne Unique 和 6 张 Strike，
  并按卡牌类型及 Tier 建立静态索引。
- `buildRageborneDeck()` 按 6/8/10 的 Tier 顺序构建两人牌库，每个 Tier 独立洗牌，
  并按 3/5/7 的规则从对应 Basic 候选池中抽取。
- `buildRageborneStrikeDeck()` 独立洗混 6 张 Strike；Strike 不进入 24 张 Nemesis Deck。
- `createGame()` 已保存 Nemesis 定义、名称、印刷难度、标准/增强难度、Strike 牌堆和
  Rageborne 初始 Fury；第三个参数可选择 `standard` 或 `increased`。
- 阶段 1 回归测试已加入 `src/tests/stage1.test.ts`，并由现有测试脚本一并执行。

验证结果：阶段 1 测试、阶段 7 引擎回归和 UI 生产构建均已通过。Nemesis 阶段效果解释、
Power/Minion 结算和 Rageborne Fury/Strike 行为留到后续阶段实现。

区分静态定义和运行状态：

- `NemesisDef`：ID、名称、初始/上限 Life、印刷难度、Setup、Unleash、额外规则、
  Increased Difficulty 规则覆盖、专属卡池和专属辅助牌堆配置。
- `NemesisCardDef`：Attack/Minion/Power 判别类型、Tier、类型化效果块，
  Minion 才声明初始 Life，Power 才声明初始 Power 与可选弃置费用。
- `NemesisCardInstance`：唯一实例 ID、定义 ID、入场顺序及当前指示物。
  不能只用卡牌 ID 或每回合一次的 timestamp 定位，防止同回合多次入场或同名卡混淆。
- Strike 定义为辅助牌堆卡，不冒充三种 Nemesis Deck 卡之一，也不进入 Tier 配牌。
- 规则资源如 Fury 放在 Nemesis 专属状态中，通过可复用计数器操作访问。

建议数据目录：

```text
aeons-end-engine/src/data/wave1/
  nemesis.ts                  # 统一导出、Nemesis 注册
  nemesis/
    basic.ts                  # 三个 Tier 的基础卡池
    rageborne.ts              # Mat 配置、9 张专属卡、6 张 Strike
```

新增 `buildNemesisDeck()`，以人数配置和候选池构建；先仅支持已确认的两人配置。
随机源可注入，以便测试配牌与洗牌；随机结果/必要状态进入 GameState。
去除生产数据和初始化中的占位 Attack，避免保留两套运行时结算路径。

验收：24 张、6/8/10 分层、专属与 Basic 数量正确、不重复抽 Basic、无跨 Tier；
所有定义能通过数据校验；标准和增强难度初始化正确。卡图映射在阶段 5 接入 UI，
避免让引擎依赖前端资源。

## 阶段 2：引擎阶段与可暂停结算

状态：已完成（2026-09-11）。

实际交付：

- `GameState.nemesisResolution` 保存 Nemesis 回合的步骤、Main 队列、游标、活动卡和待抽卡，
  结算状态可以直接进入 JSON 存档。
- Nemesis 回合开始时建立当前场上卡牌的快照，并按 `placedAt`/实例 ID 从旧到新处理，
  不会因为场上卡牌变化而跳过或重复处理卡牌。
- Main Phase 已区分旧 Minion 的 Persistent、旧 Power 的 Power token 递减和 Power 耗尽，
  当前回合 Draw Phase 新入场的卡会记录 `enteredOnNemesisTurn`，不会在同回合触发后续 Main 效果。
- Draw Phase 每回合抽一张 Nemesis 卡：Attack 进入 Nemesis 弃牌堆；Minion/Power 进入场上并
  初始化其 Life/Power 指示物；为 Immediately 预留了类型化触发入口。
- 增加 `advanceNemesisTurn()`、`resolveNemesisMainPhase()` 和 `resolveNemesisDrawPhase()`，
  统一推进入口会在已有 Pending Decision/Effect 时停止，后续效果模块可以从同一状态继续。
- 旧 Demo 使用的 `nemesisDrawCard()` 暂时保留为兼容适配器；阶段 5 接入完整 UI 时移除其对
  `pendingNemesis` 的规则承担，改用上述 Nemesis 状态机。

验证结果：阶段 1、阶段 2、阶段 7 引擎测试和 UI 生产构建均已通过。
Nemesis 卡牌完整实际效果、Unleash/Strike 连锁和 UI 目标选择留到阶段 4/5；阶段 3 已先接入
可复用的 To Discard 支付框架。

设计由引擎负责的 Nemesis 阶段状态，而非 UI 自动跳转规则：

```text
Main：逐张结算 → Draw：抽牌/展示 → 结算前响应 → 入场或 Attack 结算
     → 回合结束效果 → 完成回合
```

保存主阶段待处理实例队列、当前位置、当前展示卡、子步骤和效果续执行信息。
Main 开始建立队列；处理中移除卡牌、额外入场和额外结算要有明确规则，不能因为数组变化跳牌。
每张卡完全结算完毕后再处理下一张。玩家尚有决策、效果或回合末触发时，不得推进回合。

扩展现有效果触发词汇：Attack 结算、Immediately、Persistent、Power 耗尽、
Nemesis 回合结束。具体代码命名在此阶段统一。
嵌套 Unleash/Strike/额外抽牌须使用可序列化的执行帧或续执行队列，不能覆盖父效果。
Nemesis 效果上下文不默认借用 p1，也不能把“任意玩家”错误解释为当前浏览的 Mage。

验收：用小型规则夹具覆盖三种卡的生命周期、入场回合不持续结算、正确队列顺序、
决策后准确恢复、不重复减少 Power，以及连锁效果后返回正确步骤。

## 阶段 3：通用效果、目标和 To Discard

状态：已完成（2026-09-11）。

实际交付：

- 扩展类型化效果词汇：Nemesis counter 增减、Unleash 配置效果、Strike 辅助牌堆抽取/洗回。
  `unleash` 会读取当前 Nemesis 的配置效果，未配置时使用通用 `unleash` counter；计数器始终
  保持非负。
- `NemesisCardDef.toDiscard` 以可组合的 `NemesisDiscardCost[]` 建模支付条件，当前支持通用
  Aether、Charge、手牌弃置、限定费用的手牌/弃牌区 Destroy，以及限定费用的已准备法术 Destroy。
  阶段 3 已为阶段 0 确认的 Power 卡登记 To Discard 支付条件，后续阶段只需继续补齐卡牌效果数据，
  不需要新增专用分支。
- 新增 `getNemesisDiscardActions()` 与 `discardNemesisPower()`。动作仅在当前玩家的 Main Phase
  暴露；支付前会重新检查 Power 实例、阶段、费用与牌区，牌选项通过通用 `PendingDecision` 暂停，
  确认前不会扣除 Aether、Charge 或 Destroy 卡牌；成功后只把 Power 移入 Nemesis 弃牌堆，
  不会错误触发 Power 耗尽效果。
- 增加 Strike 牌堆的可序列化抽取、弃牌回收和洗回接口；具体 Strike 卡牌效果已在阶段 4
  使用同一套类型化效果解释器接入。
- 修正玩家 Exhaustion 时超额伤害的计算顺序：先按原始负生命值计算 Gravehold 损失，再将玩家
  HP 截断到 0；Gravehold 伤害也会截断到 0。
- `GameState.pendingNemesisDiscard` 保存 To Discard 的中断进度，可随 JSON 存档恢复。

验证结果：阶段 1、2、3 和阶段 7 引擎测试通过；UI Vite 生产构建通过。阶段 3 的测试覆盖
Unleash/counter 非负、Strike 牌堆耗尽回收、To Discard 合法支付与选牌暂停、费用不足不变更状态、
以及玩家超额伤害。Nemesis 37 张卡的完整 Attack/Immediately/Persistent/Power/Strike 效果数据、
Nemesis UI 仍留到阶段 5；Adelheim 的 Nemesis 抽牌前响应已在阶段 4 接入引擎。

复用伤害、恢复生命、抽牌、弃牌、Destroy、选择等效果。
按阶段 0 的实际卡牌需求扩展：Unleash、多次效果、Nemesis 计数器增减、
辅助牌堆抽取/洗回、条件数值、受约束的玩家/Minion/牌区目标。
目标应由引擎过滤，包含并列合法候选；UI 不自行决定谁受到伤害。

To Discard 单独建模为“可选动作 + 支付条件”，不能直接套用普通效果顺序：

- 先检查阶段、操作者、目标实例及费用能否完整支付。
- 需要选牌时暂停；确认前不提前扣除部分费用。
- 提交时重新校验，完整支付后将 Power 弃置，不执行 Power 到期效果。
- 可用 Aether 遵循消费用途限制，不能花费只能购买 Gem 等条件 Aether。
- 自动结束玩家回合的合法动作检查，必须包含可支付的 To Discard。

统一检查伤害防止、生命上限、Minion 死亡、玩家 Exhaustion 和游戏结束。
当前 `checkPlayerDeath()` 先把 HP 清零再计算超额伤害，且有简化裂隙处理，
需要按阶段 0 确认的规则修正；不能让新卡继续继承该缺口。

验收：合法/非法目标、足额/不足额支付、取消不扣款、Power 弃置不爆发、
一次性中断提交、防止伤害及不同来源伤害路径一致。

## 阶段 4：Rageborne 与全部卡牌接入

状态：已完成（2026-09-11）。

实际交付：

- 已将 22 张 Basic Nemesis Cards、9 张 Rageborne Unique Cards 和 6 张 Strike Cards 的已确认
  规则接入类型化数据。Attack、Minion、Power、Strike 分别使用 `immediately`、`persistent`、
  `power_resolved` 和 Strike 效果块，不再使用固定伤害占位卡。
- Nemesis 状态机现在会真正执行 Attack 的即时效果、Minion 的 Persistent、Power 耗尽效果，
  并在效果需要玩家选择时暂停；选择完成后会自动回到 Nemesis 回合继续推进。
- 实现 Rageborne 的 Unleash、Fury、标准/增强难度 Strike 后 Fury 扣除、回合末 Fury 阈值 Strike，
  以及 Strike 结算后洗回辅助牌堆。
- `resolve_strike` 现在是统一的 Strike 关键词入口：无论由回合结束阈值还是 Nemesis 卡牌效果触发，
  都会在 Strike 结算完成后追加类型化的 `lose_nemesis_counter(fury)`；标准难度减少 3，增强难度
  减少 1，数量不足时由计数器逻辑钳制为 0。
- 增加玩家/牌区目标过滤：最低生命、最多 Charge、最多已开启 Breach、最多已准备法术；增加
  共同弃牌、共同弃 Gem 减少 Gravehold 伤害、从弃牌堆洗回牌库、牌库顶 Destroy、已准备法术
  弃置和 Minion 自身目标等可复用效果。
- 接入 Cauterizer 的“每个伤害实例最多承受 1 点”规则，并保留每次伤害实例分别处理，避免把
  多个伤害实例错误合并。
- Adelheim 的 Aethereal Ward 已接入：Attack/Power 抽出后、结算前提供 Activate/Skip；激活
  后取消该牌的效果且不将其放入 Nemesis 弃牌堆。Minion 不触发该响应。

验证结果：阶段 1、2、3、4 和阶段 7 引擎测试全部通过；UI Vite 生产构建通过。新增阶段 4
测试覆盖 Attack/Unleash、Persistent、Power 多次 Unleash、Strike 结算和洗回、Cauterizer、
Adelheim 结算前响应以及共同弃 Gem 减伤。阶段 5 仍需把这些引擎状态接入完整 Nemesis UI，
包括卡图、指示物、Pending Decision、To Discard 按钮和 Attack/Strike 展示。

按阶段 0 核对的资料，用类型化数据接入 37 张卡；新增模块只对应可复用规则原语，
避免在 UI 或引擎里遍布 `if (cardId === ...)`。

实现完整 Setup、Unleash、Fury、Strike、回合末检查和增强难度覆盖。
Strike 自有抽牌/展示/结算/洗回流程；嵌套 Strike 不能打断后续父卡效果。

接通 Adelheim：Nemesis Attack/Power 被抽出、尚未结算时提供 Activate/Skip。
激活后正确消费 Charge 并弃置该卡，阻止其效果、Immediately 和 Power 入场；
Minion 不触发该能力。Phaedraxa 的防护要覆盖 Nemesis 当前整个回合及回合末 Strike。

验收：每张卡有独立效果测试；所有分支、难度差异、Fury 阈值和 Mage 联动可验证。
游戏从初始化到完整 Nemesis 回合不再依赖占位 Attack 流程。

## 阶段 5：UI 与可视化交互

### 本阶段新增布局约定（2026-09-11）

- Nemesis Play Area 左侧单独放置 Nemesis Mat；Mat 不与场上卡牌混排。
- Mat 右侧作为主要内容区，固定分成上下两片：上方放置 Fury、Strike Deck 及其他
  Nemesis 专属物件；下方放置场上的 Power/Minion。
- Power/Minion 从左到右按 oldest → newest 排列；数量超出单行可视范围时，沿用手牌区的
  横向滚动实现与鼠标滚轮平滑滚动行为，不改成换行布局。
- 空的 Mat/专属物件/场上卡牌位置仍保留明确的区域边界，避免牌进入场上后导致布局跳动。

本阶段执行顺序：先完成 NemesisArea 的结构与卡图接入，再接入卡牌指示物、To Discard 和
阶段/待决策状态，最后用生产构建与浏览器流程检查实际图片解码、滚动和层级。

状态：已完成（2026-09-11）。

实际交付：

- `NemesisArea.vue` 已改为 Mat 左侧、专属物件上方、Power/Minion 场区下方的固定三段式布局；
  Nemesis Deck/Discard 保留在 Mat 下方，不再与场上卡牌混排。
- 已接入 Rageborne Mat 正/反面卡图，以及全部 Basic、Rageborne Unique 和 Strike 卡图；Mat
  可点击翻面，卡牌使用统一的 0.2 秒悬停预览组件。
- 场上 Power/Minion 按 `placedAt` 从 oldest 到 newest 排列；溢出时使用独立的横向滚动容器，
  垂直滚轮映射为平滑横向滚动，不使用换行破坏顺序。
- UI 已改用引擎的 `advanceNemesisTurn()` 和 `PendingDecision` 状态机，Nemesis Main/Draw
  阶段、Attack 目标、Immediately/Persistent/Power 结算后的暂停可以显示在统一决策层；旧的
  简化 Attack 弹窗不再承担生产流程。
- Power 在当前玩家 Main Phase 且 To Discard 条件可支付时显示 `To Discard`，点击后继续使用
  引擎的通用支付/选牌中断，而不是为单张卡牌写专用 UI 分支。
- 已保留 Nemesis 专属状态的可见区域：Fury、Strike Deck 数量；Rageborne 不使用专属弃牌区，
  该区域保留占位并显示 `Not used`。Nemesis HP 仅在 Turn Order Bar 显示。

验证结果：

- `node aeons-end-engine/scripts/run-stage7-test.cjs`：阶段 1、2、3、4、7 引擎回归通过。
- `npm run build`：Vite 生产构建通过，Nemesis Mat 与所有接入卡图均成功打包。
- `npx playwright test --workers=1`：8 条浏览器测试全部通过，包含实际图片解码、Mage 页面、
  双法术叠放、存档、手牌滚动、弃牌分组与 Jian 能力流程；新增启动验收确认 Rageborne Mat、
  Strike Deck 区域和 Power/Minion 区域存在。

遗留项：Nemesis 区域的 Minion 伤害点击入口、Strike 卡的详细展示/结算控件以及 Mat 上更多
专属标记物，待阶段 6/7 的完整存档验收和后续 Nemesis 交互细化时继续补齐；当前已接入的
通用 Pending Decision 会继续承载这些规则，不新增卡牌专用弹窗。

### 阶段 5 布局反馈更新（2026-09-11，已完成）

- 左侧 Nemesis Mainboard 占满区域内容高度，按 Mat 图片真实宽高比确定宽度；Rageborne
  原图为 1036×1384，不再使用横版比例。保留 10px 上下内边距。
- Mat 右侧可插入 Nemesis Sub Board；Rageborne 的 `subBoard.enabled` 为 `false`，不占空间。
- 右侧上排固定五个等宽区域：Token Info、Nemesis Deck、Nemesis Discard、Nemesis Specific、
  Nemesis Specific Discard。文字水平/垂直居中；下排 Nemesis Play Area 按 oldest → newest 排列。
- Rageborne 专属牌堆显示 Strike Deck；专属弃牌区保留矩形占位并显示 `Not used`，不误报弃牌数。
- 两侧 HP 填满回合框与边缘之间的剩余空间；与回合框间隔 24px，Round 留在最右侧。
  根据窗口宽度和日志面板造成的可用宽度变化重新计算；空间足够时六格中心对齐浏览器中心，
  极窄可用区域优先保证信息不重叠。右侧较窄时将 Gravehold 名称放在血条上方。
- 验证：9 项 Playwright 测试通过；新增布局测试覆盖 1280×800、1440×900、1920×1080、
  2560×1440，检查 Mat 解码/比例/满高、五分区等宽、边界、回合框居中、HP 间距，
  并验证 Mat 翻面、弃牌查看和 12 张场上卡横向滚动。截图已人工检查。

### 阶段 5 交互反馈更新（2026-09-11，已完成）

- 通用牌堆弹窗和 Nemesis 弃牌弹窗按当前最大行数自适应宽度，每行最多 5 张；单牌时不再
  保留五列空白。`PileModal.vue`、`CardDecisionModal.vue` 与 Nemesis 弃牌弹窗共用 CSS 变量
  `--pile-columns`/`--decision-columns`。
- Nemesis Play Area 移除角标文字，场上 Minion/Power 卡按可用高度等比例放大，超出宽度后继续
  使用横向滚动。玩家/ Nemesis discard 只显示牌堆名称与数量，不泄露最后一张牌名。
- Nemesis Mat 预览当前由 `NemesisArea.vue` 的 `matPreviewHeight = 1260` 控制，约为此前高度的
  三倍；调整这个常量即可改变悬停预览尺寸。
- Strike Deck 抽牌复用通用 `PendingDecision` 的 `confirm_nemesis_draw` 中断，并以
  `source: specific_deck` 标记来源；先展示牌面，玩家点击继续后再进入 Strike 效果，不再维护独立
  的 Strike 弹窗类型。Nemesis 主阶段使用 `confirm_nemesis_effect`，逐张为 Persistent
  或 Power 卡显示红色边框，点击卡牌后才减少 Power 或执行效果；这些中断状态保存在引擎的
  `nemesisResolution`/`pendingEffect` 中，刷新或存档不会跳过确认。
- `select_damage_target` 不再显示按钮弹窗。Nemesis Mat 和合法 Minion 统一使用 Casting Phase
  的黄色 `#e6c84f` 边框，点击 Mat 时优先提交伤害目标，不会误开 Mat 查看弹窗。
- 验证：阶段 1、2、3、4、7 引擎回归通过；9 项 Playwright 测试通过，包含单牌弃牌弹窗宽度、
  Mat/弃牌交互、场上卡横向滚动、伤害目标黄色高亮与 Mat 点击不打开查看弹窗。

维护入口：

- `aeons-end-ui/src/game/nemesis-presentation.ts`：通过 `subBoard.enabled` 开关子版图，
  `imageUrl`/`aspectRatio` 配置图片和比例；`specificDeck`、`specificDiscard` 的 `enabled` 与
  `label` 控制专属区状态和标题。关闭专属区只禁用其内容，不移除占位。
- `aeons-end-ui/src/style.css`：`.nemesis-area` 的 `gap`/`padding` 控制区块间距；
  `.nemesis-content-column` 的 `grid-template-rows` 控制上下比例；
  `.nemesis-assets-row` 的 `repeat(5, minmax(0, 1fr))` 保证五区等宽。
- `aeons-end-ui/src/components/TurnOrderBar.vue`：`updateLayout()` 测量可用宽度并计算回合框位置；
  其中 `gap = 24` 应与 CSS `.turn-status-content` 的 `gap: 24px` 同步调整。
  `.turn-side .hpbar` 的 `flex: 1 1 0` 让血条填充空间，不再设置固定血条宽度。

保持顶部整体布局：左侧全高 Mat、可选子版图、右侧上下两区，底部 Turn Order Bar；Market
仍使用右侧整列，Turn Order Bar 不另占一整屏宽度。

- Mat：可查看正反面；显示 HP、名称、印刷难度与当前难度模式。
- Rageborne：清晰的 Fury 数值与独立 Strike Deck 入口。Fury 只属于该 Nemesis。
- 场上卡：从左到右由旧到新，展示卡图、当前 Life/Power；多牌时在区域内滚动。
- 阶段栏：显示 `Nemesis Main Phase`、`Nemesis Draw Phase`、`End of Nemesis Turn`
  及当前正在结算的卡牌/响应步骤。
- 当前强制结算来源用 2px 红框标识；默认提供明确的继续/确认操作，保证玩家能读到效果。
- 合法 Minion 伤害目标可点击；Power 在符合 To Discard 条件时提供动作入口及费用。
- 新抽卡和 Strike 通过可复用的展示确认组件呈现；需要选择时使用合法目标选择，
  不再给每张 Attack 固定的任意伤害目标弹窗。
- 弃牌查看用普通卡牌列表（每行最多 5 张），不用 Next Draw/Future Draw 标签；
  未公开的 Nemesis Deck 不允许普通查看泄露牌序，调试模式除外。
- 保持 0.2 秒悬停预览、弹窗拖动、ESC 顶层和现有键盘操作；检查真实遮挡/点击命中，
  不能只比较 CSS z-index 数字。
- Setup 提供标准/增强难度选择，存档列表记录选择的 Nemesis 与模式。

验收：卡图正常解码；玩家能看清当前处理哪张牌、需要什么操作、为何不能支付费用；
不同视口和较多场上卡时不挤占 Market、手牌或控制栏；完成一次真实交互全流程。

## 阶段 6：保存、恢复、撤销

Nemesis 卡实例、指示物、阶段子步骤、队列游标、待展示卡、所有嵌套效果、Fury、
Strike 顺序和随机状态统一保存。移除 UI `pendingNemesis` 中重复承担的规则状态。

逐一测试在以下位置保存后恢复：Persistent 中、Power 归零但效果未完、抽牌展示、
Adelheim 响应、伤害选目标、To Discard 选牌、Strike 结算和回合结束。
恢复不能重复抽牌、重复支付、重复扣 Power 或丢失后续效果。
Ctrl+Z 必须同时恢复牌堆、计数器和阶段；固定随机状态，避免恢复时重新随机已确定的结果。

存档增加明确版本。含占位 Attack ID 的旧 Demo 存档不能伪装成真实 Rageborne 对局：
先保留/备份，评估能否安全迁移；不能迁移时明确提示并保留原文件或存档记录，不能静默删除
或洗成另一局。沿用用户已确认的 Save and Exit / Exit without saving 行为。

验收：上述暂停点 JSON 往返与浏览器 Resume 都准确；直接退出不新增记录；
测试使用隔离浏览器存储，接触真实测试存档前先备份。

## 阶段 7：最终验收与维护文档

引擎测试按建库、生命周期、通用效果、Rageborne、Mage 联动、保存恢复拆分，
使用固定随机源；对 37 张卡逐张建立覆盖记录，不只测试某次随机抽中的 24 张。

Playwright 覆盖：新游戏建库、图片实际加载、连续 Nemesis 阶段、Persistent、Power 倒数与弃置、
Minion 击杀、Attack/Immediately、Adelheim Activate/Skip、Strike、难度模式、存档/撤销。
验证实际点击结果、牌区变化、计数器变化和步骤顺序；关键布局保留截图人工检查。
不得把“若干测试通过”等同于“整个游戏所有规则均正确”。

更新现有 README、dev-guide、关键词文档和本计划，记录：新增 Nemesis/Basic 卡的位置、
可复用模块、专属状态接入方式、触发时机、回归命令和实际未覆盖项。
生产资源另做构建后检查，避免开发服务器图片正常但生产版本断图。

最终验收：标准与增强模式都能完成 Rageborne 对局，存档可恢复，中断不跳过，
旧 Demo 攻击流程退出生产路径，已确认规则无待实现项。
