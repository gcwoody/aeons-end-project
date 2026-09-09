# Mage 实装阶段计划

本文档记录 Wave 1 其余 Mage 的实装计划、已确认的规则资料、需要扩展的通用引擎机制，以及每个阶段的验收标准。

## 当前范围

Wave 1 共有 8 位 Mage：

- 已实现：Jian、Brama、Xaxos
- 本次计划实现：Adelheim、Kadir、Lash、Mist、Phaedraxa

本次资料以用户提供的规则为准。Mage 图片只用于确认视觉资源，不能替代 Ability、Breach 或卡牌效果规则。

## Mage 实装进度

截至 2026-09-09：

- 阶段 0：已完成。5 位新增 Mage 的规则资料已确认并记录。
- 阶段 1：已完成。5 位 Mage 已接入 Setup、Mage 图片、静态配置、起始牌和 Common Breach 槽位。
- 阶段 2：已完成。5 张 Mage 独特卡牌已使用类型化效果组合接入，并覆盖所有选择分支。
- 阶段 3：已完成通用框架。Mist、Lash、Phaedraxa 的 Ability 已接入；Ability 中断、Turn Order 牌选择、当前回合伤害防止和存档兼容已覆盖。
- 阶段 4：已完成。Kadir 的 Ability、弃牌堆 Spell 回手、每个开启 Breach 的双 Spell 准备、叠放 UI、按具体 Spell 释放和回合重置均已实现。
- 阶段 5：已完成。引擎回归测试和 Playwright 浏览器测试已覆盖当前阶段的主要规则、UI 流程及保存/读档。
- 阶段 6：未执行，保留为后续文档与维护流程整理阶段。

阶段 3 的明确遗留项：Adelheim 的 Nemesis draw phase Ability 仍暂不结算，因为 Nemesis Attack/Power 的完整抽牌与结算流程尚未完成。

## 分阶段实施计划

### 阶段 0：规则资料确认与数据建档

目标：先把每位 Mage 的静态资料整理成统一格式，避免在代码实现过程中根据图片或不完整信息猜测规则。

本阶段完成内容：

1. 确认 Mage 名称、生命值、Charge 上限。
2. 确认 Ability 名称、触发时机和效果。
3. 确认四个 Breach 的存在状态、方向、开启状态及后续费用数据。
4. 确认起始手牌和起始牌库。
5. 确认独特卡牌的类型化效果。
6. 记录需要新增的通用引擎能力，但暂不把特殊规则写成某个 Mage 的硬编码分支。

阶段 0 的资料已经整理在本文档的“已确认 Mage 资料”章节中。

### 阶段 1：选择页面与静态 Mage 数据接入

目标：让 5 位 Mage 能够从前端选择，并正确进入游戏。

实施内容：

- 在 Mage 选择页面增加 Adelheim、Kadir、Lash、Mist、Phaedraxa。
- 接入 Mage 正反面图片。
- 将静态资料加入 Wave 1 Mage 数据文件。
- 接入 HP、Charge 上限、起始手牌、起始牌库和 Breach 配置。
- 为不完整或非法的 Mage 配置增加启动前校验。
- 确认回合顺序卡使用 Mage 名称前缀时不会产生歧义。

验收标准：

- 每位 Mage 都能被选择并正常开始游戏。
- 游戏开始后，HP、Charge、手牌、牌库和 Breach 与资料一致。
- Phaedraxa 缺少第一个 Breach 时，UI 不显示第一个 Breach，但第 2、3、4 个 Breach 的相对位置不改变。

### 阶段 2：独特卡牌的类型化效果接入

状态：已完成。

目标：将 5 张独特卡牌使用现有的类型化 CardEffect 组合实现。

优先复用已有效果模块，例如：

- `gain_aether`
- `gain_life`
- `draw_cards`
- `cast_prepped_spell`
- `reveal_turn_order_card`
- `choose_one`
- `choose_optional`
- `discard_cards`
- `destroy_cards`

目前需要确认或实现的卡牌：

