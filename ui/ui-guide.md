# UI 开发指南

这里集中维护前端组件、交互、尺寸、动效和层级约定。改 UI 前先找可复用的组件和 Gallery 示例；不要另建平行的 UI 规范。

UI Gallery：`http://127.0.0.1:5173/?ui-gallery=1`

更新时间：2026-10-08

## 1. UI 与规则的边界

- `aeons-end-engine` 决定规则、合法目标、效果顺序和等待玩家操作时的状态。
- Vue 负责显示状态、采集输入并调用引擎；不要在组件内复制卡牌规则。
- Breach 法术准备/移动的可选目标由引擎查询，提交动作时也由引擎再次校验。
- 新需求优先组合已有组件和状态；只有现有模式确实表达不了，才新增通用组件或决策类型。
- 所有游戏界面文字使用英文；内部文档可用中文。

## 2. 常用组件

| 组件 | 用途 |
| --- | --- |
| `CardSurface.vue` | 共用卡面、牌背、尺寸和可交互状态 |
| `CardHoverPreview.vue` | 卡牌与 Breach 的悬停放大预览 |
| `BreachArtwork.vue` | Breach 棋盘图和预览共用方向、素材与旋转角度 |
| `PlayerArea.vue` | 玩家区域的状态/交互协调 |
| `PlayerBreachArea.vue`、`PlayerHandArea.vue`、`PlayerZoneArea.vue`、`PlayerControls.vue` | 玩家区域展示和输入 |
| `HandCardRow.vue` | 共用手牌卡槽、居中、滚动、稳定视觉身份与收拢动画；游戏和 Gallery 使用同一组件 |
| `NemesisArea.vue`、`MarketPanel.vue`、`SetupScreen.vue` | Nemesis 区域、市场和开局设置 |
| `MatPreviewButton.vue` | Setup 中按图片自然边界显示 Mage/Nemesis mat，并共用圆角和悬停边线 |
| `ModalBase.vue` | 标准弹窗外壳、遮罩、拖动和关闭行为 |
| `CardDecisionModal.vue` | 将引擎的 typed decision 映射到决策 UI |
| `CardSelectionPanel.vue` | 单选、多选、跳过、确认和可选排序 |
| `LargeCardChoicePanel.vue` | 需要读卡面的即时单选 |
| `TwoButtonChoice.vue`、`TokenAmountChoicePanel.vue` | 双按钮决策、token 数量决策 |
| `PlayerDamageChoice.vue`、`PlayerDiscardChoice.vue` | 通用受伤目标和弃牌目标选择 |
| `TurnOrderTokenRow.vue` | Turn Order token 展示与排序 |
| `PileModal.vue`、`ZoneScroller.vue` | 查看牌堆、横向滚动牌区 |
| `DamageFeedbackLayer.vue` | Mage、Nemesis、Gravehold 等位置的受击反馈 |
| `UiGallery.vue` | 共用 UI 状态和组件的可视化目录 |

## 3. 卡牌、牌区和边界线

