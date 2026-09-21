# UI 层级维护指南

本文记录 Aeon's End Digital 当前 UI 的 `z-index` 层级，以及以后定位和调整层级时应遵循的方法。

## 快速结论

主要层级参数集中在：

```text
aeons-end-ui/src/style.css
```

文件顶部的 `:root` 块中。以后调整主要层级时，优先修改这些 CSS 变量，不要直接修改组件中的局部数字。

## 当前全局层级表

| 层级变量 | 当前值 | 作用 |
|---|---:|---|
| `--z-board-token` | 0 | Breach 背景图片 |
| `--z-board-interaction` | 2 | Breach 交互层、Deck/Discard 区域 |
| `--z-board-spell` | 3 | Breach 上准备的 Spell |
| `--z-played` | 6 | Played 区域 |
| `--z-local-hover` | 10 | 局部容器悬停效果；具体卡牌悬停使用 `--z-card-hover` |
| `--z-hand-row` | 40 | 手牌所在整行 |
| `--z-overlay` | 50 | 普通全屏弹窗 |
| `--z-drag-preview` | 550 | Spell 拖拽中的预览卡牌；拖拽期间高于 Controls、手牌和普通卡牌 |
| `--z-help` | 110 | Game Help 弹窗 |
| `--z-decision` | 120 | Card Decision 选择弹窗 |
| `--z-pile-viewer` | 130 | Deck / Discard 查看弹窗 |
| `--z-save-confirm` | 140 | 删除存档确认弹窗 |
| `--z-debug` | 250 | Debug Tools 浮动面板 |
| `--z-mage-modal` | 300 | Mage 图片详情弹窗 |
| `--z-card-hover` | 490 | 悬停卡牌：最高的普通游戏板面层，低于 Controls |
| `--z-controls` | 500 | 底部 Controls 控制栏 |
| `--z-card-preview` | 600 | 鼠标悬停产生的卡牌放大预览 |
| `--z-exit` | 1000 | ESC 触发的退出确认弹窗，始终最高 |

层级关系可以简单理解为：

```text
ESC Exit Modal (1000)
└─ Card Hover Preview (600)
   └─ Spell Drag Preview (550; 卡牌放大预览在拖拽期间会被关闭)
      └─ Controls (500)
         └─ Hovered game card (490)
            └─ Mage Modal (300)
               └─ Debug Panel (250)
                  └─ Save Confirmation (140)
                     └─ Pile Viewer (130)
                        └─ Card Decision (120)
                           └─ Help (110)
                              └─ Normal Overlay (50)
                                 └─ Board Content (0-40)
```

## 参数定义位置

打开以下文件：

```text
aeons-end-ui/src/style.css
```

在文件顶部搜索：

```css
/* Global stacking order. */
--z-board-token: 0;
--z-card-hover: 490;
--z-controls: 500;
--z-hand-row: 40;
--z-overlay: 50;
--z-card-preview: 600;
--z-drag-preview: 550;
--z-mage-modal: 300;
--z-exit: 1000;
```

如果要修改某一类控件，直接修改对应变量。例如，要让 Mage 弹窗高于 Debug 面板，可以调整：

```css
--z-debug: 250;
--z-mage-modal: 300;
```

修改后，搜索变量名可以看到它实际应用的位置：

```text
Ctrl+F → --z-mage-modal
Ctrl+F → --z-exit
Ctrl+F → --z-hand-row
```

## 控件与 CSS 选择器对应关系

### 场景内容

| 控件 | 组件/选择器 | 使用的层级 |
|---|---|---|
| Breach 背景 | `.breach-token` | `--z-board-token` |
| Breach 交互区域 | `.breach-hover-target` | `--z-board-interaction` |
| Breach 上的 Spell | `.breach .spell:has(img)` | `--z-board-spell` |
| Played 区域 | `.played-zones` | `--z-played` |
| Market / Nemesis 卡牌悬停 | `.pile.can-buy:hover`、`.pile.decision-market-choice:hover`、`.nemesis-play-card:hover` | `--z-card-hover` |
| 手牌整行 | `.hand-row` | `--z-hand-row` |
| 手牌或三区悬停 | `.hand-row:has(.card:hover)`、`.played-zones:has(.card:hover)` | `--z-card-hover` |
| Player cards in play 区域 | `.player-cards-in-play-pile` | `--z-card-hover`，卡牌边界高于相邻 hand-row 单元但低于 Controls |
| 悬停卡牌 | `.card:hover` | `--z-card-hover` |
| 底部 Controls | `.controls` | `--z-controls` |