- Amethyst Shard：获得 1 Aether；任意 Ally 可以抽 1 张牌，再弃 1 张手牌。
- Emerald Shard：获得 1 Aether，或任意玩家获得 1 Life。
- Quartz Shard：获得 1 Aether；展示回合顺序牌堆顶牌；可以将其放回牌顶或牌底；若为玩家回合顺序卡，额外获得 1 Aether。
- Garnet Shard：获得 1 Aether，或施放任意玩家准备好的 Spell。
- Tourmaline Shard：获得 1 Aether；任意 Ally 可以承受 1 点伤害；如果承受，则从手牌 Destroy 一张牌。

验收标准：

- 卡牌效果通过通用类型化数据表达。
- 需要选择时出现可复用的选择流程。
- 伤害、生命、抽牌、弃牌和 Destroy 均遵守现有规则。
- 不为单张卡牌复制一套专属结算逻辑。

### 阶段 3：Ability 触发时机与通用中断机制

状态：已完成通用框架与当前阶段范围内的 Ability 接入。

目标：实现 Ability 的触发资格、玩家选择和效果结算。

计划支持：

- Nemesis draw phase：Adelheim 的 Ability 暂时只接入数据，不实现具体效果。
- Any player's main phase：Kadir、Lash。
- Current player's main phase：Mist。
- Immediately after a turn order card is drawn：Phaedraxa。

需要特别设计的通用能力：

#### Lash：Quicken Thought

激活前必须检查回合顺序弃牌堆中至少存在一张玩家回合顺序卡。没有符合条件的卡牌时，Ability 不可激活。

#### Phaedraxa：Auspex Rune

当回合顺序卡翻开后，如果 Charge 已达到上限，弹出可拖动的确认窗口：

- `Activate`
- `Skip`

如果激活，防止玩家和 Gravehold 在当前回合受到伤害；效果从激活时持续到该回合结束。

该效果需要建模为“当前回合持续的伤害防止状态”，不能只在单次伤害结算时临时判断。

验收标准：

- Ability 按钮只在正确阶段和正确玩家范围内可用。
- 任意玩家 Main Phase 的 Ability 可以由符合条件的玩家激活。
- 特殊触发时机不会被普通 Main Phase 流程吞掉。
- 弹窗确认、Skip 和保存/读档都能保持状态一致。

已完成实现：

- Mist 的 `Divine Augury` 使用通用 `draw_cards`，让 Ally 抽 4 张牌。
- Lash 的 `Quicken Thought` 使用通用 Turn Order 牌选择决策；没有玩家回合顺序卡时不能激活，选择后将牌洗回牌堆并让牌主承受 1 点伤害。
- Phaedraxa 的 `Auspex Rune` 在 Turn Order card 翻开后触发通用 Activate/Skip 中断；激活后通过回合状态防止玩家和 Gravehold 受到伤害，并在下一回合开始时清除。
- 新增 Ability 触发类型 `turn_order_card_drawn` 和 `nemesis_draw_phase`，不再把不同规则混用。

### 阶段 4：Kadir 的多 Spell 准备模型与 UI

状态：已完成。

目标：支持同一个 Breach 同时准备最多两张 Spell。

规则：

- Kadir 的 Ability 允许目标玩家从弃牌堆将最多三张 Spell 返回手牌。
- 本回合可以在每个已开启 Breach 上准备最多两张 Spell。
- 同一 Breach 上的两张 Spell 纵向叠放。
- 第二张 Spell 与第一张保持相同水平位置，垂直方向上移动约半张卡牌高度。
- Casting Phase 中，玩家可以点击同一 Breach 上的任意一张 Spell 选择释放。
- 一张 Spell 释放后，另一张 Spell 使用普通单张 Prepped Spell 的 UI 展示。

实现要求：

- 将 Breach 的单一 `preppedSpell` 模型扩展为可维护顺序的 Spell 列表。
- Casting Phase 的可释放目标必须按具体 Spell，而不是只按 Breach 判断。
- While Prepped、Cast、释放后进入弃牌堆等流程要保持现有规则。
- 不影响普通情况下每个 Breach 只有一张 Spell 的 UI。

实际实现：

