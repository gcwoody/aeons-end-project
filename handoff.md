# Aeon's End Digital — 对话交接

更新时间：2026-09-13

这份文档用于把当前项目状态交给新的 Codex 对话。它只记录“现在是什么状态、哪些决定已经确定、接下来怎么工作”；长期的代码地图和调试入口请结合 [`dev-guide.md`](dev-guide.md) 阅读。涉及 UI 覆盖、`z-index` 和 stacking context 时，再阅读 [`design/ui-layering-guide.md`](design/ui-layering-guide.md)。

## 新对话开始时先读什么

按以下顺序读取：

1. `AGENTS.md`：项目硬性约定。
2. `handoff.md`：本次交接状态和最近的设计决定。
3. `dev-guide.md`：架构、文件职责和扩展方式。
4. `design/ui-layering-guide.md`：只有处理 UI 层级或遮挡问题时需要。

可以把下面这段作为新对话的开场说明：

> 请先阅读项目根目录的 `AGENTS.md`、`handoff.md` 和 `dev-guide.md`。这是一个已经开发到中期的 Aeon's End 数字版Demo项目，工作区中已有用户改动，禁止 reset、checkout 或覆盖无关改动。继续任务前先检查当前代码和测试状态，再按已有的类型化效果、ScenarioConfig、通用决策模块和图片生成映射进行扩展。

## 项目当前状态

- `aeons-end-engine/` 是纯 TypeScript 规则引擎；`aeons-end-ui/` 是 Vue 3 + Vite 前端。
- UI 通过 `@engine` 直接引用引擎源码，不要在 UI 中复制规则。
- 当前重点是两人游戏场景；回合顺序牌固定为 6 张。
- 玩家 ID 使用稳定格式，例如 `wave1_JIAN`，不要再使用 `P1`、`P2` 作为规则层身份。
- 同一 Mage 不允许被多个玩家选择；引擎和 UI 都有校验。
- 当前已经实现 Wave 1 的 8 个 Mage：Jian、Brama、Xaxos、Adelheim、Kadir、Lash、Mist、Phaedraxa。
- 当前已经实现 Rageborne 和 Prince of Gluttons 两个 Nemesis。Setup 可选择 Standard 或 Increased 难度；Prince 的 Increased 开局会要求玩家逐张选择额外 Devour 的 9 张供应牌。所有 Nemesis 共用 `unleash` 关键词，但每个 Nemesis 的完整 Unleash 后续序列由 `aeons-end-engine/src/nemesis/<nemesis>.ts` 的规则模块提供。Rageborne 模块负责 Fury、Strike 结算后处理和结束回合 Strike；Prince of Gluttons 模块负责 Unleash 序列、Devoured pile setup 和 Increased setup。专属 Strike deck 的卡牌数据和构建仍位于 Nemesis 数据文件。Prince 继续使用同一 `nemesis.strikeDeck` 状态字段作为 Devoured pile。通用的 `devour_market_cards`、空供应数量、市场选择和顶牌获得规则由引擎统一解释，不能再为单张 Prince 卡写 ID 分支。UI 的 `NemesisSpecificPile.vue` 同时支持计数和顶牌正面显示；后续 Nemesis 应通过 presentation 配置其显示方式，并由父组件注入可选动作。
- CLI 已删除，不要重新维护 CLI 测试入口。
- 不需要兼容旧存档；当前保存格式以最新代码为准。
- UI 中所有按钮、标签、提示和日志文本必须使用英文；文档可以使用中文。

## 已确定的扩展原则

1. 卡牌和 Mage Ability 只维护数据和类型化效果组合；规则由引擎统一解释。
2. 需要玩家操作的流程使用通用 `pendingDecision` / `pendingEffect` 和可复用决策 UI，不要为单张卡牌复制一套弹窗。
3. `gain`、`may`、`ally`、`or`、`destroy`、`while_prepped`、`on_cast`、伤害目标、卡牌选择等规则，应优先组合已有效果模块。
4. 只有确实无法表达的新规则，才增加新的通用 `CardEffect` 或决策类型；不要把特殊规则写成大量卡牌 ID 分支。
5. 引擎原地修改单个 `GameState`；UI 负责提交操作和展示状态，不负责自行推导规则结果。
6. 改动中断、弹窗、自动结束阶段时，要检查时间点、恢复流程、撤销和存档是否一起正确。
7. `unleash` 是所有 Nemesis 共用的效果关键词；关键词的重复次数由效果本身决定，而每次 Unleash 要执行的完整序列由当前 Nemesis 的规则模块决定。不要把某个 Nemesis 的 Unleash 行为重新写回通用 `CardEffect` 分支。

Nemesis 规则采用“公共解释器 + 专属模块”的混合边界：公共层负责关键词、资源、市场选择、决策和流程恢复；专属模块可以独立提供 setup、Unleash 序列、Strike 后处理或结束回合规则。只有多个 Nemesis 被证明具有相同语义时，才提升对应 Hook 为公共模块。

## 图片映射工作流

图片路径已经从手写映射改为生成式映射：

- 生成脚本：[scripts/generate-image-imports.mjs](scripts/generate-image-imports.mjs)
- 生成文件：[aeons-end-ui/src/generated-image-imports.ts](aeons-end-ui/src/generated-image-imports.ts)
- 查询 API：`aeons-end-ui/src/card-images.ts`、`mage-images.ts`、`breach-images.ts`

运行：

```powershell
cd aeons-end-ui
npm run generate:images
```

脚本会扫描图片目录，并从已注册的引擎数据中提取卡牌、Mage 和 Nemesis mat，生成实际需要的静态 import。它不会把图片目录中尚未注册的数据全部打包进前端。新增卡牌时，应同时添加引擎数据和符合名称规则的图片，然后重新生成；缺图或重复映射会直接报错。`npm run build` 会自动先运行这个生成步骤。

## 标准验证命令

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npm run generate:images
npm run build
npm run test:e2e -- --workers=1
```

当前最近一次验证结果：引擎回归通过，前端构建通过，Playwright 24 项全部通过。若 5173 端口已经有本项目开发服务器，可使用：

```powershell
$env:PLAYWRIGHT_REUSE_SERVER='true'
npm run test:e2e -- --workers=1
```

## 当前工作区注意事项

- 当前分支是 `main`，工作区不是干净状态；其中已有用户和前序开发改动。开始工作前检查 `git status`，只修改当前任务相关内容。
- 不要使用 `git reset --hard`、`git checkout --` 或大范围删除来“清理”工作区。
- 图片文件由 `.gitignore` 忽略；不要为了生成映射修改该忽略规则。
- 处理 UI 遮挡时，优先参考 `design/ui-layering-guide.md`，并同时检查是否新建了 stacking context，而不是只盲目提高一个 `z-index`。
- 浏览器测试可以验证 DOM、交互和布局关系，但图片清晰度、动画观感和不同浏览器的实际视觉效果仍值得人工复核。

## 继续开发时的建议步骤

1. 先确认用户要改的是引擎规则、UI 交互、数据、图片资源还是文档。
2. 先在 `types.ts`、`engine.ts`、对应的 wave 数据文件和通用 Vue 组件中找现有模块。
3. 先写或更新引擎回归测试，再接 UI 流程；涉及视觉布局时补 Playwright 几何或可见性断言。
4. 完成后运行生成图片映射、引擎测试、构建和相关 Playwright 测试。
5. 如果新增了长期有效的架构决定，更新本交接文档或 `dev-guide.md`，不要额外制造重复的长文档。
