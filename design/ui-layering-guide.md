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
| `--z-local-hover` | 10 | 局部悬停效果、可购买 Market 卡牌、弹窗内选中卡牌 |
| `--z-controls` | 30 | 底部 Controls 控制栏 |
| `--z-hand-row` | 40 | 手牌所在整行 |
| `--z-overlay` | 50 | 普通全屏弹窗、手牌悬停容器 |
| `--z-drag-preview` | 100 | Spell 拖拽中的预览卡牌 |
| `--z-help` | 110 | Game Help 弹窗 |
| `--z-decision` | 120 | Card Decision 选择弹窗 |
| `--z-save-confirm` | 140 | 删除存档确认弹窗 |
| `--z-card-preview` | 200 | 鼠标悬停产生的卡牌放大预览 |
| `--z-debug` | 250 | Debug Tools 浮动面板 |
| `--z-mage-modal` | 300 | Mage 图片详情弹窗 |
| `--z-exit` | 1000 | ESC 触发的退出确认弹窗，始终最高 |

层级关系可以简单理解为：

```text
ESC Exit Modal (1000)
└─ Mage Modal (300)
   └─ Debug Panel (250)
      └─ Card Hover Preview (200)
         └─ Save Confirmation (140)
            └─ Card Decision (120)
               └─ Help (110)
                  └─ Drag Preview (100)
                     └─ Normal Overlay (50)
                        └─ Hand Hover (40-60)
                           └─ Controls (30)
                              └─ Board Content (0-20)
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
--z-controls: 30;
--z-hand-row: 40;
--z-overlay: 50;
--z-card-preview: 200;
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
| Played 区域 | `.played-row` | `--z-played` |
| Market 卡牌悬停 | `.pile.can-buy:hover` | `--z-local-hover` |
| 手牌整行 | `.hand-row` | `--z-hand-row` |
| 手牌容器悬停 | `.hand:has(.card:hover)` | `--z-overlay` |
| 手牌悬停卡牌 | `.card:hover` | `--z-overlay + 10` |
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

### 让手牌高于普通控制栏

保持：

```css
--z-controls: 30;
--z-hand-row: 40;
```

手牌容器还有滚动条和 `overflow` 规则，因此“层级正确但仍看不到”的问题也可能来自裁切，而不是 `z-index`。此时应同时检查 `.hand` 的 `overflow-x`、`overflow-y`、`scrollbar-gutter` 和上下 `padding`。

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