- 所有游戏卡牌的卡面、牌背、牌堆、预览和弹窗统一使用 `styles/tokens.css` 的 `--card-aspect-ratio: 63.5 / 88`。这是唯一的卡牌比例来源；不要改图片素材或为单张卡另设比例。Mage/Nemesis mat、Breach 和 token 不受此规则限制。
- 有图片的卡牌默认不显示中性灰边框，直接显示完整卡面；选中、可操作和目标提示使用覆盖在卡面上的彩色边框，不能改变卡牌尺寸或压缩图片。只有空牌区、无图片占位和选择控件可以保留结构边框。Nemesis Mat 等非卡牌区域按各自规则处理。
- 游戏对象的提示边框统一使用 `.game-highlight` 覆盖层（`::after`），再按语义加一个颜色类。它覆盖卡图、不改变尺寸；不要给卡牌、Breach 或 Nemesis 目标另写 `border`、`outline` 或 `box-shadow` 高亮。默认粗细由 `--game-highlight-width` 控制；Nemesis Mat 可保留单独的 3px 表面尺寸，普通卡牌和棋盘目标为 2px。
- 高亮颜色按含义固定：`.game-highlight--available` 绿色，表示可购买/可激活/可执行；`.game-highlight--choice` 橙色，表示尚未选中的合法候选；`.game-highlight--selected` 红色，表示玩家已选中的候选，与 `.game-highlight--required`（必须执行的目标）共用红色；`.game-highlight--context` 蓝色，表示拖拽中的临时落点或悬停上下文。禁用项保持灰暗、不加彩色边框。键盘焦点环、普通按钮和空区域占位的结构边框不属于游戏目标高亮，可以保留自己的可访问性/控件样式。Gallery 的 `Card.States` 展示这五种语义。全局色值和粗细只在 `styles/tokens.css` 调整，覆盖层实现只在 `styles/interaction-highlights.css` 维护。
- Setup 的 Mage/Nemesis mat 预览使用 `MatPreviewButton.vue`。按钮跟随图片自然比例收缩，图片与高亮覆盖层同边界、同圆角；不要把 `object-fit: contain` 留出的空白也圈进边线。
- 图片与边框共存时，内侧圆角应贴合卡面，不能遮住边框或在角落留下空隙。
- 市场 Supply pile 保持紧凑的 3×3 排列；视口变化时卡牌随可用高度缩放，不用弹性分配把列间距拉大。Nemesis Play 区域使用剩余横向空间。Supply pile 悬停不做上浮位移。
- Nemesis Play 区域分为上下两行：下行显示 Minion、Power 等正常在场卡牌；上行从左至右显示被规则放置在场边的 Nemesis 卡牌（例如 Dark Conclusion 暂放在 Turn Order deck 旁）。
- Log 面板默认隐藏；Debug Tools 最后一项可切换显示。面板隐藏时，游戏日志仍持续记录；启用后保留原有的展开/折叠交互。
- Supply pile 卡图始终保持正常颜色；费用足够时用绿色边框标记可购买项。费用不足不能通过降低卡图透明度来表示；费用不足时 Charge 按钮使用禁用样式。
- 卡牌牌区内容不足时居中，超出时横向滚动；不能裁掉卡牌边缘。Deck、Discard、Trinket 等查看弹窗按顶牌在左、底牌在右，每行最多五张。
- Trinket deck 是全局牌区：牌宽随 Supply pile 同步，水平位置与市场第三列对齐；切换 Mage 视角时它不淡入淡出。查看牌堆不会揭示未知牌；是否已看过要随实体卡移动。
- Mage 抽牌堆和弃牌堆，无论使用哪位 Mage，都显示 Player Card Back；Mage-specific deck 显示自己的牌背（例如 Tressa's Vault 使用 Treasure 3 back）。普通 Deck/Discard 悬停不加蓝框；仅 Recall 等确实可执行的动作使用语义高亮。
- 当前回合的 Turn Order token 不加环绕边框，回合到位动画本身负责提示。Nemesis 设置项按 `NemesisDef.wave` 分类，与 Mage 和 Market 的 Wave 分类一致。
- Played Zone 始终显示。开局 Mage 或市场卡牌需要 Swap 时显示 Swap Zone；市场含有 Develop 卡牌时显示 Develop Zone。两种条件独立判断，区域对所有 Mage 视角可见。Swap 卡仍归其持有者，Develop 为共享区域。
- Played、Swap、Develop 使用彼此分开的深色圆角区域。Swap 与 Develop 各占一份，Played 在单侧区域存在时占两份；两侧区域都存在时三等分。Swap/Develop 卡列在自己的区域内居中，Played 卡列始终以整行中心为中心并在空间不足时滚动。
- 区域标题位于上边缘：Swap/Develop 标题居中对齐各自区域；Played 标题对齐整行中心，与 Played 卡列保持一致。
- Breach 上附着的 Relic 放在 Breach 下层并露出卡牌下方；Focus/Open 按钮要在附着牌上层。垂直露出量只改 `--breach-attached-relic-offset-y`。
- Focus 合法时，悬停 Breach 图或对应 Focus 按钮，都要同时把图和按钮边线临时变成蓝色；由 `board-pile-interactions.css` 的共享配对悬停规则处理。

Recall 可用时，弃牌堆顶牌及可触发的牌用蓝色上下文提示；打开弃牌堆后的操作说明也使用蓝色。Recall、Develop、Supply 购买/Develop 和其他可操作状态都通过统一覆盖层提示，不能挤占卡面空间。不要给牌堆增加整块矩形高亮或 hover 上浮。

