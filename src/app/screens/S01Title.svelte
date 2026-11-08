<script lang="ts">
  import { audio } from '../../audio';
  import { loadScenario } from '../../data/loader';
  import { notice, setLang, t } from '../../i18n';
  import { loadProgress, saveSettings } from '../../storage';
  import { backTo, errorMessage, play, scenario, screen, selectedScenarioId, settings } from '../store';
  import type { Lang, PlayState } from '../../engine/types';
  import '../styles/base.css';

  let progress = $state<PlayState | null>(loadProgress());
  let resuming = $state(false);

  const ui = $derived.by(() => {
    setLang($settings.lang);
    return {
      product: t('sa.title.product'),
      tagline: t('sa.title.tagline'),
      sub: t('sa.title.sub'),
      start: t('sa.title.start'),
      continueLabel: t('sa.title.continue'),
      about: t('sa.title.about'),
      soundNotice: t('sa.title.soundNotice'),
      langJa: t('sa.title.langJa'),
      langEn: t('sa.title.langEn'),
      settings: t('sa.common.settings'),
      credits: t('sa.common.credits'),
      language: t('sa.common.language'),
      credit: t('sa.title.credit'),
      loading: t('sa.common.loading'),
      loadError: t('sa.scenarios.loadError'),
      purpose: notice('purpose'),
      criminal: notice('criminal'),
      score: notice('score'),
      resumeTarget: (scenarioId: string, role: string) =>
        t('sa.title.resumeTarget', { scenario: scenarioId, role: t(`sa.roles.role.${role}`) }),
    };
  });

  function chooseLang(lang: Lang): void {
    if ($settings.lang === lang) return;
    const next = { ...$settings, lang };
    settings.set(next);
    saveSettings(next);
    setLang(lang);
  }

  async function start(): Promise<void> {
    try {
      await audio.unlock();
    } catch {
      // 音を有効にできなくても、無音で先に進める
    }
    audio.playBgm('title');
    if (!$settings.soundNoticeShown) {
      const next = { ...$settings, soundNoticeShown: true };
      settings.set(next);
      saveSettings(next);
    }
    screen.set('S03');
  }

  async function resume(): Promise<void> {
    if (!progress || resuming) return;
    resuming = true;
    try {
      const sc = await loadScenario(progress.scenarioId);
      scenario.set(sc);
      play.set(progress);
      selectedScenarioId.set(progress.scenarioId);
      screen.set('S05');
    } catch {
      errorMessage.set(ui.loadError);
      screen.set('error');
    } finally {
      resuming = false;
    }
  }

  function open(id: 'S10' | 'S11'): void {
    backTo.set('S01');
    screen.set(id);
  }
</script>

<section class="screen screen--narrow title-screen" data-screen="S01Title">
  <header class="title-hero">
    <p class="eyebrow">{ui.tagline}</p>
    <h1 class="title-name">{ui.product}</h1>
    <p class="title-sub">{ui.sub}</p>
  </header>

  <div class="lang-switch" role="group" aria-label={ui.language}>
    <button
      class="btn btn--ghost"
      class:is-active={$settings.lang === 'ja'}
      aria-pressed={$settings.lang === 'ja'}
      onclick={() => chooseLang('ja')}
    >{ui.langJa}</button>
    <button
      class="btn btn--ghost"
      class:is-active={$settings.lang === 'en'}
      aria-pressed={$settings.lang === 'en'}
      onclick={() => chooseLang('en')}
    >{ui.langEn}</button>
  </div>

  <div class="stack">
    <button class="btn btn--primary btn--wide" onclick={start}>{ui.start}</button>

    {#if progress}
      <button class="btn btn--wide" onclick={resume} disabled={resuming}>
        {resuming ? ui.loading : ui.continueLabel}
      </button>
      <p class="hint">{ui.resumeTarget(progress.scenarioId, progress.role)}</p>
    {/if}

    <div class="row row--center">
      <button class="btn btn--ghost" onclick={() => open('S10')}>{ui.settings}</button>
      <button class="btn btn--ghost" onclick={() => open('S11')}>{ui.credits}</button>
    </div>
  </div>

  {#if !$settings.soundNoticeShown}
    <p class="notice notice--info" role="status">{ui.soundNotice}</p>
  {/if}

  <div class="panel notice-stack">
    <h2>{ui.about}</h2>
    <p>{ui.purpose}</p>
    <p>{ui.criminal}</p>
    <p>{ui.score}</p>
  </div>

  <p class="footer-note">{ui.credit}</p>
</section>
