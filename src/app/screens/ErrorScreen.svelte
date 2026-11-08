<script lang="ts">
  import { onMount } from 'svelte';
  import { setLang, t } from '../../i18n';
  import { loadScenario } from '../../data/loader';
  import { loadProgress } from '../../storage';
  import { errorMessage, play, scenario, screen, selectedScenarioId, settings } from '../store';
  import type { PlayState } from '../../engine/types';
  import '../styles/base.css';

  let progress = $state<PlayState | null>(loadProgress());
  let resuming = $state(false);
  let fail = $state('');

  // この画面が出る直前に App が進行中プレイを保存している。開いた時点でも読み直す
  onMount(() => {
    progress = loadProgress();
  });

  const ui = $derived.by(() => {
    setLang($settings.lang);
    return {
      title: t('sa.error.title'),
      defaultMessage: t('sa.error.default'),
      detail: t('sa.error.detail'),
      continueLabel: t('sa.error.continue'),
      home: t('sa.error.home'),
      noProgress: t('sa.error.noProgress'),
      loading: t('sa.common.loading'),
      loadError: t('sa.scenarios.loadError'),
    };
  });

  async function resume(): Promise<void> {
    if (!progress || resuming) return;
    resuming = true;
    fail = '';
    try {
      const sc = await loadScenario(progress.scenarioId);
      scenario.set(sc);
      play.set(progress);
      selectedScenarioId.set(progress.scenarioId);
      screen.set('S05');
    } catch {
      fail = ui.loadError;
    } finally {
      resuming = false;
    }
  }

  function home(): void {
    screen.set('S01');
  }
</script>

<section class="screen screen--narrow error-screen" data-screen="ErrorScreen">
  <header class="screen-head">
    <h1>{ui.title}</h1>
  </header>

  <div class="error-box" role="alert">
    <p>{$errorMessage || ui.defaultMessage}</p>
    {#if $errorMessage}
      <p class="muted small">{ui.detail}: {$errorMessage}</p>
    {/if}
  </div>

  <div class="stack">
    {#if progress}
      <button class="btn btn--primary btn--wide" onclick={resume} disabled={resuming}>
        {resuming ? ui.loading : ui.continueLabel}
      </button>
      {#if fail}
        <p class="error-text" role="alert">{fail}</p>
      {/if}
    {:else}
      <p class="hint">{ui.noProgress}</p>
    {/if}
    <button class="btn btn--wide" onclick={home}>{ui.home}</button>
  </div>
</section>
