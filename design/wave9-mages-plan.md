# Wave 9 Breach Mages 开发计划

## 目标与边界

本计划只覆盖当前 Wave 9 内容中的六位 Breach Mage，以及为其正常运行所必需的专属牌、专属区域、特殊 breach 和 UI。内容依据 `documents/wave9/mages/mages.md` 与 `documents/wave9/errata.md`；具体卡面以该资料和后续核对的 Wiki 为准。

开发对象：

- Indira、Nook、Stake、Wolf、Dezmodia、Remnant；
- 每位 Mage 的初始牌、专属牌、能力、breach 与个人资源；
- Nook 的 Swap zone、Stake 的 Prototype/Upgrade、Dezmodia 的 Treasure stash；
- Mage 机制所需的通用资源显示与图片映射。

暂不在本计划中实现：本 Wave 的 Supply cards、Trinket deck、Friends and Foes、Banner cards、Nemeses 及 Basic Nemesis cards。它们可以复用本轮新增的通用能力，但不应反过来阻塞 Mage 开发。

本文与 Wave 9 范围文档使用同一内容命名。当前已审核的图片仍物理存放在既有 `image-database/cards/wave9/` 目录；本次仅更正资料与计划文档，不移动该目录中的图片。

## 资料与资源约定

- `image-database/cards/wave9/mages/` 是 Mage 专属卡图的候选来源；用户已手动删除的错误图片视为有效的审查结果，不恢复、不重新下载。
- `image-database/common images/` 中的 `Aether.png`、`Knowledge.png`、`Recall.jpg` 是跨内容复用的唯一资源。后续代码应引用这三张公共图，不为 Wave 9 再复制一份。
- 在图片导入生成脚本支持公共图片映射之前，不手改自动生成的图片导入文件；实现时扩展生成脚本并重新生成。
- 如确需再次执行资料采集脚本，先让脚本跳过/识别上述公共图片及人工剔除项，避免把已删除的错误文件重新写回。
- 所有面向玩家的 UI 文本、卡牌文本、提示和日志保持英文；本计划及资料文档可以使用中文。

## 实施原则

1. 规则引擎优先。特殊机制进入通用且可持久化的 `GameState` 模型，不把规则判断藏进 Vue 组件。
2. 先做可复用的最小抽象，再以单个 Mage 的纵向切片确认抽象确实可用；不为尚未开发的内容提前做大而全的框架。
3. 每个新增状态均必须参加存档、导入导出、撤销和游戏重置，且不能影响已有 Wave 的游戏。
4. 每完成一个 Mage，就同时完成其引擎测试、基本 UI 流程和图片映射，不积累“只有数据、不能实际游玩”的半成品。
5. 开发顺序是建议，不是硬依赖；若某个共享机制先被其他 Mage 验证，可以调整后续批次。

## 阶段 1：基线与数据接入

目的：在不改变现有游戏行为的前提下，确定数据入口和可测试的选择方式。

- 核对六位 Mage 的卡牌清单、初始配置、能力费用、breach 布局和勘误；将资料中的歧义单独记录，不用猜测替代规则。
- 为 Wave 9 Mage 建立独立的数据模块、图片键约定和选择入口，并接入现有角色选择/开局流程。
- 制作每位 Mage 的最小测试开局夹具：能创建其初始状态，但尚未要求所有专属效果完成。
- 扩展图片导入生成流程，使 Mage 卡图与公共 `Aether`、`Knowledge`、`Recall` 图均有稳定键；生成文件由脚本产生。

完成标准：六位 Mage 都能被数据层识别并创建，未实现的效果不会伪装为可用；现有 Mage 和既有测试不发生回归。

## 阶段 2：共享规则能力

目的：为六位 Mage 共同需要的状态提供可组合、可测试的引擎能力。

优先按实际切片需要逐项加入：

- 玩家资源/计数器：例如 Knowledge、Doom，以及以后可复用的 Aether token；明确获得、消耗、上限、显示和重置时机。
- 特殊 breach 描述：支持“从此 breach 施放时”的伤害、去向、抽牌、不可摧毁、额外预备容量等可声明效果，而不是为每个 Mage 写 UI 特判。
- Mage 私有区域：支持可见的交换区、升级区、stash 等区域及其抽取、放回、排序、选择和持久化。
- 持续性/附着效果：为 Treasure 对供应牌堆、玩家、breach 或回合事件产生的持续效果提供受控挂点与清理时机。
- 跨玩家操作：选择盟友、处理盟友手牌/弃牌/预备法术，以及严格校验目标与时机。

