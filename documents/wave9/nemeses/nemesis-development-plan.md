# Wave 9 Nemesis 开发计划：Oracle of Filth、The Timeless、Twice-Dead Prophet

这份计划记录三场战斗的规则理解、实现分工和进度。Oracle of Filth、The Timeless 与 Twice-Dead Prophet 均已实现。

项目目前固定为两名 Mage 对战一名 Nemesis。因此本轮先按双人局实现；卡牌资料里写出的 1–4 人数量表会保留为规则数据，但不借这次开发扩展多人局。

“orcale of filth”按卡牌资料中的正式名称理解为 **Oracle of Filth**。

## 当前进度

- Oracle of Filth 的引擎效果、开局替换供给堆、Vortex 牌区、Pupil 上排展示及卡牌移动已接通。
- Unrelenting Fear 使用通用分配弹窗：玩家把展示的牌拖到任一 Mage 区域后确认。
- The Timeless 已接通开局 Curse、Exiled pile、顶牌购买、Exile 效果、Finality 召唤/回收、Nemesis token 和 Curse 的 Conjure 限制。
- The Timeless 的 Exiled pile 与 Finality pile 分别复用 Nemesis specific deck/discard；通用 Nemesis token 使用 `NemesisToken.png`。
- Twice-Dead Prophet 已接通 Prophecy deck、Nemesis deck 底牌附着、结算/弃置后回到底部、Nemesis end-turn 阈值、无生命上限和特殊失败条件。
- Prophecy 下方的卡按“刚抽到”处理，包含可用的 Nemesis 抽牌响应；卡牌使用 Gallery 的 `Card.AttachedQuarter` 组件展示。
- Nemesis deck 底牌与 face-up 专属牌堆顶的来源锚点已加入通用卡牌移动捕获模块。
- 引擎和 UI 类型检查已通过；本次未运行游戏测试。

## 一眼看懂三场战斗的核心

| Nemesis | 主要压力 | 最需要的新规则 |
| --- | --- | --- |
| Oracle of Filth | 把玩家的牌送进 Vortex，再靠 Vortex 里的牌强化法术或让玩家取回牌 | Vortex 牌区、Expunge 分发、对 Nemesis 的伤害限制、法术被送入 Vortex |
| The Timeless | 持续 Exile 玩家牌，并用 Nemesis token 不断召出 Finality | Exiled pile、从 Exiled pile 购买、手牌中的 Curse 自动触发、重复召出 Finality |
| Twice-Dead Prophet | 用 Nemesis token 推进 Prophecy；Prophecy 会把 Nemesis deck 底牌变成延迟威胁 | Prophecy deck、卡牌叠放、按结束回合触发、特殊胜负条件 |

## 建议的代码分工

三位 Nemesis 各自使用独立的卡牌数据和规则文件，不把它们的专属规则塞进一个总文件：

- 卡牌数据分别放在 `aeons-end-engine/src/data/wave9/nemeses/oracle-of-filth.ts`、`the-timeless.ts`、`twice-dead-prophet.ts`。
- 需要额外回合规则的内容分别放在 `aeons-end-engine/src/nemesis/oracle-of-filth.ts`、`the-timeless.ts`、`twice-dead-prophet.ts`。
- 共用的牌移动、Exile、辅助牌堆、伤害来源和回合结束处理放在职责对应的 engine 模块里；不按单张卡 ID 在通用解析器里堆分支。
- 每个 Nemesis 的卡牌清单和牌堆构建留在自己的数据文件中；Nemesis 规则文件只处理卡牌数据难以表达的初始化、回合时点和持续规则。
- 每张实体牌都要有自己的编号；同名的多张牌也不能混为一张。新牌区使用这些编号和引擎移动记录。UI 根据记录显示移动和动效，并为每个新牌区提供实际的卡牌落点。
- 在 `wave9/index.ts` 登记三组卡牌和 Nemesis 定义，在 `nemesis/registry.ts` 登记需要的特殊规则；之后再由现有数据入口提供给设置页和游戏。
- Vortex、Exiled pile、Finality pile、Prophecy deck 和卡牌下方压着的牌，都属于可保存的游戏状态；需要一起保存牌的顺序、可见状态和归属。

