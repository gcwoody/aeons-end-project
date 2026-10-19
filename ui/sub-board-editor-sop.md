# Sub Board Layout Editor 使用说明

这份说明介绍 UI Gallery 中的 **Sub Board Layout Editor**。它用来把 Nemesis 的辅助棋盘图片标注成程序可使用的布局：哪些位置可以点击，以及 token 应该画在哪里。

## 先认识三个部分

- **棋盘图片**是背景。布局里的坐标都按图片宽高的百分比计算，所以图片缩放时标注位置也会跟着缩放。
- **Region（区域）**是玩家可以点击的矩形操作范围。游戏接入布局后，会用它判断玩家点中了哪个位置，并在该位置显示可操作或选中的高亮。
- **Anchor（锚点）**标记 token 的中心位置，并记录 token 实际显示的矩形宽高。每个 Anchor 必须绑定一个 Region；每个 Region 也必须绑定一个 Anchor。两者是一对一关系：点击某个 Region 时，游戏就能找到对应的 token 锚点和 token 尺寸。
- **Token size（token 尺寸）**是 Anchor 上的矩形框，以棋盘图片宽高的百分比表示。拖动 Anchor 矩形的四角可以调节大小，拖动矩形可以移动 token 中心点。

Region 和 Anchor 的 ID 可以不同，实际关联保存在 Anchor 的 `regionId` 字段里。ID 应采用容易辨认且不重复的名称，例如 Region 为 `armor-space-1`，Anchor 为 `nemesis-token-armor-1`。

## 编辑步骤

1. 在 **Board image** 选择示例棋盘，或点 **Load image…** 加载自己的棋盘图片。图片文件不会放进导出的 JSON；接入项目时要另外保留并注册图片。
2. 创建可点击位置：点 **Draw region**，在图片上按住左键拖出矩形。完成绘制后会自动切回 **Select** 模式并选中新区域；可以立即拖动它。将鼠标移到四边或角落会显示对应的调整光标，拖动即可调整大小；边缘和角落不会显示额外的控点。
3. 为区域创建 token 锚点：点 **Place anchor**，再点目标 Region 内的 token 中心位置。编辑器会把这个 Anchor 自动绑定到该 Region，并建立默认的 4% × 4% token 矩形。也可以在 **Select** 模式下右键点击 Region，在它的中心创建 Anchor。一个 Region 已经有 Anchor 时，再次尝试会选中现有 Anchor。
4. 选中 Region 可编辑它的响应范围；右侧会显示关联 Anchor，点击关联项可直接选中它。选中 Anchor 后，可在 **Bound region** 下拉框调整关联，在 **Token width / Token height** 中输入矩形大小。将鼠标移到 Anchor 矩形的边或角会显示对应的调整光标；拖动边只调整这一条边，拖动角落会同时移动相邻两条边。选中状态不会显示额外的边缘控点。Anchor 的中心会自动更新到新矩形的宽、高中点。拖动矩形本身可移动整个 token 框。拖动 Anchor 时，它会根据中心点所在的 Region 自动更新绑定；目标 Region 已有 Anchor 时不会重复绑定。点击 **Match position and size to region** 可将 Anchor 中心和矩形宽高调整到与绑定的 Region 完全一致。所有坐标、区域宽高和 token 宽高都使用图片的百分比，精确到两位小数。
5. 按住 **Ctrl** 并左键点击，可把 Region 或 Anchor 加入/移出当前选择。选中元素后按键盘方向键，每次沿对应方向移动 **0.1%**；多选时所有选中元素一起移动。方向键移动会记录到撤回历史中。多选时右侧的 **Shared label** 会把相同名称应用到所有选中元素；若当前名称不同，输入框会显示为空并提示 **Mixed labels**。**Group X / Group Y** 按整组选框的左上位置定位；修改它们会平移整组并保留元素间距。拖动已选中的任意元素也会一起移动；按 **Delete** 会删除当前选中的所有元素。也可以使用 **Delete selected** 按钮。
6. 复制相似位置：选中 Region 后按 **Ctrl+C**，编辑器会把它和绑定的 Anchor 一起复制；选中 Anchor 后复制则只复制 Anchor。按 **Ctrl+V** 后副本会出现在原位置附近、自动获得不重复的 ID，并保持选中。单独粘贴的 Anchor 暂时未绑定；将它拖入一个尚未绑定 Anchor 的 Region 后，会自动完成关联。也可以使用 **Copy selected** 和 **Paste copy** 按钮。
7. 单独删除 Anchor 会保留它绑定的 Region；这个 Region 会显示未配对的红色提醒。删除 Region 时，会连同它绑定的 Anchor 一起删除。多选后按 **Delete** 则删除所选 Anchor，并删除所选 Region 及其配对 Anchor。
8. 操作后按 **Ctrl+Z** 或点 **Undo** 撤回最近一次编辑。拖动一次算作一次编辑；正在输入属性时，Ctrl+Z 保留浏览器的文本撤回行为。
9. **Save** 始终可用。每次点击都会重新写入当前布局，即使内容没有变化也会更新文件时间；成功后会在屏幕右上方显示自动消失的保存提示。新布局第一次保存时会打开文件保存窗口，让你选择路径；之后会覆盖保存到同一个文件。通过文件选择窗口导入 JSON 后，Save 会写回原文件；如果导入方式没有保留文件句柄，第一次 Save 会让你选择保存位置。浏览器不支持直接写入时会下载 JSON，并提示这是下载副本而非覆盖原文件。**Export layout JSON** 始终可下载副本；**Import JSON…** 可载入其他布局；**Reset layout** 会恢复该示例的初始标注。
10. 修改右侧属性后，可以直接点击另一个元素；当前属性会先提交，再切换选择。ID 会校验后保存，坐标和尺寸会按两位小数归整。
11. 在布局编辑器下方的 **Token placement and movement** 区域可以检查交互效果。选择 **Place Nemesis token** 或 **Place Terror token** 后，可连续点击多个未占用的 Region 来放置同类 token；Place 状态会保持激活，直到选择另一种 token。点击 Preview 中的 token 选中它，再拖动可直接移动关联 Anchor；拖动边或角可调整 Anchor 的 token 矩形，方向键每次微调位置 0.1%。这些改动会同步到布局，可用 Preview 里的 **Save layout** 保存；也会记入 Undo 历史。**Remove selected** 删除选中的模拟 token，**Clear tokens** 清空模拟状态。模拟 token 的放置和移除只是预览状态，不会改动游戏状态或写入布局；拖动和键盘调整则会修改并保存 Anchor 布局。