### 浮动预览和弹窗

| 控件 | 组件/选择器 | 使用的层级 |
|---|---|---:|
| Spell 拖拽预览 | `.spell-drag-preview` | `--z-drag-preview` |
| 普通卡牌放大预览 | `.card-hover-preview` | `--z-card-preview` |
| 普通弹窗基础层 | `.overlay` | `--z-overlay` |
| Help | `.help-overlay` | `--z-help` |
| 卡牌选择 | `.decision-overlay` | `--z-decision` |
| 删除存档确认 | `.save-delete-overlay` | `--z-save-confirm` |
| Debug Tools | `.debug-panel` | `--z-debug` |
| Mage 图片弹窗 | `.overlay.mage-overlay` | `--z-mage-modal` |
| ESC 退出弹窗 | `.exit-overlay` | `--z-exit` |

## Spell 拖拽期间的交互锁

Spell 开始真实拖拽（指针移动超过拖拽阈值）后，`PlayerArea` 会在 `body`
上添加 `spell-dragging` 状态，并广播 `card-preview-dismiss` 事件。这个状态
有三项约束：

1. 所有 `CardHoverPreview` 都必须拒绝新的悬停预览，并立即关闭已经显示的预览；
2. 其他卡牌表面在拖拽期间不接收鼠标指针事件，避免触发点击或悬停行为；
3. `.spell-drag-preview` 使用 `--z-drag-preview: 550`，位于 Controls、手牌和普通
   板面卡牌之上。不要在单个卡牌组件中另加临时 `z-index` 来绕过这个规则。

拖拽结束或取消时必须移除 `spell-dragging` 状态，避免后续正常悬停被错误屏蔽。

## 特别注意：Stacking Context

`z-index` 不是简单的全局数字比较。一个元素如果位于父级 stacking context 中，就不能突破父级的层级范围。

当前 Mage 弹窗曾经出现过“自身是 `300`，但仍被手牌遮挡”的问题，原因是：

```css
.mage-area:has(.mage-overlay) { z-index: var(--z-mage-modal); }
```

这个规则同样重要。它在 Mage 弹窗打开时提升了父级 `.mage-area`，让 Mage 弹窗可以超过同级的 `.hand`。

因此，如果以后发现弹窗仍然被其他区域遮挡，检查顺序应当是：

1. 弹窗自身有没有正确的 `z-index`；
2. 弹窗的父级是否创建了 stacking context；
3. 父级的 `z-index` 是否低于遮挡它的兄弟元素；
4. 是否存在 `overflow: hidden`、`transform`、`filter` 或 `isolation` 造成额外的层级/裁切限制。

## 常见调整方式

### 让某个弹窗高于手牌，但低于 ESC

保持以下关系：

```css
--z-hand-row: 40;
--z-mage-modal: 300;
--z-exit: 1000;
```

如果弹窗位于手牌行内部，还必须提升弹窗所在的父级 stacking context，不能只提升弹窗自身。

### 悬停卡牌的最高板面层

保持：

```css
--z-card-hover: 490;
--z-controls: 500;
```

悬停卡牌必须通过父级 `.hand-row:has(.card:hover)` 或
`.played-zones:has(.card:hover)` 一并提升；只给卡牌本身设置较大的
`z-index` 无法越过父级 stacking context。它是最高的普通板面内容，但必须
低于 Controls。放大预览仍在 `--z-card-preview`。

横向滚动容器的 `overflow-x: auto` 会同时裁切纵向溢出。因此，任何会
`translateY(-3px)` 的卡牌都必须在其滚动容器的顶部保留至少“上浮距离 +
2px 边框”的空白；否则即使层级正确，顶部高亮边框仍会被裁切。

### 让 ESC 始终位于最前

ESC 退出弹窗使用：

```css
--z-exit: 1000;
```

不要把其他游戏弹窗提高到 `1000` 或更高，否则会破坏 ESC 的优先级。

## 修改后的验证方式

调整层级后，至少运行：

```powershell
cd aeons-end-ui
npm run build
npm run test:e2e
```

重点手动验证：

1. 鼠标悬停手牌，确认卡牌抬升部分没有被控件遮挡；
2. 点击 Mage 图片，确认 Mage 弹窗高于手牌；
3. Mage 弹窗打开时按 ESC，确认退出弹窗位于最上层；
4. 打开 Card Decision、Debug、Help 和卡牌放大预览，确认层级关系仍符合上表；
5. 手牌很多并出现横向滚动条时，再次验证悬停层级和卡牌顶部是否被裁切。