现在已有 Nemesis 数据、基础卡牌池、Unleash、Minion/Power/Attack 结算、`setup` 和 `endTurn` 规则入口，以及有序卡牌移动记录。Oracle 的 Vortex、The Timeless 的 Exiled/Finality 和 Twice-Dead Prophet 的 Prophecy deck 均复用 Nemesis specific deck/discard 状态；Prophecy 下方的牌使用通用 Nemesis 卡牌叠放结构。

Nemesis 卡牌中的大写 `OR` 必须沿用 [游戏裁定](../../../game-rulings.md) 的规则：根据整组选项是否能结算来确定按钮是否可选，并在玩家提交时再次校验。特别需要覆盖 Oracle 的 Torment 和 Abyssal Vial。

## 1. Oracle of Filth

### 基本设置

- 起始生命 80，难度 6。
- 开局由玩家从现有供给堆中选择两个进行替换，替换成 Vortex Blast 和 Abyssal Vial；两张专属供给牌各有 5 张。
- 双人局从盒中取 5 张 Wave 9 Crystal 组成 Vortex deck；其他人数对应 4/6/7 张，先作为规则数据保留。
- 开局把 Pupil of Oblivion 放入场上，生命为 2。
- Pupil of Oblivion 显示在 Nemesis 牌区的上排（`nemesis-play-top`）。
- Unleash：Pupil of Oblivion 获得 4 点生命。
- 普通难度：玩家对 Oracle of Filth 造成的伤害，除非伤害来源是 Vortex Blast，否则变为 0。
- Pupil of Oblivion 没有生命上限，且生命不能低于 1。
- Increased Difficulty：每次 Oracle Expunges 后，Oracle 或 Pupil 其中之一获得 3 点生命。

### Vortex 和 Expunge

需要一个可以容纳不同类型玩家卡牌的 Vortex 牌区。放进 Vortex 的牌放在顶端；牌只会在卡牌效果明确要求时进出 Vortex。Oracle Expunges 时：

1. 洗混 Vortex 中的牌。
2. 先由玩家选择开始接牌的 Mage，再按玩家顺序轮流发牌，直到发出 6 张。
3. 发给玩家的牌背面朝上放到该玩家牌堆顶；不提供排序选择。
4. 如果需要发牌但 Vortex 已空，每缺一张改为 Gravehold 受到 4 点伤害。

当前双人局初始 Vortex 只有 5 张 Crystal，所以 Expunge 如果没有其他牌补进去，会发完 5 张后再让 Gravehold 受到 4 点伤害。

### 专属卡牌与处理重点

| 卡牌 | 效果概述 | 实现时要检查的规则 |
| --- | --- | --- |
| Blind Gazer（Tier 1 Minion，4 生命） | PERSISTENT：Pupil 获得 2 点生命；任意玩家受到 1 点伤害 | Pupil 治疗不设上限；玩家目标按通用 Nemesis 目标规则选取 |
| Perplex（Tier 1 Attack） | Unleash；任意玩家受到 2 点伤害，并把手牌中的 Crystal 放进 Vortex | 选择玩家时同时看其是否有可放入的 Crystal；若无人满足，按规则尽可能结算其余效果 |
| Possess（Tier 1 Attack） | 同上，但放入的是 Spark | 同上；有 Ocularum 阻止放牌时也不能绕过阻止规则 |
| Foretold Terrors（Tier 2 Power，3） | Oracle Expunges | Expunge 要作为可暂停、可保存的完整步骤执行，不能只改牌区数量 |
| The Doomed（Tier 2 Minion，10 生命） | IMMEDIATELY：将 Vortex 中两张牌放到此卡下，这些牌不再属于 Vortex；PERSISTENT：任意玩家受到 3 点伤害 | 记录被压在 Minion 下的牌；它们离开 Vortex 后不能被 Expunge 或其他 Vortex 效果拿到 |
| Torment（Tier 2 Attack） | `OR`：Unleash 两次并让任意玩家弃掉手牌中的 Abyssal Vial 或 Vortex Blast；或任意玩家从 Vortex 获得两张牌并受到 3 点伤害 | 按 `game-rulings.md` 对整个分支检查可执行性，正确处理牌不够、目标不合格、部分有利收益和按钮禁用 |
| Frighten（Tier 3 Power，1） | 摧毁 Vortex 中每张费用为 0 的牌，然后 Unleash 两次 | 只摧毁费用为 0 的牌；摧毁后从 Vortex 移除实体副本 |
| Ocularum（Tier 3 Minion，12 生命） | 只要它在场，牌不能放进 Vortex；PERSISTENT：生命最低的玩家受到 3 点伤害 | 这是会影响其他卡牌操作的全局限制；移动开始前和提交选择时都要重新检查 |
| Unrelenting Fear（Tier 3 Power，1） | Unleash 两次；玩家共同获得 Vortex 中费用最高的四张牌 | 对全体 Vortex 牌统一排序；牌数不足时按 Nemesis 效果规则尽可能完成。将牌显示在上方，由玩家拖到下方各 Mage 区域并确认 |
| Pupil of Oblivion（起始 Minion，无上限） | 法术对它造成伤害后，该法术进入 Vortex；PERSISTENT：若生命至少 13，它受到 8 点伤害并触发 Expunge，否则获得 2 点生命 | 触发只针对法术伤害；移动进 Vortex 后不能再同时进入弃牌堆、Swap 或其他结算目的地；生命至少保留 1 |
| Abyssal Vial（供给牌，费用 4，Relic） | `OR`：获得 1 Charge；或把本回合打出的最多两张 Gem/Relic 放进 Vortex | 本回合打出的牌作为一个可选集合；官方裁定允许 Vial 把自己放入 Vortex。选项合法性按大写 `OR` 的通用规则判断 |
| Vortex Blast（供给牌，费用 7，Spell） | Cast：造成 1 点伤害，再加上 Vortex 所有牌的费用总和 | 每次施放时按当时 Vortex 内容计算伤害；对 Oracle 的伤害例外只认合规的 Vortex Blast 来源 |

