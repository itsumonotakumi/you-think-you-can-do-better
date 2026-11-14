<script lang="ts">
  import { onMount } from 'svelte';
  import { audio } from '../../audio';
  import { loadReferences, loadScenario } from '../../data/loader';
  import { loc, setLang, t } from '../../i18n';
  import { beginPlayOnce, clearPrologueDraft, loadPrologue, nextPlayCount, saveProgress } from '../../storage';
  import { applyStep, scenario, screen, selectedScenarioId, settings } from '../store';
  import { portrait } from '../illustrations';
  import {
    EMPTY_RANKING_PROFILE, isRankingEnabled, isValidNickname, loadRankingProfile,
    normalizeNickname, RANKING_KEYS, saveRankingProfile,
  } from '../ranking';
  import type { RankingProfile } from '../ranking';
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

  // #7 ランキング: プレイ前にニックネームを決める。保存済みなら入力済みで出す
  const rankingEnabled = isRankingEnabled();
  let rankingProfile = $state<RankingProfile>({ ...EMPTY_RANKING_PROFILE });
  let nickname = $state('');
  let optOut = $state(false);
  let nicknameError = $state(false);

  onMount(() => {
    if (!rankingEnabled) return;
    const saved = loadRankingProfile();
    rankingProfile = saved;
    // 入力欄がすでに触られている場合は上書きしない
    if (nickname === '') nickname = saved.nickname;
    optOut = saved.optOut;
  });

  function saveNickname(nextNickname: string, nextOptOut: boolean): RankingProfile {
    optOut = nextOptOut;
    const saved = {
      ...rankingProfile,
      nickname: normalizeNickname(nextNickname),
      optOut: nextOptOut,
    };
    saveRankingProfile(saved);
    rankingProfile = saved;
    return saved;
  }

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
      nicknameHeading: t('rk.nickname.heading'),
      nicknameLabel: t('rk.nickname.label'),
      nicknameHint: t('rk.nickname.hint'),
      nicknameWarning: t(RANKING_KEYS.nicknameWarning),
      autoNotice: t(RANKING_KEYS.autoNotice),
      nicknameRequired: t('rk.nickname.required'),
      nicknameInvalid: t('rk.nickname.invalid'),
      optOutLabel: t(RANKING_KEYS.optOutLabel),
      optOutHint: t('rk.optout.hint'),
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
    if (rankingEnabled && !isValidNickname(nickname)) {
      nicknameError = true;
      return;
    }
    audio.playSe('select');
    busy = role;
    error = '';
    try {
      if (rankingEnabled) {
        // 変更されていればここで保存する（次回からは入力済みで出す）
        saveNickname(nickname, optOut);
        nicknameError = false;
      }
      const refs = await loadReferences();
      const startedAt = new Date().toISOString();
      // 同じ startedAt で二度呼ばれてもプレイ回数を数え直さない（再読み込み対策）
      const count = beginPlayOnce(sc.id, role, mode, startedAt);
      const prologue = loadPrologue() ?? { comment: '', predictedHours: null };
      const result = startPlay(sc, role, count, prologue, startedAt, refs, mode);
      // 前のプレイの入力途中の内容を持ち越さない
      clearPrologueDraft();
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
    {#if rankingEnabled}
      <section class="panel nickname-panel" aria-labelledby="ranking-nickname-heading" data-ranking-nickname-panel>
        <h2 id="ranking-nickname-heading">{ui.nicknameHeading}</h2>
        <label class="field">
          <span>{ui.nicknameLabel}</span>
          <input
            type="text"
            maxlength={16}
            autocomplete="nickname"
            data-ranking-nickname
            bind:value={nickname}
            oninput={() => { nicknameError = false; }}
            onchange={() => { if (isValidNickname(nickname)) saveNickname(nickname, optOut); }}
            aria-invalid={nicknameError}
            aria-describedby="ranking-nickname-hint"
          />
        </label>
        <p id="ranking-nickname-hint" class="hint">{ui.nicknameHint}</p>
        {#if !isValidNickname(nickname)}
          <p class="hint" role="status" data-ranking-nickname-required>{ui.nicknameRequired}</p>
        {/if}
        {#if nicknameError}
          <p class="error-text" role="alert">{ui.nicknameInvalid}</p>
        {/if}
        <p class="notice notice--warn" data-ranking-warning>{ui.nicknameWarning}</p>
        <p class="hint" data-ranking-auto-notice>{ui.autoNotice}</p>
        <label class="check">
          <input
            type="checkbox"
            data-ranking-optout
            checked={optOut}
            onchange={(event) => saveNickname(nickname, (event.currentTarget as HTMLInputElement).checked)}
          />
          <span>{ui.optOutLabel}</span>
        </label>
        <p class="hint">{ui.optOutHint}</p>
      </section>
    {/if}

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
            disabled={busy !== null || (rankingEnabled && !isValidNickname(nickname))}
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
  .nickname-panel {
    display: grid;
    gap: 0.5rem;
    margin: 0 0 0.8em;
  }
  .nickname-panel h2 {
    margin: 0;
    font-size: 0.95em;
    color: var(--muted);
    font-weight: 600;
  }
  .nickname-panel .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85em;
    color: var(--muted);
  }
  .nickname-panel input[type='text'] {
    min-height: 2.4em;
    padding: 0.35em 0.5em;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
  }
  .check {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    line-height: 1.6;
  }
  .check input {
    margin-top: 0.3rem;
  }
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
