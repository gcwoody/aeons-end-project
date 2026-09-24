# Aeon's End Digital 当前开发交接文档

更新时间：2026-09-24

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
- Remnant 的 Violet Shard 通过独立的 `breach` 条件 Aether 实现，只能用于 focus/open；III、IV Rift Breach 使用各自的闭合/开启图片，开启后施法让盟友抽一张牌且不增加伤害；Rebuild Matter 只提高 III、IV breach 的本回合预备上限。
- Stake 仅保留 IV 号 Prototype Breach，前三个槽位不显示但保留布局空间；Knowledge 是可持久保存的玩家资源。Stake 的正面 Breach Upgrade 专属牌堆可点击查看，安装牌会移入 Prototype Breach 并提供容量、伤害或施法触发效果；Prototype 施法给 Stake Knowledge，且不能被摧毁。
- Wolf 的 I 号 Breach 隐藏，Aegis of Hope 消耗 6 charge；Doom 以玩家状态保存并在控制栏显示 5 枚 token。达到 5 Doom 时对所有敌方单位造成 10 点伤害，再由 Wolf 承受 10 点伤害并失去所有 Doom。Aegis of Hope 先令一名盟友抽 1 张牌，再按失去的 Doom 数重复抽牌。
- 存档保存在浏览器 `localStorage`，支持 Resume 和最多 10 步 Ctrl+Z。
- `Ctrl+D` 打开 Debug Tools，`Space` 可推进 Nemesis 主阶段的红框结算。
- 当前工作树包含大量此前阶段的未提交修改。不要使用 `git reset --hard`、`git checkout --` 或大范围清理，除非用户明确要求。

## 3. 最近完成的 Played Zone 修复

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

## 4. 最近验证结果

本次修改后已经完成以下验证：

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

## 5. 后续开发时的硬性约束

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

## 6. 推荐的下一步工作流

1. 先查看 `git status` 和相关文件的现有 diff，保留用户已有修改。
2. 阅读本交接文档、`dev-guide.md` 和 `ui/ui-guide.md`，再定位需求涉及的组件。
3. 如果是规则问题，先检查 `types.ts`、`engine.ts` 和对应 Wave 数据；如果是显示问题，先检查共享组件和 CSS token。
4. 为新状态或新机制增加最小可复用组件/效果，并补充对应 Playwright 或引擎测试。
5. 运行针对性测试，再运行 `npm run build`；较大的 UI 变化应更新 Gallery 或 `ui/screenshots/`。
6. 最终交付时明确列出修改文件、测试命令和任何未解决的已知问题。

## 7. Mage Ability 决策 UI 与 Debug Tools 最新进度

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
- 数字输入框宽度为 74px；`DebugNumberInput.vue` 提供统一的步进箭头，颜色取自 UI 主题，鼠标悬停或键盘聚焦时显示，在触屏设备保持可见。原生 Chromium 箭头已隐藏；点击箭头仍通过输入框事件更新现有数值逻辑。
- `aeons-end-ui/src/components/DebugPanel.vue` 包含 Knowledge 的直接编辑入口。维护它时保留现有 Aether/Knowledge 更新逻辑和 Add Card 的类型白名单。

本次数字输入框优化以 `tests/debug-number-input.spec.ts` 验证悬停、聚焦和步进更新。

## 8. 当前分支与工作树交接

- 当前分支是 `main`。
- 当前工作树有大量未提交修改，来自多个已进行的 Wave 9 Mage、引擎、UI、Debug Tools 和文档任务；没有已暂存的修改。
- 还有未跟踪的 Remnant、Stake、Wolf 引擎数据模块、Mage Ability 决策组件和 Wolf Doom token 图片；Remnant 目录下的 `Megaflux Slice.jpg` 当前显示为删除。
- 不要把整个工作树直接提交或清理。继续工作前先对照 `git status --short` 和 `git diff` 确认目标范围；用户没有要求提交本次修改。
- 最新工作树快照中 `git diff --stat` 显示 24 个已跟踪文件有差异，另有未跟踪文件；这是多个阶段累积的总差异，不等同于最近 Debug Panel 这项改动的范围。
