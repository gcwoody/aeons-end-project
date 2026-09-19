# 决策上下文重构 Phase 0 审计

日期：2026-09-18  
范围：`aeons-end-engine/src`、`aeons-end-ui/src`、现有引擎测试

## 1. 审计结论

当前代码确实把两种不同概念混在了一起：

1. `PendingDecision.playerId` 被当作“谁拥有弹窗操作权”，同时又被 UI 当作默认显示角色。
2. `PendingEffectResolution.playerId` 是一个混合字段：有时代表效果来源/当前 Mage，有时只是创建决策时的默认值。
3. Nemesis 回合状态中的 `controllerPlayerId` 把 Nemesis 效果默认绑定到第一个 Mage，并传入条件判断与决策创建。
4. 目标候选项、法术拥有者、支付 Power 卡费用的玩家和查看牌堆的玩家，则是有实际业务意义的 ID，不能因为删除“决策权限”而一并删除。

因此本次重构不是简单删除所有 `playerId`，而是删除“决策权限字段”，并把剩余 ID 按业务语义改名或保留。

## 2. 现有结构盘点

### 2.1 类型层

- `PendingDecisionBase` 位于 `aeons-end-engine/src/types.ts`，当前包含：`id`、`playerId`、`prompt`、`context`。`PendingDecision` 的所有联合类型都继承该基类。
- `PendingEffectResolution` 当前包含必填 `playerId`，以及可选的 `effectPlayerId`、`reviewingTopCard.playerId`、`pendingSpellCast.playerId` 等字段。
- `PendingNemesisDiscard.playerId` 表示支付 Nemesis Power 卡 To Discard 费用的玩家。
- `PendingSpellCast.playerId` 表示法术拥有者/施放者，不是弹窗权限。
- 多个卡牌候选结构（例如 `CardChoice`、`PreppedSpellChoice`、目标结构）包含 `playerId`，这些属于候选对象的所有权或效果目标。
- `NemesisResolutionState.controllerPlayerId` 是 Nemesis 回合的控制者字段；它不是游戏规则中的目标玩家。

### 2.2 Engine 决策创建与恢复

- `createDecision`（`aeons-end-engine/src/engine.ts`）当前签名接收 `playerId`，并把它写入新决策。
- 该 helper 在 Player/Mage 效果、Nemesis 主阶段确认、Nemesis 抽牌确认、牌堆查看、商店/Devoured pile、弃牌与破坏、预备法术、伤害目标等多个分支被调用；调用点数量较多，必须按语义迁移而不能直接删除参数后逐行猜测。
- `pauseEffect` 保存 `PendingEffectResolution` 和 `PendingDecision`，恢复时继续使用 `resolution` 中的字段。
- `resolvePendingDecision` 中存在两类不同的 ID 检查：
  - `pendingNemesisDiscard.playerId` 与当前支付流程匹配，这是业务支付者校验，应保留（后续可改名为 `payerPlayerId`）。
  - 通用分支约在 `engine.ts:3171` 对 `decision.playerId`、`resolution.playerId`、`effectPlayerId` 和 `reviewingTopCard.playerId` 做匹配，这是“决策权限”校验，应删除并交给上层会话层。
- Setup 期间 Prince of Gluttons 规则模块会通过 `createDecision` 创建选择 Devour pile 的决策，当前把 `game.players[0].id` 作为决策玩家；这只是历史默认值，不是目标。

### 2.3 Nemesis 回合

- `initializeNemesisTurn` 初始化 `controllerPlayerId` 为 `g.players[0]?.id`。
- `resolveNemesisCardEffects` 使用该字段：
  - 作为 `conditionMatches` 的玩家参数；
  - 作为效果解析 `PendingEffectResolution.playerId`；
  - 无法找到时返回 “No player is available to resolve the Nemesis effect”。
- `advanceNemesisTurn` 在 Nemesis 主阶段确认、抽牌确认和回合结束效果处读取 `controllerPlayerId`，并将其传给 `createDecision` 或 `resolveEffects`。
- 当前 Nemesis 规则中，`controllerPlayerId` 的存在主要是为了给暂停状态找一个默认 Mage，而不是表示实际效果目标。重构时必须为条件块和 `self` 效果分别提供明确上下文。

### 2.4 UI 读取点