### 决策目标高亮

- 由规则条件筛出的合法目标，在决策出现时就要有持续可见的提示；不能只在鼠标悬停或选中后才显示。合法候选由引擎写入 `pendingDecision.candidates`，UI 直接按这份列表呈现，不要在 Vue 中重复计算卡牌费用、类型或其他规则条件。
- 对棋盘上的目标和市场供牌，沿用同一 `.game-highlight` 覆盖层，并使用对应语义颜色。`emphasis: 'required'` 的强制限定目标使用红色；玩家可选的合法目标使用橙色。不要用鼠标悬停才显示的边框代替持续目标提示。
- 对弃牌堆、牌库或专属牌堆等在决策面板中展示的卡牌，决策面板只列出合法候选。普通揭示/排序候选保持干净；可选择候选用橙色，选中后变为红色；如果规则条件筛选了可操作目标，则通过 `select_cards.targetHighlight` 给符合条件的候选加持续边框。
- 新增条件选择效果时，同时验证引擎候选列表和对应 UI 的持续高亮。UI Gallery 的 `Decision.MarketTargets` 展示市场目标高亮样式。
- 决策标题和提示文字使用 `text-wrap: pretty`，避免行末只剩一个短词；不要为单张卡牌的提示手工插入换行。

## 4. 交互与动效

### 玩家视角和 Breach

- 回合切换时，先播放 Turn Order token 到位/放大淡出的动效，再切换玩家区域；棋盘短暂拦截重复输入。
- 玩家区域的淡入只用于玩家区域内容。底部 Control Bar 和全局 Trinket deck 不跟随淡入；切换 Mage 也不播放 Breach Focus/Open 动画。
- Breach 只有自身方向或开合状态改变时才播放动效。Focus 按当前方向顺时针旋转；Open 使用随开口方向调整翻转轴的 3D 翻面。动作动画结束后，回合自动结束和后续阶段才会继续。
- Nemesis 抽牌从牌堆飞向中央时，背景同步渐暗；卡牌在移动途中横向收窄，在背面不可见时切换预加载正面，再展开。不要展示镜像的牌背，也不要在动画完成后再突然弹出另一张正面牌。
- Nemesis 抽牌翻开后直接停在屏幕中央；点击卡牌、遮罩区域或按 Space 确认继续，不再额外弹出一个只含 Confirm 的窗口。开局第一张 Nemesis 牌也必须走同一动画流程。
- 从玩家手牌放到自己或盟友牌堆顶的卡牌也要飞向目标牌堆，同时等待来源手牌收拢完成。Vapor Wraith 的 on-damage 选择和 Flailer 的盟友牌堆顶选择共用 `hand-to-pile` 动画时长。Conjure 跳过时，手牌区域中的临时揭示牌也飞回牌堆顶；真实 hand 状态不包含这张临时牌。其他从场上牌堆移动到玩家手牌、牌堆或弃牌堆的卡牌，统一使用 `src/game/card-flight.ts` 的 `captureCardZoneTransfer` / `resolveCardZoneTransfers` 和 `useGame.ts` 的区域目标动画。Supply 购买与 Nemesis 特殊牌堆获得 Corruption 都走这套逻辑；新增此类效果时复用它，并标记来源牌堆和玩家区域目标。落到玩家牌堆时使用 `overlay`，保留原有牌堆图像可见；只有落点是刚加入的手牌或弃牌顶牌时才使用 `replace` 暂时隐藏该张新牌，避免重复显示。手牌打出的 Gem/Relic 与弃牌阶段也使用卡牌飞行动画；弃牌动画以原弃牌顶牌为底图，Play All Gems 逐张播放，卡牌决策等当张卡飞完后再出现。

### 决策和拖动

