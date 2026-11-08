<script lang="ts">
  import { audio } from '../../audio';
  import { applyLang, t } from '../../i18n';
  import { DEFAULT_SETTINGS, clearAll, memoryOnly, saveSettings } from '../../storage';
  import { backTo, screen, settings } from '../store';
  import type { Lang, Settings } from '../../engine/types';
  import '../styles/base.css';

  let confirming = $state(false);
  let cleared = $state(false);
  let audioError = $state(false);

  const memOnly = memoryOnly;

  const ui = $derived.by(() => {
    applyLang($settings.lang);
    return {
      title: t('sa.settings.title'),
      lead: t('sa.settings.lead'),
      language: t('sa.settings.language'),
      fontSize: t('sa.settings.fontSize'),
      fontSmall: t('sa.settings.fontSmall'),
      fontMedium: t('sa.settings.fontMedium'),
      fontLarge: t('sa.settings.fontLarge'),
      theme: t('sa.settings.theme'),
      themeLight: t('sa.settings.themeLight'),
      themeDark: t('sa.settings.themeDark'),
      bgm: t('sa.settings.bgm'),
      se: t('sa.settings.se'),
      muted: t('sa.settings.muted'),
      reduceMotion: t('sa.settings.reduceMotion'),
      reduceMotionHint: t('sa.settings.reduceMotionHint'),
      pressTime: t('sa.settings.pressTime'),
      pressTime1: t('sa.settings.pressTime1'),
      pressTime15: t('sa.settings.pressTime15'),
      pressTime2: t('sa.settings.pressTime2'),
      data: t('sa.settings.data'),
      clear: t('sa.settings.clear'),
      clearConfirm: t('sa.settings.clearConfirm'),
      clearYes: t('sa.settings.clearYes'),
      clearNo: t('sa.settings.clearNo'),
      cleared: t('sa.settings.cleared'),
      audioError: t('sa.settings.audioError'),
      memoryOnly: t('sa.settings.memoryOnly'),
      previewSe: t('sa.settings.previewSe'),
      previewBgm: t('sa.settings.previewBgm'),
      back: t('sa.common.back'),
      langJa: t('sa.title.langJa'),
      langEn: t('sa.title.langEn'),
    };
  });

  $effect(() => {
    audioError = audio.hasLoadError();
    // 試聴などで後から失敗したときも表示を更新する
    return audio.onLoadError(() => {
      audioError = true;
    });
  });

  function apply(patch: Partial<Settings>): void {
    const next = { ...$settings, ...patch };
    settings.set(next);
    saveSettings(next);
    applyLang(next.lang);
    audio.setVolumes({ bgm: next.bgmVolume, se: next.seVolume, muted: next.muted });
  }

  function setLanguage(lang: Lang): void {
    apply({ lang });
  }

  function percent(value: number): number {
    return Math.round(value * 100);
  }

  function previewSe(): void {
    audio.playSe('select');
  }

  function previewBgm(): void {
    audio.playBgm('calm');
  }

  function doClear(): void {
    clearAll();
    const next: Settings = { ...DEFAULT_SETTINGS, lang: $settings.lang, soundNoticeShown: true };
    settings.set(next);
    saveSettings(next);
    audio.setVolumes({ bgm: next.bgmVolume, se: next.seVolume, muted: next.muted });
    confirming = false;
    cleared = true;
  }

  function back(): void {
    screen.set($backTo);
  }
</script>

