# Wave 9 — Beyond the Breach 开发计划

更新时间：2026-09-19

## 目标与工作方式

本计划覆盖 Aeon's End: Beyond the Breach（Wave 9）的本轮可玩内容。项目仍保持为本地单机、
固定双 Mage 对抗单 Nemesis 的 Web Demo；不在本轮提前扩展多人联机、账号、服务器或
1/3/4 人场景。

阶段 0 是后续实现的资料基础，完成后再按实际机制复杂度、测试反馈和开发决策推进后续内容。
因此，阶段 1 以后是可交叉、可拆分的路线图，不代表必须严格按编号顺序开发。

规则仍遵守项目既有边界：引擎决定规则与状态变化，Vue 只显示状态、收集输入并调用引擎；
优先组合现有 `CardEffect`、`PendingDecision` 和通用 Nemesis `unleash`，不按具体卡牌 ID
在 UI 中硬编码规则。

## 本轮范围

- Breach Mages：Indira、Nook、Stake、Wolf、Dezmodia、Remnant。
- Supply Cards：5 Gems、5 Relics、11 Spells，以及 Trinket deck。
- Friends and Foes：Dai, the Youth、Lash, the Dreamer、Qu, the Rift Walker；
  Creeping Dark、The Anomaly、The Hunger；以及 Banner cards。
- Nemeses：The Terror in Brass、Twice-Dead Prophet、Oracle of Filth、Wayward Reflection、
  Crooked Mask（Beyond the Breach 版本）。
- Basic Nemesis Cards：本盒 Tier 1、Tier 2、Tier 3 卡牌。

## 暂不在本轮范围

- Treasure cards。
- Upgraded Basic Nemesis Cards。
- Expedition、Battle 5 randomizers、战役叙事和其他未列出的盒内内容。
- The Surface、The Returned 等 Beyond the Breach mini expansions。

## 阶段 0：资料收集与冻结

目的：为本轮范围内的每张卡、每张 Mage/Nemesis mat 和每项机制建立可追溯的规则资料，
在写运行时代码前消除“卡牌清单、规则文本、图片或勘误缺失”的不确定性。

资料来源以 Beyond the Breach Wiki 页面、其链接的详情页、规则页、Rulings/Errata 页面为准；
资料文件中记录抓取日期与页面链接。对于有歧义或已知勘误的内容，保留原文、澄清来源和拟采用
的实现解释，最终仍以实体卡面和正式规则书复核。

每个资料条目至少记录：

- canonical title、稳定 ID、类别/所属卡组、费用或生命值、Tier（如适用）；
- 完整 Effect，以及 Setup、Rule、Details、Clarifications、Errata 等会改变实现的文本；
- 相关 Mage Ability、Nemesis Unleash、专属区域/专属牌堆和卡牌间依赖；
- 图片文件名、原始图片 URL、计划中的本地路径和缺失状态；
- 来源 Wiki URL、抓取时间及待人工复核项。

按以下资料包交付并检查数量与分类完整性：

1. 六名 Mage 的 mat、起始牌、Breach 配置、Ability、额外规则与图片。
2. 21 组 Supply Cards（Gem / Relic / Spell）及 Trinket deck 的完整清单、规则和图片。
3. 三名 Friend、三名 Foe、全部 Banner cards 的 setup、触发时机、卡牌内容和图片。
4. 五名 Nemesis 的 mat、专属牌、Unleash、难度规则、所需 token/区域和图片。
5. Basic Nemesis Cards 的 Tier 1/2/3 清单、规则和图片。
6. Friends and Foes、Banner、Trinket 等机制规则，以及与本轮卡牌直接相关的全局澄清。

抓取与图片下载优先复用 `image-database/download_wiki_images.py`、
`collect_supply_wiki_rules.py` 和 `collect_nemesis_wiki_rules.py` 的 MediaWiki API、
User-Agent、代理与 `--no-proxy` 配置；为 Wave 9 扩展时不改写 Wave 1 已冻结资料。

阶段完成标准：所有本轮条目都有可定位的资料和图片状态；所有已知勘误被标记；缺图、规则歧义、
尚未实现的机制被列为显式待办，而不是在编码过程中临时猜测。

## 阶段 1：规则盘点与实现切片

- 将阶段 0 的规则按“现有引擎可直接表达”“需要可复用引擎扩展”“需要专属 Nemesis/Mage hook”分类。
- 优先识别高风险的新机制，尤其是 Trinket、Friends and Foes、Banner 以及新的 Nemesis 专属流程。
- 为每种新增通用能力先确定最小数据结构、状态保存/恢复、Pending Decision 和测试边界；不为单张卡创建专用 UI。
- 根据资料完整度和你的开发优先级选择下一批可实现内容。

