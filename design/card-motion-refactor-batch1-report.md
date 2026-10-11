# 卡牌区域动效重构：批次 1 报告

日期：2026-10-10  
范围：引擎牌副身份、移动事实、旧存档补建与移动记录核对。没有改 UI 动画或卡牌规则。

## 交付内容

- 新增 `aeons-end-engine/src/engine/card-movement.ts`：统一的区域存取、跨区域移动、创建、销毁、临时展示、揭示、洗牌/重排记录，以及 `withCardMoveTransaction()` 动作包装器。
- 在 `types.ts` 中增加类型化移动事实。事实带事务 ID、移动 ID、牌副 ID、卡牌 ID、区域与持有者、区域顺序、动作顺序和规则原因；记录仅由包装器暂存并返回，不写进 `GameState` 存档。
- 为 Hand、Discard、Played、Swap、Develop、玩家场上牌、被销毁的牌补充并行牌副 ID；Breaches 的预备法术和附着 Relic 也保留牌副 ID。旧存档在第一次读取这些区域时补建 ID。Trinket 旧存档会尽可能沿用已有的所属牌副记录；旧存档若有多张同名 Trinket 且缺少位置记录，无法还原当时究竟是哪一张，系统会按区域访问顺序分配。
- 将常见牌路迁移到同一移动工具：玩家牌区之间移动、抽牌、弃牌、打牌、准备/取回法术、Swap、Develop、获得卡牌、Trinket/Corruption/专属牌堆、Conjure、Nemesis 抽牌/弃牌/返回，以及 Strike 的抽取和归还。Supply 仍按堆数量表示，新获得的卡牌在实际进入牌区时创建牌副身份。
- 删除了不再使用、会单独改 Hand 或 Breach 数组的旧帮助函数，降低绕过牌副身份记录的机会。
- 新增 `src/tests/card-movement.test.ts`，覆盖同名牌身份、跨玩家放牌、牌库顶/底、Develop 创建与离开、恢复快照、旧存档补建，以及 Strike 暂时离开后按原身份归还。

## 记录覆盖边界

- 本批只提供引擎事实和动作包装器；`withCardMoveTransaction()` 由调用方包住一次规则动作后返回事实与核对结果。当前 UI 和自动阶段还没有统一接入这个包装器，所以屏幕上的旧动效仍照常运行，事实也还没有交给 UI。这是批次 2 的接入工作。
- `return_source_corruption` 目前没有卡牌资料在使用，但保留的旧效果分支仍调用 `returnCorruptionToBottom()`，它没有从明确来源区域移动指定牌副。若未来启用此效果，需先把它改为带来源区域和牌副 ID 的移动。
- 游戏初始化会在实例 ID 初始化前加入开局卡牌；初始化结束后统一为所有牌区分配 ID。这属于建局，不产生可播放的动作事实。
- 牌堆洗牌会保留 ID 并产生洗牌事实；隐藏牌堆内部洗牌不要求 UI 逐张播放。

## 检查结果

- `aeons-end-engine`：`npm test` 通过。包含 TypeScript 检查、新增牌副身份用例和仓库现有引擎测试。
- 未运行 UI、Playwright 或桌面目视测试；本批没有改 UI。
- 批次 0 的两个未跟踪文件仍保留：`aeons-end-ui/tests/card-motion-batch0.spec.ts` 和 `design/card-motion-refactor-batch0-report.md`。

## 下一步

批次 2 需要在 UI 的统一动作入口中调用引擎包装器，先迁移 Hand → Discard（包括 Woven Sky、其他效果弃牌、Nemesis To Discard 和弃牌阶段），再迁移 Hand → Deck。必须继续用逐帧浏览器检查到达前的弃牌数量和顶牌，并确认每张牌只被一个动效流程领取。
