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
  import { errorMessage, play, screen, settings } from './store';
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
  import ErrorScreen from './screens/ErrorScreen.svelte';

  const screens = { S01: S01Title, S02: S02Prologue, S03: S03ScenarioSelect, S04: S04RoleSelect, S05: S05Main,
    S06: S06Draft, S07: S07Press, S08: S08Ending, S09: S09Review, S10: S10Settings, S11: S11Credits, error: ErrorScreen };
  const Current = $derived(screens[$screen]);

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
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  });
</script>

{#if $screen === 'error'}
  <main class="app font-{$settings.fontSize}" class:reduce-motion={$settings.reduceMotion}>
    <ErrorScreen />
  </main>
{:else}
  <svelte:boundary onerror={(error) => toErrorScreen(error)}>
    <main class="app font-{$settings.fontSize}" class:reduce-motion={$settings.reduceMotion}>
      <Current />
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
