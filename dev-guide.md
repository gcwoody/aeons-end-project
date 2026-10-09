# 开发者指南

这是规则与数据开发的主要入口。先读 [README.md](README.md) 了解项目范围；改动前按工作内容再读本指南或 [UI 开发指南](ui/ui-guide.md)。

更新时间：2026-10-07

## 先记住这些

1. `aeons-end-engine/` 是共享的纯 TypeScript 规则引擎；它原地修改一个 `GameState`。
2. `aeons-end-ui/` 通过 `@engine` 使用引擎。Vue 组件只显示状态、收集输入和调用引擎，不复制游戏规则。
3. 卡牌与角色用类型化数据描述效果；遇到玩家选择时由引擎创建可保存、可恢复的决策状态。
4. 优先组合已有规则、决策和 UI 组件。确有新规则时，添加可复用的通用类型，不要在公共流程里按单张卡牌 ID 写特例。

## 项目结构

```text
aeons-end-engine/src/data/wave*/  按 Wave 和内容类型组织的 Mage、卡牌与牌堆资料
aeons-end-engine/src/engine/      按职责拆分的共享规则模块
aeons-end-engine/src/nemesis/     Nemesis 专属 setup、触发和回合规则
aeons-end-engine/src/engine.ts    引擎对外入口和玩家/阶段操作 API
aeons-end-ui/src/game/            响应式状态、阶段协调、存档和撤销
aeons-end-ui/src/components/      Vue 展示与交互组件
aeons-end-ui/src/styles/          按职责拆分的 CSS
aeons-end-ui/tests/               Playwright 浏览器测试
scripts/generate-image-imports.mjs 根据已注册数据生成图片导入映射
```

Wave 数据由各自的 `index.ts` 汇总，再通过引擎数据注册表提供给游戏。新增或重命名图片后运行 `cd aeons-end-ui; npm run generate:images`；不要手动编辑生成的 `src/generated-image-imports.ts`。

### 按改动找文件

| 工作 | 主要位置 |
| --- | --- |
| 卡牌、Mage、Nemesis 数据 | `src/data/wave*/cards/`、`mages/`、`nemeses/` |
| Wave 专属牌堆 | `src/data/wave*/special-decks/` |
| Wave 注册和重复 ID 检查 | `src/data/wave*/index.ts`、`src/data/catalog.ts`、`src/data.ts` |
| 效果与决策类型 | `src/types.ts` |
| 牌库、弃牌和 Reveal 补牌 | `src/engine/decks.ts` |
| Breach 方向与费用 | `src/engine/breaches.ts` |
| 目标、伤害和状态 | `src/engine/targets.ts`、`combat.ts`、`player-state.ts` |
| 对局初始化与 Nemesis 回合 | `src/engine/game-setup.ts`、`nemesis-turn.ts`、`src/nemesis/` |
| 卡牌实体及揭示记忆 | `src/engine/card-instances.ts`、`src/engine/decks.ts` |
| 通用生命与 Charge 反馈事件 | `src/engine/health-feedback.ts`、`charge-feedback.ts` |
| 效果运行与决策恢复 | `src/engine/effect-resolution.ts`、`decision-resolution.ts` |
| 前端阶段与操作协调 | `aeons-end-ui/src/game/useGame.ts` |
| 前端存档和撤销辅助逻辑 | `aeons-end-ui/src/game/game-persistence.ts` |
| UI 组件、CSS 与 Gallery | `aeons-end-ui/src/components/`、`src/styles/`、`UiGallery.vue` |
| 规则和浏览器回归 | `aeons-end-engine/src/tests/`、`aeons-end-ui/tests/` |

## 效果来源与卡牌归属

执行卡牌效果时，必须分清“谁在执行效果”和“卡牌属于谁”。**持有卡牌的 Mage 不会自动成为效果来源。** 这决定 `you/your` 与 `ally` 的含义，也决定目标是谁；卡牌归属则决定实体卡从哪里移动、最后进入谁的牌区。

