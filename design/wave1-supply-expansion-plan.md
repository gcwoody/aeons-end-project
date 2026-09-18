# Wave 1 商店卡牌扩展与商店配置计划

更新时间：2026-09-13

## 目标

完成 Wave 1 的全部 Gem、Relic、Spell 数据与效果实现，并在 Setup 页面允许玩家为 9 个商店槽位选择固定牌组或使用半随机模板 1。规则结果继续由引擎决定，Setup/UI 只负责提交配置和展示结果。

本次范围是当前项目已经存在的 Wave 1 图片目录和 Core Box 规则；不提前设计其他 Wave、其他场景人数或任意自定义随机规则。

## 当前基线与资料范围

当前图片目录为 `image-database/cards/wave1/`，实际清单为：

- Gem：Burning Opal、Clouded Sapphire、Crystal、Diamond Cluster、Jade、Searing Ruby、Sifter's Pearl、V'riswood Amber。其中 Crystal 是初始牌，不是新增商店牌。
- Relic：Blasting Staff、Bottled Vortex、Flexing Dagger、Focusing Orb、Mage's Talisman、Unstable Prism，共 6 张。
- Spell：Amplify Vision、Arcane Nexus、Chaos Arc、Consuming Void、Dark Fire、Essence Theft、Feral Lightning、Ignite、Lava Tendril、Oblivion Swell、Phoenix Flame、Planar Insight、Spark、Spectral Echo、Wildfire Whip，共 15 张；其中 Spark 是初始牌。

因此，完成后商店候选目录应为 27 张：7 Gem、6 Relic、14 Spell。当前已经实现的 9 张（3 Gem、2 Relic、4 Spell）保留并纳入同一目录。

详细规则以 Core Box Wiki 的 Supply Gems、Supply Relics、Supply Spells 章节及各卡牌详情页的 Effect 为准。图片、Wiki canonical title、卡牌 ID 和代码名称必须在实现前建立一一对应关系。

## 阶段 0：资料收集与整理（前置条件）

这一阶段完成前不开始批量写卡牌效果代码。

1. 复用 `image-database/download_wiki_images.py` 的 MediaWiki API 访问、分区解析和文件名清洗逻辑，增加 supply 图片目录的校验/补抓模式；默认输出应与 `image-database/cards/wave1/gems`、`relics`、`spells` 对齐，不能因为重新抓取覆盖已有有效图片。
2. 新增或扩展 supply 规则收集脚本，参考 `image-database/collect_nemesis_wiki_rules.py`：从三个 Supply 章节取得卡牌链接，逐张读取详情页，保留名称、canonical title、类型、费用、Effect，以及与规则有关的 Details、Clarifications、Errata。Flavor Text、Story、Trivia 等叙事内容不进入运行时资料。
3. 输出两份前置资料：
   - `documents/wave1-supply-wiki-rules.md`：按 Gem/Relic/Spell 分组的可读规则资料，带来源链接和抓取时间。
   - `documents/wave1-supply-catalog.json`：供后续人工核对和脚本校验的结构化清单，至少包含 `id`、显示名、Wiki 标题、类型、费用、图片文件名、Effect 原文和规则备注。
4. 建立“图片文件名 → Wiki 标题 → 稳定代码 ID → 代码导出名”的映射表。处理括号、撇号、连字符、`(Aeon's End)` 等命名差异；禁止同一张牌出现两个 ID，也禁止有图片但没有资料或有资料但没有图片。
5. 对 27 张商店候选牌建立效果审计表：
   - 已能由现有 `CardEffect` 表达的效果；
   - 需要复用的现有选择/牌区/目标模块；
   - 确实缺失、可能需要新增的通用效果；
   - 是否存在“任意玩家”“盟友”“本回合”“预备法术”“手牌/弃牌堆”等目标和时机要求。
6. 以卡面图片逐张复核费用和 Effect 原文，标记 Wiki 与图片不一致、措辞含糊或需要规则裁定的项目。阶段 0 的结果以资料和待决清单为准，后续实现不得凭记忆猜测数值。

## 阶段 1：完整商店卡牌数据目录

