# 卡牌区域动效重构：批次 3c

状态：已完成。

## 本批改动

- Crooked Mask 的 Corruption、Nemesis 专属牌堆和 Mage 专属牌堆获牌，现在按引擎记录的具体卡牌实例飞往玩家的手牌、牌库或弃牌堆，不再靠比较牌堆数量猜是哪张牌。
- 目标玩家的棋盘不在当前视角时，卡牌飞向该玩家一直可见的角色按钮；来源牌堆没有可见卡面时，开发环境会输出提示，页面直接显示引擎最终结果。
- Conjure 临时展示牌进入 Breach 时使用移动记录飞向准确的 Breach 卡位；选择 Skip 时飞回牌库顶，牌库数量等飞行结束后再更新。
- Control Bar 的手牌数字仍读取真实手牌；Conjure 临时展示牌不计入手牌。

## 验证结果

- UI `npx vue-tsc --noEmit`：通过。
- Playwright：Conjure、Crooked Mask Corruption、Inco Firethorn 相关 5 项用例通过。
- UI `npm run build`：通过；仍有原有主脚本超过 500 KB 的提示。

下一批是 4：清理已被替代的旧推断路径，更新 UI 指南与 Gallery，并进行完整回归。