- 可选的单张预备法术施放，点击棋盘上高亮的法术即提交选择并继续施放，弹窗只提供 Skip，不显示 Selected 计数或 Confirm。多张法术选择仍保留选中计数和 Confirm；引擎的候选校验、Skip 分支与施放规则不变。`PreppedSpellChoicePanel` 的 `confirmSelection` 控制这两种展示方式，Gallery 同步展示点击即施放。
- 引擎决策使用可复用模式：多选后 Confirm/Skip 用 `CardSelectionPanel`；读卡后立即选一张用 `LargeCardChoicePanel`；双选用等宽上下排列按钮；token 数量选择用共享的 `DebugNumberInput` 与 Confirm。
- 阻塞式决策不能被 Esc 或遮罩点击取消；普通查看弹窗可按其组件配置关闭。
- Debug Tools 的文本框聚焦时，游戏快捷键交给文本输入；Esc 关闭 Debug Tools，Tab 切换玩家视角而不移动原生焦点。游戏界面不显示对象的原生键盘焦点环；鼠标悬停反馈仍保留。牌序编辑入口常驻，选定 Mage 后在独立牌堆窗口里用大图拖动排序。
- Power 卡的 To Discard 条件满足时高亮整张卡，点击卡牌触发；不显示常驻的独立 Discard 按钮。
- 玩家在 Main Phase 首次点击 End Turn 且仍有合法操作时，保留现有内联提醒，同时用引擎的 `getMainPhaseActionHint` 显示一个具体操作说明，并短暂闪亮该操作位置。若操作属于另一位 Mage，先闪亮其 Control Bar 选择按钮；切换视角后再闪亮实际操作目标。此提示不新增弹窗，`canPlayerAct` 与提示必须共用同一引擎判断。
- 决策弹窗内所有可用按钮（包括不在候选列表中的 Skip/Confirm）统一有悬停和按下颜色反馈，由 `.decision-overlay .btn` 与 `.decision-options button` 公共规则维护。
- Reveal 类效果要让玩家看到实际揭示的卡牌，再按规则提供 Confirm 或选择操作。Conjure 使用专用流程：揭示牌暂时显示在手牌并以橙色选择提示标记；没有拖动时不高亮 Breach，开始拖动后合法 Breach 才显示蓝色临时落点提示。即使无合法目标，仍展示卡牌并提供 Skip。
- 需要选择 Breach 执行 Focus 效果时，合法目标显示橙色 Focus 按钮；按钮与 Breach 图提交同一决策，且不额外支付普通 Focus 费用。
- 受伤/弃牌目标使用统一玩家选择按钮；伤害弹窗明确写出伤害量，弃牌弹窗显示需弃牌数量和随后抽牌数量（抽牌数为零时不写后续抽牌）。
- Control Bar 的 Hand 数字只读取该玩家真实的 `hand.length`。Conjure 揭示牌虽然暂时展示在手牌区域，仍不能加入 Hand 计数；获得到牌堆顶或弃牌堆不触发白色手牌增长气泡。白色气泡只反映真实手牌增加，蓝色气泡反映 Charge；正常回合补牌不产生手牌气泡，切换到对应 Mage 时清除其手牌提醒，撤销/恢复整个 GameState 时清除所有遗留增长提醒。
- Turn Order deck 的 Reveal、选择和排序使用 token 图片。排序弹窗不加冗余顺序文字；拖动 token 时相邻项目要平滑让位。

所有可以重排卡牌或 token 的界面都复用 `aeons-end-ui/src/game/usePointerReorder.ts`。使用 Pointer Events 和 pointer capture；跨过目标中线时改变顺序，用 `pointer-sort` 过渡显示位移。鼠标仍按住时拖动可离开弹窗继续跟随，松开、取消拖动、窗口失焦或标签页隐藏时都要清理状态。不要启用原生 HTML drag image 或 dataTransfer。当前共用位置包括卡牌选择、Turn Order token 和 Debug Deck Order。

### 伤害反馈与伤害分配

- 伤害反馈由页面级 `DamageFeedbackLayer` 显示，需保持在弹窗、控制栏及牌区之上。命中生命值时也要让相应生命条平滑变化。
- `deal_damage_divided` 先智能地把伤害尽量分配给当前生命值最低的敌方单位。用红底白字的 `−X` 标记各单位已分配值；左键加分配、右键撤销一点。分完后再次点击法术或按 Space 才结算，不能在最后一点分配时自动结算。
- 选择施法目标或分配伤害时，敌方可选目标使用橙色覆盖式边框；高亮不能与底色边框叠脏，也不能改变卡牌尺寸。二次点击确认中的法术仍保持原 Breach 位置。
- “Damage assigned” 提示的位置固定；只调 `--damage-assigned-size` 就能按比例改变提示整体大小。

