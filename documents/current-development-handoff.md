# Aeon's End Digital 当前开发交接文档

更新时间：2026-09-25

这份文档用于把当前项目状态交给下一位开发模型。它记录当前代码基线、近期的重要实现、
验证方式和后续开发时不能忽略的约束。它不是规则设计文档；规则和 UI 规范仍以项目中的
正式文档为准。

## 1. 项目位置与阅读顺序

项目根目录：

```text
D:\coding\opencode_project\aeons-end-project
```

新模型开始工作前，按下面的顺序阅读：

1. [`AGENTS.md`](../AGENTS.md)：全局编码约束、UI 字符串语言、2px 边界线、圆角和引擎/UI 边界。
2. [`README.md`](../README.md)：当前产品范围、常用命令和项目结构。
3. [`dev-guide.md`](../dev-guide.md)：规则引擎、数据文件、UI 组件和测试入口。
4. [`ui/ui-guide.md`](../ui/ui-guide.md)：UI 组件目录、状态组合、尺寸、层级、响应式和 Gallery 规范。
5. [`design/wave9-plan.md`](../design/wave9-plan.md)：Wave 9 当前范围和后续计划。
6. 实现具体卡牌或 Mage 时，再阅读 `documents/wave9/` 下对应的资料以及相关引擎测试。

如果需要查看可复用组件的实际外观，启动 UI 后打开：

```text
http://127.0.0.1:5173/?ui-gallery=1
```

## 2. 当前项目状态

- 前端：Vue 3 + Vite，位于 `aeons-end-ui/`。
- 规则引擎：纯 TypeScript，位于 `aeons-end-engine/`；引擎原地修改一个 `GameState`。
- UI 通过 `@engine` alias 直接消费引擎源码，不复制规则到 Vue 组件。
- 当前产品范围是两名 Mage 对抗一名 Nemesis 的本地单机 Demo。
- Wave 1 的基础内容已经接入。
- Wave 9 已接入 Nook、Indira、Dezmodia、Remnant、Stake、Wolf，以及 Swap、Conjure、specific deck、Treasure、Rift/Prototype Breach、Breach-only Aether、Knowledge、Breach Upgrade 和 Doom 等机制。
- Wave 9 的完整计划范围仍未全部完成；`design/wave9-plan.md` 是后续 Supply、Trinket、Friends/Foes、Banner、Nemesis 等内容的范围入口。实现新内容前先核对计划、资料文档和当前注册表，不要把已接入的六名 Mage 误当成整盒内容已经完成。
- Remnant 的 Violet Shard 通过独立的 `breach` 条件 Aether 实现，只能用于 focus/open；III、IV Rift Breach 使用各自的闭合/开启图片，开启后施法让盟友抽一张牌且不增加伤害；Rebuild Matter 只提高 III、IV breach 的本回合预备上限。
- Remnant III Rift 初始朝南，IV Rift 初始朝西、第一次 Focus 后朝北、第二次 Focus 后开启。Breach 图片显示统一经过 `BreachArtwork.vue`，角度以引擎 `focusDirection` 和素材基准朝向计算；旧存档与撤销快照会规范化这两个 Rift 的进度。
- Stake 仅保留 IV 号 Prototype Breach，前三个槽位不显示但保留布局空间；Knowledge 是可持久保存的玩家资源。Stake 的正面 Breach Upgrade 专属牌堆可点击查看，安装牌会移入 Prototype Breach 并提供容量、伤害或施法触发效果；Prototype 施法给 Stake Knowledge，且不能被摧毁。
- Wolf 的 I 号 Breach 隐藏，Aegis of Hope 消耗 6 charge；Doom 以玩家状态保存并在控制栏显示 5 枚 token。达到 5 Doom 时对所有敌方单位造成 10 点伤害，再由 Wolf 承受 10 点伤害并失去所有 Doom。Aegis of Hope 先令一名盟友抽 1 张牌，再按失去的 Doom 数重复抽牌。
- 存档保存在浏览器 `localStorage`，支持 Resume 和最多 10 步 Ctrl+Z。
- `Ctrl+D` 打开 Debug Tools。
- 当前工作树包含大量此前阶段的未提交修改。不要使用 `git reset --hard`、`git checkout --` 或大范围清理，除非用户明确要求。

## 3. 最近的 UI 与交互进度