| 概念 | 字段/依据 | 作用 |
| --- | --- | --- |
| 效果行动者 | `sourcePlayerId` | 卡面中的 `you/your` 和 `ally` 的参照；`ally` 排除此玩家。由触发或发起效果的 Mage 决定，不从 UI 视角推导。 |
| 来源卡持有者 | `sourceCardOwnerId` | 找到、移动来源卡或访问其专属牌区；不决定 `you` 或 `ally`。 |
| 当前效果目标 | `effectPlayerId` | 已选定的玩家目标或当前处理对象。改变它不能改写效果行动者。 |
| 法术所有者与施法者 | `PendingSpellCast.playerId` / `casterPlayerId` | 法术效果按施法者结算；法术离开 Breach 后按所有者放回相应牌区。 |

常见情况：

- A 施放 B Breach 上的法术：法术的伤害、抽牌和 `ally` 选择以 A 为准；法术离开 Breach 后属于 B，并进入 B 的弃牌堆。
- A 触发 B 弃牌堆中卡牌的 Recall：Recall 效果以 A 为准，Recall 卡仍属于 B。
- 法术触发其 Breach 上附着 Relic：Relic 的 `any ally` 相对施法者计算；附着物仍归该 Breach 管理。
- 嵌套的 `On Play`、`On Gain` 或其他卡牌触发块，必须明确保存触发者、来源卡和持有者；子效果结束后恢复外层上下文。
- 只有数据明确声明 `effectPlayerScope: 'owner'` 时，才由来源卡持有者执行该效果块。

新增或续接嵌套卡牌触发时，使用引擎的上下文封装流程，不要把子块效果裸追加到外层队列。选中 ally 后可以把 `effectPlayerId` 指向该目标以处理其牌区，但仍以稳定的 `sourcePlayerId` 判断后续的 `ally`。改动后重点测试效果目标、来源卡归属、决策暂停/恢复以及最终卡牌所在区域。

## 可组合的规则

卡牌效果块描述触发时机、条件和效果顺序；共享效果解释器负责执行。需要选择、确认或暂停时，状态保存在 `pendingDecision` / `pendingEffect`，由 `resolvePendingDecision()` 校验选择并续接执行。

常见的可复用规则包括资源与生命、抽牌/弃牌/摧毁/获得卡牌、施法、Breach focus/open、Recall、Develop、Attach、Turn Order 操作、Nemesis unleash 和敌方单位伤害。新增卡牌前先检查 `CardEffect`、trigger、condition 和 decision 类型；不能表达时才扩展通用模型。

- **施法生命周期：** 执行法术的 Cast 效果后，法术通常进入弃牌堆；只有效果明确要求保留或转移时才改变去向。卡面注明 “without discarding” 就是明确例外。
- **Nemesis Power 的 To Discard：** 除非卡面明确允许其他玩家支付，费用和代价由启动该行动的 Mage 承担。费用校验不能用其他玩家的牌或资源满足。
- To Discard 代价上的后续抽牌（如 `drawAfter`）必须在同一轮引擎结算中完成，再把状态交给 UI 检查 Main Phase 是否可自动结束。
- **Additional damage：** 额外伤害应作为原伤害实例的修正处理，不能误算成第二次独立伤害。
- **伤害与治疗反馈：** 通用伤害/治疗结算函数按每次实际效果写入 `GameState.healthChangeEvents`，前端 `DamageFeedbackLayer` 按目标和数值显示气泡。新增效果必须复用这些结算函数；不要按卡牌 ID、触发来源或调用入口单独补气泡。
- **动画与流程：** 如果动作会启动卡牌转移、Breach 旋转/翻开或 Nemesis 抽牌展示，阶段推进和自动结束必须等对应动画完成。批量动画期间要阻止重复输入；动画时间不能让引擎跳过尚未完成的决策或效果。

### Reveal 牌库的通用规则

Reveal 玩家牌库顶前 N 张时，先调用 `aeons-end-engine/src/engine/decks.ts` 的共享补牌逻辑。牌库不够时，把整个弃牌堆翻过来、不洗牌，接在剩余牌库之后并清空弃牌堆，再继续 Reveal；合计仍不足 N 张时就展示所有现有牌。

Reveal Turn Order deck 时也使用共享补牌逻辑，但先洗混 Turn Order discard，再放回牌库；牌库循环时同步推进新一轮。不要在单张卡牌中另写补牌规则，也不要在补牌前直接读取牌库顶。

