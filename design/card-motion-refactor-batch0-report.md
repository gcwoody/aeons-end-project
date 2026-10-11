# 卡牌区域动效重构：批次 0 基线报告

日期：2026-10-10  
基线提交：`2b2fcb8` (`1010`)  
范围：路线盘点、复现/诊断、接口决定；未修改游戏规则或动画实现。

## 项目上下文

当前项目是两名不同 Mage 对抗一名 Nemesis 的数字版。`aeons-end-engine/` 以纯 TypeScript 原地修改一个 `GameState`；`aeons-end-ui/` 直接读取引擎状态并用 Vue `reactive()` 展示。规则去向和顺序由引擎决定，UI 负责可见投影和交互。UI 字符串为英文；正式 UI 行为规范仍在 `ui/ui-guide.md`。

批次 0 不调整规则或动画代码。所有已观察到的移动由前后状态、组件 DOM 标记或专用 flight snapshot 推断；尚无统一引擎移动事实、事务 ID 或跨区域副本身份。

## 当前可见移动路线与所有者

| 动作链 | 引擎规则入口/来源 | 当前 UI 入口与动效所有者 | 基线风险/迁移归属 |
| --- | --- | --- | --- |
| Deck → Hand（回合补牌、效果抽牌） | `drawCardsForPlayer`、`resolveDrawPhase`、效果解释器；循环补牌在 `engine/zones.ts` | `beforeAction` / `finishAction` 或自动路径 `trackAutomaticCardTransfers`；Hand 自己做行式重排 | 隐藏牌堆的洗牌/循环不逐张飞行；可见抽牌目标需登记。批次 3c。 |
| Hand → Played（打 Gem/Relic、Play All Gems） | `playCard`、`resolvePendingDecision`、效果解释器 | `pendingPlayCardFlight`、`handPlayPresentation`；`captureCardZoneMotion`/`finishAction` 与手牌飞行/FLIP 共同参与 | 跨 `pendingDecision` 先保留手牌展示，效果完成后才释放。完整打牌链归一个事务。批次 3a。 |
| Hand → Swap → Discard（交换） | typed effect 的 Swap 处理与 `resolvePendingDecision`；之后旧 Swap 卡进入玩家弃牌堆 | 通用区域快照、`PlayerZoneArea` 的 `data-card-motion-after-zones="swap"`、held-card 覆盖、`queueCardZoneMotion` / `queueCardZoneTransfers` | 现有代码已有先入后出和重复牌回归；两个移动必须同一链串行，不能由新旧系统分领。批次 3a。 |
| Hand → Discard（效果弃牌、批量选择、Nemesis To Discard） | `resolvePendingDecision`、`resolveEffects`；Woven Sky 走 `discardNemesisPower` → `pendingNemesisDiscard` → `finishNemesisDiscard` | 常规效果使用 `captureHandZoneTransfers`、`handDiscardPresentation` 和 `queueCardZoneTransfers`；Nemesis 选择是 `pendingNemesisDiscard` 独立路径 | Woven Sky 已确认三张选择最后一起改规则状态；UI staging 仅按 `pendingEffect.awaiting.kind` 建立，Nemesis 路径可能提前显示最终数量/顶牌。批次 2。 |
| Hand → 自己/盟友 Deck 顶 | 决策解析器中的放置效果 | `captureHandZoneTransfers`、专用 hand-to-deck flight、牌堆显示覆盖 | 目标顶牌/数量要等落地；手牌收拢须与飞行同步。批次 2。 |
| Hand → Breach（预备 Spell） | `prepSpell` | `pendingAttachCardFlight` 专用飞行；通用牌区快照也可能观察到变化 | 专用附着路径和通用路径需归并为单一所有者。批次 3a。 |
| Breach → Played/Discard/Hand/Swap（施法、移出预备法术、效果转移） | `castSpell`、`activatePreppedSpellAction`、效果解释器 | Breach DOM 锚点、`captureCardZoneMotion`；部分效果落在 `captureHandZoneTransfers` | Breach 中预备牌有 instance ID；玩家其他区域尚未统一身份。批次 3a/3c。 |
| Played → Discard（结束回合弃牌阶段） | `resolveDrawPhase` 与回合流程 | `moveDiscardPhaseCard` 逐张直接修改 `discardRemaining` 并调用专用 flight；自动弃牌可能走 `trackAutomaticCardTransfers` | 目前与通用快照队列并存。Hand→Discard 链完整切换时须包括弃牌阶段。批次 2。 |
| Supply → Develop → Discard | `developCardFromSupply`、`developCardFromZone` | Supply 市场快照、`captureCardZoneMotion`；Supply/Develop/Discard 的 DOM 区域属性；行式 FLIP | 已有“同帧让位”用例；开发卡牌的进入、再次 Develop 离开应同属一条投影链。批次 3b。 |
| Supply → 玩家 Hand/Deck/Discard（购买、效果获得） | `buyCard`、`gainCard` 及 gain placement 决策 | `captureMarketPileTransfers`、通用转移队列、`pendingGainPlacementFlight` | Supply 堆的减少与落点显示需要逐次提交；gain 的实体是新建，不应伪装为现有物理卡搬运。批次 3b。 |
| Corruption deck → 玩家牌区 | Crooked Mask 的专属效果/决策 | `captureCorruptionCardTransfers`，`NemesisSpecificPile` 的 corruption 源锚点，通用转移队列 | 目前只有 Crooked Mask 明确提供 source flight anchor；其他专属牌堆须逐一盘点。批次 3c。 |
| Mage/Nemesis 专属堆、Trinket → 玩家牌区 | `buySpecificPileCard`、`gainFirethornTopCard`、Trinket 效果等；`engine.ts`、`effect-resolution.ts`、`decision-resolution.ts` | 大多没有与市场/Corruption 对应的通用来源快照；特效或直接更新 | 来源和实例身份需登记，不能假设 Corruption 路径覆盖所有专属牌堆。批次 3c。 |
| Nemesis deck → Play Area / Play Area → Discard | `advanceNemesisTurn` 和 `nemesis-turn.ts` 的抽牌、弃牌处理 | `pendingNemesisDrawFlight` 专用翻面/揭示流程，Nemesis play/discard 展示 | 计划明确首轮不重写 Nemesis 抽牌翻面；新事务需等待/取消既有 reveal flight。批次 3c 的协调范围。 |
| Deck → 临时 Conjure 展示 → Breach 或 Deck 顶 | Conjure reveal/decision 效果 | 临时手牌展示、专用 Conjure/Skip 回 Deck flight | 展示对象不是 `player.hand`，不增加真实 Hand 数/气泡；作为 reveal/temporary，不伪装实体移动。批次 3c。 |
| Discard → Hand（Recall 等）、牌区间销毁/移出、牌堆重排 | `activateRecall`、`destroyCard`、效果解释器、牌组 helper | 部分走 hand transfer 或通用 DOM 差分，其余直接展示最终状态 | 必须按真实可见来源补齐登记；隐藏牌堆内部洗牌不要求飞行，公开区重排另记为 reorder/destroy。批次 3c。 |

