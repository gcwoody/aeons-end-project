# 项目交接快照

更新时间：2026-10-18

## 当前项目

这是两名不同 Mage 对抗一名 Nemesis 的本地网页游戏。`aeons-end-engine/` 负责规则和游戏状态，`aeons-end-ui/` 负责显示棋盘、收集操作和保存本地进度。改动前以 `AGENTS.md`、开发指南和当前代码为准；跨对话摘要不代替代码检查。

The Terror in Brass 已接入 Nemesis 选择、卡牌、Regeneration 专属牌堆、双面 sub board、token 状态与操作、格子效果、易伤伤害规则及九张 Tier 卡。用户提供的 Normal / Increased difficulty 布局 JSON 位于 `aeons-end-ui/src/game/sub-board-layouts/the-terror-in-brass/`。引擎和 UI 类型检查、UI 生产构建通过；仍待真实对局验收。

## 卡牌动效结构

卡牌动效重构后的结构说明已整理到 [UI 开发指南](ui/ui-guide.md) 的“卡牌动效结构”部分。引擎记录实体卡的起点、终点和顺序；`useGame.ts` 协调游戏操作，飞行规则、动画队列、临时画面和等待逻辑分别由 `aeons-end-ui/src/game/` 下的模块承担。不要再引用已清理的分阶段计划或报告；当前实现以代码和 UI 开发指南为准。

## E2E 回归基线

原有 Playwright 回归基线保留 184 个用例，来源于此前完整运行中通过的 184 项；原运行共 201 项，其中 17 项失败用例已移除。基线来源和最近的并行复跑记录见 [E2E 基线记录](aeons-end-ui/tests/E2E_BASELINE.md)。最近的 2-worker 和 4-worker 全量运行都各有两项失败，且失败项不一致；Worldshift 高亮用例在单独复核时仍失败，后续遇到相关反馈时应先检查具体错误和画面，不要仅凭失败数判断回归。

## 本次完成：摧毁动效与顺序

- Ctrl+Z 上限为 50 次，帮助文字与存档恢复同步；撤销会中断当前飞行及尚未播放的后续移动。
- Destroy 接入共享卡牌移动队列，实际摧毁的实体从真实来源区域逐张飞向右下角垃圾桶，到达后更新数量。选择窗口中的卡牌只作展示，不能作为飞行起点；返回 Swap 或 Corruption deck 等替代去向仍按引擎记录处理。主要模块是 `card-destroy-motion.ts`、`card-motion-capture.ts`、`card-zone-motion.ts` 和 `card-pile-motion-display.ts`，Gallery 的 `Hand.Motion` 提供演示。
- Gather Darkness 通过共享 `shuffle_discard_into_deck`、`destroy_top_cards` 的动效等待：弃牌堆整摞平移翻面到牌库，再逐张摧毁四张，最后 Unleash twice；空堆不产生无用等待。
- Nemesis 换行后按新到达的顺序放在右侧。`placedAt` 保留实体身份，`displayOrder` 记录显示顺序；棋盘与 Main Phase 共用 `nemesis-card-order.ts` 排序。
- 本次新增 11 项摧毁/撤销浏览器检查，连同相关旧用例共 21 项在独立端口以 2 workers 通过；引擎移动、Stage 2、Crooked Mask 和 Oracle 专项通过，引擎/UI 类型检查与 UI 构建通过。未宣称全套回归通过：完整引擎测试仍会在旧的市场牌数量断言（预期 62，实际 64）处停止。

## 最近反馈修正

- Servant of Brass 移除 Armor Chart token 时按真实 token 所在区域提供橙色子棋盘选择，并复用居中提示组件；选择提示不会挡住棋盘点击。
- Tourmaline Shard 的可行性检查与结算都明确检查/选择 ally 的手牌；不可摧毁卡不会被误判为有效选项。
- 临时为跨玩家决策切换棋盘后，自动回到当前回合 Mage；Nemesis 回合则回到切换前玩家。玩家手动切换视角会保留手动选择。
- Frostfire Maelstrom 的 Pulse 数量选择复用 Gallery 使用的居中提示组件。

## 工作树保护

当前工作树包含未提交的引擎、UI、测试、动效模块和截图修改。开始工作前先看 `git status --short`；不要使用会清除或覆盖现有修改的 reset、clean 或批量覆盖操作。新增的卡牌或 Mage 规则仍需读对应 `documents/` 资料，并检查匹配的引擎数据和测试。
