# 决策上下文重构计划

状态：Phase 0–5 已完成  
日期：2026-09-18

## 1. 目标与边界

本次重构的目标是把“谁可以点击决策”与“效果作用于谁”彻底分开。引擎中的决策应当是全局待处理状态：当前连接到游戏的任意玩家都可以提交有效答案，答案写入同一个 `GameState`，再由同步层广播给其他客户端。规则引擎不再把一个玩家标记为“决策控制者”。

本次不改变卡牌规则，也不实现联机传输层；只重构决策状态、效果上下文和 UI 显示所需的接口。具体效果目标（例如受伤玩家、弃牌玩家、法术拥有者）仍然必须保留玩家 ID。当前测试存档不需要继续支持，重构时可以直接删除旧存档和旧状态字段，不增加兼容迁移层。

## 2. 已确定的语义

| 当前字段/概念 | 当前问题 | 重构后的语义 |
| --- | --- | --- |
| `PendingDecision.playerId` | 同时被当作默认显示玩家和权限校验依据 | 删除；`PendingDecision` 表示全局决策，不携带点击权限 |
| `NemesisResolutionState.controllerPlayerId` | 把 Nemesis 效果人为绑定到 Player 1 | 删除；Nemesis 效果不需要“控制者” |
| `PendingEffectResolution.playerId` | 名称含义不明确，既像来源、又像决策人、又被当作默认玩家 | 改为明确的 `sourcePlayerId?: PlayerId`（或在实现阶段使用等价的显式 source context）；Nemesis 本身作为来源时允许为空 |
| `PendingEffectResolution.effectPlayerId` | 当前效果实际作用的 Mage/目标玩家 | 保留，并在需要时改成更明确的目标语义 |
| 候选项中的 `playerId` | 目标或卡牌所属玩家 | 保留，不能删除 |
| `reviewingTopCard.playerId` | 被查看牌堆所属玩家 | 保留，不能删除 |
| `PendingNemesisDiscard.playerId` | 支付 Power 卡 To Discard 费用的玩家 | 保留其业务语义；实现阶段可改名为 `payerPlayerId`，但不能当作通用决策权限 |
| `PendingSpellCast.playerId` | 被施放法术的拥有者/施放者 | 保留，属于效果业务数据 |

联机权限、重复提交、并发冲突和客户端身份校验属于网络/会话层，不写进 `GameState` 的规则语义中。本项目当前为单操控两个 Mage 的 demo，因此 UI 也不应假设只有某一个角色可以点击。

## 3. 分阶段计划

### Phase 0：盘点与规范（当前阶段）

1. 扫描 engine、nemesis 模块、UI 和测试中所有决策相关字段及调用点。
2. 按“决策权限 / 效果来源 / 效果目标 / 支付者 / 查看对象 / UI 默认显示”分类。
3. 记录旧状态中可能出现的字段，并明确旧存档直接删除，不设计迁移策略。
4. 输出审计文档和验收门槛。本阶段不修改运行时代码。

产物：`design/decision-context-phase0-audit.md`。

### Phase 1：类型与状态契约

1. 从 `PendingDecisionBase` 移除 `playerId`，同步更新 `PendingDecision` 的所有联合类型。
2. 将 `PendingEffectResolution.playerId` 改成明确的 `sourcePlayerId`（允许 Nemesis 来源为空），并保留目标字段。
3. 移除 `NemesisResolutionState.controllerPlayerId`。
4. 删除旧存档中已经废弃的状态；不增加旧 JSON 迁移逻辑。
5. 保证当前版本导出 JSON、自动存档和恢复流程使用新的状态契约。

门槛：TypeScript 构建通过；当前版本存档可加载；运行时不再生成 `PendingDecision.playerId`。

### Phase 2：引擎决策流

1. 重构 `createDecision`，不再接收或写入决策玩家 ID。
2. 删除 `resolvePendingDecision` 中针对 `decision.playerId` 的通用权限检查。
3. 将所有效果解析调用点改用明确的 source/target/payer 语义。
4. Nemesis 解析使用显式的效果来源与条件上下文；全局 Nemesis 条件不绑定 Mage，只有仍需解释 `self` 的旧卡牌效果才使用效果解析器的上下文回退。
5. 逐项核对 `self`、`any player`、`all players`、最低/最高生命值、预备法术、弃牌支付和牌堆查看效果，确保目标玩家 ID 来自效果候选，而不是“决策玩家”。

门槛：所有现有引擎测试通过；Bleed Static、Prince of Gluttons、Mage ability 和 Power/Attack 决策回归测试覆盖。

### Phase 3：UI 决策显示

1. 删除 UI 对 `decision.playerId` 的读取。
2. 牌堆/手牌/预备法术/裂隙显示所需的角色改由候选项、效果目标或查看对象决定。
3. 没有唯一目标时保持当前角色，不通过隐藏的“决策控制者”切换界面。
4. 保留全局决策弹窗，任何本地操控角色都可以提交答案；提交后等待共享状态更新。
5. 更新快捷键、卡牌高亮和决策弹窗的空状态文案。

门槛：桌面端所有决策类型均可打开、选择、确认和恢复；UI 不再依赖已删除字段。

### Phase 4：存档与未来联机边界

1. 删除旧版本测试存档和不再使用的旧状态字段，不维护旧版本 JSON 迁移。
2. 明确规则引擎返回“决策待处理”，由上层会话层负责身份、并发和广播。
3. 不引入新的单一 `decisionPlayerId` 替代字段；如未来需要审计提交者，放在网络事件/日志中，不放在规则状态中。

门槛：当前版本自动保存、导出导入和回放不改变卡牌结算结果。

### Phase 5：测试、文档与清理

1. 增加类型级、引擎级、UI 级回归测试。
2. 对所有 `playerId` 字段做最终语义审计，避免把目标字段误删。
3. 更新 `dev-guide.md` 和相关开发说明。
4. 删除兼容期临时代码和过时注释，完成构建与 E2E 验证。

完成记录（2026-09-18）：

- Engine：`cd aeons-end-engine; npm test` 通过（类型检查及 Stage 1、2、3、4、7、8）。
- UI：`cd aeons-end-ui; npm run build` 通过。
- E2E：使用当前源码启动独立 Vite 服务后，`npx playwright test --reporter=line` 的 47 个用例全部通过。
- 文档：`dev-guide.md` 已补充全局决策状态、来源/目标字段和未来联机边界约定。
- 旧存档：不再读取或迁移旧决策字段；测试存档按约定直接删除并从新状态开始。

## 4. 全局不变量

- 决策是否可点击，不由任何 Mage/Nemesis 的玩家 ID 决定。
- 所有效果目标仍然有可追踪的玩家/牌/裂隙 ID。
- Nemesis 来源可以没有 Mage `sourcePlayerId`。
- 一个 `unleash` 或效果帧暂停后恢复时，继续使用同一个显式效果上下文。
- 当前版本保存的状态不包含决策权限字段。
- UI 字符串保持英文，代码标识符保持英文。

## 5. 风险与回滚点

- `PendingEffectResolution.playerId` 使用范围广，必须先完成语义分类再批量重命名，不能机械替换。
- Nemesis 条件目前存在 Player 1 默认值；必须逐个确认条件需要的是来源、当前目标还是全局状态。
- 旧存档不在本次支持范围内；删除旧存档后，以新状态重新开始测试。
- 若任一阶段的测试失败，回滚该阶段改动，不回退用户已有的卡牌和 UI 功能。
