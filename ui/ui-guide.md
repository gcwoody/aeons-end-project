# UI 开发指南

本文是项目 UI 的唯一维护入口。组件目录、状态组合、尺寸与响应式规则、
层级、交互约定和验收方式都集中在这里。实现新的卡牌、Mage 或页面 UI
之前，先查找是否已有可复用组件和状态。

UI Gallery 地址：`http://127.0.0.1:5173/?ui-gallery=1`

## 1. 基本边界

- 游戏规则、效果结算、目标选择和中断恢复由 `aeons-end-engine` 决定。
- Vue 组件只负责显示状态、收集输入和调用引擎，不复制卡牌规则。
- 新需求优先组合已有组件和状态；只有现有模型无法表达时，才增加通用组件
  或通用状态，不为单张卡牌复制一套 UI。
- 所有用户可见 UI 文本使用英文；中文只用于内部文档。

## 2. 组件目录

### 卡牌和预览

| 名称 | 用途 | 常见状态 |
| --- | --- | --- |
| `Card.Hand` | 手牌中的大卡牌 | `face-up`、`draggable`、`selected`、`pending`、`disabled` |
| `Card.Mini` | Played、Swap、Develop 和部分 Breach 卡牌 | `face-up`、`actionable`、`selected`、`overflow` |
| `Card.Pile` | Deck、Discard、Specific Deck、Player Cards in Play | `face-up`、`face-down`、`empty`、`counted`、`clickable` |
| `Card.FaceDown` | 牌背显示和面朝下准备的法术 | `fixed-back`、`known-back`、`draggable`、`locked` |
| `Card.AttachedQuarter` | 覆盖在 Supply pile 右下角的卡牌 | `attached`、`empty-target`、`actionable` |
| `Card.Reveal` | 弹窗中需要读清楚文字的已揭示卡牌 | `face-up`、`selected`、`placement-choice` |
| `CardHoverPreview` | 鼠标悬停大图预览 | `delayed`、`visible`、`zoomed`、`disabled` |
| `DragCardPreview` | 手牌或 Breach 卡牌拖拽预览 | `face-up`、`face-down`、`drop-valid`、`drop-invalid` |
| `Card.DebugPicker` | Debug Tools 中搜索和选择卡牌 | `grouped`、`filtered`、`selected`、`preview` |
| `Breach.Artwork` | Breach token 与悬停预览 | 图片和预览共用同一 artwork/rotation；闭合方向以引擎 `focusDirection` 为准，旋转基于素材登记的初始方向；`opened` 时显示开启图且不旋转 |

主要实现位置：`CardSurface.vue`、`CardHoverPreview.vue`、`BreachArtwork.vue`、
`PlayerArea.vue`、`DebugCardPicker.vue`。

所有 Breach 图片都必须通过 `aeons-end-ui/src/components/BreachArtwork.vue` 显示，使板面 token 和悬停预览共享同一张图及旋转角度。角度由当前 `focusDirection` 和 `aeons-end-ui/src/breach-images.ts` 登记的素材基准方向计算；`focusCount` 只表示规则进度，不可单独用来推算图片朝向。新增特殊 Breach 美术时，必须同时登记闭合/开启素材和闭合素材的基准方向，并覆盖初始朝向、一次 Focus 后方向变化、自动开启这三种状态的引擎与 UI 回归。

### 牌堆和滚动区域

| 名称 | 用途 | 规则 |
| --- | --- | --- |
| `Pile.Deck` | 玩家 Deck | 非空时显示牌背和数量；为空时显示名称与 0 |
| `Pile.Discard` | 玩家 Discard | 非空时显示顶牌正面和数量；为空时显示名称与 0 |
| `Pile.SpecificDeck` | Mage-specific deck | 可配置正面/牌背展示、数量和 PileViewer；正面牌堆在查看窗口中展示全部牌 |
| `Pile.TrinketDeck` | 全局 Trinket 牌堆 | 位于 Breach 行最右侧，与已准备法术垂直对齐、与 Market 第三列水平对齐；可点击查看。每张实体牌独立记录是否已揭示，未知牌显示牌背，已知牌显示正面；打开查看窗口不会揭示未知牌 |
| `Pile.PlayerCardsInPlay` | Put into play 的玩家卡牌 | 无牌时隐藏；单牌可直接触发，多牌打开选择弹窗 |
| `Pile.NemesisSpecific` | Nemesis 专属牌堆或弃牌堆 | 根据 Nemesis 配置显示数量或顶牌 |
| `PileViewer` | 查看牌堆内容 | 顶牌在左侧，每行最多 5 张 |
| `ZoneScroller` | Played、Swap、Develop 和 Gallery 的横向溢出 | 内容短时居中，溢出时滚轮横向滚动 |

