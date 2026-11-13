<script lang="ts">
  import { audio } from '../../audio';
  import { loadReferences, loadScenario } from '../../data/loader';
  import { loc, setLang, t } from '../../i18n';
  import { loadPrologue, nextPlayCount, registerPlayStart, saveProgress } from '../../storage';
  import { applyStep, scenario, screen, selectedScenarioId, settings } from '../store';
  import { portrait } from '../illustrations';
  import type { PlayMode, RoleId, Scenario } from '../../engine/types';
  import { ROLES } from '../../engine/types';
  // エンジン本体（src/engine/index.ts）は別担当。未着の間も型検査を通すため解決エラーだけ抑止する。
  // @ts-ignore -- 実装が入れば通常の import として解決される
  import { startPlay } from '../../engine';
  import '../styles/base.css';

  type Phase = 'loading' | 'ready' | 'error';

  let current = $state<Scenario | null>(null);
  let phase = $state<Phase>('loading');
  let busy = $state<RoleId | null>(null);
  let error = $state('');
  /** 難易度（#10）。本番は判断ごとに制限時間があり、時間切れは「判断の先送り」になる */
  let mode = $state<PlayMode>('normal');

  $effect(() => {
    const id = $selectedScenarioId;
    if (!id) {
      screen.set('S03');
      return;
    }
    let alive = true;
    phase = 'loading';
    error = '';
    loadScenario(id)
      .then((sc) => {
        if (!alive) return;
        scenario.set(sc);
        current = sc;
        phase = 'ready';
      })
      .catch(() => {
        if (alive) phase = 'error';
      });
    return () => {
      alive = false;
    };
  });

  const ui = $derived.by(() => {
    setLang($settings.lang);
    return {
      title: t('sa.roles.title'),
      lead: t('sa.roles.lead'),
      info: t('sa.roles.info'),
      choose: t('sa.roles.choose'),
      back: t('sa.common.back'),
      loading: t('sa.common.loading'),
      retry: t('sa.common.retry'),
      loadError: t('sa.roles.loadError'),
      startError: t('sa.roles.startError'),
      modeLegend: t('sa.roles.mode.legend'),
      modeNormal: t('sa.roles.mode.normal'),
      modeHard: t('sa.roles.mode.hard'),
      modeHint: t('sa.roles.mode.hint'),
      modeHardNotice: t('sa.roles.mode.hardNotice'),
    };
  });

  const roles = $derived.by(() => {
    setLang($settings.lang);
    const sc = current;
    if (!sc) return [];
    return ROLES.filter((role) => Boolean(sc.roles[role])).map((role) => {
      const script = sc.roles[role]!;
      const label = t(`sa.roles.role.${role}`);
      return {
        role,
        label,
        portraitSrc: portrait(sc.id, role),
        portraitAlt: t('sa.images.portrait', { role: label }),
        info: t(`sa.roles.info.${role}`),
        intro: loc(script.intro),
        estimate: t('sa.roles.estimate', { n: script.estimateMinutes }),
        next: t('sa.roles.next', { n: nextPlayCount(sc.id, role, mode) }),
      };
    });
  });

  const scenarioTitle = $derived.by(() => {
    setLang($settings.lang);
    return current ? loc(current.title) : '';
  });

  function back(): void {
    screen.set('S03');
  }

  async function choose(role: RoleId): Promise<void> {
    const sc = current;
    if (!sc || busy) return;
    audio.playSe('select');
    busy = role;
    error = '';
    try {
      const refs = await loadReferences();
      const count = registerPlayStart(sc.id, role, mode);
      const prologue = loadPrologue() ?? { comment: '', predictedHours: null };
      const startedAt = new Date().toISOString();
      const result = startPlay(sc, role, count, prologue, startedAt, refs, mode);
      applyStep(result);
      saveProgress(result.state);
      // 本編の前にプロローグ（S02）を挟む
      screen.set('S02');
    } catch {
      error = ui.startError;
    } finally {
      busy = null;
    }
  }
</script>

<section class="screen" data-screen="S04RoleSelect">
  <header class="screen-head">
    <h1>{ui.title}</h1>
    {#if scenarioTitle}
      <p class="eyebrow">{scenarioTitle}</p>
    {/if}
    <p class="lead">{ui.lead}</p>
  </header>

  {#if phase === 'loading'}
    <p class="muted" role="status">{ui.loading}</p>
  {:else if phase === 'error'}
    <div class="panel stack">
      <p class="error-text" role="alert">{ui.loadError}</p>
      <button class="btn" onclick={back}>{ui.back}</button>
    </div>
  {:else}
    <fieldset class="mode-select">
      <legend>{ui.modeLegend}</legend>
      <div class="mode-options">
        <label class="mode-option">
          <input type="radio" name="mode" value="normal" bind:group={mode} />
          <span>{ui.modeNormal}</span>
        </label>
        <label class="mode-option">
          <input type="radio" name="mode" value="hard" bind:group={mode} />
          <span>{ui.modeHard}</span>
        </label>
      </div>
      <p class="hint">{ui.modeHint}</p>
      {#if mode === 'hard'}
        <p class="mode-notice" role="note">{ui.modeHardNotice}</p>
      {/if}
    </fieldset>

    <ul class="role-list">
      {#each roles as item (item.role)}
        <li class="role-card">
          <div class="role-card__body">
            <div class="role-card__head">
              {#if item.portraitSrc}
                <img
                  class="role-card__portrait"
                  src={item.portraitSrc}
                  alt={item.portraitAlt}
                  width="480"
                  height="480"
                  loading="lazy"
                  decoding="async"
                  onerror={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              {/if}
              <h2 class="role-card__title">{item.label}</h2>
            </div>
            <p class="role-card__intro">{item.intro}</p>
            <p class="role-card__info">
              <span class="tag">{ui.info}</span>
              {item.info}
            </p>
            <p class="role-card__meta muted small">
              {item.estimate} ・ {item.next}
            </p>
          </div>
          <button
            class="btn btn--primary btn--wide"
            disabled={busy !== null}
            onclick={() => choose(item.role)}
          >{busy === item.role ? ui.loading : ui.choose}</button>
        </li>
      {/each}
    </ul>

    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}

    <div class="row">
      <button class="btn btn--ghost" onclick={back}>{ui.back}</button>
    </div>
  {/if}
</section>

<style>
  .mode-select {
    margin: 0 0 0.8em;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--panel);
  }
  .mode-select legend {
    padding: 0 0.35em;
    color: var(--muted);
    font-size: 0.85em;
    font-weight: 600;
  }
  .mode-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.2rem;
  }
  .mode-option {
    display: flex;
    align-items: center;
    gap: 0.4em;
    cursor: pointer;
  }
  .mode-option input[type='radio'] {
    width: 1.1em;
    height: 1.1em;
    accent-color: var(--accent);
  }
  .mode-option input[type='radio']:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .mode-select .hint {
    margin: 0.5em 0 0;
    color: var(--muted);
    font-size: 0.85em;
    line-height: 1.7;
  }
  .mode-notice {
    margin: 0.5em 0 0;
    padding: 0.4rem 0.6rem;
    border-left: 4px solid var(--warn);
    border-radius: 4px;
    background: var(--card-notice);
    font-size: 0.85em;
    line-height: 1.7;
  }
  .role-card__head {
    display: flex;
    align-items: center;
    gap: 0.75em;
  }
  .role-card__portrait {
    display: block;
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-hover);
    object-fit: cover;
  }
</style>
