<script module lang="ts">
  import type { PlayState as SavedPlayState, Scenario as LoadedScenario } from '../../engine/types';
  import { versionChanged } from '../parts/logic';

  export type ResumeScreen = 'S05' | 'S06' | 'S07' | 'S08';

  /** 保存した状態から、再開する画面を決める（終了 > 会見 > 文案 > 本編） */
  export function resumeScreen(state: SavedPlayState): ResumeScreen {
    if (state.finished) return 'S08';
    if (state.press) return 'S07';
    if (state.pendingDraft) return 'S06';
    return 'S05';
  }

  /** 再開先に合わせた BGM。会見は press、それ以外はフェーズの曲 */
  export function resumeBgm(state: SavedPlayState, scenario: LoadedScenario): string {
    if (resumeScreen(state) === 'S07') return 'press';
    return scenario.audio.bgmByPhase?.[state.phase] ?? scenario.audio.bgmDefault;
  }

  // 版の確認はエラー画面でも使うため logic.ts に置き、ここからは再公開する
  export { versionChanged };
</script>

<script lang="ts">
  import { audio } from '../../audio';
  import { loadScenario } from '../../data/loader';
  import {
    applyLang, notice, setLang, setPendingNotice, t, versionChangedNotice,
  } from '../../i18n';
  import { loadProgress, saveProgress, saveSettings } from '../../storage';
  import { backTo, errorMessage, play, scenario, screen, selectedScenarioId, settings } from '../store';
  import { ACHIEVEMENTS_LABEL_KEY } from '../achievements';
  import S13Achievements from './S13Achievements.svelte';
  import type { Lang, PlayState } from '../../engine/types';
  import '../styles/base.css';

  let progress = $state<PlayState | null>(loadProgress());
  let resuming = $state(false);
  let showingAchievements = $state(false);

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
      achievements: t(ACHIEVEMENTS_LABEL_KEY),
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
    applyLang(lang);
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
    const saved = progress;
    if (!saved || resuming) return;
    resuming = true;
    try {
      try {
        await audio.unlock();
      } catch {
        // 音を有効にできなくても、無音で再開する
      }
      const sc = await loadScenario(saved.scenarioId);

      if (versionChanged(saved, sc)) {
        // 初版では旧版の続きを用意しない。遊び直しはシナリオ選択から
        saveProgress(null);
        progress = null;
        setPendingNotice(versionChangedNotice($settings.lang));
        screen.set('S03');
        return;
      }

      scenario.set(sc);
      play.set($state.snapshot(saved) as PlayState);
      selectedScenarioId.set(saved.scenarioId);
      audio.playBgm(resumeBgm(saved, sc));
      screen.set(resumeScreen(saved));
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
      <button class="btn btn--ghost" onclick={() => (showingAchievements = true)}>{ui.achievements}</button>
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

  {#if showingAchievements}
    <S13Achievements onBack={() => (showingAchievements = false)} />
  {/if}
</section>