1. 在 `aeons-end-engine/src/data/wave1/gems.ts`、`relics.ts`、`spells.ts` 中补齐剩余牌，并保留现有 9 张的稳定 ID、费用、初始/商店分类和效果。
2. `MARKET_GEM_CARDS`、`MARKET_RELIC_CARDS`、`MARKET_SPELL_CARDS` 表示完整候选目录；初始牌仍只放在对应的 `INITIAL_*_CARDS` 中。`data.ts` 的统一 `MARKET_CARDS` 继续作为查找入口，但不再等同于本局实际使用的 9 个商店槽位。
3. 默认供应数量继续遵循当前 Wave 1 规则（Gem 7 张，Relic/Spell 5 张），不要在每个卡牌效果中复制数量逻辑；若资料阶段发现例外，再为卡牌元数据增加明确字段。
4. 图片生成脚本必须能从新数据目录发现并映射全部已注册卡牌；缺图、重复 ID、重复图片映射在生成阶段直接报错。

## 阶段 2：效果实现与通用效果审计

1. 先按资料审计表实现卡牌，优先组合现有通用 `CardEffect`、`PendingDecision`、牌区选择和目标选择流程，不为单张卡牌增加 ID 分支。
2. 对现有类型无法准确表达的语义，先增加一个有清晰名称、序列化形状和引擎解释分支的通用效果；同时补充对应的成功、取消、无目标、资源不足和边界测试。
3. 需要玩家选择的目标遵循现有交互约定：市场牌堆、手牌和裂隙上预备法术优先使用场面高亮；抽牌堆/弃牌堆选择继续使用牌堆弹窗；单一可能目标自动确认或切换到对应玩家。
4. 效果执行必须支持暂停后恢复、Ctrl+Z、自动存档和 Resume。特别检查同一效果包含多个选择、重复触发、销毁当前打出卡牌、牌堆为空和同名卡牌实例的情况。

## 阶段 3：商店配置领域模型与引擎解析

### 3.1 配置模型

在 `aeons-end-engine/src/types.ts` 和一个独立的商店配置模块（建议 `aeons-end-engine/src/market-setup.ts`）中定义可序列化模型：

- `MarketSetupConfig`：`manual` 或 `template1`。
- `manual` 保存 9 个槽位的卡牌 ID，顺序固定为 Gem 1–3、Relic 1–2、Spell 1–4。
- `template1` 表示半随机模板 1；随机后的具体 9 张牌写入本局 `market.piles`，不会在 Resume 时重新随机。
- 槽位规格是共享常量，包含牌类型和费用区间，避免 Setup UI 和引擎各自维护一份规则。

### 3.2 手动方案

对 9 个槽位逐一选择卡牌，并在引擎入口校验：

- 槽位类型必须匹配 Gem/Relic/Spell；
- 必须正好 9 个非空 ID；
- 不允许同一供应牌重复占用多个槽位；
- ID 必须来自完整商店候选目录，不能选择初始牌或 Nemesis 牌；
- 不合法配置返回明确错误，不静默替换或随机补牌。

### 3.3 半随机模板 1

每个槽位从对应类型和费用桶中随机选一张，且全局不重复：

| 类型 | 槽位 | 费用条件 |
| --- | --- | --- |
| Gem | 1 | `cost <= 3` |
| Gem | 2 | `cost === 4` |
| Gem | 3 | `cost >= 5` |
| Relic | 1 | `cost <= 3` |
| Relic | 2 | `cost >= 4` |
| Spell | 1 | `cost === 3` |
| Spell | 2 | `cost === 4` |
| Spell | 3 | `cost === 5` |
| Spell | 4 | `cost >= 6` |

随机函数接收可注入的 `RandomSource`，测试使用固定随机源验证结果。候选桶为空时必须报告配置错误；不得跨类型、跨费用桶或重复使用牌来“凑满” 9 个槽位。

### 3.4 创建游戏、存档和现有机制

1. `createTwoPlayerScenario()` 接受 `marketSetup`；Setup 当前只提供 Template One，下方九宫格允许玩家逐槽位替换为同类型卡牌。
2. `createGame()` 先解析并验证配置，再仅用解析出的 9 个 ID 建立 `market.piles`。完整候选目录仍可供 Setup 和规则查询，但不应自动全部放入市场。
3. `GameState.scenario` 保存选择的配置，`market.piles` 保存已经解析的实际牌组；Resume、Undo、Prince of Gluttons 的 Devour 和空供应判断都只依赖当前实际牌堆。
4. 现有买牌、弃牌、Devour、最低/最高费用筛选和图片映射逻辑要改为读取实际 9 个市场槽位，不能假设 `Object.keys(MARKET_CARDS)` 就是本局商店。