### 本场新增的共用能力

- 让每张实体牌可以在玩家牌区与 Nemesis 特殊牌区之间移动，保留副本 ID 和正确的目的地。
- 为 Nemesis 伤害判断保留伤害来源信息，以通用来源标记表达“只有特定来源能伤害 Oracle”，不要把卡牌 ID 判断放到所有伤害代码中。
- 支持法术对 Minion 造成伤害后触发规则并改写这张法术的最终去向。
- 支持多张牌按玩家顺序轮流发到牌堆顶；Expunge 不开放先后顺序选择。牌不够时由 Gravehold 受伤，并支持操作中断后的继续结算。
- 多张牌需要分配给玩家时，使用通用分配弹窗显示卡牌和玩家区域；确认时校验每张实体牌恰好分配一次。
- Vortex 使用现有 Nemesis specific deck 区域；桌面牌堆始终以 `player-card-back` 显示。查看牌堆时按实体牌的可见状态混合显示正面和牌背：开局的 Crystal 和 Abyssal Vial 放回的牌可见；Vortex 洗牌后，其中所有牌变为不可见。Wave 9 Crystal 使用自己的牌面图片。

## 2. The Timeless

### 实现状态

- 开局为每位玩家的弃牌堆加入一张 Curse of Exhaustion；从最高费用供给堆移走一张牌作为 Exiled pile 顶牌，最高费用并列时由玩家选择。
- Exiled pile 复用 Nemesis specific deck，牌面全程可见；Finality pile 复用 Nemesis specific discard，共 8 张。
- Main Phase 中，若玩家付得起原费用加 1，Exiled pile 顶牌会像供给牌一样高亮；点击可购买并把同一张实体牌放入弃牌堆。付不起时点击仍可查看牌堆。
- Nemesis token 图使用共用的 `NemesisToken.png`；Finality 进入场上、被击败后回到专属牌堆，回合结束按每 3 个 token 召唤并继续检查。
- Curse of Exhaustion 进入手牌后走通用 tracked in-hand resolution；不能被摧毁、Exile 或准备到 Breach。Conjure 翻到它时只能跳过并放回牌堆顶。

### 基本设置

