<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import { cardImageUrl, playerCardBackUrl, specificDeckBackUrl } from '../card-images'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ZoneScroller from './ZoneScroller.vue'
import ModalBase from './ModalBase.vue'
import TokenBadge from './TokenBadge.vue'

type GalleryModal = 'pile' | 'decision' | null

const modal = ref<GalleryModal>(null)
const galleryModalEl = ref<HTMLElement | null>(null)

watch(modal, (value) => {
  if (!value) return
  nextTick(() => galleryModalEl.value?.focus({ preventScroll: true }))
})

function handleGalleryKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || modal.value !== 'pile') return
  event.preventDefault()
  modal.value = null
}

onMounted(() => window.addEventListener('keydown', handleGalleryKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleGalleryKeydown))

const handCards = ['vision_shard', 'crystal', 'spark']
const miniCards = ['crystal', 'spark', 'corrupted_coil', 'runic_flute', 'fungal_network']
const pileCards = ['calcified_electinium', 'corrupted_coil', 'fungal_network', 'runic_flute', 'time_cortex']

function cardName(cardId: string): string {
  return getCard(cardId).name
}

</script>

<template>
  <main class="ui-gallery" data-ui-gallery>
    <header class="ui-gallery-header">
      <div>
        <p class="ui-gallery-kicker">Aeon's End Digital · UI Gallery</p>
        <h1>Reusable UI Components</h1>
        <p class="ui-gallery-intro">
          Development-only component catalogue. These fixtures do not modify a game state.
        </p>
      </div>
      <a class="btn" href="/">Exit Gallery</a>
    </header>

    <section class="ui-gallery-section" data-gallery-section="card-surfaces">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">01 · Cards</p>
          <h2>Card surfaces and states</h2>
        </div>
        <span class="ui-gallery-note">2px borders · rounded corners · hover previews</span>
      </div>

      <div class="ui-gallery-grid ui-gallery-grid-cards">
        <article class="ui-gallery-item" data-component="Card.Hand">
          <h3>Card.Hand</h3>
          <p class="ui-gallery-caption">Standard face-up hand card</p>
          <div class="ui-gallery-surface hand-surface">
            <CardHoverPreview :card-id="handCards[0]">
              <CardSurface :card-id="handCards[0]" class="gallery-hand-card" />
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.Mini">
          <h3>Card.Mini</h3>
          <p class="ui-gallery-caption">Played, Swap and Develop zones</p>
          <div class="ui-gallery-surface mini-surface">
            <CardHoverPreview v-for="cardId in miniCards.slice(0, 3)" :key="cardId" :card-id="cardId">
              <CardSurface :card-id="cardId" size="mini" class="gallery-mini-card" />
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.Pile">
          <h3>Card.Pile</h3>
          <p class="ui-gallery-caption">Deck, discard and specific deck surfaces</p>
          <div class="ui-gallery-surface pile-surface">
            <CardSurface base-class="gallery-pile-card" class="gallery-pile-card-back" image-fit="fill" :image-url="playerCardBackUrl()" image-alt="Player card back">
              <template #overlay><span class="gallery-pile-count">12</span></template>
            </CardSurface>
            <CardHoverPreview :card-id="pileCards[0]">
              <CardSurface base-class="gallery-pile-card" :card-id="pileCards[0]">
                <template #overlay><span class="gallery-pile-count">4</span></template>
              </CardSurface>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.FaceDown">
          <h3>Card.FaceDown</h3>
          <p class="ui-gallery-caption">Unknown information stays face-down</p>
          <div class="ui-gallery-surface face-down-surface">
            <CardHoverPreview :image-url="specificDeckBackUrl('treasure_2')" image-alt="Treasure deck card back">
              <div class="gallery-face-down-card">
                <img :src="specificDeckBackUrl('treasure_2')" alt="Treasure deck card back" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.AttachedQuarter">
          <h3>Card.AttachedQuarter</h3>
          <p class="ui-gallery-caption">Treasure attached to a supply pile</p>
          <div class="ui-gallery-surface attached-surface">
            <CardHoverPreview :card-id="'amethyst_shard'">
              <div class="gallery-attached-supply">
                <img :src="cardImageUrl('amethyst_shard')" :alt="cardName('amethyst_shard')" draggable="false" />
                <CardHoverPreview :card-id="'runic_flute'">
                  <div class="gallery-attached-treasure">
                    <img :src="cardImageUrl('runic_flute')" :alt="cardName('runic_flute')" draggable="false" />
                  </div>
                </CardHoverPreview>
              </div>
            </CardHoverPreview>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Card.Reveal">
          <h3>Card.Reveal</h3>
          <p class="ui-gallery-caption">Readable revealed cards in a decision modal</p>
          <div class="ui-gallery-surface reveal-surface">
            <CardHoverPreview v-for="cardId in pileCards.slice(0, 2)" :key="cardId" :card-id="cardId">
              <div class="gallery-reveal-card">
                <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
        </article>
      </div>

      <div class="ui-gallery-state-row" data-component="Card.States">
        <span class="ui-gallery-state-label">Card states</span>
        <div class="card small card-image gallery-state-card actionable-card">
          <img :src="cardImageUrl('crystal')" alt="Actionable Crystal" draggable="false" />
          <span class="gallery-state-chip">Actionable</span>
        </div>
        <div class="card small card-image gallery-state-card selected-card">
          <img :src="cardImageUrl('spark')" alt="Selected Spark" draggable="false" />
          <span class="gallery-state-chip">Selected</span>
        </div>
        <div class="card small card-image gallery-state-card disabled-card">
          <img :src="cardImageUrl('crystal')" alt="Disabled Crystal" draggable="false" />
          <span class="gallery-state-chip">Disabled</span>
        </div>
      </div>
    </section>

    <section class="ui-gallery-section" data-gallery-section="piles-and-zones">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">02 · Piles and zones</p>
          <h2>Overflow, empty states and conditional zones</h2>
        </div>
        <span class="ui-gallery-note">center short rows · scroll long rows</span>
      </div>

      <div class="ui-gallery-grid ui-gallery-grid-zones">
        <article class="ui-gallery-item" data-component="ZoneScroller">
          <h3>ZoneScroller</h3>
          <p class="ui-gallery-caption">Long content keeps all cards reachable</p>
          <ZoneScroller class="ui-gallery-zone-scroll">
            <div class="ui-gallery-zone-track">
              <CardHoverPreview v-for="(cardId, index) in [...miniCards, ...miniCards]" :key="`${cardId}-${index}`" :card-id="cardId">
                <div class="card small card-image gallery-mini-card">
                  <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
                </div>
              </CardHoverPreview>
            </div>
          </ZoneScroller>
        </article>

        <article class="ui-gallery-item" data-component="Pile.Deck">
          <h3>Pile.Deck</h3>
          <p class="ui-gallery-caption">Non-empty pile</p>
          <div class="ui-gallery-pile-demo">
            <CardSurface base-class="gallery-pile-card" class="gallery-pile-card-back" image-fit="fill" :image-url="playerCardBackUrl()" image-alt="Deck">
              <template #overlay><span class="gallery-pile-count">18</span></template>
            </CardSurface>
          </div>
        </article>

        <article class="ui-gallery-item" data-component="Pile.Empty">
          <h3>Pile.Empty</h3>
          <p class="ui-gallery-caption">Empty pile preserves its identity</p>
          <div class="ui-gallery-empty-pile">Discard 0</div>
        </article>

        <article class="ui-gallery-item" data-component="Badge.Token">
          <h3>Badge.Token</h3>
          <p class="ui-gallery-caption">Stable status badge placement</p>
          <div class="ui-gallery-badge-demo">
            <TokenBadge class="gallery-token-badge" label="Power" :count="2" tone="power" />
            <TokenBadge class="gallery-token-badge gallery-token-badge-gold" label="Aether Token" :count="3" tone="aether" />
          </div>
        </article>
      </div>
    </section>

    <section class="ui-gallery-section" data-gallery-section="modals">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">03 · Modals</p>
          <h2>Decision and pile viewer examples</h2>
        </div>
        <span class="ui-gallery-note">blocking and readable card layouts</span>
      </div>
      <div class="ui-gallery-modal-launchers">
        <button class="btn primary" data-gallery-open="pile" @click="modal = 'pile'">Open PileViewer</button>
        <button class="btn" data-gallery-open="decision" @click="modal = 'decision'">Open CardSelectionModal</button>
      </div>
    </section>

    <section class="ui-gallery-section" data-gallery-section="naming">
      <div class="ui-gallery-section-heading">
        <div>
          <p class="ui-gallery-index">04 · Naming</p>
          <h2>Use component names in future requests</h2>
        </div>
      </div>
      <div class="ui-gallery-code-example">
        <code>Card.Pile + face-down + known-information + clickable</code>
        <span>Specific Deck viewer with remembered reveals</span>
      </div>
    </section>

    <ModalBase
      v-if="modal"
      unstyled
      overlay-class="ui-gallery-modal-overlay"
      panel-class="ui-gallery-modal"
      v-model:panel-ref="galleryModalEl"
      data-gallery-modal
      @overlay-click="modal = null"
    >
        <button class="ui-gallery-modal-close" aria-label="Close gallery modal" @click="modal = null">×</button>
        <template v-if="modal === 'pile'">
          <p class="ui-gallery-index">PileViewer · top → bottom</p>
          <h2>Specific Deck</h2>
          <div class="ui-gallery-modal-cards">
            <CardHoverPreview v-for="cardId in pileCards" :key="cardId" :card-id="cardId">
              <div class="gallery-modal-card">
                <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
          <button class="btn" @click="modal = null">Close</button>
        </template>
        <template v-else>
          <p class="ui-gallery-index">CardSelectionModal · large cards</p>
          <h2>Choose a revealed card</h2>
          <p class="ui-gallery-modal-hint">Readable cards remain fixed while the player makes a choice.</p>
          <div class="ui-gallery-modal-reveal">
            <CardHoverPreview v-for="cardId in pileCards.slice(0, 2)" :key="cardId" :card-id="cardId">
              <div class="gallery-modal-reveal-card">
                <img :src="cardImageUrl(cardId)" :alt="cardName(cardId)" draggable="false" />
              </div>
            </CardHoverPreview>
          </div>
          <div class="ui-gallery-modal-actions">
            <button class="btn primary" @click="modal = null">Return to Top</button>
            <button class="btn" @click="modal = null">Return to Bottom</button>
          </div>
        </template>
    </ModalBase>
  </main>
