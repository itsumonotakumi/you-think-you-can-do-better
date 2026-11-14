<script lang="ts">
  // S08 の結果を画像と投稿文にして共有する。担当: f-share。
  // 画像は端末内の canvas で作り、外部へ送らない。
  import { tick } from 'svelte';
  import type { EndingResult, PlayState, Scenario } from '../../engine/types';
  import { t } from '../../i18n';
  import { settings } from '../store';
  import {
    buildShareCard, localizedFor, shareFileName, siteUrl, type ShareCard,
  } from '../share/data';
  import { headlineFor } from '../headline';
  import {
    SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, canvasToBlob, renderShareCanvas,
  } from '../share/image';
  import {
    SHARE_PLATFORMS, buildPostText, type SharePlatform,
  } from '../share/text';
  import {
    canShareFiles, copyText, downloadBlob, shareFiles,
  } from '../share/browser';

  interface Props {
    scenario: Scenario;
    playState: PlayState;
    result: EndingResult;
    /** #8 翌朝の新聞見出し（任意）。省略時は scenario.headlines から取る */
    headline?: string;
    /** #9 称号（任意） */
    achievement?: string;
  }

  let { scenario, playState, result, headline, achievement }: Props = $props();

  let open = $state(false);
  let generating = $state(false);
  let imageReady = $state(false);
  let error = $state('');
  let platform = $state<SharePlatform>('x');
  let card = $state<ShareCard | null>(null);
  let blob = $state<Blob | null>(null);
  let shareAvailable = $state(false);
  let copied = $state(false);
  let saved = $state(false);
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();
  let openButton: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDialogElement | undefined = $state();

  let requestSeq = 0;

  const postText = $derived(card ? buildPostText(card, platform) : '');

  function currentCard(): ShareCard {
    // 見出しは結果画面と同じ共通の関数で決める（シナリオの上書きも反映される）
    const fromHeadline = localizedFor(headlineFor(playState, scenario), $settings.lang);
    return buildShareCard({
      scenario,
      result,
      lang: $settings.lang,
      roleLabel: t(`sa.roles.role.${playState.role}`),
      productName: t('sa.title.product'),
      url: siteUrl(),
      headline: (headline ?? '').trim() || fromHeadline,
      achievement,
    });
  }

  async function openPanel(): Promise<void> {
    if (open) return;
    const seq = ++requestSeq;
    open = true;
    generating = true;
    imageReady = false;
    error = '';
    copied = false;
    saved = false;
    blob = null;
    shareAvailable = false;
    const data = currentCard();
    card = data;

    await tick();
    // モーダルとして開き、背面の操作とフォーカスの移動を止める
    if (panelEl && !panelEl.open) panelEl.showModal();
    closeButton?.focus();
    const canvas = canvasEl;
    if (!canvas) {
      generating = false;
      error = t('share.imageFailed');
      return;
    }
    try {
      await renderShareCanvas(canvas, data);
      if (seq !== requestSeq) return;
      const next = await canvasToBlob(canvas);
      if (seq !== requestSeq) return;
      blob = next;
      imageReady = true;
      shareAvailable = next ? canShareFiles(next, shareFileName(data)) : false;
    } catch {
      if (seq === requestSeq) error = t('share.imageFailed');
    } finally {
      if (seq === requestSeq) generating = false;
    }
  }

  function closePanel(): void {
    requestSeq += 1;
    if (panelEl?.open) panelEl.close();
    open = false;
    card = null;
    blob = null;
    generating = false;
    imageReady = false;
    shareAvailable = false;
    error = '';
    // 閉じたら、開いたボタンへフォーカスを戻す
    void tick().then(() => openButton?.focus());
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    closePanel();
  }

  async function saveImage(): Promise<void> {
    if (!card) return;
    const target = blob ?? (canvasEl ? await canvasToBlob(canvasEl) : null);
    if (!target) {
      error = t('share.imageFailed');
      return;
    }
    downloadBlob(target, shareFileName(card));
    saved = true;
  }

  async function copyPost(): Promise<void> {
    const copiedOk = await copyText(postText);
    if (copiedOk) {
      copied = true;
      error = '';
    } else {
      error = t('share.copyFailed');
    }
  }

  async function sharePost(): Promise<void> {
    if (!card || !blob) return;
    const shared = await shareFiles(blob, shareFileName(card), postText, card.url);
    if (!shared) error = t('share.shareFailed');
  }