Nemesis mat 右侧的 Info Bar 横跨剩余区域；左侧从 Fury token 开始，随后是 Nemesis 血条，中间为六个 Turn Order token 与垂直居中的轮数，右侧为 Gravehold 血条。三个布局区域之间不显示分隔线，血条标签不重复写 `HP`。未揭示的 Turn Order 槽位显示问号，不暴露抽牌顺序，当前回合 token 不加边框。下方依次是两列 `Card.Pile` 和场上卡牌区：第一列上方为 Specific Discard、下方为 Nemesis Discard；第二列上方为 Specific Deck、下方为 Nemesis Deck。牌堆按剩余高度保持卡牌比例缩放，未使用的专属槽位固定显示 `Not used`，四个槽位均可点击查看。有牌图片在悬停时不改变边框颜色；Rageborne 的 Strike Deck 用带白边的专属牌背，牌堆和弹窗保持一致。Nemesis Play 区域与左侧牌堆一样分为两行高度，顶部留空、卡牌从下排左侧起横向排列并在需要时滚动；卡牌悬停时不移动，区域用深蓝色底区分且不绘制边框。Nemesis Play、Played、Develop 和 Swap 区域为空时不显示占位文案。`.nemesis-area` 的 `--info-*-share` 和 `--info-*-hp-width` 调整三块区域份额和血条宽度；`--info-turn-token-size`、`--info-turn-token-gap`、`--info-turn-round-gap`、`--info-turn-round-font-size` 调整 Turn Order token 和轮数；`--info-nemesis-token-size` 调整 Fury 尺寸；`--info-hp-label-font-size` 与 `--info-hp-value-font-size` 调整血条文字。`.controls` 的 `--control-player-token-size`、`--control-aether-token-size` 和 `--control-main-offset-x` 分别调整玩家按钮 token、Aether Token 大小与中间操作区的屏幕居中偏移。

### 弹窗、标记和控制

| 名称 | 用途 |
| --- | --- |
| `ModalBase` | 所有标准弹窗的遮罩、焦点、拖动和 dialog 外壳 |
| `Modal.Decision` | 引擎产生的阻塞式决策；一般 `choose_one` 用按钮，`large-card-selection` 显示可选大图并要求显式 Confirm |
| `Decision.MageAbilityChoice` | Mage mat 下方竖向排列的 Ability 二选一按钮 |
| `Modal.CardSelection` | 从手牌、弃牌堆或候选卡牌中选择 |
| `Modal.PileViewer` | 查看牌堆，不做决策 |
| `Modal.SupplyPrompt` | 选择 Supply pile 的提示 |
| `Badge.PileCount` | Deck、Discard、Specific Deck、Trinket Deck 的数量和空牌堆文字 |
| `Badge.Token` | Power、Aether token 等状态标记 |
| `Controls.TurnBar` | Mage 切换按钮、阶段、资源和回合按钮 |

每次进入 Setup 时，两位玩家从全部已实现 Mage 中随机获得不同角色，并同步选中各自的 Wave 标签。点击某位玩家的 Wave 标签会立即从该 Wave 随机选择 Mage；重复点击当前 Wave 也会重新抽取，并避开该玩家当前角色和另一玩家的角色。Mage 的 Reroll 按钮继续从全部 Wave 抽取。

控制栏的常规 Aether 使用 `image-database/common images/Aether.png` 图标加白色数字；图标带白色圆边，所有计数数字使用与 Mage 按钮一致的 12px 粗体。Gem、Spell、Breach 条件 Aether 继续写明类型，文字同为白色。Stake 的 Knowledge 计数使用 `image-database/common images/Knowledge.png` 图标加 `#E4DBBC` 数字，仍仅对追踪 Knowledge 的 Mage 显示。Breach Upgrade 卡牌以手牌尺寸悬停显示，并横向放在 Prototype Breach 左侧。前三个 Breach 隐藏外观但保留位置，为升级卡留出空间。