</template>

<style scoped>
.ui-gallery {
  height: var(--viewport-height);
  min-height: 0;
  max-height: var(--viewport-height);
  padding: 28px clamp(18px, 4vw, 64px) 60px;
  overflow-x: hidden;
  overflow-y: auto;
  background: radial-gradient(1100px 700px at 50% -10%, #202a43 0%, var(--bg) 68%);
}
.ui-gallery-header,
.ui-gallery-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.ui-gallery-header {
  max-width: 1440px;
  margin: 0 auto 28px;
}
.ui-gallery-header h1,
.ui-gallery-section h2,
.ui-gallery-item h3 {
  margin: 0;
}
.ui-gallery-header h1 { font-size: clamp(26px, 4vw, 42px); letter-spacing: .02em; }
.ui-gallery-intro { max-width: 620px; margin: 8px 0 0; color: var(--muted); line-height: 1.5; }
.ui-gallery-kicker,
.ui-gallery-index {
  margin: 0 0 6px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.ui-gallery-section {
  max-width: 1440px;
  margin: 0 auto 24px;
  padding: 20px;
  border: var(--pixel-border-width) solid var(--border);
  border-radius: 12px;
  background: rgba(27, 32, 48, .86);
}
.ui-gallery-section-heading { align-items: center; margin-bottom: 18px; }
.ui-gallery-note { color: var(--muted); font-size: 12px; text-align: right; }
.ui-gallery-grid { display: grid; gap: 14px; }
.ui-gallery-grid-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ui-gallery-grid-zones { grid-template-columns: minmax(0, 2fr) repeat(3, minmax(150px, 1fr)); }
.ui-gallery-item {
  min-width: 0;
  padding: 14px;
  border: var(--pixel-border-width) solid rgba(47, 56, 80, .8);
  border-radius: 9px;
  background: rgba(18, 21, 29, .58);
}
.ui-gallery-item h3 { color: var(--text); font-size: 15px; }
.ui-gallery-caption { min-height: 32px; margin: 5px 0 12px; color: var(--muted); font-size: 12px; line-height: 1.35; }
.ui-gallery-surface {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  border: var(--pixel-border-width) dashed var(--border);
  border-radius: 8px;
  background: #151a29;
}
.hand-surface { min-height: 270px; }
.mini-surface { min-height: 150px; }
.gallery-hand-card { width: 148px; height: 220px; padding: 0; }
.card.gallery-mini-card {
  width: 78px;
  min-width: 78px;
  height: 118px;
  padding: 0;
}
.gallery-hand-card img,
.gallery-mini-card img,
.gallery-pile-card img,
.gallery-face-down-card img,
.gallery-attached-supply > img,
.gallery-attached-treasure img,
.gallery-reveal-card img,
.gallery-modal-card img,
.gallery-modal-reveal-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.pile-surface { min-height: 270px; }
.gallery-pile-card {
  position: relative;
  width: var(--hand-card-width);
  height: var(--hand-card-height);
  overflow: hidden;
  border: var(--pixel-border-width) solid var(--border);
  border-radius: var(--card-radius);
  background: #151a29;
}
.gallery-pile-card-back img { object-fit: fill; }
.gallery-pile-count {
  position: absolute;
  top: 5px;
  left: 5px;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(11, 16, 32, .84);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.face-down-surface { min-height: 270px; }
.gallery-face-down-card {
  width: var(--hand-card-width);
  height: var(--hand-card-height);
  overflow: hidden;
  border: var(--pixel-border-width) solid var(--border);
  border-radius: var(--card-radius);
}
.attached-surface { min-height: 270px; }
.gallery-attached-supply {
  position: relative;
  width: 144px;
  height: 216px;
  overflow: hidden;
  border: var(--pixel-border-width) solid var(--border);
  border-radius: var(--card-radius);
}
.gallery-attached-treasure {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 50%;
  height: 50%;
  overflow: hidden;
  border: var(--pixel-border-width) solid var(--ok);
  border-radius: var(--card-radius);
}
.reveal-surface { min-height: 270px; }
.gallery-reveal-card { width: 96px; height: 144px; overflow: hidden; border: var(--pixel-border-width) solid var(--border); border-radius: var(--card-radius); }
.ui-gallery-state-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  padding: 12px;
  border: var(--pixel-border-width) dashed var(--border);
  border-radius: 8px;
}
.ui-gallery-state-label { margin-right: 4px; color: var(--muted); font-size: 12px; font-weight: 700; }
.gallery-state-card { position: relative; width: 74px; height: 110px; padding: 0; overflow: hidden; }
.gallery-state-card img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.actionable-card { border-color: var(--ok); box-shadow: 0 0 0 2px rgba(158, 206, 106, .24) inset; }
.selected-card { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(122, 162, 255, .28) inset; }
.disabled-card { opacity: .56; cursor: not-allowed; }
.gallery-state-chip { position: absolute; right: 4px; bottom: 4px; left: 4px; padding: 3px 4px; border-radius: 4px; background: rgba(11, 16, 32, .86); color: #fff; font-size: 10px; text-align: center; }
.ui-gallery-zone-scroll { min-width: 0; overflow-x: auto; padding: 8px 2px; border: var(--pixel-border-width) dashed var(--border); border-radius: 8px; background: #151a29; }
.ui-gallery-zone-track { display: flex; width: max-content; min-width: 100%; align-items: center; justify-content: center; gap: 10px; }
.ui-gallery-zone-track .card-hover-wrap { flex: 0 0 auto; }
.ui-gallery-pile-demo { display: flex; min-height: 174px; align-items: center; justify-content: center; }
.ui-gallery-empty-pile { display: grid; flex: 0 0 auto; width: var(--hand-card-width); height: var(--hand-card-height); box-sizing: border-box; place-items: center; border: var(--pixel-border-width) dashed var(--border); border-radius: var(--card-radius); color: var(--muted); font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.ui-gallery-badge-demo { display: flex; min-height: 174px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.gallery-token-badge { padding: 5px 8px; border-radius: 4px; background: #11151f; color: #fff; font-size: 13px; font-weight: 700; }
.gallery-token-badge-gold { color: #f3cf35; }
.ui-gallery-modal-launchers { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.ui-gallery-code-example { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border: var(--pixel-border-width) dashed var(--border); border-radius: 8px; background: #151a29; }
.ui-gallery-code-example code { color: var(--accent); font-size: 12px; }
.ui-gallery-code-example span { color: var(--muted); font-size: 12px; }
.ui-gallery-modal-overlay { position: fixed; inset: 0; z-index: var(--z-pile-viewer); display: grid; place-items: center; overflow: auto; padding: 20px; background: var(--overlay-backdrop); }
.ui-gallery-modal { position: relative; width: min(900px, calc(100vw - 40px)); max-height: min(88vh, 720px); overflow: auto; padding: 26px; border: var(--pixel-border-width) solid var(--border); border-radius: 12px; background: var(--panel); text-align: center; }
.ui-gallery-modal:focus { outline: none; }
.ui-gallery-modal h2 { margin: 0 0 8px; }
.ui-gallery-modal-close { position: absolute; top: 8px; right: 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 26px; line-height: 1; }
.ui-gallery-modal-hint { margin: 0 0 14px; color: var(--muted); }
.ui-gallery-modal-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 16px 0 20px; }
.gallery-modal-card { width: 100%; aspect-ratio: 2 / 3; overflow: hidden; border: var(--pixel-border-width) solid var(--border); border-radius: var(--card-radius); }
.ui-gallery-modal-reveal { display: flex; justify-content: center; gap: 20px; margin: 16px 0 20px; }
.gallery-modal-reveal-card { width: 220px; height: 330px; overflow: hidden; border: var(--pixel-border-width) solid var(--border); border-radius: var(--card-radius); }
.ui-gallery-modal-actions { display: flex; justify-content: center; gap: 10px; }
@media (max-width: 900px) {
  .ui-gallery-grid-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ui-gallery-grid-zones { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .ui-gallery { padding-inline: 10px; }
  .ui-gallery-header,
  .ui-gallery-section-heading { flex-direction: column; }
  .ui-gallery-note { text-align: left; }
  .ui-gallery-grid-cards,
  .ui-gallery-grid-zones { grid-template-columns: 1fr; }
  .ui-gallery-section { padding: 12px; }
  .ui-gallery-modal-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gallery-modal-reveal-card { width: min(42vw, 220px); height: auto; aspect-ratio: 2 / 3; }
}
</style>

<style>
/* Modal.Base renders this panel in its own component scope, so keep the
   Gallery fixture's shell selectors global while the rest stays scoped. */
.ui-gallery-modal-overlay { position: fixed; inset: 0; z-index: var(--z-pile-viewer); display: grid; place-items: center; overflow: auto; padding: 20px; background: var(--overlay-backdrop); }
.ui-gallery-modal { position: relative; width: min(900px, calc(100vw - 40px)); max-height: min(88vh, 720px); overflow: auto; padding: 26px; border: var(--pixel-border-width) solid var(--border); border-radius: 12px; background: var(--panel); text-align: center; }
.ui-gallery-modal:focus { outline: none; }
.ui-gallery-modal h2 { margin: 0 0 8px; }
.ui-gallery-modal-close { position: absolute; top: 8px; right: 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 26px; line-height: 1; }
.ui-gallery-modal-hint { margin: 0 0 14px; color: var(--muted); }
.ui-gallery-modal-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 16px 0 20px; }
.ui-gallery-modal-actions { display: flex; justify-content: center; gap: 10px; }
.ui-gallery-modal-reveal { display: flex; justify-content: center; gap: 20px; margin: 16px 0 20px; }
@media (max-width: 560px) {
  .ui-gallery-modal-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gallery-modal-reveal-card { width: min(42vw, 220px); height: auto; aspect-ratio: 2 / 3; }
}
</style>