每新增一项都需要定义其序列化格式、撤销快照行为和引擎级错误提示。若一个效果不能合理抽象，应先以受限的 Mage 专属规则实现，并留下可测试的边界，避免过度泛化。

完成标准：共享状态可以保存、恢复、撤销；不选 Wave 9 Mage 时不会改变原有规则路径。

## 阶段 3：低耦合 Mage 纵向切片

建议先用规则较清晰、依赖较少的 Mage 验证阶段 2 的模型：

1. **Remnant**：Rift III/IV 的施放后盟友抽牌、`Rebuild Matter`、Violet Shard 的条件 Aether。
2. **Wolf**：Doom 的取得/失去与第五枚 Doom 的结算、`Aegis of Hope`、Doomstone 与 Doom Howl。
3. **Indira**：Transfer breach、Conjure、从盟友手中施放两次，以及能力的“仅限 Spell”的 5 Aether 分支。

Indira 的 Transfer breach 必须执行勘误：从该 breach 施放的法术在结算后回到任意盟友手牌，不能设计成可选的回手效果。

Indira 的专项规则与资料核对要求：

- III 号是特殊的 Transfer breach，不能套用 common breach 的图片或规则；使用专用 breach 的正面/背面图片，
  closed 侧默认朝右。打开后，来自该 breach 的法术额外造成 1 点伤害，并且必须将该法术放入任意盟友的手牌。
- `Pyromancer's Guile` 是两个分支的 OR 选择：从任意盟友手牌施放一个法术且不弃掉它，然后再次施放；或获得
  5 点只能用于获得 Spell 的 Aether。两条分支应优先由现有类型化效果组合实现。
- `Conjure` 的官方定义：查看自己牌堆顶牌，然后可以将它面朝下预备到自己的已打开 breach，或本回合已被
  focus 的 closed breach。面朝下的牌视为费用为 2 的 Spell，并具有 `Cast: Deal 2 damage.`；施放后将它正面朝上
  放入弃牌堆，且可以随时查看这些面朝下的牌。
- Conjure 的实现必须保留官方澄清：面朝下牌没有名称；从 breach 移入手牌后会以正面朝上，不能再次作为 Conjured
  spell 预备；施放时应绕过会替换普通弃牌流程的效果。Fused Opal 因而可以把非 Spell 的牌作为面朝下的 Conjured
  spell 使用，Transfer breach 结算后再按强制规则放入盟友手牌。