Mage ability 的 OR 决策使用可复用的 `Decision.MageAbilityChoice`：弹窗上方展示能力来源 Mage 的正面 mat 并裁切为统一圆角；下方显示与 mat 同宽、上下排列的两个可点击按钮。按钮使用蓝底深色文字，悬停时平滑变暗。所有 `choose_one` Ability 决策都应声明 `layout: 'mage-ability'`；非 Ability 的卡牌选择沿用普通决策 UI。Mage mat 宽度、选项文字大小和按钮最小高度集中在 `.decision-modal.mage-ability-modal` 的 CSS 自定义属性中，方便统一微调。Specific Deck 中需要直接辨认的升级卡选择使用 large 卡牌尺寸。

`choose_one` 的 `large-card-selection` 用于需要辨认卡面的多张卡牌选择：卡图以 large 尺寸显示，玩家先点选一张，再点 Confirm；选择状态复用 2px 边界线。Setup 的 Market 卡牌替换弹窗按候选卡牌所属 Wave 提供 Wave tabs，默认切到当前槽位卡牌所属的 Wave。弹窗中的卡图悬停预览复用 `CardHoverPreview`，并高于该 Setup 弹窗显示。

Wolf 的 5 枚 Doom token 显示在控制栏 Activate Ability 按钮右侧；未获得的 token 使用灰度与低透明度，已获得的 token 保留原图颜色。尺寸、间距与相对位置集中在 `.doom-token-track` 的四个 CSS 自定义属性中，方便微调。

Mage 切换按钮常显该玩家的手牌数，HP 使用红色文字；当前显示玩家和当前回合玩家仍由按钮边界状态区分，控制栏不重复显示 Mage 名称。未显示玩家的手牌数增加时，该按钮的 Hand 数字变绿，并在其右下方向右伸出约 3 秒的 `+N` 标记，标记底边不超过按钮底边；点击按钮查看该玩家时清除标记，不自动切换玩家。撤销、载入存档或替换游戏状态时不重播旧标记。桌面控制栏的 Aether 和操作按钮相对于控制栏水平居中；紧凑宽度下按钮、阶段和操作区保持互不重叠。

弃牌排序阶段的 Played 区域只在当前回合 Mage 的视角显示待排序卡牌；切换到另一名 Mage 时仍显示该 Mage 自己的 Played 区域，不混入当前回合玩家的弃牌队列。

控制栏内部下侧留白由 `.controls` 的 `--control-bar-bottom-padding` 调整，控制栏外侧到玩家区域底部的留白由 `.player-area` 的 `--player-area-bottom-padding` 调整；当前均为 6px。抽牌气泡在按钮右侧伸出，并由两个 Mage 按钮之间及 Mage 按钮与阶段文字之间的 24px 间距预留位置。玩家回合结束后 Draw Phase 补足 5 张手牌时不显示抽牌气泡；卡牌和能力效果抽牌仍显示。

主要实现位置：`ModalBase.vue`、`CardDecisionModal.vue`、`MageAbilityChoice.vue`、`CardSelectionPanel.vue`、
`PileModal.vue`、`PileCountBadge.vue`、`TokenBadge.vue`。

## 3. 状态组合规则

组件状态应从以下维度组合，而不是创建卡牌专用样式：

| 维度 | 可用状态 |
| --- | --- |
| 尺寸 | `hand`、`mini`、`pile`、`large` |
| 朝向 | `face-up`、`face-down`、`known-face-up` |
| 数据 | `empty`、`single`、`multiple`、`counted` |
| 交互 | `static`、`clickable`、`actionable`、`draggable`、`disabled` |
| 选择 | `unselected`、`selected`、`pending` |
| 溢出 | `centered`、`scrollable`、`clipped-prohibited` |
| 可见性 | `visible`、`conditional`、`empty-hidden` |

典型组合示例：

```text
组件：Card.Pile
状态：face-down + counted + clickable
场景：Dezmodia's Stash

组件：Card.Hand + DragCardPreview
状态：face-up + draggable + drop-valid
场景：从手牌准备 Spell
```

## 4. 视觉契约

### 卡牌、边界线和圆角

- 所有可见 `border`、`outline` 和 outline 风格的阴影都使用 2px。
- 原生下拉框不显示浏览器默认白色焦点框，其余外观保持原样。
- Debug Tools 的数字输入框使用统一的主题色步进箭头：鼠标悬停或键盘聚焦时显示；无悬停能力的设备保持可见。
- 正常卡牌、背面卡牌和弹窗内卡牌都必须有统一圆角。
- 图片填满卡牌时应贴合边框内侧圆角：内侧半径需从卡牌外侧半径扣除边框宽度，不能让图片盖住边界线，也不能在四角留下灰色缺口。
- Breach 上面朝下的 Conjure 卡与玩家 Deck 牌背使用同一张图片和 `--pile-card-aspect-ratio`；不应用面朝下牌背专属缩放，保留原图白边。
- Casting Phase 中可释放的面朝下法术使用 `--face-down-cast-border` 边框颜色；必须释放的状态继续使用 `--must-cast`。
- `Card.AttachedQuarter` 使用自己的圆角，不能依赖下方 Supply pile 的圆角。
- 选中、可触发和目标高亮只改变颜色或内阴影，不改成 1px 边界。