- Setup 每次进入时随机选择 Mage；玩家点击 Wave 类型按钮时，选择会随机切换到该 Wave 的 Mage。
- 玩家 Control Bar 使用玩家 Turn Order token、Aether token 等图像，并显示 Knowledge（适用时）；其他 Mage 抽牌时会在对应玩家按钮附近给出短暂提示。中间操作区保持相对屏幕居中，HP 数值与 token 尺寸通过 CSS 自定义属性调整。
- Nemesis mat 右侧的 Info Bar 延伸到 Mage mat 右侧，分为 Nemesis 信息、Turn Order、Gravehold HP 三个无分隔线区域。Nemesis token 与血量同排；Turn Order 使用六张 token，Round 文本靠近并垂直对齐；血量标签不重复写 `HP`。
- Nemesis 下方使用两列牌堆与场上区域。Specific Discard / Nemesis Discard 位于第一列，Specific Deck / Nemesis Deck 位于第二列；四个槽位使用 `Card.Pile` 并可查看弹窗。未使用的区域写 `Not used`。Nemesis Play 使用两排高度，卡牌从下排开始并可横向滚动；悬停不浮起，区域不画边框，空区不显示 `empty` / `none`。
- `ModalBase` 遮罩默认支持点击外部关闭；仍在等待引擎决策的弹窗需显式设置 `blocking`，不可因点击外部中断流程。需要玩家确认的决策继续使用阻塞弹窗。
- `Space` 可触发已启用的决策 `Confirm`，并可确认 Nemesis 抽牌、结算红框标记的 Nemesis 主阶段卡牌或推进当前阶段；使用前检查焦点是否在文本输入控件内，避免影响输入。
- 所有 Breach 图片都通过 `BreachArtwork.vue` 展示，板面图与悬停预览共用图片与角度。`focusDirection` 是显示方向的唯一规则来源，素材基准方向登记在 `aeons-end-ui/src/breach-images.ts`；不要从 `focusCount` 单独推算图片旋转。Remnant IV 当前规则为西向起始、两次 Focus 后开启；旧存档中因先前错误规则而以一次 Focus 开启的状态会恢复为闭合并保留进度。
- Common Images 中 Aether 图片已采用带白边版本；Treasure 背图当前文件名为 `treasure 2 back.jpg`，旧的 `treasure 12back.jpg` 在工作树中标记删除，构建图片映射时不要恢复旧名。

最近 UI 约定的尺寸变量集中在 `ui/ui-guide.md`：Info Bar 的 `--info-*`，玩家按钮的 `--control-player-token-size`，Aether token 的 `--control-aether-token-size`，以及布局偏移 `--control-main-offset-x`。先修改这些变量，不要在组件内散落临时尺寸值。

## 4. 最近完成的 Played Zone 修复

### 用户问题

在只存在一个侧边区域时，Played Zone 中的卡牌数量较多会发生溢出：

- Swap + Played 时，卡牌向左溢出，最左侧卡牌被 Played 区域遮住一半。
- Develop + Played 时，右锚定轨道使用普通 LTR 滚动，滚轮后可能把整条卡牌轨道推到可视区域之外。
- 需要保留横向滚动，同时不能让边界处的首张可见卡牌出现半截。

### 当前布局契约

这些规则已经写入 `ui/ui-guide.md`，实现位于 `PlayerArea.vue`、`ZoneScroller.vue` 和 `style.css`：

| 状态 | 区域分配 | Played 卡牌行为 |
| --- | --- | --- |
| Swap + Played + Develop | 三列各占 1/3 | Played 位于中间列，短内容居中 |
| Swap + Played | Swap 左 1/3，Played 右 2/3 | 卡牌相对整行居中，轨道碰到 Played 左边界时钉在左侧并向右增加；只有超出 Played 整个可视宽度才显示普通 LTR 横向滚动条 |
| Develop + Played | Played 左 2/3，Develop 右 1/3 | 卡牌相对整行居中，轨道碰到 Played 右边界时钉在右侧并向左增加；超出整栏后使用 RTL 负 `scrollLeft` 滚动语义 |
| 只有 Played | Played 占整行 | 短内容相对整行居中 |

侧边区域缺失时，卡牌居中基准仍然是整行屏幕中心，而不是 Played 自己那一列的中心。

### 关键实现