- 起始生命 60，难度 7。
- 双人局每位玩家各把一张 Curse of Exhaustion 放进自己的弃牌堆。
- 从费用最高的供给牌堆取一张牌，正面朝上放在 The Timeless 旁边，作为 Exiled pile 的第一张牌。
- 将 8 张 Finality 正面朝上组成 Finality pile。
- Unleash：The Timeless 获得 1 个 Nemesis token。
- 回合结束时，只要 The Timeless 至少有 3 个 Nemesis token，就召出一张 Finality 并减去 3 个 token；重复处理，直到剩余不超过 2 个 token。
- 如果应召出 Finality 但 Finality pile 已空，改为 Gravehold 受到 10 点伤害。
- Increased Difficulty：Finality 进场时多 1 点生命；结算 Finality 的 PERSISTENT 时不能从弃牌堆顶 Exile，只能选择手牌。

### Exiled pile 和 Curse of Exhaustion

Exiled pile 中的牌正面朝上放置，新 Exile 的牌放在最上面。玩家可以查看整叠但不能调整顺序；只能获得最上面那张，费用为该牌费用再加 1，获得后进入玩家弃牌堆。它不是供给堆，不能按正常 supply pile 计数或补牌。

Curse of Exhaustion 在进入玩家手牌时自动结算：先抽 1 张牌；然后选择自己受到 1 点伤害或 Gravehold 受到 2 点伤害；The Timeless 获得 1 个 Nemesis token；最后弃掉 Curse。它不能被摧毁、Exile 或 Conjure。这个触发必须覆盖所有抽牌入口，而不只是正常抽牌阶段。

### 专属卡牌与处理重点

| 卡牌 | 效果概述 | 实现时要检查的规则 |
| --- | --- | --- |
| Bubbling Anachro（Tier 1 Minion，6 生命） | PERSISTENT：Gravehold 受到 2 点伤害；任意玩家弃掉自己牌堆顶牌 | 牌堆顶牌直接进入弃牌堆；若牌堆空，按可完成部分继续 |
| Subside（Tier 1 Attack） | 任意玩家 Exile 手牌中的 Spell，并受到 3 点伤害 | 目标选择要考虑是否有 Spell；双人局无人有 Spell 时按 Nemesis 强制效果规则尽可能结算 |
| Infinity Warp（Tier 1 Attack） | 放入一张 Finality | 与回合结束阈值召出的 Finality 共用牌堆和空堆处理 |
| Paradox Scourge（Tier 2 Minion，10 生命） | 玩家对它造成伤害时 The Timeless 获得 1 个 token；PERSISTENT：任意玩家弃掉手中费用最高的牌 | 伤害触发按每次伤害生效；最高费用打平时让玩家从并列牌中选择 |
| Beyond Time and Space（Tier 2 Power，2） | 放入一张 Finality，并把此卡放到 Nemesis mat 旁；以后每次 Finality 结算 PERSISTENT 时，再结算一次 | 游戏期间的全局状态要保存；如果 Finality 在第一次结算中被击败，不再对离场 Minion 重复结算 |
| Crushing Eventuality（Tier 2 Power，3；TO DISCARD：7 Aether） | Unleash 两次；从费用最高的供给牌堆 Exile 一张；牌堆数量最少的玩家受到 3 点伤害 | 需要供给牌堆选择/费用并列规则，以及按牌堆总张数选目标；空供给堆不能提供牌 |
| Ghastly Epoch（Tier 3 Power，1） | 若 Exiled pile 顶牌费用大于 0，Gravehold 受 6 点伤害；否则受 10 点 | 检查当前顶牌；空 Exiled pile 应有明确定义，避免读不存在的牌 |
| Ossilith（Tier 3 Minion，15 生命） | 任意玩家 Exile 手牌一张牌并受 5 点伤害；按该牌费用减伤，最低为 0 | Exile 的牌必须先选定，再算伤害；没有手牌时仍按规则处理可完成部分 |
| Wipe（Tier 3 Attack） | 任意玩家 Exile 手牌两张牌、抽两张牌并受到 4 点伤害 | 若手牌不足两张，Exile 能选的牌数；抽牌与伤害仍按卡面顺序继续 |
| Finality（特殊 Minion，标准 5 生命，增加难度 6） | PERSISTENT：任意玩家 Exile 一张手牌或自己弃牌堆顶牌；随后 Finality 受到 1 点伤害 | 目标选择和可用牌一起校验；即使无人能 Exile，仍继续 Finality 的 1 点自伤；被击败后回 Finality pile，而非 Nemesis 弃牌堆 |

### 本场新增的共用能力