### 当前代码中发现的动效入口

- 用户动作通常包在 `beforeAction()` → 同步引擎调用 → `finishAction()` 中；前者同时采集卡区 DOM snapshot、手牌转移、Corruption 与 Market 快照。
- 规则自动推进走 `trackAutomaticCardTransfers()`，再次采集同类快照并排队；Nemesis discard phase、Nemesis reveal、Conjure、Attach、Gain placement 和待决策打牌仍有专用状态/飞行。
- `card-flight.ts` 的 `resolveCardZoneTransfers()` 按卡牌 ID 数量差配对；`resolveCardZoneMotion()` 按区域 DOM 增减、数量和视觉 key 推断移动。相同卡牌副本没有贯穿规则和动画的共同 ID。
- 计时分别在通用 `animateCardFlight`、Deck 翻面 `animateCardFlightToPlayerDeck` 与专用 Hand/Swap/Discard Phase 路径读取，当前没有穷尽的 intent 表和统一完成解析器。
- DOM 区域/接收关系主要在 `HandCardRow.vue`、`PlayerZoneArea.vue`、`PlayerHandArea.vue`、`PlayerBreachArea.vue`、`MarketPanel.vue`、`CardSelectionPanel.vue`；Crooked Mask 是当前 Nemesis 专属牌堆 flight source 示例。