## 5. 尺寸、颜色和动效参数

最低目标是浏览器内容区 1440×900 CSS 像素；推荐 1920×1080 或更大桌面视口。项目不为窄屏设计额外的游戏布局。

`aeons-end-ui/src/style.css` 是样式导入入口；按职责拆分的文件在 `src/styles/`。导入次序决定覆盖关系，不要随意重排。全局变量集中在 `src/styles/tokens.css`。

常用参数（以 tokens.css 当前值为准）：

| 效果/尺寸 | 参数 |
| --- | --- |
| 卡牌比例 | `--card-aspect-ratio: 63.5 / 88` |
| Nemesis mat 圆角（棋盘、设置、预览和弹窗） | `--nemesis-mat-radius: 5%` |
| Breach 附着 Relic 露出量 | `--breach-attached-relic-offset-y: 18px`，正值向下 |
| Focus/Open 动效 | `--breach-focus-duration: 280ms`、`--breach-open-duration: 560ms`、`--breach-open-perspective: 620px` |
| 手牌飞入 Played Zone | `--hand-to-play-zone-flight-duration: 200ms` |
| 手牌飞向牌堆或弃牌堆 | `--hand-to-pile-flight-duration: 200ms` |
| 弃牌阶段飞入 Discard | `--discard-phase-flight-duration: 200ms` |
| 其他卡牌飞行动画（购买、其他牌区移动） | `--card-flight-duration: 600ms`、`--card-flight-easing` |
| 手牌收拢/新增卡牌重排 | `--hand-card-reflow-duration: 220ms`、`--hand-gain-reflow-duration: 220ms` |
| Played、Swap、Develop 等牌区重排 | `--card-zone-reflow-duration: 240ms` |
| 玩家区域切换 | `--transition-player-turn: 600ms` |
| Turn Order token 到位 | `--turn-order-arrival-duration: 600ms`、`--turn-order-arrival-scale: 7`、`--turn-order-arrival-opacity: .50` |
| Nemesis 抽牌飞行/翻面 | `--nemesis-draw-flight-duration: 500ms`、`--nemesis-draw-flip-duration: 150ms`；翻面约在飞行 45% 时开始 |
| 双按钮决策 | `--two-button-choice-width: 420px`、`--two-button-choice-gap: 10px`、`--two-button-choice-button-height: 56px`、`--two-button-choice-font-size: 14px` |
| 伤害分配提示缩放 | `--damage-assigned-size: 1.35` |
| 伤害目标边框 | Mat `--damage-target-mat-border-width: 3px`；Mini 卡 `--damage-target-card-border-width: 2px` |

引擎在通用伤害/治疗结算中逐次记录目标和数值，页面级 `DamageFeedbackLayer` 消费事件显示反馈，不按卡牌或伤害来源判断。伤害显示红色负数，治疗显示绿色正数；新效果只要复用通用结算路径，就会自动获得反馈。获得手牌和 Charge 的提示显示在对应玩家的 Control Bar 上；正常获得会显示 `+X`，回合开始抽满 5 张牌不显示抽牌提示。伤害数字停留动画目前为 1500ms，光晕为 540ms，HP 条过渡为 460ms，参数在 `src/styles/damage-feedback.css`。

手牌使用 `HandCardRow.vue` 的固定宽度卡槽直接参与横向布局。每次更新前捕获真实屏幕位置，更新后一次性确定居中与卡槽的最终位置，再用同一套 FLIP 动画移动。不要同时给手牌 padding 加 CSS 过渡或另外计算弃牌位移。新动画启动前取消该手牌的旧动画；完成、切换 Mage 和卸载时清理动画，不在卡槽上保留 inline transform。相同卡牌的打出/准备按实际离开的卡槽识别；批量弃牌保留源索引，结束后按剩余顺序恢复实时索引。