### 牌堆和区域

- 非空 Deck、Discard、Specific Deck 和 Player Cards in Play 使用大图卡牌铺满区域。
- 空牌堆保留完整的大卡牌比例，中央显示名称和数量；不能只显示孤立的 `0`。
- 牌堆区域本身不因 hover 整体上浮，也不出现额外的蓝色区域边框。
- 数量徽章固定在左上角，不能因 hover 或卡牌内容发生位移。
- Played、Swap、Develop 短内容居中；内容溢出时横向滚动，不能裁切卡牌边界。
- 如果开局任一 Mage 需要 Swap，或市场中有可 Develop 的牌，则每个 Mage 视角都保留 Swap / Played / Develop 三栏；没有相关机制时隐藏整组侧栏。Swap cards 始终归其 Mage 所有，但所有 Mage 视角都公开显示并标明归属；Develop 是全局共享区。
- 可 Develop 的 Supply pile 左键仍执行购买，右键支付 Develop cost 并将一张卡移入 Develop 区；Develop 区的卡片可左键或右键支付 Develop cost 后获得。可用操作显示绿色 2px 高亮和费用提示；普通获得效果不能从 Develop 区拿牌。
- Develop 区可操作卡牌的绿色边界沿卡牌外缘连续绘制；Recall 可用时，弃牌堆顶牌本身沿卡牌外缘显示蓝色边界，不在牌外额外画矩形框。
- 没有侧栏需求时 Played 占整行；一旦任一侧栏需求存在，Swap / Played / Develop 三栏都保留并各占 1/3。Gallery 中若单独预览 Swap-only 或 Develop-only 布局，Played 卡牌仍以整行中心为基准；轨道接触相邻侧区边界时要钉在 Played 内侧边缘，Swap-only 向右增加、Develop-only 向左增加。只有轨道超过 Played 整个可视宽度时才显示横向滚动条。

### 弹窗

- 阻塞式决策弹窗使用灰色遮罩，底层玩家区域不能提升到弹窗上方。
- 弹窗内卡牌可以使用 `CardHoverPreview`，但不能提升整个手牌或玩家区域。
- 标题过长时换行，不能通过无限拉宽弹窗解决。
- 选择按钮在选中前后保持稳定位置。
- 牌堆查看弹窗说明明确的顺序：顶牌在左、底牌在右，每行最多 5 张。
- Trinket Deck 使用标准牌堆查看弹窗，不因查看而翻开牌；揭示知识跟随牌堆中的实体副本移动，返回牌堆底部的 Trinket 保持正面可见。
- 牌堆查看弹窗设定视口内的最小宽度：带行标签的 Deck/Discard 至少 280px，其他牌堆至少 440px，避免空牌堆或单张牌时长标题被挤成多行；窄窗口以视口宽度为上限。
- Nemesis 四个牌堆均可打开查看弹窗；未启用的专属区域显示空内容。Nemesis Deck 始终只显示牌背，Specific Deck 按 Nemesis 配置显示牌背或正面。
- `ModalBase` 的遮罩点击默认关闭对应弹窗；只有仍需引擎决策的弹窗显式设置 `blocking`，由游戏操作继续流程。
- 只有不需要决策的查看类弹窗允许 ESC 关闭；决策弹窗不能被 ESC 取消。
- Conjure 的牌库顶牌在决策期间以临时手牌显示，复用 `CardSurface`、`CardHoverPreview` 和待选牌的黄色边界；合法 Breach 复用棋盘目标高亮。弹窗沿用可操作棋盘的非遮挡样式，仅提供 Skip。拖动这张牌到合法 Breach 时准备为面朝下法术；Skip 将牌放回牌库顶。即使没有合法 Breach，也必须展示此牌并允许 Skip。
- 效果要求玩家选择一个 Breach 来 Focus 时，所有合法目标都显示橙色边框的 `Focus` 按钮；点击按钮或 Breach 图像都提交同一个效果决策，不支付 Aether。普通主阶段 Focus 按钮只在没有待处理决策时执行付费 Focus。