## 批次 0 逐帧基线用例

新增 `aeons-end-ui/tests/card-motion-batch0.spec.ts`：在干净开局后用 Debug Tools 固定 Woven Sky 状态，建立 `requestAnimationFrame` 采样，记录每帧 Discard 数量/顶牌、手牌卡片与位置、Played/Swap 数量、飞行 clone、clone 的实际 Animation duration 和 shield；JSON 时间线作为 Playwright attachment。测试断言弃牌计数经历 `[D, D+1, D+2, D+3]`。expected-failure 标记只在夹具、采样和动画收尾断言通过后设置，使既知逐张计数回归以“预期失败”状态留在 suite 中；若该断言通过则作为意外通过报告。最终需检查 attachment 的首帧/飞行中/每次落地。

现有逐帧/中间态覆盖可复用为批次 0 诊断基线：

- `tests/damage-feedback.spec.ts`：决策中的 Gem/Relic 保留在手牌、Swap 两段飞行和旧弃牌堆状态、相同卡副本保持、专用时长 token、Hand→Deck 计数不提前、Supply 获卡、弃牌阶段等。
- `tests/develop-zone.spec.ts`：`Develop cards make room in the same frame as a new card arrives` 采样 Develop 卡位置，检查卡牌进入与行式让位。
- `tests/nemesis-layout.spec.ts`：Woven Sky To Discard 候选和规则选择已有覆盖；当前没有逐张弃牌计数/顶牌时间线。

当前 UI/引擎没有 motion transaction ID，因此本批的 JSON 是**按帧视觉诊断**，不能给旧移动伪造身份。批次 1 的事件记录接口应增加可核对的 transaction/move/entity ID，并由测试附件同时记录引擎事件、展示投影和飞行 clone。

## 冻结给后续批次的接口决定

1. **规则事件与身份**：动作记录器输出非持久化的判别联合类型：`move`、`create/gain`、`destroy`、`reorder/shuffle`、`reveal/temporary`。所有动作共享 `transactionId`；每个有实体的事实有唯一 `moveId`、`instanceId`、`cardId`、动作内 `sequence`、规则 `reason`、来源/目标 `zoneId` 与 owner、来源/目标 index。创建/销毁/展示事件分别表达，不冒充 move。事件不写进存档，不带像素/CSS 信息。尽可能沿用 `card-instances.ts` 既有 ID allocator 和 zone helpers；新进入游戏的 Supply card 在实际获得时分配实例 ID。
2. **事务边界**：每个 `beforeAction`/`finishAction` 用户动作是单一展示事务；自动阶段和 Nemesis 推进各建独立事务。打牌跨 `pendingDecision` 时保留原事务和 Hand 展示，待决策及其效果结束、真实去向已知后才释放；嵌套效果并入其触发事务。连续 Swap 入/出和同一决策产生的多张弃牌分别是同一有序事务链，不能拆给两个协调器。
3. **旧/新负责人**：批次 2 将 hand-discard、Woven Sky、手牌放牌库顶和 Discard Phase 作为一个 hand-zone 完整链，关闭这些移动的 `captureHandZoneTransfers`/专用弃牌领取；批次 3a 迁移 Hand→Played/Swap、Swap→Discard、Breach 及等待决策打牌，关闭对应 DOM snapshot/held overrides；批次 3b 迁移 Supply→Develop→Discard 与 Supply gain，关闭 market/count diff；批次 3c 登记 Corruption、Mage/Nemesis 专属牌堆、Trinket、Conjure 及其他剩余路径。每个动作链迁移后，旧路径只能处理不与之共享展示区/实体的其他动作。
4. **旧存档和清理**：实体 ID 与规则 `GameState` 同步持久化在可见 card zone 的并行 ID 列表中；旧存档在访问区域时依现有 `ensureCardInstanceZone()` 惰性补建，隐藏牌堆无法恢复的旧顺序视未知，公开区保持公开状态。撤销恢复引擎快照后，由同一个 coordinator 清除打开事务、clone、隐藏真卡、占位、区域覆盖和 FLIP，并从恢复后的 GameState 重建投影；载入存档、视角隐藏/切换、取消 flight 和组件卸载也复用此清理入口。存档不恢复中途动画。
5. **MotionIntent**：使用穷尽的 typed map，为 hand→played、hand→swap、swap→discard、hand→discard、discard-phase、hand→deck-top、普通 supply/specific-pile flight、row reflow、Nemesis reveal、reveal/temporary 等当前已知意图逐项列出 token、easing、翻面与 row/stack 策略。普通和 Deck 翻面 flight 共用 token 解析器及完成信号；未知意图在开发/测试失败，生产按最终规则状态结清投影，不静默回落到 `standard`。缺失可见锚点在开发/测试报事务诊断；生产同步最终投影并关闭，不补播。