- 当前 Nemesis 结束回合规则一次只执行一组效果；The Timeless 需要能在每次召牌/伤害后重新检查 token，重复到低于 3。应提供可复用的结束回合循环，并在每次循环间完成效果和动效。
- 建立专门的 Exiled pile，能保存顺序、牌面可见状态和各牌的实体 ID；Exile 不能被当成普通摧毁或弃牌。
- 提供“获得 Exiled pile 顶牌”的玩家操作：费用加 1，只拿顶牌，牌不进供给区。
- 增加通用的不可摧毁、不可 Exile、不可 Conjure 卡牌限制；所有相关操作都必须遵守。
- 增加“牌进入手牌时触发”的规则时点，等 Curse 的抽牌、伤害选择、token 和弃牌都完成后，才继续原本抽牌流程。
- Finality 作为特殊 Minion 使用独立回收位置；普通 Minion 被击败进入 Nemesis 弃牌堆的流程不能误处理它。

## 3. Twice-Dead Prophet

### 基本设置

- 起始生命 50，难度 6；没有生命上限。
- 双人局开局获得 2 个 Nemesis token。资料列出的 1/2/3/4 人数值是 2/2/1/0。
- Unleash：获得 2 点生命和 1 个 Nemesis token。
- Increased Difficulty：开局多 20 点生命。
- Nemesis token 在回合结束时达到 6 个或以上，就把 Prophecy deck 顶牌放入场上，然后减去 4 个 token。卡面没有写“重复”，所以先按每个 Nemesis 回合至多放入一张 Prophecy 实现。
- Twice-Dead Prophet 达到 99 点生命时，玩家立即失败；Nemesis deck 为空也会让玩家失败。
- Prophecy deck 共 6 张：Prophecy of Fire、Prophecy of Ruin、Prophecy of the Storm 各两张。牌堆顶始终正面可见。

### Prophecy 和它下面的 Nemesis 卡

Prophecy 是 Power。每张 Prophecy 进场时，把 Nemesis deck 底牌正面朝上放在 Prophecy 下面，再给 Prophecy 放上卡面数量的 Power token。Prophecy 的 Power 结算时，把下面的卡放入场上，按“刚从 Nemesis deck 抽到”处理，然后把 Prophecy 放到 Prophecy deck 底部。

- Fire：3 个 Power token；TO DISCARD：花费 8 Aether。
- Ruin：2 个 Power token；TO DISCARD：失去 4 个 Charge。
- Storm：2 个 Power token；TO DISCARD：花费 7 Aether。
- 如果玩家用 TO DISCARD 弃掉 Prophecy，Prophecy 回到 Prophecy deck 底部，下面的 Nemesis 卡正面朝上放到 Nemesis 弃牌堆顶部；被弃掉的 Prophecy 不结算其 Power 效果。
- 从 Prophecy 放出的 Power 当回合不移除 Power token；Minion 当回合不结算 PERSISTENT。需要用明确的回合标记表达，不能依赖“它刚好没进本轮处理列表”的偶然结果。
- Vile Petition 结算时抽一张 Prophecy，并从它移除 1 个 Power token；本回合不再从这张 Prophecy 移除 token。

这要求每张 Prophecy 和压在它下方的牌都有独立副本 ID，并能在保存/恢复、移入场上、弃掉和回到牌堆底部时保持正确关系。

### 专属卡牌与处理重点

