# 末日决战（Aeon's End）电子化

本项目是本地单人 Web 版《末日决战》：两名裂隙法师对抗一名 Nemesis。当前通过 Web UI、
调试面板、引擎回归测试和 Playwright 浏览器测试开发，CLI 已删除。

## 快速开始

```powershell
cd aeons-end-ui
npm install
npm run dev        # http://localhost:5173
```

常用验证：

```powershell
cd aeons-end-engine
npm test           # 类型检查 + 引擎回归

cd ..\aeons-end-ui
npm run build      # 前端生产构建
npx playwright install chromium  # 首次使用 Playwright 时执行
npm run test:e2e   # 浏览器流程测试
```

## 代码分层

```text
aeons-end-engine/  纯 TypeScript 规则引擎和数据
aeons-end-ui/      Vue 3 + Vite 展示层，@engine 直接引用引擎源码
design/            当前只保留 UI 层级维护指南
```

引擎原地修改一个 `GameState`；UI 使用 Vue `reactive()` 追踪状态。规则、资源变更、
目标选择和中断恢复属于引擎；组件只负责显示状态、收集输入和调用引擎。

## 当前实现

- 玩家卡牌使用 `CardEffect` 类型化效果，由 `engine.ts` 的统一解释器按顺序执行。
- Gem、Relic、Spell 的初始卡和 Wave 1 市场卡已接入；Mage Ability 也复用同一效果队列。
- 已有可复用的牌区选择、玩家/伤害目标选择、`may`、`or`、抽牌、弃牌、Destroy、
  费用减免、持续效果、存档中断恢复等模块。
- 当前场景由可序列化的 `ScenarioConfig` 描述，固定使用 6 张回合顺序牌；Setup 已支持
  从注册表选择 Mage 和 Nemesis，目前 Nemesis 注册表只有 Rageborne。
- 玩家使用稳定 ID（例如 `wave1_JIAN`），同一 Mage 不能被两个玩家同时选择；旧 v1/v2
  存档不再迁移。
- Rageborne 已接入基础 Nemesis Deck、Strike、Fury、Minion/Power 的部分流程；完整
  Nemesis 规则仍在扩展中，Fury/Strike 目前明确属于 Rageborne 专属逻辑。
- 支持多存档、Save & Exit、Resume、删除确认、Ctrl+Z（最多 5 步）和 Ctrl+D 调试。

## 开发入口

新增卡牌、Ability、Nemesis 或场景时，先阅读 [`dev-guide.md`](dev-guide.md)。它是当前唯一
的规则/数据/测试扩展指南，并明确区分“应复用的模块”和“暂时保留的硬编码”。

涉及遮挡、悬停、弹窗或 `z-index` 时，查阅
[`design/ui-layering-guide.md`](design/ui-layering-guide.md)。

`AGENTS.md` 是给编码代理的项目约束，不是玩法或开发教程。