- `aeons-end-ui/src/components/PlayerArea.vue`
  - 根据 `hasSwapZone`、`hasDevelopZone` 控制区域是否出现。
  - Played 的 `ZoneScroller` 在 Develop-only 状态传入 `overflow-anchor="end"`。
- `aeons-end-ui/src/components/ZoneScroller.vue`
  - 使用 `ResizeObserver` 和 `MutationObserver` 检测内容是否溢出。
  - Played 单侧布局另外计算屏幕中心到 Played 内边界的距离，在完整轨道碰到 Swap/Develop 一侧边界时提前加上 `is-boundary-constrained`；该状态与真正的 `is-overflowing` 分开，确保卡牌不被相邻区域遮住，同时仅在整个 Played 栏位放不下时出现滚动条。
  - 溢出时添加 `is-overflowing` 和 `--zone-overflow-distance`。
  - 普通滚动区域把滚轮垂直位移转换为横向滚动。
  - `overflowAnchor === 'end'` 时识别 RTL 的负 `scrollLeft` 范围，并在初始化、内容变化、窗口变化和滚轮操作后把首张可见卡牌对齐到视口边界。
  - 不要把 RTL 逻辑改回普通的 `0..maxScroll` 正值范围，否则轨道会再次跳出视口。
- `aeons-end-ui/src/style.css`
  - 单侧区域的 1:2 网格和绝对定位轨道位于 `.played-zones` 相关规则中。
  - Develop-only 滚动容器使用 `direction: rtl`，卡牌轨道本身恢复 `direction: ltr`，确保卡牌顺序不反转。
  - Played 滚动容器保留顶部空间，避免 hover 上浮和 2px 边界线被裁切。

## 5. 验证记录

### 2026-09-25：Remnant Rift 与当前工作树

