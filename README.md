# 末日决战（Aeon's End）电子化

本地单人 Web 版《末日决战》：2 名裂隙法师 vs 天罚怒煞（Rageborne），可完整游玩一局。
当前为 **Demo 阶段**（基础版规则 + 占位卡牌数据）。

## 架构

```
aeons-end-engine/  规则引擎（纯 TypeScript，无 Node 依赖，UI 直接共用）
aeons-end-ui/      Vue 3 + Vite 前端，通过 @engine 别名直接引用引擎源码（不复制）
```

- 引擎**原地修改**单个 `GameState` 对象；UI 用 Vue `reactive()` 包装它，变更自动反映到界面。
- 规则逻辑只改引擎（`engine.ts`）；交互/显示只改 UI。**不要为迁就 UI 改引擎行为。**

## 运行

```powershell
# 前端（推荐）
cd aeons-end-ui
npm install
npm run dev        # http://localhost:5173

```

## 玩法速览

- **开局**：设置页选两位法师（Jian / Brama）→ Start Game；设置页会列出已有存档，可选择对应的 Resume Game。
- **玩家回合**：施法（点裂隙上已预备法术）→ 主阶段（打宝石/遗物、Prep 法术、购买、Focus/Open 裂隙、充能、激活能力）→ 抽牌回 5 张（牌库空则翻转弃牌堆，**不洗牌**）。
- **天罚回合**：弹窗显示抽到的卡，选攻击目标（P1 / P2 / Gravehold）。
- **特殊机制**：
  - 打出的牌显示在 Played 区；回合结束进入弃牌排序（点选顺序），完全相同则自动弃牌。
  - 裂隙 III/IV 施放法术伤害 +1（Once Opened）。
  - 无行动时自动结束回合；**Ctrl+Z** 撤销（最多 5 步）。
  - 月长石碎片的条件以太只能用于买宝石。

## 调试工具

- **Ctrl+D** 开关调试面板（改 HP/充能、加卡、开/关裂隙、导出/导入 JSON）。
- **自动存档**到浏览器 localStorage；游戏中按 ESC 可选择 Save & Exit，刷新后可从存档列表 Resume。
- 详见 [dev-guide.md](dev-guide.md)「调试指南」。

## 已知限制（Demo 阶段）

- Jian 的 Black Mirror 能力未实现（引擎占位）
- 天罚 Minion/Power 卡机制未实现
- 9 张 Wave 1 市场卡已接入类型化效果；更完整的 Minion/Power 卡机制仍在后续开发
- 无卡牌图片（后续可复用 TTS 图包）

## 文档索引（只需看这三份）

| 文档 | 用途 |
|------|------|
| [README.md](README.md) | 项目说明 + 运行 + 玩法（本文件） |
| [dev-guide.md](dev-guide.md) | 开发者地图：文件职责、改功能去哪找、调试方法 |
| [AGENTS.md](AGENTS.md) | AI 协作约定（语言要求、项目结构、UI 约定） |