## 5. 尺寸和响应式规则

运行时实际值以 `aeons-end-ui/src/style.css` 顶部的 `:root` token 为准。

| 类别 | 当前 token |
| --- | --- |
| 卡牌圆角 | `--card-radius: 9px` |
| 统一边界线 | `--pixel-border-width: 2px` |
| Mini 卡牌 | `--mini-card-width: 55px`、`--mini-card-height: 82px` |
| Pile/Hand 卡牌 | `--pile-card-width: 122px`、`--pile-card-height: 178px` |
| 卡牌 hover 上浮 | `--card-hover-lift: 3px` |
| Zone 间距 | `--zone-gap: 10px` |
| 普通滚动条 | `--scrollbar-size: 10px` |
| 紧凑横向滚动条 | `--scrollbar-compact-size: 8px` |

布局要求：

- 手牌、Played、Swap、Develop 在内容不足时居中，溢出时横向滚动。
- 横向滚动容器顶部必须预留 hover 上浮距离和 2px 边界线。
- 1280×720 等短窗口仍需保留 Nemesis mat 的可见高度。
- 优先使用 `clamp()`、`min()`、`max()` 和 flex/grid 约束，不随意增加断点。
- 新增尺寸先修改 token 或通用组件，不在单张卡牌样式中写临时像素值。

## 6. 全局层级

层级变量集中在 `aeons-end-ui/src/style.css` 的 `:root`，不要在组件中添加
临时的局部大数值。

| 层级 | 值 | 用途 |
| --- | ---: | --- |
| 普通板面内容 | 0–40 | Breach、Played、手牌等 |
| 普通遮罩 | 50 | 普通全屏覆盖 |
| Help | 110 | 帮助弹窗 |
| Decision | 120 | 决策弹窗 |
| PileViewer | 130 | 查看牌堆 |
| Save confirmation | 140 | 删除存档确认 |
| Mage modal | 300 | Mage/Nemesis 图片弹窗 |
| Hovered card | 490 | 普通板面卡牌最高层 |
| Controls | 500 | 底部控制栏 |
| Drag preview | 550 | 拖拽中的卡牌 |
| Card preview | 600 | Teleported 悬停预览 |
| Debug Tools | 610 | Debug 面板 |
| Supply prompt | 620 | Supply pile 选择 |
| Exit modal | 1000 | ESC 退出确认 |

层级关系：

```text
Exit modal
└─ Supply prompt
   └─ Debug Tools
      └─ Card preview
         └─ Drag preview
            └─ Controls
               └─ Hovered card
                  └─ Board content
```

拖拽 Spell 时：

1. 关闭已经存在的卡牌预览。
2. 其他卡牌不能响应 hover、点击或预览。
3. 拖拽预览保持允许公开的朝向，并高于手牌和普通卡牌。
4. 结束或取消拖拽后必须恢复正常 hover 行为。

Setup 的 Market picker 是 `CardHoverPreview` 的层级特例：其卡图预览只需比 picker overlay 高一个层级，使用 `calc(var(--z-supply-decision) + 1)`；不要提升其他预览或底层游戏区域。

## 7. 新 UI 需求流程

实现前先回答：

1. 是否已有合适的组件名称？
2. 这是新组件，还是现有组件的新状态？
3. 空状态、禁用状态、溢出状态和窄窗口状态是什么？
4. 是否涉及新的层级、圆角、边界线或滚轮行为？
5. 是否需要在 UI Gallery 增加示例和截图？

推荐流程：

1. 先查阅本指南和 `UiGallery.vue`。
2. 复用 `CardSurface`、`CardHoverPreview`、`ModalBase`、`ZoneScroller` 等基础组件。
3. 完成后增加或更新 Playwright 场景。
4. 视觉变化较大时，在 `ui/screenshots/` 保存标准窗口和紧凑窗口截图。
5. 同步更新本指南中受到影响的组件或规则。

## 8. 验收命令

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npm run build
npm run test:e2e
```

UI Gallery 测试：

```powershell
cd aeons-end-ui
npm run test:ui-gallery
```

当前阶段 1～4 的 UI 系统化和阶段 5 的首轮视觉回归已经完成。当前验收基线为：

- Engine 测试：通过。
- 前端生产构建：通过。
- 完整 Playwright UI 回归：59/59 通过。

新增 Wave 或新机制时，只需把新增状态加入本指南、Gallery 和对应回归测试，
不需要重新建立整套 UI 规范。
