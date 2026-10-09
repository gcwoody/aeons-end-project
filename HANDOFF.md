# 项目交接摘要

更新时间：2026-10-08

## 项目是什么

Aeon's End 的桌面浏览器单机版。当前只支持两名不同 Mage 对抗一名 Nemesis；Vue 前端展示棋盘并接收操作，纯 TypeScript 引擎负责规则。存档保存在浏览器 `localStorage`，不是云存档。

## 当前内容

- 8 位 Wave 1 Mage、10 位 Wave 9 Mage。
- Nemesis：Rageborne、Prince of Gluttons、Wave 9 重制版 Crooked Mask。
- Wave 1/9 的 Gems、Relics、Spells，Wave 9 Trinket deck，以及 22 张已加入共享池的 Wave 9 Basic Nemesis Cards。
- Wave 9 的 Friends、Foes、Banners 和 Crooked Mask 以外的 Nemesis 仍未接入。细节见 [`design/wave9-plan.md`](design/wave9-plan.md)。

项目已实现的机制包括 typed effects/decisions、Recall、Develop、Attach、Pulse token、Trinket/Corruption 牌堆和逐张卡牌实例的揭示状态。规则原则集中在 [`dev-guide.md`](dev-guide.md)；组件、布局、高亮、动效与 Gallery 约定在 [`ui/ui-guide.md`](ui/ui-guide.md)。这两份指南比本摘要更详细，也优先于本快照。

## 架构入口

- `aeons-end-engine/src/types.ts`：规则、效果、决策和 GameState 类型。
- `aeons-end-engine/src/data/wave*/`：按 Wave 组织的 Mage、Supply、Nemesis 和专属牌堆数据。
- `aeons-end-engine/src/engine/`：共用规则模块；`engine.ts` 保留公开 API。
- `aeons-end-engine/src/nemesis/`：Nemesis 专属运行规则模块。
- `aeons-end-ui/src/game/useGame.ts`：前端阶段协调、动画等待、存档和撤销。
- `aeons-end-ui/src/game/`、`src/components/`、`src/styles/`：UI 辅助逻辑、Vue 组件和职责拆分后的样式。
- `aeons-end-ui/src/components/UiGallery.vue`：复用组件和交互示例。
- `documents/`：卡牌与 Mage 的资料来源；实现卡牌时只查对应资料和数据/测试。

引擎原地更新 GameState；UI 通过 `@engine` 直接使用引擎，并用 Vue `reactive()` 观察状态。不要在 Vue 组件里补规则，也不要在共用效果路径里按单张卡牌 ID 写特例。效果来源、持卡者、目标与施法者的区别见开发指南“效果来源与卡牌归属”。

## 最近一次 UI 修正

已审查左下角的手牌计数和增长气泡：Hand 只计入引擎中的实际手牌，不再把 Conjure 的临时揭示牌计入；撤销、载入或 Debug 替换 GameState 时，同时清理手牌与充能增长气泡。白色气泡依然仅来自实际手牌增量，充能使用蓝色气泡。新增浏览器回归覆盖 Qu Giver/Taker 的购买/效果获牌、空/非空目标牌堆、真实抽牌/获牌入手、撤销、Conjure、支付 Gems 和恢复待决策状态。17 项相关浏览器检查通过，引擎测试、`vue-tsc` 与生产构建通过。截图位于 `ui/screenshots/qu-giver-deck-placement-1440x900.png` 与 `ui/screenshots/hand-gain-feedback-1440x900.png`。

用户报告的“Qu 将获得的牌放到 ally 牌堆顶后，ally 出现白色气泡且 Hand 从 5 变成 1”尚未复现；上述 8 种 Giver/Taker 转移组合逐帧检查均保持两位 Mage 的 Hand 为 5，且无白色气泡。本次没有宣称修复此原始现象，也没有为它改变引擎规则；已向用户询问 ally Mage、卡牌、获牌方式，以及计数异常是否持续。后续应依据这些信息或异常时的存档继续定位。