## 阶段 2：共享基础与数据接入

- 按需要在引擎中增加经过抽象的通用效果、状态或决策能力，并为它们写独立回归测试。
- 建立 Wave 9 数据目录、注册表、Setup 可选项和图片映射流程；保持 Wave 1 存档与既有测试稳定。
- 每次接入一小组内容时同步资料、图片、本地映射和运行时数据，避免“资料、图片、规则定义”脱节。

## 阶段 3：玩家侧内容

- 以可单独验证的小批次接入 Mage、Supply Cards 和 Trinkets。
- 覆盖起始配置、购买/获得、打出、准备/施放、持续效果、目标选择、无合法目标和撤销/存档恢复。
- 在需要时调整 Setup、市场替换与玩家区域展示，但不把卡牌规则放入组件。

## 阶段 4：Friends and Foes 与 Banner

- 实现模块的 setup、回合/触发流程、Friend/Foe mat 或区域、Banner 选择和卡牌效果。
- 先验证它们与固定双 Mage、当前 turn order、Nemesis 回合及存档/撤销的交互，再逐步扩充到所有 Wave 9 条目。

## 阶段 5：Nemeses 与 Basic Nemesis Cards

- 为每个 Nemesis 建立数据定义、专属规则模块、难度设置、专属区域与所需 token 展示。
- 复用通用 Attack / Power / Minion / Unleash 流程；只有机制语义确实独特时才增加专属 hook。
- 接入本盒 Basic Nemesis Cards，并分别验证 Tier 构建、抽取、结算、目标/选择中断和失败条件。

## 阶段 6：集成验收与试玩迭代

- 持续运行引擎测试、`npx vue-tsc --noEmit`、`npm run build` 及相关 Playwright 测试。
- 对每个新机制验证 Ctrl+Z、localStorage Resume、刷新恢复、自动结束回合、无合法操作和 Debug Tools。
- 人工检查真实浏览器中的卡图、悬停预览、拖拽、弹窗层级、窄屏布局和英文 UI 文案。
- 以可回归的测试和清晰提交为单位整理批次；试玩反馈进入下一批次，而不是阻塞已验证内容。

## 开始实现前的检查清单

- 确认 Wave 1 基线已提交，当前开发分支为 `main`，且不修改 `friend-preview`。
- 检查 `git status`，保留并确认与 Wave 9 无关的用户改动。
- 阶段 0 资料冻结后，再决定第一批实现的机制和卡牌，而不是一次性接入整盒内容。

## 末尾保留的后续优化

以下两项优化不一定与当前 Wave 9 卡牌按同一批次完成，但必须在后续开发中保留，不能遗忘：

1. **将 Swap 完善为通用的类型化游戏机制**
   - 保留并扩展 `CardEffect` 中的 Swap 相关效果，由引擎统一处理规则、状态变化、选择和撤销；
     不为 Nook 或某一张 Supply Card 在 UI 中硬编码 Swap 行为。
   - 将卡牌筛选从依赖英文名称的 `nameIncludes` 逐步改为类型化的 `CardFilter`、Card Tag 或等价数据结构，
     以便未来 Supply Cards、Mage cards 和其他内容复用相同机制。
   - 为 Develop 以及其他类似专属区域预留同样的通用区域移动、取回和交换效果；新增规则先扩展类型化
     效果，再编写卡牌数据和 UI。

2. **根据本局实际机制动态显示 Played / Swap / Develop 区域**
   - 游戏开始时根据当前 Mage、Mage 专属卡、实际加入市场的 Supply Cards 及其类型化效果，计算本局启用的
     区域能力；区分“区域能力已启用”和“当前区域暂时为空”。
   - 仅有 Played 时，Played Area 占用可用宽度并在整个屏幕范围内居中；只有 Swap 或只有 Develop 时，
     侧边区域可以显示，但 Played 卡牌仍必须以整个屏幕为基准居中，不能在剩余的右侧或左侧列中居中；
     三者同时启用时再使用三列布局。
   - 通过布局模式或等价的可测试配置实现上述组合，不能简单依赖隐藏三列中的某一列；同时保留三个区域
     的迷你卡牌、溢出横向滚动和鼠标滚轮左右滚动行为。
   - 为“无辅助区域、仅 Swap、仅 Develop、Swap + Develop”分别增加引擎配置/组件渲染和浏览器布局回归测试，
     并覆盖存档恢复及旧存档兼容。