<section class="screen screen--narrow" data-screen="S10Settings">
  <header class="screen-head">
    <h1>{ui.title}</h1>
    <p class="lead">{ui.lead}</p>
  </header>

  {#if audioError}
    <p class="notice notice--warn" role="status">{ui.audioError}</p>
  {/if}
  {#if memOnly}
    <p class="notice notice--warn" role="status">{ui.memoryOnly}</p>
  {/if}

  <div class="panel settings-grid">
    <div class="setting">
      <label class="setting__label" for="set-lang">{ui.language}</label>
      <div class="setting__control">
        <select
          id="set-lang"
          class="select"
          value={$settings.lang}
          onchange={(e) => setLanguage(e.currentTarget.value as Lang)}
        >
          <option value="ja">{ui.langJa}</option>
          <option value="en">{ui.langEn}</option>
        </select>
      </div>
    </div>

    <div class="setting">
      <label class="setting__label" for="set-font">{ui.fontSize}</label>
      <div class="setting__control">
        <select
          id="set-font"
          class="select"
          value={$settings.fontSize}
          onchange={(e) => apply({ fontSize: e.currentTarget.value as Settings['fontSize'] })}
        >
          <option value="small">{ui.fontSmall}</option>
          <option value="medium">{ui.fontMedium}</option>
          <option value="large">{ui.fontLarge}</option>
        </select>
      </div>
    </div>

    <div class="setting">
      <label class="setting__label" for="set-theme">{ui.theme}</label>
      <div class="setting__control">
        <select
          id="set-theme"
          class="select"
          value={$settings.theme}
          onchange={(e) => apply({ theme: e.currentTarget.value as Settings['theme'] })}
        >
          <option value="light">{ui.themeLight}</option>
          <option value="dark">{ui.themeDark}</option>
        </select>
      </div>
    </div>

    <div class="setting">
      <label class="setting__label" for="set-bgm">
        {ui.bgm} <span class="value">{percent($settings.bgmVolume)}%</span>
      </label>
      <div class="setting__control">
        <input
          id="set-bgm"
          class="range"
          type="range"
          min="0"
          max="100"
          step="5"
          value={percent($settings.bgmVolume)}
          oninput={(e) => apply({ bgmVolume: Number(e.currentTarget.value) / 100 })}
        />
        <button class="btn btn--ghost btn--small" onclick={previewBgm}>{ui.previewBgm}</button>
      </div>
    </div>

    <div class="setting">
      <label class="setting__label" for="set-se">
        {ui.se} <span class="value">{percent($settings.seVolume)}%</span>
      </label>
      <div class="setting__control">
        <input
          id="set-se"
          class="range"
          type="range"
          min="0"
          max="100"
          step="5"
          value={percent($settings.seVolume)}
          oninput={(e) => apply({ seVolume: Number(e.currentTarget.value) / 100 })}
        />
        <button class="btn btn--ghost btn--small" onclick={previewSe}>{ui.previewSe}</button>
      </div>
    </div>

    <div class="setting">
      <div class="setting__control">
        <label class="check">
          <input
            type="checkbox"
            checked={$settings.muted}
            onchange={(e) => apply({ muted: e.currentTarget.checked })}
          />
          <span>{ui.muted}</span>
        </label>
      </div>
    </div>

    <div class="setting">
      <div class="setting__control">
        <label class="check">
          <input
            type="checkbox"
            checked={$settings.reduceMotion}
            onchange={(e) => apply({ reduceMotion: e.currentTarget.checked })}
          />
          <span>{ui.reduceMotion}</span>
        </label>
      </div>
      <p class="hint">{ui.reduceMotionHint}</p>
    </div>

    <div class="setting">
      <label class="setting__label" for="set-press">{ui.pressTime}</label>
      <div class="setting__control">
        <select
          id="set-press"
          class="select"
          value={String($settings.pressTimeScale)}
          onchange={(e) => apply({ pressTimeScale: Number(e.currentTarget.value) as Settings['pressTimeScale'] })}
        >
          <option value="1">{ui.pressTime1}</option>
          <option value="1.5">{ui.pressTime15}</option>
          <option value="2">{ui.pressTime2}</option>
        </select>
      </div>
    </div>
  </div>

  <div class="panel stack">
    <h2>{ui.data}</h2>
    {#if !confirming}
      <div class="row">
        <button class="btn btn--danger" onclick={() => { confirming = true; cleared = false; }}>{ui.clear}</button>
      </div>
    {:else}
      <div class="dialog" role="alertdialog" aria-labelledby="clear-title">
        <p id="clear-title">{ui.clearConfirm}</p>
        <div class="row">
          <button class="btn btn--danger" onclick={doClear}>{ui.clearYes}</button>
          <button class="btn" onclick={() => (confirming = false)}>{ui.clearNo}</button>
        </div>
      </div>
    {/if}
    {#if cleared}
      <p class="notice notice--info" role="status">{ui.cleared}</p>
    {/if}
  </div>

  <div class="row">
    <button class="btn btn--ghost" onclick={back}>{ui.back}</button>
  </div>
</section>