</script>

<button
  type="button"
  class="btn share-open"
  bind:this={openButton}
  onclick={openPanel}
  aria-haspopup="dialog"
  aria-expanded={open}
>
  {t('share.open')}
</button>

{#if open}
  <div class="share-backdrop">
    <dialog
      bind:this={panelEl}
      class="share-panel"
      aria-modal="true"
      aria-labelledby="share-title"
      oncancel={handleCancel}
      onclose={() => { if (open) closePanel(); }}
    >
      <div class="share-head">
        <h2 id="share-title">{t('share.title')}</h2>
        <button type="button" class="btn btn--small share-close" bind:this={closeButton} onclick={closePanel}>
          {t('share.close')}
        </button>
      </div>

      <div class="share-canvas-wrap" role="img" aria-label={t('share.imageAlt')}>
        <canvas
          bind:this={canvasEl}
          class="share-canvas"
          width={SHARE_IMAGE_WIDTH}
          height={SHARE_IMAGE_HEIGHT}
        ></canvas>
      </div>

      {#if generating}
        <p class="share-status" aria-live="polite">{t('share.generating')}</p>
      {/if}
      {#if error}
        <p class="notice notice--warn share-error" role="alert">{error}</p>
      {/if}

      <div class="share-row">
        <label for="share-platform">{t('share.platform')}</label>
        <select id="share-platform" class="share-platform" bind:value={platform} onchange={() => (copied = false)}>
          {#each SHARE_PLATFORMS as value (value)}
            <option value={value}>{t(`share.platform.${value}`)}</option>
          {/each}
        </select>
      </div>

      <label class="share-text-label" for="share-text">{t('share.postText')}</label>
      <textarea id="share-text" class="share-text" readonly rows="6">{postText}</textarea>

      <div class="share-actions">
        <button
          type="button"
          class="btn btn--primary share-save"
          onclick={saveImage}
          disabled={!imageReady}
        >
          {saved ? t('share.saved') : t('share.save')}
        </button>
        <button type="button" class="btn share-copy" onclick={copyPost} disabled={!card}>
          {copied ? t('share.copied') : t('share.copy')}
        </button>
        {#if shareAvailable}
          <button type="button" class="btn share-api" onclick={sharePost}>
            {t('share.share')}
          </button>
        {/if}
      </div>

      <p class="hint">{t('share.hint')}</p>
    </dialog>
  </div>
{/if}

<style>
  .share-open {
    white-space: nowrap;
  }
  .share-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1.5rem 1rem;
    overflow-y: auto;
    background: var(--overlay);
  }
  .share-panel {
    position: fixed;
    inset: 0;
    width: min(60rem, calc(100% - 2rem));
    max-width: min(60rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
    overflow-y: auto;
    padding: 1rem 1.1rem 1.2rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }
  /* 暗幕は背面の .share-backdrop が描く */
  .share-panel::backdrop {
    background: transparent;
  }
  .share-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }
  .share-head h2 {
    margin: 0;
    font-size: 1.05em;
  }
  .share-canvas {
    display: block;
    width: 100%;
    height: auto;
    margin: 0.7rem 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #0f172a;
  }
  .share-status {
    margin: 0.2rem 0;
    color: var(--muted);
  }
  .share-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0.4rem 0;
  }
  .share-row label {
    color: var(--muted);
    font-size: 0.9em;
  }
  .share-text-label {
    display: block;
    margin-top: 0.4rem;
    color: var(--muted);
    font-size: 0.9em;
  }
  .share-text {
    width: 100%;
    box-sizing: border-box;
    margin: 0.25rem 0 0.6rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--bg-soft);
    color: var(--text);
    font: inherit;
    line-height: 1.7;
    resize: vertical;
  }
  .share-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  @media (max-width: 639px) {
    .share-backdrop {
      padding: 0.6rem;
    }
    .share-panel {
      width: calc(100% - 1.2rem);
      max-width: calc(100% - 1.2rem);
      max-height: calc(100dvh - 1.2rem);
      padding: 0.8rem;
    }
    .share-actions .btn {
      flex: 1 1 auto;
    }
    .share-open {
      width: 100%;
    }
  }
</style>