- `aeons-end-ui/src/game/useGame.ts` 的 `boardCardSelections`、`soleDecisionDisplayPlayerId` 使用 `pendingEffect.effectPlayerId`、`pendingNemesisDiscard.playerId` 后回退到 `decision.playerId`。
- `aeons-end-ui/src/components/CardDecisionModal.vue` 在“查看牌堆顶牌”文案中使用 `reviewingTopCard.playerId ?? decision.playerId`。
- `aeons-end-ui/src/components/PlayerArea.vue` 使用 `pending.playerId` 和 `decision.playerId` 推断施法者/伤害预览角色。
- 这些回退必须改为：候选项中的目标 ID、`reviewingTopCard.playerId`、法术拥有者/来源 ID，或在确实没有唯一角色时不切换当前 UI 角色。

### 2.5 测试读取点

- `aeons-end-engine/src/tests/stage2.test.ts`、`stage3.test.ts`、`stage4.test.ts`、`stage7.test.ts`、`stage8.test.ts` 覆盖了 Nemesis 确认、To Discard、牌堆查看、Mage ability、法术和跨玩家目标等暂停/恢复流程。
- `stage7.test.ts` 目前有一处直接断言 `pendingDecision.playerId`（Kadir 返回弃牌法术的流程）。这不是规则结果断言，Phase 1 应移除或改为断言候选项/效果目标的玩家 ID。
- 其余测试主要通过 `pendingDecision.kind`、候选项和结算后的 `GameState` 验证行为，重构后应保持这些断言不变，并额外增加“任意调用者都能提交同一全局决策”的回归覆盖。

## 3. 语义分类矩阵

| 字段/使用方式 | 分类 | 处理决定 |
| --- | --- | --- |
| `PendingDecision.playerId` | 决策权限/默认 UI 角色 | Phase 1 删除 |
| `createDecision(..., playerId, ...)` | 决策权限参数 | 改成无权限参数的 helper；调用点显式传 source/target 到 details 或 resolution |
| `controllerPlayerId` | Nemesis 默认路由 | 删除；条件和效果使用显式上下文 |
| `PendingEffectResolution.playerId` | 混合的来源/默认决策玩家 | 改为 `sourcePlayerId?: PlayerId` 或等价 source context |
| `effectPlayerId` | 当前效果目标/施放对象 | 保留；必要时重命名为明确的 target/caster 字段 |
| `CardChoice.playerId` 等候选 ID | 卡牌所属/选择目标 | 保留 |
| `reviewingTopCard.playerId` | 查看牌堆所属玩家 | 保留 |
| `PendingNemesisDiscard.playerId` | Power 卡费用支付者 | 保留业务语义，避免作为通用权限 |
| `PendingSpellCast.playerId` | 法术拥有者/施放者 | 保留 |
| `conditionMatches(playerId, ...)` | 条件判断上下文 | 逐个调用点重审，禁止隐式回退 Player 1 |

## 4. 关键风险清单

1. **隐式来源风险**：`effectPlayerId(resolution)` 当前会回退到 `resolution.playerId`。重命名后仍需保留明确的 source/target fallback 规则，否则 `self`、充能、以太和卡牌筛选可能作用到错误的 Mage。
2. **Nemesis 条件风险**：现有 `conditionMatches` 会接收 `controllerPlayerId`。Nemesis 卡牌未来如果使用玩家条件，必须明确是来源、当前目标、所有玩家还是全局条件。
3. **UI 默认角色风险**：删除 `decision.playerId` 后，牌堆查看和预备法术预览不能通过任意第一个玩家补齐；应只在数据明确指向唯一玩家时切换。
4. **存档策略**：当前测试存档不在兼容范围内。重构时直接删除旧存档，新的保存数据只使用新状态契约，不增加迁移代码。
5. **并发边界风险**：引擎删除权限校验后，未来联机层必须保证一次决策只接受一个有效答案并广播结果；该逻辑不应回填到 `GameState` 的 `decisionPlayerId`。

## 5. Phase 0 完成标准

- 计划文档已写入 `design/decision-context-refactor-plan.md`。
- 本审计文档覆盖 engine、Nemesis、UI 和存档风险。
- 已区分必须删除的权限 ID 与必须保留的业务目标 ID。
- 本阶段没有修改运行时代码；下一阶段开始前先以本矩阵作为类型重构检查表。

## 6. 重构前基线

已在 `aeons-end-engine` 执行 `npm test`：TypeScript 类型检查通过，Stage 1/2/3/4/7/8 引擎回归测试全部通过。该结果作为后续每个阶段的对照基线。旧存档兼容不属于本次验收范围。