以下验证在更新 Rift IV 为“西向起始、两次 Focus 开启”后通过：

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5174'
$env:PLAYWRIGHT_REUSE_SERVER='true'
npx playwright test tests/breach-rotation.spec.ts
```

引擎测试、Vue 类型检查和生产构建均通过；`breach-rotation.spec.ts` 的 3 项测试通过，使用 1920×1000 视口，覆盖特殊 Breach 显示、方向权威来源，以及错误旧存档恢复。构建前会运行 `generate:images`；当前生成文件没有额外的未提交差异。

这轮只完成自动化 Chromium 回归，没有在桌面 Chrome 中进行人工点击验收。Playwright 适合检查规则状态与布局断言，肉眼仍应复核真实浏览器中的图像方向和外观。

`git diff --check` 通过；Git 仅提示部分工作树文件在 LF/CRLF 间的行尾转换，不是空白差异错误。

### Played Zone 专项验证

该轮 Played Zone 布局修改时完成以下验证：

```powershell
cd D:\coding\opencode_project\aeons-end-project\aeons-end-ui
$env:PLAYWRIGHT_REUSE_SERVER='true'
npx playwright test tests/ui-visual-regression.spec.ts tests/ui-gallery.spec.ts --workers=1
```

结果：8 个测试全部通过，覆盖了：

- 912×600 窄窗口下 Swap-only 的大量 Played 卡牌。
- 912×600 窄窗口下 Develop-only 的大量 Played 卡牌。
- 首张可见卡牌边界、横向滚轮和溢出状态。
- 三个区域同时存在时的 1/3 等分布局。
- Gallery 的滚轮和卡牌圆角/2px 边界线。

生产构建也已通过：

```powershell
cd D:\coding\opencode_project\aeons-end-project\aeons-end-ui
npm run build
```

`npm run build` 会先执行 `generate:images`，不要手动编辑
`src/generated-image-imports.ts`。

## 6. 后续开发时的硬性约束

### 引擎与数据

- 卡牌效果优先组合已有类型化 `CardEffect`、触发器和 `PendingDecision`。
- 不要在通用 UI 或引擎分支里写单张卡牌 ID 的特殊判断；确实是新机制时，增加可复用的通用效果或组件。
- 规则结算由引擎负责，Vue 只显示状态、收集输入并调用引擎。
- 引擎测试至少覆盖成功、无目标、选择、重复触发和 JSON 恢复。

### UI

- 所有用户可见 UI 字符串必须是英文；中文只写在内部 Markdown 文档。
- 所有可见边界线、outline 和 outline 风格的阴影统一为 2px。
- 所有卡牌（包括弹窗、牌背、拖拽预览和空牌堆）必须使用统一圆角。
- 优先复用 `CardSurface`、`CardHoverPreview`、`ModalBase`、`PileModal`、`ZoneScroller` 和 Gallery 中已有状态。
- 不要通过调整单张卡牌的临时 `z-index` 或 1px 边框来修复布局；先检查共享 token、容器 overflow 和层级文档。
- 牌堆图片应使用 `Card.Pile` 风格；Deck、Discard、Specific Deck、Player Cards in Play 不要退回 mini card。
- 弹窗外层决策不可用 ESC 取消；仅查看类 PileViewer 可以用 ESC 关闭。

### Played / ZoneScroller 特别注意

- 修改 Played 布局前，必须同时验证：无侧区、仅 Swap、仅 Develop、两侧都存在四种状态。
- 至少用 912×600 和 1280×800 两个窗口尺寸验证。
- 不能只看轨道整体 `getBoundingClientRect()`；要检查首张可见卡牌是否被边界裁掉，以及 `scrollWidth`、`clientWidth` 和实际 `scrollLeft`。
- Develop-only 使用 RTL 负滚动范围是当前设计的一部分。滚轮事件必须保留 `preventDefault()` 和 `stopPropagation()`，不能让它与预览缩放或父级滚动冲突。
- 任何 CSS 改动都要确认不会影响 Gallery 的 `ZoneScroller`，也不会让 hover 预览或底部 Controls 被遮住。

## 7. 推荐的下一步工作流

1. 先查看 `git status` 和相关文件的现有 diff，保留用户已有修改。
2. 阅读本交接文档、`dev-guide.md` 和 `ui/ui-guide.md`，再定位需求涉及的组件。
3. 如果是规则问题，先检查 `types.ts`、`engine.ts` 和对应 Wave 数据；如果是显示问题，先检查共享组件和 CSS token。
4. 为新状态或新机制增加最小可复用组件/效果，并补充对应 Playwright 或引擎测试。
5. 运行针对性测试，再运行 `npm run build`；较大的 UI 变化应更新 Gallery 或 `ui/screenshots/`。
6. 最终交付时明确列出修改文件、测试命令和任何未解决的已知问题。

## 8. Mage Ability 决策 UI 与 Debug Tools 最新进度

### Mage Ability 的二选一决策

- `aeons-end-ui/src/components/MageAbilityChoice.vue` 是可复用的 Mage Ability 决策组件，已在 `CardDecisionModal.vue` 和 UI Gallery 中使用。
- 组件展示 Mage mat 和纵向排列的选项按钮；两个选项按钮使用相同宽度。按钮是交互控件，不要把对应 CSS 变量命名为 textbox/text field。
- 目前相关 CSS 变量为 `--mage-ability-mat-width`、`--mage-ability-choice-font-size`、`--mage-ability-choice-button-min-height`。
- Stake 的 Ability 选项应按规则只允许在 Stake 自己的 Main Phase 激活。若继续扩展 Wave 9 Mage Ability，检查能力的激活时机是否限制在“your main phase”，避免误放宽成任意玩家的 Main Phase。
- Stake Upgrade 选择界面应以大尺寸卡牌展示；费用不足的卡牌禁用并灰显。已经放置在 Breach 上的 Upgrade 卡不应有悬停上浮效果。
- 曾修复过施法后 Destroy 决策误把来源 Relic 销毁的问题：Destroy 必须应用于玩家选择的那张 Spell。改动引擎决策或来源卡追踪时，确认目标卡和触发效果来源不会混淆。
- 隐藏或被摧毁的 Breach 槽位应保留原来的槽位位置，不要让其他 Breach 重新排列。

### Debug Tools

- Debug 面板支持直接设定 Nemesis HP、Gravehold HP、玩家 HP、Aether、Charge 和 Knowledge。
- 玩家 Aether 输入表示普通、尚未花费的 Aether；条件 Aether 和 Aether tokens 单独处理，不要改成单纯把所有 Aether 数值相加。
- Add Card 只允许 Gem、Relic、Spell。未来增加其他卡牌类型时，不应自动放入该选择器。
- 玩家选择默认跟随当前回合角色；Add Card 按钮与选择框保持同高。
- 面板高度留出上下边距，Nemesis HP 和 Gravehold HP 同排显示；文本输入框和下拉框不显示浏览器白色焦点环。
- 数字输入框宽度为 58px；`DebugNumberInput.vue` 提供统一的步进箭头，颜色取自 UI 主题，鼠标悬停或键盘聚焦时显示，在触屏设备保持可见。原生 Chromium 箭头已隐藏；点击箭头仍通过输入框事件更新现有数值逻辑。
- `aeons-end-ui/src/components/DebugPanel.vue` 包含 Knowledge 的直接编辑入口。维护它时保留现有 Aether/Knowledge 更新逻辑和 Add Card 的类型白名单。

数字输入框优化由 `tests/debug-number-input.spec.ts` 验证悬停、聚焦和步进更新。

## 9. 当前分支与工作树交接

- 当前分支是 `main`。
- 当前工作树有多个阶段累积的未提交修改，涉及 Wave 9、引擎、UI、图片资源、自动化测试和文档；当前没有已暂存的修改。
- 当前跟踪文件中有多项修改和删除；另有未跟踪的 BreachArtwork 与回归测试、Modal backdrop 测试、保存 JSON 和多张新增图片。`image-database/common images/treasure 12back.jpg` 删除及 `treasure 2 back.jpg` 新增是用户要求的更名配套；保留 `image-database/TS_Save_135.json` 和其他新增素材。
- 不要把整个工作树直接提交或清理。继续工作前先对照 `git status --short`、`git diff` 和需要修改的目标文件；不要使用 `git reset --hard`、`git checkout --` 或大范围清理。用户没有要求提交当前工作。
- `git status --short` 是当前工作树事实来源；文件数量和差异会随任务变化，不沿用旧快照的统计数。

## 10. Deck Reveal 补牌与统一拖动排序（2026-10-01）

- 所有从玩家抽牌堆揭示顶端 N 张牌的效果，在读取牌顶之前先走引擎的 `preparePlayerDeckForReveal()` / `ensureDeckForReveal()`。牌堆不足时，玩家弃牌堆不洗牌、按现有抽牌顺序翻回并接到牌堆后方，随后清空弃牌堆；若牌堆与弃牌堆合计仍少于 N，就展示全部现有牌。Turn Order 弃牌堆则按其规则洗入牌堆，清空弃牌堆，并在回收时推进 round。`DeckRecyclePolicy` 和通用实现位于 `aeons-end-engine/src/types.ts`、`engine.ts`；Thought Totem 多牌揭示与 Sifter's Pearl 单牌揭示有回归覆盖。
- 玩家牌库抽顶、Conjure、玩家顶牌揭示效果和 Thought Totem 都应复用这套补牌路径。未来新增“reveal top N”不要直接读取 `deck[0]` 或另写单卡补牌逻辑；开发规则已写入 `dev-guide.md`。
- 所有可排序界面统一使用 `aeons-end-ui/src/game/usePointerReorder.ts` 与 `.pointer-sort-*` CSS。实现使用 Pointer Events、pointer capture、稳定布局中线判定和 TransitionGroup 平滑位移；禁用 HTML 原生 `draggable`/drag image。当前已用于 `CardSelectionPanel.vue`、`TurnOrderTokenRow.vue` 和 `DebugDeckOrderModal.vue`。交互规则及 Gallery 示例已更新至 `ui/ui-guide.md` 和 `UiGallery.vue`。
- 本轮验证通过：`aeons-end-engine/npm test`、`aeons-end-ui/npx vue-tsc --noEmit`、`aeons-end-ui/npm run build`，以及 `tests/ui-gallery.spec.ts`、`tests/debug-number-input.spec.ts`（5 项 Chromium 测试）。

## 11. Effect source / 卡牌持有者规则（2026-10-01）

- 新增和审查卡牌效果时，先读根目录 [`dev-guide.md`](../dev-guide.md) 的“效果来源、卡牌持有者与目标”表格；不要把行动者、所选目标和卡牌持有者混为一个玩家 ID。
- 本轮引擎审查修正了嵌套 `On Play` / `On Gain` 触发的来源卡上下文、Recall 行动者与来源卡持有者分离、Qu Form 的事件条件视角，以及 Tressa/其他 Mage 专属牌堆按来源卡持有者访问。跨玩家回归测试新增在 `aeons-end-engine/src/tests/wave9-relics.test.ts`；引擎全套 `npm test` 通过。