**规范核对项**：计划与 `ui/ui-guide.md` 均规定 Control Bar Hand 数字读取真实 `hand.length`。目前 `PlayerArea.vue` 的 `handCount` 还会在 `handPlayPresentation` 存在时加 1。批次 0 不调整这处行为；后续应按正式 UI 规范使显示语义服从真实 hand 状态，避免临时展示被计入真实数量。

## 执行结果与未完成证据

- 批次 0 代码改动仅增加 Woven Sky 逐帧基线测试；另新增本报告。引擎、生产 UI 和动效代码均未改。
- 开始时工作树干净，HEAD 为 `2b2fcb8`。没有覆盖或清理用户提交。
- `npx playwright test --config=playwright.batch0.config.ts --list tests/card-motion-batch0.spec.ts` 通过，确认 Playwright 能发现该测试。实际执行无法启动：默认 5173 端口已被来源不明的服务占用，因此没有复用；独立 5187 端口在沙箱及一次受控提升重试中均返回 `listen EACCES: permission denied 127.0.0.1:5187`。更早的一次提升请求未在自动权限审查截止前完成。没有实际浏览器时间线，不能宣称基线测试已稳定复现。
- 用户附加的 Chrome 确认 `http://localhost:5173/` 是 Aeon's End 页面。终端 Playwright 设置 `PLAYWRIGHT_REUSE_SERVER=true` 后仍无法探测该服务，于是尝试启动 Vite 并因 5173 已占用退出。这说明桌面 Chrome 与命令行测试进程的本地网络可见范围不同；失败发生在测试浏览器启动前，不是应用用例失败。
- 随后在独立的 Codex in-app browser 上手动重放 Woven Sky 路径，确认该隔离上下文没有现存存档；没有改动附加 Chrome 中的两个用户存档。弃牌堆起始数量 `D=1`，连续轮询得到 48 个样本，观察到的变化如下：

  | 点击后的约时刻 | Discard 数量 | 顶牌 | 飞行 clone 数 |
  | ---: | ---: | --- | ---: |
  | 11 ms | 1 | `moonstone_shard` | 0 |
  | 43 ms | 4 | `focusing_orb` | 0 |
  | 286 ms | 1 | `moonstone_shard` | 1 |
  | 890 ms | 4 | `focusing_orb` | 0 |

  其余样本也只出现数量 `1` 和 `4`，没有 `2`、`3`；最大同时飞行 clone 数为 1。也就是说最终三张弃牌在第一张飞行出现前已短暂预显，飞行期间又恢复成旧堆面，最后一次性切到最终值。这直接复现了 Woven Sky 的提前计数/顶牌显示缺陷，但这些是隔离页的 DOM 轮询点，不是命令行 Playwright attachment 的 rAF 时间线；实际 flight duration 仍待自动用例验证。
- 尚未执行新增 Playwright 测试本身、Swap/Develop/决策相关定向回归，也未做桌面目视检查。批次 0 的 Woven Sky 缺陷已由隔离浏览器重现；完整自动化验收仍待 Playwright 进程能访问本地服务后完成。

## 下一步执行顺序

1. 让命令行 Playwright 进程可访问现有 Vite 服务，运行 `tests/card-motion-batch0.spec.ts`，确认 attachment 中的 rAF 计数断言失败，并采集首帧和落地值/实际时长。
2. 运行现有 Swap、Develop、决策打牌及弃牌阶段的定向 Playwright 用例；保留通过用例作为基线门槛，不因批次 0 修复其表现。
3. 完成以上证据后，将该计划的批次 0 状态更新为已完成并审查路线表/五项接口决定，再开始批次 1 的引擎身份与移动事实接口。