## 阶段 4：Setup 页面交互

1. 在 `aeons-end-ui/src/components/SetupScreen.vue` 增加 Market Setup 区域，提供：
   - 提供 `Template One` 下拉选项：九个槽位即时显示随机卡图，并提供紧邻下拉框的 Refresh 重新随机；点击槽位在纯图片选择器中替换一张牌。引擎仍保留 `manual` 配置形状供旧存档和测试使用，但 Setup 不暴露 Manual 选项。
2. 手动选择器显示英文卡名、类型和费用，重复选择、类型不匹配和未填满时在 Start Game 前给出英文错误提示；不把中文写入 UI。
3. Setup 初始即生成 Template 1 的九张预览牌，避免玩家面对空槽位；玩家可通过 Refresh 或逐槽替换调整牌组。
4. 开始游戏前由 `useGame` 将 Setup 状态转换成引擎的 `MarketSetupConfig`；随机、验证和最终牌组顺序不在 Vue 组件内自行推导。Setup 的九个槽位显示对应卡图，点击槽位可在图片选择器中替换；模板模式提供 Refresh。
5. 在开始后的市场区域显示实际生成的 9 个槽位。必要时在游戏日志中记录配置模式和牌组结果，便于测试和复盘；保存/Resume 后显示必须一致。
6. 保持现有 Nemesis 难度、Mage 唯一性、删除存档、退出确认和布局响应式行为不变。

## 阶段 5：测试与验收

### 引擎测试

- 目录完整性：27 个商店候选牌全部注册，ID/图片/类型/费用无重复或遗漏；Crystal、Spark 等初始牌不会混入商店候选。
- 每张新增卡牌至少覆盖一个主效果；有选择、条件、牌区移动或多目标的牌覆盖成功、取消/跳过、无目标和边界分支。
- 手动配置：9 槽位数量、类型、重复 ID、非法 ID、初始牌 ID 和空槽位校验。
- 模板 1：每个费用桶的边界、固定随机源、无重复、候选不足错误，以及多次生成不会改变同一已创建游戏的市场。
- 游戏初始化和存档：实际市场永远为 9 堆；序列化/恢复后牌组、剩余数量和配置一致。
- 现有 Rageborne、Prince of Gluttons、买牌、Devour、空供应和 Unleash 回归测试全部保持通过。

### UI / Playwright 测试

- Setup 只显示 Template 1；九个槽位以图片九宫格展示，替换弹窗、重复牌限制和 Refresh 行为正常。
- Template 1 的解析结果能启动并显示指定 9 堆；引擎仍覆盖 Manual 配置的重复、未完成和类型错误校验。
- Template 1 启动后每个类型/费用桶满足约束，且显示的结果可由存档恢复。
- 扩展后的卡牌图像全部能加载，市场布局在现有窗口宽度下不溢出。
- 现有 Mage/Nemesis、快捷键、牌堆弹窗、目标高亮和布局测试不回归。
- Setup 中的 Mage mat、Nemesis mat 会随下拉选择同步预览；Debug Tools 可将全部新增商店牌加入玩家手牌以进行快速玩家视角冒烟测试，Searing Ruby 的 spell-only Aether 在控制栏单独显示。

## 阶段 6：文档、资源和交付检查

1. 运行 `cd aeons-end-ui; npm run generate:images`，确认所有新卡牌图片都有生成映射。
2. 更新 `dev-guide.md`、`handoff.md`：记录完整商店候选目录、模板 1、`MarketSetupConfig`、默认值和资料文档位置。
3. 执行标准验证：

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build
npm run test:e2e -- --workers=1
```

4. 人工复核至少一局 Template 1（含 Refresh 和逐槽替换）：确认费用、卡面、效果、买牌、Devour、空堆行为与资料文档一致。

## 实施顺序与风险控制

推荐顺序为：阶段 0 资料冻结 → 阶段 1 目录补齐 → 阶段 2 按效果类别实现 → 阶段 3 商店配置引擎 → 阶段 4 Setup UI → 阶段 5 测试 → 阶段 6 文档交付。

主要风险是 Wiki 页面字段或卡面文字存在命名差异、某些卡牌需要尚未存在的效果类型，以及“手动一对一”对重复牌和默认牌组的解释差异。阶段 0 必须把这些项目记录为明确决策；实现阶段只扩展已确认的通用规则，不以单张卡牌 ID 方式绕过模型。