| 卡牌 | 效果概述 | 实现时要检查的规则 |
| --- | --- | --- |
| Deathless Return（Tier 1 Power，3） | Power 结算时获得 3 个 Nemesis token | 走通用 token 操作 |
| Graven Thing（Tier 1 Minion，5 生命） | PERSISTENT：任意玩家受到 1 点伤害；Prophet 获得 1 token | 目标选择后继续同一张 Minion 的效果 |
| Muster（Tier 1 Attack） | Prophet 获得 10 点生命；玩家可以把 Prophecy deck 顶牌放到底部；Gravehold 受 5 点伤害 | optional 决策无牌时自动跳过；生命不封顶 |
| Dreaded Rebirth（Tier 2 Power，2） | Prophet 生命不超过 50：它获得 10 生命且 Gravehold 受 3 伤害；否则任意玩家受 4 伤害且 Prophet 获得 2 token | 判断结算时的当前生命，不按开局生命预先决定分支 |
| Vigil（Tier 2 Minion，10 生命） | PERSISTENT：Prophet 生命不超过 50 时获得 5 生命，否则 Gravehold 受 3 伤害 | 每次结算按当前生命判断 |
| Vile Petition（Tier 2 Power，2；TO DISCARD：7 Aether） | Power 结算：抽 Prophecy 并移除它 1 个 token | 抽牌和 token 移除是同一条可保存的效果流程；该 Prophecy 当回合不再减 token |
| Absorb（Tier 3 Attack） | Prophet 生命不超过 30：获得 10 生命，玩家共同弃掉最贵的两张已准备法术；否则玩家共同受 7 点伤害 | 两张 Spell 从全体玩家的已准备法术中作为一个集合选，不先选单一玩家；7 点伤害由玩家共同分配 |
| Omen Hulk（Tier 3 Minion，15 生命） | PERSISTENT：自身受 2 点伤害；任意玩家受 3 点伤害；从场上一张 Power 移除 1 个 token | 按顺序结算；Power 不存在时跳过该步骤，存在多张时让玩家选择 |
| Withstand（Tier 3 Attack） | Prophet 生命不超过 30：获得 15 生命；否则 Gravehold 受 8 点伤害 | 当前生命门槛和不封顶治疗 |

### 本场新增的共用能力

- 加入 Prophecy deck 及牌堆底部放置、顶牌常显、洗牌和副本身份管理。
- 支持 Nemesis 卡压在另一张 Nemesis 卡下方，之后再进入游戏或弃牌堆。
- 支持 Nemesis 回合结束时检查阈值并放入 Prophecy；这个步骤要在 Nemesis 主流程结束后执行，并能在等待玩家选择或动画时暂停。
- 支持“无生命上限”的 Nemesis，以及达到指定生命值后立即失败的条件。
- 加入 Nemesis deck 特殊失败条件，并确认 deck 最后一张牌抽出后的检查时点。
- Prophecy 回到底部、Finality 回专属堆、Exiled card 移到玩家弃牌堆等牌移动，都要通过统一移动记录串行播放，后续流程等必要动效结束再继续。

## 建议实现顺序

1. **先打牢实体牌区和规则状态。** 为 Vortex、Exiled pile、Finality pile、Prophecy deck 和“牌下压着另一张牌”的关系设计可保存的数据结构。统一接入副本 ID、移动记录和撤销/恢复。
2. **先实现 The Timeless 的 Exile 基础。** 它能验证玩家牌 Exile、牌堆顺序、特殊牌区和获得顶牌的基本路径；再实现 Curse 的进手触发和 Finality 回收。
3. **实现 Oracle of Filth 的 Vortex。** 在已验证的特殊牌区和移动基础上加入 Vortex 填充、筛选、Expunge 分发、缺牌伤害、法术去向替换和 Oracle 伤害限制。
4. **实现 Twice-Dead Prophet 的 Prophecy。** 最后接入嵌套牌、Prophecy 生命周期、Nemesis endTurn 阈值、延迟 Power/Minion，以及特殊失败条件。
5. **逐张加入各自的 Nemesis 卡牌数据。** 先做共享数据/效果已有的卡；遇到新规则再补通用效果能力，不把整张卡的效果塞进某个大 switch。
6. **再接入 UI。** Nemesis 选择、开局特殊设置、特殊牌区展示、合法决策提示、获得牌和牌区之间的移动。决策窗口展示的卡仍是预览副本，确认后按规则直接进入目的区。
7. **按规则场景做验证。** 先跑引擎测试，再检查对应 UI 操作；保存/恢复和撤销要覆盖所有新增的暂停点。

## 验证清单

### 引擎

- 三位 Nemesis 在选择列表中显示正确，起始生命、难度、三层卡牌数和专属牌堆内容正确。
- Oracle：Vortex 初始 5 张 Crystal；Vortex Blast 伤害随费用总和变化；Expunge 发 6 次且缺牌时每次造成 4 Gravehold 伤害；只有 Vortex Blast 能伤害 Oracle；Pupil 最低保留 1 点生命，法术命中后只移动一次。
- The Timeless：Exile 永远放在顶端；只能购买顶牌且费用加 1；Curse 进入手牌后按卡面顺序自动结算；Finality 阈值重复到 token 不超过 2；空 Finality pile 时使用 10 点 Gravehold 伤害；增加难度规则只允许从手牌 Exile。
- Twice-Dead Prophet：阈值触发、Prophecy 底牌装载/结算/弃置和回到底部顺序正确；被放出的牌不提前结算；99 生命和空 Nemesis deck 按指定时点结束游戏。
- Torment、Abyssal Vial 的大写 `OR` 按全组选项验证，前端禁用和引擎提交校验一致。
- 所有需要选玩家、手牌、预备法术或 Power 的效果，都覆盖无人满足、多人并列、可部分完成和状态在选择期间改变的情况。