## 编辑器中的控件

| 控件 | 用途 |
| --- | --- |
| Select | 选中、移动元素；Region 和 Anchor 的四边控制点调单条边，四角控制点同时调两条边 |
| Draw region | 在棋盘图片上画新的点击矩形 |
| Place anchor | 在 Region 内放置 token 中心，并自动绑定该 Region |
| 右侧 Region 属性 | 修改点击范围；查看并跳转到关联的 Anchor |
| 右侧 Anchor 属性 | 修改绑定的 Region、token 中心位置及矩形宽高；可将大小和位置匹配到整个 Region |
| Shared label | 多选时将相同名称应用到所有选中元素；不同名称会显示为空 |
| Group X / Group Y | 多选时调整整组的位置，并保留元素间距 |
| Arrow keys | 将选中的 Region 或 Anchor 沿方向微调 0.1%；多选时一起移动，可用 Ctrl+Z 撤回 |
| 右键 Region | 在 Region 中心创建 Anchor |
| Show IDs and labels | 在图片上显示/隐藏元素名称，方便校对 |
| Copy / Paste | 复制 Region 时一并复制关联 Anchor；复制 Anchor 时可只复制 Anchor，并在拖入空闲 Region 后自动关联 |
| Match position and size to region | 将选中 Anchor 的中心点与矩形尺寸设为和绑定 Region 完全一致 |
| Undo | 撤回最近一次布局编辑；最多保留 100 次操作 |
| Import / Export JSON | 读取布局或下载一份 JSON 副本 |
| Save | 总是显示。每次点击都会写入文件并更新时间；成功后显示自动消失的提示。首次为新布局选择保存路径；之后覆盖同一文件。导入布局则优先写回来源文件 |
| Reset layout | 放弃当前示例布局的编辑并恢复初始位置 |
| Token placement and movement | 模拟 Nemesis token / Terror token；拖动 token 调整 Anchor 位置，拖动边或角调整 token 尺寸，方向键微调位置；Save layout 保存调整结果 |

## 准备交给游戏使用

1. 选用最终会放进游戏的棋盘图片；图片比例或版本变化后，需要重新校对布局。
2. 给每个可操作格画一个 Region，并为每个 Region 创建一个对应 Anchor。确认每个 Anchor 的 **Bound region** 正确，并调整 token 矩形大小。没有一对一配对时，编辑器会显示红色提醒，但仍允许保存和导出。
3. 保存或导出 JSON，并把图片和布局一起登记为 UI 配置。游戏界面读取 Region 来定位点击/高亮，并通过 Anchor 的 `regionId` 找到 token 的中心和矩形大小；具体规则、合法操作和标记移动仍由引擎状态决定。
4. The Terror in Brass 当前示例坐标仅供起步和校准，正式使用前要对照实际棋盘图片检查每一个格子。

## 旧 JSON 的导入

编辑器仍可导入 schema version 1。缺少 `regionId` 的旧 Anchor 会尝试按其中心点所在的最小 Region 自动配对；缺少 token 尺寸时会使用 4% × 4%。如果无法推断、出现重复配对，或某个 Region 没有 Anchor，编辑器会保留文件并显示红色校验提醒；提醒不会阻止保存或导出。导出会统一使用 schema version 2。

编辑器只负责制作显示与操作位置，不会修改游戏规则或 `GameState`。