### 卡牌实例与已知状态

- 卡牌定义只保存固定资料。运行时“玩家见过这张牌”的记忆保存在 `GameState.cardInstanceStates`，以稳定的实体实例 ID 索引；不要把它写到共享的 `CardDef` 上，也不要只记录牌堆槽位。
- 牌离开已追踪牌堆、进入公开区域或返回其他牌堆时，使用 `engine/card-instances.ts` 的实例移动函数保留同一个 `instanceId`。Mage 抽牌堆、Nemesis deck/discard、Crooked Mask Corruption deck、Trinket deck 和 Mage-specific deck 的查看都使用这套状态。
- 每张物理卡牌副本独立记录已揭示状态。同名副本不能因为另一份副本被看见而一起翻开。移动卡牌时保留该实例的 ID 和记忆；洗牌只清除被洗牌实例的已知位置，使用 `resetCardInstancesAfterShuffle()`，不要只重排卡牌 ID 而漏掉实例状态。玩家的弃牌堆并入抽牌堆时也会洗混整个抽牌堆，因此原抽牌堆和弃牌堆中的牌都变成未知；之后抽出的牌离开抽牌堆，剩余牌的位置继续保持未知。普通抽牌循环只是把弃牌堆反转接到牌库底，不会清除这些已知信息。
- 旧存档没有实例 ID 时，引擎会在访问对应牌区时补建。旧存档无法恢复保存前已经看过的顺序信息，因此迁移时按未知状态处理隐藏牌堆；公开区域仍按公开状态处理。

## 新增游戏内容

### 新增 Gem、Relic 或 Spell

1. 在对应 Wave 的 `cards/` 数据中定义卡牌和 typed effects。
2. 在 Wave 注册入口汇总卡牌；确认 ID 唯一、引用和图片都有效。
3. 为效果成功、合法目标/无目标、可选跳过、上限和暂停恢复补引擎测试。
4. 如果需要玩家输入，复用已有 Pending Decision 和 UI 组件；真正的新交互才新增通用决策类型。
5. 运行引擎测试、前端构建和受影响的 Playwright 用例；视觉改动同时更新 UI Gallery。

如果市场卡牌的效果使用 Swap 区域，在卡牌数据的 `mechanics` 中声明 `'swap'`，开局就会按市场内容显示共享 Swap 区域。Develop 区域同样由市场中的 Develop 机制启用。

### 新增 Mage

在对应 Wave 的 `mages/` 中定义角色和 Ability。已有 trigger、目标和效果类型足够时不需要改 UI；新触发时机或目标规则必须同时补引擎入口与测试。

### 新增 Nemesis

将 Nemesis 卡牌放在对应 Wave 的 `nemeses/` 数据中，把独有 setup、Unleash 或回合处理放到 `aeons-end-engine/src/nemesis/`。能用共享 `CardEffect` 和 Nemesis effect block 表达的部分继续复用公共解释器。专属牌堆的构筑方式、查看方式和可否获得要分别配置，不要把特例塞进通用 UI 组件。

## 当前规则范围

产品当前实现固定两名不同 Mage 对抗一名 Nemesis 的场景。Turn Order 一轮六个位置（每位 Mage 两个、Nemesis 两个）；1、3、4 人流程暂未实现。Wave 9 的 22 张 Basic Nemesis Cards 已加入共享基础牌池，Crooked Mask 已按 Wave 9 版本接入；其余未接入内容见 [design/wave9-plan.md](design/wave9-plan.md)。

稳定玩家 ID、重复选择校验和当前 v3 本地存档格式都由引擎/前端数据类型管理；不要在新功能中写死 `p1/p2` 或绕过现有创建入口。

## 验证命令

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build
npm run test:e2e
```

`npm run build` 会先生成图片导入映射。Playwright 适合验证交互、决策、几何位置与动画状态；最终观感仍需在桌面浏览器中检查。不要仅为迎合窄屏而增加布局分支；目标窗口见 [UI 开发指南](ui/ui-guide.md)。

牌库数组 `[0]` 是顶牌：抽牌用 `shift()`，放到弃牌堆顶用 `unshift()`。用户可见文字用英文；代码标识符和注释用英文，内部说明文档可用中文。