- `BreachState.prepSpells` 保存同一 Breach 上按准备顺序排列的多张 Spell。
- `PlayerTurnEffects.prepSpellLimit` 保存本回合准备上限；普通回合为 1，Kadir 激活后为 2，并在下一次抽牌阶段重置。
- `PreppedSpellChoice.spellIndex`、`CastableSpell.spellIndex` 和带索引的 `castSpell()` 保证释放或选择的是具体叠放卡牌。
- UI 以半张卡牌高度纵向叠放，并允许从叠放区域选择具体卡牌；第一张卡牌不会阻断第二张卡牌的准备操作。
- 旧存档中的单值 `preppedSpell` 会在 UI 读档归一化时迁移为 `prepSpells`。

### 阶段 5：自动化测试与浏览器验证

状态：已完成。

引擎测试覆盖：

- 每位 Mage 的初始配置。
- Breach 缺失、方向和开启状态。
- Ability 的 Charge 阈值和触发时机。
- Ability 的目标范围和选择限制。
- 独特卡牌的所有分支效果。
- Turn order deck、turn order discard pile 的边界情况。
- 当前回合伤害防止效果的开始与结束。
- Kadir 多 Spell 准备、释放和保存/读档。

Playwright UI 测试覆盖：

- Setup 页面选择 5 位 Mage。
- 正确显示 Mage 图片和 Ability 信息。
- Ability 按钮在正确阶段可用或禁用。
- 选择弹窗、确认、Skip 和卡牌高亮。
- Kadir 同一 Breach 的双 Spell 叠放与释放。
- 保存游戏后重新 Resume，状态仍然正确。

实际验证命令：

- `cd aeons-end-engine && npm test`
- `cd aeons-end-ui && npm run build`
- `cd aeons-end-ui && npm run test:e2e`

当前 Playwright 回归包括 5 位新增 Mage 的启动与图片显示、Kadir 同一 Breach
叠放两张 Spell 并分别释放、Jian 的跨玩家无弹窗能力流程，以及 Save & Exit 后
Resume。Playwright 默认使用本机 Google Chrome；可通过 `PLAYWRIGHT_CHANNEL`
覆盖浏览器通道。Adelheim 的具体 Nemesis Ability 仍按阶段 0 资料中的约定暂缓。

### 阶段 6：文档与维护流程整理

完成实现后更新：

- `README.md`
- `dev-guide.md`
- `design/card-effects-keywords.md`
- 本文档中的实现状态和遗留问题

文档需要明确说明：

- 新增 Mage 时应修改哪些文件。
- Ability 如何由通用 CardEffect 组合。
- 如何新增 Ability 触发时机。
- 如何为新的卡牌选择、目标和持续状态增加通用模块。
- 哪些规则仍然未实现，例如 Adelheim 的 Nemesis draw phase 机制。

## 已确认 Mage 资料

### Adelheim

- Ability：`Aethereal Ward`
- Activate：during the nemesis draw phase
- Effect：When a nemesis attack or power card is drawn, but before it is resolved, you may discard it. It has no effect.
- 当前实现决定：暂不实现具体 Ability 效果，因为 Nemesis draw/resolution 机制尚未完善。
- Charge：5
- HP：10

Breach：

1. Open
2. Left
3. Right
4. Down

Starting hand：

- 1 × Amethyst Shard
- 2 × Crystal
- 2 × Spark

Starting deck：

- 5 × Crystal

Unique card：

- Amethyst Shard：Gain 1 Aether. Any Ally may draw a card and then discard a card in hand.

### Kadir

- Ability：`Otherworldly Gate`
- Activate：during any player's main phase
- Effect：That player may return up to three Spells in their discard pile to their hand. That player may prep up to two Spells to each of their opened Breaches this turn.
- Charge：5
- HP：10

Breach：

1. Open
2. Left
3. Down
4. Left

Starting hand：

- 1 × Emerald Shard
- 3 × Crystal
- 1 × Spark

Starting deck：

- 3 × Crystal
- 2 × Spark

Unique card：

- Emerald Shard：Gain 1 Aether or any player gains 1 Life.

### Lash

