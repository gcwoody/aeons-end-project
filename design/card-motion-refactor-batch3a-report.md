# 卡牌区域动效重构：批次 3a 报告

日期：2026-10-10  
范围：Hand → Played/Swap、Swap → Discard，以及预备法术、施放法术和附着 Relic 的 Breach 移动。

## 完成内容

- 打牌和 Play All Gems 根据引擎移动记录确认具体牌副，并按牌副 ID 找目标。不再通过同名牌数量变化猜目的地。
- Gem/Relic 产生待处理决策时，仍在手牌展示区保留原牌；决策结束后再按该牌副的最终位置飞出。重复牌和撤销路径沿用同一身份。
- Swap 进出使用同一动作里的移动记录。进入 Swap 的牌先落地，出 Swap 的牌再飞向 Discard；Discard 的旧顶牌和数量在到达前保留。
- 为 Played、Swap 和 Breach 展示补上牌副 ID。预备法术、施放法术、附着 Relic 也使用对应牌副定位。
- 已迁移的这些移动会由记录路径领取；旧的区域差值流程跳过相同来源，避免重复飞行。其他牌区移动仍留给后续批次。

## 检查结果

- `npx vue-tsc --noEmit` 通过。
- `npm run build` 通过；构建只提示现有主 chunk 超过 500 kB。
- Playwright 定向回归 **12 项通过**：决策中的单张/批量打牌、连续打牌重排、重复牌、撤销、Swap 入场/出场次序与 Discard 展示，以及手牌预备法术到 Breach。
- 未运行完整 E2E 套件、UI Gallery，也未做桌面目视验收。
- 没有修改引擎规则。

## 下一步

按计划进入批次 3b：迁移 Supply → Develop、Develop → Discard 和从 Supply 获牌到玩家牌区的展示。