Played、Swap、Develop 等牌区通过 `src/game/card-flight.ts` 的通用区域转移动效处理。可移动的卡面标记 `data-card-motion-zone`、卡牌 ID、玩家 ID 和稳定的视觉 key；目标卡面用 `data-card-motion-from-zones` 声明接受哪些来源。`data-card-motion-count` 可让单个来源元素表示堆叠牌数量，`data-card-motion-arrival-count` 可让持续存在的目标元素报告新增牌数，`data-card-motion-after-zones` 声明目标区域需等待哪些区域完成转移。`data-card-motion-row` 标记需要做 FLIP 重排的容器。引擎更新后，通用流程按区域增减识别卡牌转移、飞向新落点并重排原区域的剩余卡牌；新增牌区应提供这些标记并复用 `captureCardZoneMotion` / `resolveCardZoneMotion`，不要按卡牌 ID 新增飞行动画分支。供应堆以外的临时来源可直接复用 `captureCardFlight` 和 `animateCardFlight`，并与区域重排同时启动。Swap 使用区域依赖声明实现串行：牌先到 Swap Zone，Discard 等 Swap Zone 的转移动效完成后再接收交换目标。

手牌打出或一次弃多张牌时，每张卡开始飞行后，剩余卡牌就同步平滑收拢；后续飞牌和自动阶段推进等待飞行与收拢均结束。多张牌仍按玩家选择顺序逐张处理。新增手牌与旧牌同步移动，飞入的新牌暂时隐藏到达目标；切换 Mage 直接替换整手牌并重置滚动。相关动画在 `src/game/card-flight.ts`，协调流程在 `src/game/useGame.ts`。Gallery 的 `Hand.Motion` 可以演示连续增删、逐张弃牌、溢出滚动和视角切换，包括打断前一段动画的操作。

## 6. 全局层级

层级 token 在 `src/styles/tokens.css`。只有全局浮层使用全局 token；局部卡牌徽标和牌区叠放在各自 stacking context 内排序。

| 层级 token | 值 | 用途 |
| --- | ---: | --- |
| `--z-board-token` | 0 | Breach 等棋盘底图 |
| `--z-board-interaction` | 2 | Focus/Open 操作层 |
| `--z-board-spell` | 3 | Breach 上的法术和附着牌 |
| `--z-played` / `--z-local-hover` | 6 / 10 | 基础牌区和局部悬停 |
| `--z-hand-row` | 40 | 手牌 |
| `--z-overlay` | 50 | 普通遮罩 |
| `--z-help` / `--z-decision` / `--z-pile-viewer` | 110 / 120 / 130 | 帮助、决策、牌堆查看 |
| `--z-save-confirm` / `--z-mage-modal` | 140 / 300 | 存档确认、Mage/Nemesis 图片弹窗 |
| `--z-card-hover` / `--z-controls` | 490 / 500 | 棋盘卡牌预览、Control Bar |
| `--z-drag-preview` / `--z-debug` | 550 / 600 | 拖拽预览、Debug Tools |
| `--z-card-preview` / `--z-supply-decision` | 610 / 620 | 页面级卡牌预览、Supply 决策 |
| `--z-card-flight-shield` / `--z-card-flight` | 630 / 640 | 飞行期间输入遮挡、卡牌动画副本 |
| `--z-turn-token-arrival` | 645 | 放大后淡出的 Turn Order token |
| `--z-exit` / `--z-damage-feedback` | 1000 / 1100 | 退出确认、全局受击反馈 |

大的 `z-index` 不能越过父元素创建的 stacking context，也不能逃过 `overflow: hidden/clip`。跨区域动画或提示需要时使用 Teleport/页面级固定层；不要只给子元素继续叠加更大的数字。Setup 的卡图预览只比 Setup 选牌窗口高一级。

## 7. 修改和验收

1. 查找本指南和 Gallery，确认能否复用现有组件/状态。
2. 先改通用组件或全局 token，再改单个页面；避免同类交互各自补一套样式。
3. 更新相关 Playwright 用例；明显视觉变化更新 Gallery 示例。自动截图不能代替桌面浏览器目视检查。
4. 确认游戏过程、空状态、禁用状态、遮挡层级、拖动结束和键盘操作。

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build
npm run test:e2e
npm run test:ui-gallery
```

生产构建会先生成图片导入映射。新增可复用决策 UI、排序交互或明显视觉状态时，把模式也加入 UI Gallery，方便后续直接复用。