来源：[`Conjure` — Aeon's End Wiki](https://aeonsend.wiki.gg/wiki/Conjure)、
[`Breach` — Aeon's End Wiki](https://aeonsend.wiki.gg/wiki/Breach)、
[`Beyond the Breach` Errata](https://aeonsend.wiki.gg/wiki/Beyond_the_Breach)。

每个切片的完成标准：

- 可从新游戏完整选用该 Mage，初始牌、ability、breach 和专属资源均可游玩；
- 非法目标、缺少目标、牌堆为空等边界情况有明确处理；
- 引擎单元测试覆盖正常流程、选择分支和至少一个失败/边界流程；
- UI 能清楚展示该 Mage 专属状态，并可在一个完整玩家回合中操作。

## 阶段 4：私有区域与升级机制

在共享区域模型稳定后，实现依赖更强的两位 Mage：

- **Nook**：开局 Swap zone、Crystal/Spark 的交换、Empty 牌被摧毁时返回 Swap zone、`Rupture Time` 的多选与按名称取得。重点测试交换目标不存在、重复名称和弃牌堆放置顺序。
- **Stake**：不可摧毁的 Prototype breach、Knowledge 的获得与消费、Upgrade 的选择与装配、各 Upgrade 的持续效果、`Tinker` 的两种分支。重点测试 Prototype 的预备限制变化、升级叠加/移除规则和自行摧毁法术。

完成标准：私有区域中的牌不会混入普通牌库；所有升级和交换状态在存档、撤销、导入后保持一致；规则提示能解释为何某个选择当前不可用。

## 阶段 5：Dezmodia 与 Treasure 系统

Dezmodia 是本轮最复杂的 Mage，放在前述通用能力经过实际验证之后。

通用区域约定：`MageDef` 通过 `hasSpecificDeck`、`specificDeck`、
`specificDeckShuffled`、`specificDeckBack` 和 `hasPlayerCardsInPlay` 声明
Mage-specific deck 与 Player cards in play；玩家区按声明动态插入这些区域。
Specific deck 的展示默认使用牌背，进入 Player cards in play 后改为正面叠放。
因此后续 Mage 只需在数据定义中设置这些字段，不应在 Vue 组件内写角色特判。

当前 Dezmodia 纵向切片已覆盖 Stash 的洗牌、展示/选择、放回牌底、放入 play
以及基础的 in-play action 接口；七张 Treasure 的供应牌堆附着、token 和跨玩家
触发效果仍按本阶段后续批次逐张接入，不把占位数据误认为规则已完成。

- 实现开局从 7 张等级 2 Treasure 组成的个人 stash；支持使用默认列表，并为未来合法自定义列表保留校验入口。
- Treasure 不属于 Supply Gem/Relic/Spell：使用独立的 `CardType = treasure` 与 `treasureLevel = 2` 定义，且不设置 Aether 购买费用；其规则继续通过类型化效果块实现。
- 实现 `Pilfer Past`：展示 stash 顶两张，选择一张进入 play，另一张放到 stash 底；无足够牌时按已确认规则处理。
- 实现七张专属 Treasure 的入场、持续、消耗/摧毁和离场效果，包括供应牌堆附着、Aether token、Power token、费用修正、自动获得/抽牌/施放、回合牌影响等。
- 对 Treasure 的“任意玩家”“本回合”“每个供应牌堆”等范围做单独的引擎测试，避免以当前单玩家 UI 误替代多人规则。
- 处理资料中的名称/类型不一致项时，以效果、勘误和 Wiki 复核为依据，并在资料勘误文件中留下来源。

完成标准：默认 Treasure 组合可完整游玩，所有 Treasure 都有可复现的测试场景；撤销不会留下幽灵附着效果或重复 token。

## 阶段 6：UI、可玩性与资源收口

- 在角色选择、玩家信息区和 breach 区补齐 Wave 9 Mage 的可见状态；专属区域应可查看但不应把所有内部状态暴露成调试面板。
- 为资源、条件 Aether、目标选择和必须/可选操作提供清晰的英文反馈；避免通过隐式自动选择掩盖关键决策。
- 将公共图标用于 Aether、Knowledge、Recall 的一致展示；核对卡图文件名、数据键、生成导入和缺图回退。
- 逐一执行六位 Mage 的人工冒烟流程：开局、专属牌、ability、特殊 breach、保存后恢复、Ctrl+Z 撤销关键操作。

完成标准：六位 Mage 均能在正常 UI 中从开局推进多个回合，图片无错误复用或缺失，且没有仅靠调试工具才能继续的步骤。

## 阶段 7：回归与交接

- 运行引擎完整测试、类型检查、前端构建及相关 E2E/手动浏览器测试。
- 新增专门的 Wave 9 Mage 回归测试入口，并保留每位 Mage 的关键规则用例索引。
- 对照 `documents/wave9/mages/mages.md`、勘误和实际数据逐项复核；列出未确认的规则而不是静默简化。
- 更新开发文档：数据位置、图片键、公共图片约定、已实现 Mage、已知限制和后续依赖（例如 Supply 或 Friends and Foes 会复用的机制）。

最终验收：六位 Mage 的规则、资源、图片、存档、撤销和多人目标行为均有对应验证；已有 Wave 内容和存档兼容路径保持可用。

## 批次执行与检查清单

每个小批次建议遵循相同的循环：

1. 先确认相关 Wiki 文字、卡图和勘误，写出该批次的可验证规则点。
2. 在引擎加入最小状态与操作，先补单元测试。
3. 接入数据和 UI，补齐图片映射与交互反馈。
4. 验证撤销、存档恢复及至少一个异常路径。
5. 运行相关测试后再开始下一张/下一位 Mage；发现共享模型不合适时，先调整模型和已有测试。

建议按「共享能力 → Remnant/Wolf/Indira → Nook/Stake → Dezmodia → 全量回归」推进，但可根据你希望优先游玩的 Mage 调整。任何会改变资料范围、重建已人工清理图片或重构既有核心规则的操作，先单独确认。
