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

主要实现位置：`CardSurface.vue`、`CardHoverPreview.vue`、
`PlayerArea.vue`、`DebugCardPicker.vue`。

### 牌堆和滚动区域

| 名称 | 用途 | 规则 |
| --- | --- | --- |
| `Pile.Deck` | 玩家 Deck | 非空时显示牌背和数量；为空时显示名称与 0 |
| `Pile.Discard` | 玩家 Discard | 非空时显示顶牌正面和数量；为空时显示名称与 0 |
| `Pile.SpecificDeck` | Mage-specific deck | 牌背、已知正面信息、数量和 PileViewer |
| `Pile.PlayerCardsInPlay` | Put into play 的玩家卡牌 | 无牌时隐藏；单牌可直接触发，多牌打开选择弹窗 |
| `Pile.NemesisSpecific` | Nemesis 专属牌堆或弃牌堆 | 根据 Nemesis 配置显示数量或顶牌 |
| `PileViewer` | 查看牌堆内容 | 顶牌在左侧，每行最多 5 张 |
| `ZoneScroller` | Played、Swap、Develop 和 Gallery 的横向溢出 | 内容短时居中，溢出时滚轮横向滚动 |

### 弹窗、标记和控制

| 名称 | 用途 |
| --- | --- |
| `ModalBase` | 所有标准弹窗的遮罩、焦点、拖动和 dialog 外壳 |
| `Modal.Decision` | 引擎产生的阻塞式决策 |
| `Modal.CardSelection` | 从手牌、弃牌堆或候选卡牌中选择 |
| `Modal.PileViewer` | 查看牌堆，不做决策 |
| `Modal.SupplyPrompt` | 选择 Supply pile 的提示 |
| `Badge.PileCount` | Deck、Discard、Specific Deck 的数量和空牌堆文字 |
| `Badge.Token` | Power、Aether token 等状态标记 |
| `Controls.TurnBar` | 当前 Mage、阶段、资源和回合按钮 |

主要实现位置：`ModalBase.vue`、`CardDecisionModal.vue`、`CardSelectionPanel.vue`、
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
- 正常卡牌、背面卡牌和弹窗内卡牌都必须有统一圆角。
- 图片填满卡牌时使用继承圆角，不能让图片盖住边界线。
- `Card.AttachedQuarter` 使用自己的圆角，不能依赖下方 Supply pile 的圆角。
- 选中、可触发和目标高亮只改变颜色或内阴影，不改成 1px 边界。

### 牌堆和区域

- 非空 Deck、Discard、Specific Deck 和 Player Cards in Play 使用大图卡牌铺满区域。
- 空牌堆保留完整的大卡牌比例，中央显示名称和数量；不能只显示孤立的 `0`。
- 牌堆区域本身不因 hover 整体上浮，也不出现额外的蓝色区域边框。
- 数量徽章固定在左上角，不能因 hover 或卡牌内容发生位移。
- Played、Swap、Develop 短内容居中；内容溢出时横向滚动，不能裁切卡牌边界。
- Swap、Develop 等区域是否出现由游戏状态决定，没有相关机制时隐藏。
- 三个区域共用一排：全部存在时各占 1/3；缺少 Swap 时 Played 占左侧 2/3、Develop 占右侧 1/3；缺少 Develop 时 Swap 占左侧 1/3、Played 占右侧 2/3。单侧布局中 Played 卡牌仍以整行中心为基准；超过可用宽度后必须固定在 Played 边界内，Swap-only 向右增加、Develop-only 向左增加，并通过横向滚动查看溢出内容。

### 弹窗

- 阻塞式决策弹窗使用灰色遮罩，底层玩家区域不能提升到弹窗上方。
- 弹窗内卡牌可以使用 `CardHoverPreview`，但不能提升整个手牌或玩家区域。
- 标题过长时换行，不能通过无限拉宽弹窗解决。
- 选择按钮在选中前后保持稳定位置。
- 牌堆查看弹窗说明明确的顺序：顶牌在左、底牌在右，每行最多 5 张。
- 只有不需要决策的查看类弹窗允许 ESC 关闭；决策弹窗不能被 ESC 取消。

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