- Ability：`Quicken Thought`
- Activate：during any player's main phase
- Effect：Shuffle any player's turn order card into the turn order deck. That player suffers 1 damage.
- Additional restriction：如果回合顺序弃牌堆中没有玩家回合顺序卡，则不能激活 Ability。
- Charge：5
- HP：10

Breach：

1. Open
2. Left
3. Right
4. Left

Starting hand：

- 1 × Quartz Shard
- 3 × Crystal
- 1 × Spark

Starting deck：

- 3 × Crystal
- 2 × Spark

Unique card：

- Quartz Shard：Gain 1 Aether. Reveal the top card of the turn order deck. You may place that card on the bottom or the top of the turn order deck. If you revealed a player turn order card, gain an additional 1 Aether.

### Mist

- Ability：`Divine Augury`
- Activate：during your main phase
- Effect：Any Ally draws 4 cards.
- Charge：5
- HP：10

Breach：

1. Open
2. Left
3. Down
4. Down

Starting hand：

- 1 × Garnet Shard
- 3 × Crystal
- 1 × Spark

Starting deck：

- 3 × Crystal
- 2 × Spark

Unique card：

- Garnet Shard：Gain 1 Aether or cast any player's prepped Spell.

### Phaedraxa

- Ability：`Auspex Rune`
- Activate：immediately after a turn order card is drawn
- Effect：Prevent any damage that the players or Gravehold would suffer during that turn.
- Charge：5
- HP：10

Breach：

1. No Breach
2. Open
3. Down
4. Left

第一个 Breach 不存在。UI 需要隐藏第一个 Breach，但不能改变第 2、3、4 个 Breach 的相对位置。

Starting hand：

- 1 × Tourmaline Shard
- 3 × Crystal
- 1 × Spark

Starting deck：

- 4 × Crystal
- 1 × Spark

Unique card：

- Tourmaline Shard：Gain 1 Aether. Any Ally may suffer 1 damage. If they do, they destroy a card in hand.

## 数据和实现约定

### Aether 命名

代码和规则数据统一使用 `aether`。用户资料中出现的 `ether` 按同一资源处理，不创建第二种资源。

### Common Breach 费用

所有通用 Breach 使用统一费用规则：第一个 Breach 通常开局已开启；第 2、3、4 个 Breach 的 Focus 费用分别为 2、3、4。Open 费用由 Breach 编号和当前方向决定：

| Breach | Right / East | Down / South | Left / West | Up / North |
| --- | ---: | ---: | ---: | ---: |
| II | 5 | 4 | 3 | 2 |
| III | 9 | 7 | 5 | 3 |
| IV | 13 | 10 | 7 | 4 |

该规则由 `COMMON_BREACH_FOCUS_COSTS` 和 `COMMON_BREACH_OPEN_COSTS` 统一维护。Mage 数据只需要声明 Breach 的开启状态和方向，不应为同一个 Common Breach 定义不同费用。

### Ability 设计

Ability 应继续采用“触发时机 + 类型化效果列表”的数据驱动方式：

- 触发时机负责判断何时可以激活。
- 效果列表负责描述激活后的状态变化、选择和结算。
- 特殊限制应作为通用资格判断或通用条件效果维护。
- 不应在 `if (mageId === ...)` 分支中复制完整结算流程。

### 不确定或暂缓内容

- Adelheim 的 Ability 暂不实现具体效果，直到 Nemesis draw phase 完整接入。
- Nemesis Minion/Power 的完整持续效果和规则文本解释仍未完成。
- 更多复杂集合操作、任意牌区移动和复杂嵌套目标仍需按新卡牌需求继续抽象。

## 历史执行顺序

1. 接入 5 位 Mage 的静态配置和选择页面。
2. 接入独特卡牌的类型化效果。
3. 实现 Lash、Phaedraxa 的新触发条件和持续状态。
4. 实现 Kadir 的双 Spell 数据模型和 UI。
5. 补充独特卡牌、Ability、边界情况和存档的引擎测试。
6. 以 Playwright 覆盖关键浏览器流程。
7. Adelheim 的 Nemesis 阶段 Ability 留待 Nemesis 抽牌流程完善后实现。
