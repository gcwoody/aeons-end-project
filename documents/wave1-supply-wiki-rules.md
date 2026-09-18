# Wave 1 Supply 卡牌规则资料库

> 本文是阶段 0 的资料冻结结果，依据 Aeon's End Wiki Core Box 页面及各卡牌详情页整理。
> 规则实现前仍需以实际卡面复核；本文不是运行时代码。

## 来源与范围

- Core Box：[Supply Gems](https://aeonsend.wiki.gg/wiki/Aeon%27s_End_%28Core_Box%29#Supply_Gems)、[Supply Relics](https://aeonsend.wiki.gg/wiki/Aeon%27s_End_%28Core_Box%29#Supply_Relics)、[Supply Spells](https://aeonsend.wiki.gg/wiki/Aeon%27s_End_%28Core_Box%29#Supply_Spells)
- 卡牌详情页链接见下表；抓取/核对日期：2026-09-13。
- Supply 数量：Gem 7 张/堆，Relic 5 张/堆，Spell 5 张/堆。
- Crystal 和 Spark 是初始牌；其余条目标记为商店候选。商店候选合计 27 张：7 Gem、6 Relic、14 Spell。
- `Aether` 图标在文字资料中统一写为 `Aether`；代码实现时使用已有资源效果类型。

## Supply Gems

| ID | 名称 | 费用 | 范围 | 图片 | Effect |
| --- | --- | ---: | --- | --- | --- |
| `crystal` | Crystal | 0 | 初始牌 | `cards/wave1/gems/Crystal (Aeon's End) Front.jpg` | Gain 1 Aether. |
| `burning_opal` | Burning Opal | 5 | 商店 | `cards/wave1/gems/Burning Opal.jpg` | Gain 3 Aether. You may discard a card in hand. If you do, any ally draws a card. |
| `clouded_sapphire` | Clouded Sapphire | 6 | 商店 | `cards/wave1/gems/Clouded Sapphire.jpg` | Gain 3 Aether. If this is the first time you have played Clouded Sapphire this turn, any ally gains 1 charge. |
| `diamond_cluster` | Diamond Cluster | 4 | 商店 | `cards/wave1/gems/Diamond Cluster.jpg` | Gain 2 Aether. If this is the second time you have played Diamond Cluster this turn, gain an additional 2 Aether. |
| `jade` | Jade | 2 | 商店 | `cards/wave1/gems/Jade.jpg` | Gain 2 Aether. |
| `searing_ruby` | Searing Ruby | 4 | 商店 | `cards/wave1/gems/Searing Ruby.jpg` | Gain 2 Aether. Gain an additional 1 Aether that can only be used to gain a spell. |
| `sifters_pearl` | Sifter's Pearl | 3 | 商店 | `cards/wave1/gems/Sifter's Pearl.jpg` | Gain 2 Aether. Each player reveals the top card of their deck and either discards it or returns it to the top of their deck. |
| `vriswood_amber` | V'riswood Amber | 3 | 商店 | `cards/wave1/gems/V'riswood Amber.jpg` | When you gain this, you may place it on top of your deck. Gain 2 Aether. |

Wiki： [Burning Opal](https://aeonsend.wiki.gg/wiki/Burning_Opal)、[Clouded Sapphire](https://aeonsend.wiki.gg/wiki/Clouded_Sapphire)、[Diamond Cluster](https://aeonsend.wiki.gg/wiki/Diamond_Cluster)、[Jade](https://aeonsend.wiki.gg/wiki/Jade)、[Searing Ruby](https://aeonsend.wiki.gg/wiki/Searing_Ruby)、[Sifter's Pearl](https://aeonsend.wiki.gg/wiki/Sifter%27s_Pearl)、[V'riswood Amber](https://aeonsend.wiki.gg/wiki/V%27riswood_Amber)。

## Supply Relics

| ID | 名称 | 费用 | 图片 | Effect |
| --- | --- | ---: | --- | --- |
| `blasting_staff` | Blasting Staff | 4 | `cards/wave1/relics/Blasting Staff.jpg` | You may cast a prepped spell that you prepped this turn. If you do, that spell deals 2 additional damage. |
| `bottled_vortex` | Bottled Vortex | 3 | `cards/wave1/relics/Bottled Vortex.jpg` | Destroy this. Destroy up to two cards in your hand or discard pile. Draw a card. |
| `flexing_dagger` | Flexing Dagger | 2 | `cards/wave1/relics/Flexing Dagger.jpg` | The next time you focus or open a breach this turn, it costs 3 Aether less. OR Destroy this. Deal 1 damage. |
| `focusing_orb` | Focusing Orb | 4 | `cards/wave1/relics/Focusing Orb.jpg` | Focus any player's breach. OR Destroy this. Gravehold gains 3 life. |
| `mages_talisman` | Mage's Talisman | 5 | `cards/wave1/relics/Mage's Talisman.jpg` | Gain 1 charge. Any ally gains 1 charge. |
| `unstable_prism` | Unstable Prism | 3 | `cards/wave1/relics/Unstable Prism.jpg` | Play a gem in hand twice and destroy it. OR Gain 2 Aether. |

Wiki： [Blasting Staff](https://aeonsend.wiki.gg/wiki/Blasting_Staff)、[Bottled Vortex](https://aeonsend.wiki.gg/wiki/Bottled_Vortex)、[Flexing Dagger](https://aeonsend.wiki.gg/wiki/Flexing_Dagger)、[Focusing Orb](https://aeonsend.wiki.gg/wiki/Focusing_Orb)、[Mage's Talisman](https://aeonsend.wiki.gg/wiki/Mage%27s_Talisman)、[Unstable Prism](https://aeonsend.wiki.gg/wiki/Unstable_Prism)。

## Supply Spells

| ID | 名称 | 费用 | 范围 | 图片 | Effect |
| --- | --- | ---: | --- | --- | --- |
| `spark` | Spark | 0 | 初始牌 | `cards/wave1/spells/Spark (Aeon's End).jpg` | Cast: Deal 1 damage. |
| `amplify_vision` | Amplify Vision | 4 | 商店 | `cards/wave1/spells/Amplify Vision.jpg` | Cast: Focus your closed breach with the lowest focus cost. Deal 2 damage. If all of your breaches are opened, deal 1 additional damage. |
| `arcane_nexus` | Arcane Nexus | 7 | 商店 | `cards/wave1/spells/Arcane Nexus.jpg` | While prepped, once per turn during your main phase you may return a gem you played this turn to your hand. Cast: Deal 4 damage. |
| `chaos_arc` | Chaos Arc | 6 | 商店 | `cards/wave1/spells/Chaos Arc.jpg` | Cast: Deal 3 damage. Deal 2 additional damage for each prepped spell in an adjacent breach. |
| `consuming_void` | Consuming Void | 7 | 商店 | `cards/wave1/spells/Consuming Void.jpg` | Cast: Destroy up to two cards in hand. Deal 3 damage for each card destroyed in this way. |
| `dark_fire` | Dark Fire | 5 | 商店 | `cards/wave1/spells/Dark Fire.jpg` | Cast: Discard up to two cards in hand. Deal 3 damage for each card discarded in this way. |
| `essence_theft` | Essence Theft | 5 | 商店 | `cards/wave1/spells/Essence Theft.jpg` | Cast: Deal 3 damage. You may discard a card in hand. If you do, any player gains 1 life. |
| `feral_lightning` | Feral Lightning | 5 | 商店 | `cards/wave1/spells/Feral Lightning.jpg` | This spell may be prepped to a closed breach without focusing it. Cast: Deal 3 damage. |
| `ignite` | Ignite | 4 | 商店 | `cards/wave1/spells/Ignite.jpg` | Cast: Deal 2 damage. Any ally gains 1 charge. |
| `lava_tendril` | Lava Tendril | 4 | 商店 | `cards/wave1/spells/Lava Tendril.jpg` | While prepped, at the end of your casting phase deal 1 damage. Cast: Deal 3 damage. |
| `oblivion_swell` | Oblivion Swell | 5 | 商店 | `cards/wave1/spells/Oblivion Swell.jpg` | While prepped, once per turn during your main phase you may gain 1 Aether. Cast: Deal 2 damage. You may discard a gem. If you do, deal additional damage equal to its cost. |
| `phoenix_flame` | Phoenix Flame | 3 | 商店 | `cards/wave1/spells/Phoenix Flame.jpg` | Cast: Deal 2 damage. You may lose 1 charge to deal 2 additional damage. |
| `planar_insight` | Planar Insight | 6 | 商店 | `cards/wave1/spells/Planar Insight.jpg` | Cast: Deal 2 damage. Deal 1 additional damage for each of your opened breaches. |
| `spectral_echo` | Spectral Echo | 3 | 商店 | `cards/wave1/spells/Spectral Echo.jpg` | Cast: Deal 2 damage. You may destroy a card in hand. |
| `wildfire_whip` | Wildfire Whip | 6 | 商店 | `cards/wave1/spells/Wildfire Whip.jpg` | While prepped, during your main phase you may spend 2 Aether to cast any player's prepped spell. Cast: Deal 4 damage. |

Wiki： [Amplify Vision](https://aeonsend.wiki.gg/wiki/Amplify_Vision)、[Arcane Nexus](https://aeonsend.wiki.gg/wiki/Arcane_Nexus)、[Chaos Arc](https://aeonsend.wiki.gg/wiki/Chaos_Arc)、[Consuming Void](https://aeonsend.wiki.gg/wiki/Consuming_Void)、[Dark Fire](https://aeonsend.wiki.gg/wiki/Dark_Fire)、[Essence Theft](https://aeonsend.wiki.gg/wiki/Essence_Theft)、[Feral Lightning](https://aeonsend.wiki.gg/wiki/Feral_Lightning)、[Ignite](https://aeonsend.wiki.gg/wiki/Ignite)、[Lava Tendril](https://aeonsend.wiki.gg/wiki/Lava_Tendril)、[Oblivion Swell](https://aeonsend.wiki.gg/wiki/Oblivion_Swell)、[Phoenix Flame](https://aeonsend.wiki.gg/wiki/Phoenix_Flame)、[Planar Insight](https://aeonsend.wiki.gg/wiki/Planar_Insight)、[Spectral Echo](https://aeonsend.wiki.gg/wiki/Spectral_Echo)、[Wildfire Whip](https://aeonsend.wiki.gg/wiki/Wildfire_Whip)。

## 阶段 2 实现前的效果审计

下表是从规则文字到现有引擎能力的第一轮分类；真正写代码时仍需逐卡测试。

| 类别 | 卡牌 | 初步复用/缺口 |
| --- | --- | --- |
| 纯资源 | Jade、Burning Opal、Clouded Sapphire、Searing Ruby、Mage's Talisman | `gain_aether`、条件 Aether、`gain_charge`；Searing Ruby 的“仅用于买 Spell”需要确认现有 conditional-aether 是否支持商店类型限制。 |
| 本回合计数/条件 | Diamond Cluster、Amplify Vision、Planar Insight | 复用本回合卡牌计数、未开启/已开启 Breach 计数；Amplify Vision 需要最低 focus cost 目标选择。 |
| 手牌/弃牌选择 | Bottled Vortex、Consuming Void、Dark Fire、Essence Theft、Oblivion Swell、Spectral Echo | 复用 `select_cards`、`destroy_cards`、`discard_cards` 和 optional 分支；数量型伤害需要把实际移牌数量传给后续效果。 |
| 玩家/盟友目标 | Burning Opal、Clouded Sapphire、Sifter's Pearl、Focusing Orb、Ignite、Mage's Talisman | 复用 any-player/ally 自动切换与直接高亮；Sifter's Pearl 还需要每名玩家分别处理牌堆顶牌。 |
| 预备法术与裂隙 | Blasting Staff、Feral Lightning、Wildfire Whip、Arcane Nexus、Lava Tendril | 复用预备法术选择、施法 continuation 和 while-prepped；Feral Lightning 的闭合裂隙预备例外、Blasting Staff 的“本回合预备”需要通用字段。 |
| 牌区重复/销毁 | Unstable Prism | 需要明确“同一 Gem 在手牌中连续执行两次 on_play 后销毁”的实例语义，不能误伤同名其他牌。 |
| 其他 | Chaos Arc、Oblivion Swell、Phoenix Flame | 相邻 Breach 法术数量、弃 Gem 费用伤害、消耗 Charge 等效果需要先确认现有 `EffectAmount` 和 pending continuation 是否足够。 |

阶段 0 的规则资料以本文件和 `wave1-supply-catalog.json` 为准；发现图片、Wiki 或规则解释冲突时，先更新待决清单并补测试，再进入实现。
