<script module lang="ts">
  /** 例外から表示用の文言を取り出す（画面外の例外も文字にする） */
  export function reasonMessage(reason: unknown): string {
    if (reason instanceof Error) return reason.message;
    if (typeof reason === 'string') return reason;
    if (reason === null || reason === undefined) return '';
    try {
      return String(reason);
    } catch {
      return '';
    }
  }
</script>

<script lang="ts">
  // 画面ルーター（オーケストレーター所有）
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { audio } from '../audio';
  import {
    advanceCaption, captionHistory, captions, cues, enqueueCaptions, errorMessage, play,
    resetCaptions, screen, settings,
  } from './store';
  import { runFxCues, clearFx } from './effects';
  import './effects/effects.css';
  import { claimCaptionCues, claimCues } from './parts/cueMemory';
  import { cueCaptions } from './parts/logic';
  import { showsCaptions } from './parts/captionScreens';
  import CaptionBar from './parts/CaptionBar.svelte';
  import MuteButton from './parts/MuteButton.svelte';
  import { saveProgress } from '../storage';
  import { t } from '../i18n';
  import S01Title from './screens/S01Title.svelte';
  import S02Prologue from './screens/S02Prologue.svelte';
  import S03ScenarioSelect from './screens/S03ScenarioSelect.svelte';
  import S04RoleSelect from './screens/S04RoleSelect.svelte';
  import S05Main from './screens/S05Main.svelte';
  import S06Draft from './screens/S06Draft.svelte';
  import S07Press from './screens/S07Press.svelte';
  import S08Ending from './screens/S08Ending.svelte';
  import S09Review from './screens/S09Review.svelte';
  import S10Settings from './screens/S10Settings.svelte';
  import S11Credits from './screens/S11Credits.svelte';
  import S12Ranking from './screens/S12Ranking.svelte';
  import ErrorScreen from './screens/ErrorScreen.svelte';

  const screens = { S01: S01Title, S02: S02Prologue, S03: S03ScenarioSelect, S04: S04RoleSelect, S05: S05Main,
    S06: S06Draft, S07: S07Press, S08: S08Ending, S09: S09Review, S10: S10Settings, S11: S11Credits,
    S12: S12Ranking, error: ErrorScreen };
  const Current = $derived(screens[$screen]);

  /** 字幕を1件表示しておく時間（ミリ秒） */
  const CAPTION_DISPLAY_MS = 2400;

  // 字幕と履歴は、プレイ中と結果確認の画面でだけ出す（共通の親が1か所で受け持つ）
  const captionVisible = $derived(showsCaptions($screen));
  const hasCaptions = $derived($captions.length > 0 || $captionHistory.length > 0);

  let systemReduce = $state(false);
  let lastStartedAt = '';

  $effect(() => {
    // 設定画面で配色を変えたとき、その場で html に反映する
    document.documentElement.dataset.theme = $settings.theme;
  });

  $effect(() => {
    // 新しいプレイでは、前のプレイの字幕を持ち越さない
    const startedAt = $play?.startedAt ?? '';
    if (!startedAt || startedAt === lastStartedAt) return;
    lastStartedAt = startedAt;
    resetCaptions();
  });

  $effect(() => {
    // 画面を移るときは演出クラスを必ず外す（結果画面に早送りの横縞が残る不具合の防止）。
    // プレイ中をまたいでよい深夜・期限の色だけは残す。
    const current = $screen;
    const keep = current === 'S05' || current === 'S06' || current === 'S07'
      ? (['night', 'deadline'] as const)
      : [];
    clearFx(keep);
  });

  $effect(() => {
    // 演出キューは遷移先の画面に関係なく、ここで一度だけ処理する（設計書 10章）
    const list = $cues;
    if (!list || list.length === 0) return;
    if (claimCues(list)) {
      audio.runCues(list);
      runFxCues(list, $settings.reduceMotion || systemReduce);
    }
    // 会見画面などが先に音を処理しても、字幕だけは必ず作る
    if (claimCaptionCues(list)) enqueueCaptions(cueCaptions(list));
  });

  $effect(() => {
    // 字幕は待ち行列の先頭から1件ずつ出し、表示し終えたら履歴へ移す。
    // 出していない画面（タイトルなど）では進めない＝表示していない字幕を消費しない
    if (!captionVisible) return;
    const head = $captions[0];
    if (!head) return;
    const timer = setTimeout(() => advanceCaption(head.captionId), CAPTION_DISPLAY_MS);
    return () => clearTimeout(timer);
  });

  /** 予期しない例外: 進行中のプレイを保存してからエラー画面へ移す（設計書 13章） */
  function toErrorScreen(reason: unknown): void {
    try {
      const state = get(play);
      if (state && !state.finished) saveProgress(state);
    } catch {
      // 保存できなくてもエラー画面へは進む（storage 側が memoryOnly に切り替わる）
    }
    errorMessage.set(reasonMessage(reason));
    screen.set('error');
  }

  onMount(() => {
    const onError = (event: ErrorEvent): void => {
      toErrorScreen(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      toErrorScreen(event.reason);
    };
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    systemReduce = motionQuery.matches;
    const handleMotion = (event: MediaQueryListEvent): void => {
      systemReduce = event.matches;
    };
    motionQuery.addEventListener('change', handleMotion);

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      motionQuery.removeEventListener('change', handleMotion);
    };
  });
</script>

{#if $screen === 'error'}
  <main class="app font-{$settings.fontSize}" class:reduce-motion={$settings.reduceMotion}>
    <ErrorScreen />
  </main>
{:else}
  <svelte:boundary onerror={(error) => toErrorScreen(error)}>
    <main
      class="app font-{$settings.fontSize}"
      class:reduce-motion={$settings.reduceMotion}
      class:has-captions={captionVisible && hasCaptions}
    >
      <Current />

      {#if captionVisible && hasCaptions}
        <div class="caption-host">
          <CaptionBar />
        </div>
      {/if}

      <MuteButton raised={captionVisible && hasCaptions} />
    </main>

    {#snippet failed(_error, reset)}
      <main class="app font-{$settings.fontSize}" class:reduce-motion={$settings.reduceMotion}>
        <section class="screen screen--narrow" data-screen="ErrorScreen">
          <header class="screen-head">
            <h1>{t('sa.error.title')}</h1>
          </header>
          <div class="error-box" role="alert">
            <p>{$errorMessage || t('sa.error.default')}</p>
          </div>
          <div class="stack">
            <button type="button" class="btn btn--primary btn--wide" onclick={reset}>
              {t('sa.error.continue')}
            </button>
          </div>
        </section>
      </main>
    {/snippet}
  </svelte:boundary>
{/if}

<style>
  /* 字幕は画面の下に固定する。どの画面でも同じ位置で読めるようにし、内容を押しのけない */
  .app.has-captions {
    padding-bottom: 5.5rem;
  }
  .caption-host {
    position: fixed;
    inset: auto 0 0.75rem;
    z-index: 30;
    display: flex;
    justify-content: center;
    padding: 0 0.75rem;
    pointer-events: none;
  }
  .caption-host :global(.caption-bar) {
    max-width: 46rem;
    /* 本文の操作を邪魔しない。触れるのは履歴の開閉だけ */
    pointer-events: none;
  }
  .caption-host :global(.history-box) {
    pointer-events: auto;
  }
  @media (max-width: 640px) {
    .app.has-captions {
      padding-bottom: 7rem;
    }
  }
  /* エンディングを印刷するときは、画面に固定した字幕を出さない */
  @media print {
    .caption-host {
      display: none;
    }
    .app.has-captions {
      padding-bottom: 0;
    }
  }
</style>