### UI 和卡牌动效

- 开局能看到每个特殊牌区，并能查看规则允许查看的卡牌；牌堆面朝规则指定的一侧。
- 玩家能看清目标和不可用选项；不允许的按钮不能靠直接提交绕过。
- 每张牌只从实际来源移动一次；从选择窗口确认的卡不从窗口中央飞出。
- Vortex / Exiled pile / Prophecy deck 的连续移动按顺序播放；动画完成前不能翻开下一张 Nemesis 卡或继续后续阶段。
- 中断后恢复游戏，卡牌归属、顺序、token、压叠关系、可见状态和待续结算完全一致。

## 仍需后续核对的假设

这些点会影响数据结构和结算顺序，我把理解写清楚，等你审核：

1. **The Doomed：** 卡牌资料说明被击败时，玩家获得压在它下面的牌。还需确定本项目中如何选择获得者，以及如何将牌送到其规则目的地区域。
2. **The Timeless 起始 Exiled pile：** 我暂按从最高费用供给堆移走一张实体牌，供给堆数量减一；若最高费用并列，玩家从并列堆中选。请确认。
3. **The Timeless 没有 Finality 时：** 我暂按每次本该召出 Finality 时 Gravehold 受 10 点伤害，同时仍扣除 3 个 Nemesis token，所以同一个结束回合可能重复造成伤害，直到 token 不超过 2。请确认。
4. **Twice-Dead Prophet 的空牌堆失败时点：** 我暂按 Nemesis deck 最后一张牌被抽出后立即判负、该牌效果不再结算；Prophecy 装载 Nemesis deck 底牌时如果因此掏空牌堆，也要立刻判负。第二种情况尤其需要你确认是否符合卡面意图。
5. **Twice-Dead Prophet 结束回合：** 卡面没有写“重复”，所以即使扣 4 后仍有 6 个或更多 token，也暂按本回合只放一张 Prophecy。
6. **Oracle 增加难度：** Oracle 或 Pupil 的 3 点治疗目标由玩家选择；Pupil 仍无生命上限。

Oracle 的供给牌堆、Vortex 可见状态、Pupil 上排位置及 Expunge 起始玩家/发牌方式已按用户补充确定。其他待核对项仍需确认；实现中不把未确认的推断固化为通用规则。

## 资料来源

- 项目整理的卡牌文字：[Wave 9 Nemesis 卡牌资料](nemeses.md)
- 本地 The Timeless 卡图：`image-database/cards/wave9/nemesis/The Timeless/`
- [Oracle of Filth](https://aeonsend.wiki.gg/wiki/Oracle_of_Filth)、[Vortex Blast](https://aeonsend.wiki.gg/wiki/Vortex_Blast)、[Unrelenting Fear](https://aeonsend.wiki.gg/wiki/Unrelenting_Fear)、[Abyssal Vial 裁定](https://aeonsend.wiki.gg/wiki/Rulings#Abyssal_Vial)
- [The Timeless](https://aeonsend.wiki.gg/wiki/The_Timeless)、[Curse of Exhaustion](https://aeonsend.wiki.gg/wiki/Curse_of_Exhaustion)、[Finality](https://aeonsend.wiki.gg/wiki/Finality)、[Subside](https://aeonsend.wiki.gg/wiki/Subside)
- [Prophecy of Fire](https://aeonsend.wiki.gg/wiki/Prophecy_of_Fire)、[Prophecy of Ruin](https://aeonsend.wiki.gg/wiki/Prophecy_of_Ruin)、[Vile Petition](https://aeonsend.wiki.gg/wiki/Vile_Petition)
- 项目裁定：[game-rulings.md](../../../game-rulings.md)
