# 末日决战（Aeon's End）电子化

本地单人 Web 版《末日决战》：2 名裂隙法师对抗天罚 Nemesis。当前是可操作的
Demo，基础回合流程、市场、法师区域、存档和一批类型化卡牌效果已经接入。

## 架构

```
aeons-end-engine/  共享规则引擎（纯 TypeScript）
aeons-end-ui/      Vue 3 + Vite 前端，直接通过 @engine 引用引擎源码
design/            卡牌效果模型、关键词状态和扩展参考
```

引擎原地修改单个 `GameState`；UI 使用 Vue `reactive()` 追踪状态。规则只在引擎
实现，UI 只负责显示、交互和提交选择。项目已经删除 CLI，后续统一通过 Web UI、
调试面板和引擎回归测试开发。

## 运行

```powershell
cd aeons-end-ui
npm install
npm run dev        # http://localhost:5173
```

生产构建：

```powershell
cd aeons-end-ui
npm run build
```

引擎测试：

```powershell
cd aeons-end-engine
npm test
```

浏览器端 E2E 测试（首次使用需先执行 `npx playwright install chromium`）：

```powershell
cd aeons-end-ui
npm run test:e2e
```

## 当前玩法

- 开局选择两名法师（Jian / Brama）对抗 Rageborne。
- 玩家回合依次进行 Casting Phase、Main Phase 和抽牌流程。
- Casting Phase 可选择释放准备好的 Spell；未开启 breach 上的 Spell 必须释放。
- Spell 可通过点击或拖拽从手牌 Prep 到可用 breach。
- Main Phase 可打出 Gem/Relic、购买市场卡、Focus/Open breach、充能和激活能力。
- 抽牌补足到 5 张；牌库耗尽时翻转弃牌堆，不洗牌。
- Played 区在回合结束时进入弃牌排序；顺序完全相同的牌会自动处理。
- Nemesis 回合会显示攻击目标选择，支持玩家或 Gravehold。
- Market 为固定九宫格；牌堆耗尽后保留原位置但不显示卡图，后续牌堆不补位。

## 已接入的卡牌效果

4 张初始玩家卡和 9 张 Wave 1 市场卡已经通过可组合的类型化效果接入：

- Gem：V'riswood Amber、Diamond Cluster、Burning Opal
- Relic：Flexing Dagger、Bottled Vortex
- Spell：Lava Tendril、Essence Theft、Planar Insight、Arcane Nexus

初始卡：Spark、Crystal、Moonstone Shard、Buried Light。当前效果系统支持 `gain`、
`may`、`ally`、`or`、`destroy`、`while prepped`、`cast`、`deal damage`、
`gain life`、条件 Aether、抽牌、费用减免和返回手牌等模块。第三/第四裂隙的施法增伤、效果
选择暂停以及存档后恢复也已接入。

新增卡牌时，优先在 `aeons-end-engine/src/data/wave1/` 对应的 `gems.ts`、
`relics.ts` 或 `spells.ts` 中组合已有 `CardEffect`；`data.ts` 只负责统一出口和
Breach 配置。只有出现全新的规则词汇时，才扩展 `types.ts` 和引擎解释器。具体组合方式及实现进度见：
[`design/card-effects-keywords.md`](design/card-effects-keywords.md)。

## 存档与调试

- 游戏会自动保存到浏览器 localStorage。
- 设置页显示多条存档的法师、Nemesis、轮次和回合，并可 Resume 或删除。
- 游戏中按 ESC，可选择 `Save & Exit` 或 `Exit Without Saving`。
- Ctrl+D 打开调试面板：修改 HP/Charge、添加卡牌、开关裂隙、导出/导入 JSON、
  清除全部存档。
- Ctrl+Z 撤销最近最多 5 步操作。

## 当前限制

- Jian 的 Black Mirror 和 Brama 的 Brink Siphon 已通过类型化 Ability 效果实现。
- Nemesis 的 Minion/Power 完整规则尚未完成。
- 当前玩家卡牌已完全迁移到类型化效果，旧 Gem/Relic/Spell 字段和 demo 专用 Relic
  结算逻辑已删除。
- 已配置引擎回归测试和基础浏览器 E2E；复杂 UI 视觉细节仍建议手动验证。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [dev-guide.md](dev-guide.md) | 文件职责、修改入口、调试和新增卡牌流程 |
| [design/card-effects-keywords.md](design/card-effects-keywords.md) | 类型化模型、关键词状态、卡牌覆盖、扩展方式和进度决策 |