手牌飞往牌堆顶已纳入手牌区域飞行协调：Vapor Wraith 的 on-damage 自己牌堆顶选择、Flailer 的盟友牌堆顶选择会匹配真实离开的手牌副本、飞入对应牌堆并等待来源手牌收拢；Conjure Skip 时，手牌行里的临时展示牌飞回牌堆顶。弃牌飞行与这两种飞行共用 `--hand-to-pile-flight-duration`。项目里其他牌堆顶来源（Supply、Corruption、Trinket、Mage-specific deck）并非来自手牌，保留各自区域来源动画。`npx vue-tsc --noEmit` 通过；本次尚未运行浏览器交互验证。当前工作尚未提交。

可选的单张预备法术施放已改为点击即提交：弹窗只显示 Skip，点击任意 Mage 的高亮法术后直接进入施放和伤害目标等后续决策。引擎决策与存档格式不变，已有的待确认存档也走新交互；单张/多张弃法术选择仍按原要求保留 Confirm。Gallery 的 `Decision.PreppedSpellChoicePanel` 同步更新。9 项相关浏览器检查（含 1440×900/1920×1080 下跨 Mage 施放、Skip、外层效果继续、弃法术确认与 Gallery）通过，引擎测试、`vue-tsc` 和生产构建通过。

手牌动效已统一到 `HandCardRow.vue`：更新前读取实际屏幕位置，更新后确定最终布局，用一套 FLIP 动画处理收拢、居中和新增手牌。旧的 padding 过渡及单独弃牌位移已移除；每次重排先取消旧动画，完成/切换 Mage/卸载时清理动画，不保留 inline transform。同名卡的打出和准备识别实际离开的卡槽，批量弃牌保留源索引并按选择顺序逐张飞出。后续飞牌和自动阶段推进等待飞行与收拢全部结束。

游戏和 Gallery 共用手牌组件；`Hand.Motion` 可演示增删、批量弃牌、动画中断、溢出滚动和视角切换。相关协调逻辑仍在 `src/game/card-flight.ts` 和 `src/game/useGame.ts`。

在独立的 HEAD 源码副本中，新增回归测试复现了连续出牌时 254px/463px 的卡槽重叠，以及弃牌后的残留 transform。修正版在 1440×900 与 1920×1080 下逐帧通过：无重叠、每槽最多一个位移动画、完成后无残留 transform；还覆盖了快速重复点击、同名卡槽身份、滚动、撤销、连续增删、缩放和 Mage 切换。最终 38 项相关浏览器检查通过（含 Gallery），引擎测试、`vue-tsc` 和生产构建通过。已在桌面尺寸浏览器检查 Gallery 的飞牌与收拢，用户尚未做最终肉眼验收。

首次全量浏览器运行是 132/151 通过。其他失败包含过时的边框/文案/布局断言，以及随机开局揭示与随机市场造成的旧 fixture 干扰；多项在 HEAD 对照也失败。相关手牌测试已修正开局等待、供牌定位、真实 gain-to-hand 效果序列和动画结束后的几何检查；本次没有修复所有其他旧测试。Windows 偶发锁住已有参考截图，可通过 `UI_GALLERY_SCREENSHOT_DIR` 指定独立输出目录完成 Gallery 验证。

## 开发与验证

```powershell
cd aeons-end-engine
npm test

cd ..\aeons-end-ui
npx vue-tsc --noEmit
npm run build
npm run test:e2e
npm run test:ui-gallery
```

前端构建会先运行 `npm run generate:images`。新增或改名图片后运行该脚本，不要手动改 `src/generated-image-imports.ts`。生产构建目前成功，但 Vite 会提示主 JS chunk 约 710 KB；首屏拆包优化已暂缓。

本地开发默认使用 `http://localhost:5173`。启动前确认端口服务属于当前 checkout；Playwright 配置默认不会复用已有服务。测试请使用独立浏览器上下文或清理测试上下文的存档，避免触碰用户在浏览器里的真实存档。

## 当前工作状态

- 主分支：`main`。
- 本次手牌动效、可选预备法术点击即施放、手牌计数/增长气泡审查与已有文档更新尚未提交。
- Qu 的原始计数异常仍待精确复现，已向用户询问触发场景；其余后续工作以用户的新反馈和代码现状为准。

下一位 AI 开始修改前先读根目录 [`AGENTS.md`](AGENTS.md)、[`README.md`](README.md)、[`dev-guide.md`](dev-guide.md) 和 [`ui/ui-guide.md`](ui/ui-guide.md)，并再次检查 Git 状态。不要把本摘要当作代码事实的替代品。
