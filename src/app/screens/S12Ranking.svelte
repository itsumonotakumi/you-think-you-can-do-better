<script lang="ts">
  // S12 ランキング（#7）。API のベース URL が無いビルドでは何も表示しない。
  // プレイ結果は S08 で自動登録する。ここでは表示・ニックネーム変更・削除だけを行う。
  import { onMount } from 'svelte';
  import { loadIndex } from '../../data/loader';
  import type {
    PlayMode, RankingEntry, RankingResponse, RoleId, ScenarioSummary,
  } from '../../engine/types';
  import { loc, t } from '../../i18n';
  import { play, screen, settings } from '../store';
  import {
    deletePlays, EMPTY_RANKING_PROFILE, fetchRanking, isRankingEnabled, isValidNickname,
    loadDeleteKey, loadRankingProfile, normalizeNickname, RANKING_KEYS, saveRankingProfile,
  } from '../ranking';
  import type { RankingProfile } from '../ranking';

  const enabled = isRankingEnabled();

  let index = $state<ScenarioSummary[]>([]);
  let indexError = $state(false);
  let scenarioId = $state('');
  let role = $state<RoleId>('executive');
  let period = $state<'week' | 'all'>('week');
  /** 表示するランキングの難易度。直前のプレイとは独立して切り替えられる */
  let mode = $state<PlayMode>($play?.mode === 'hard' ? 'hard' : 'normal');
  let ranking = $state<RankingResponse | null>(null);
  let loading = $state(false);
  let loadError = $state(false);
  let reloadSeq = $state(0);

  let profile = $state<RankingProfile>({ ...EMPTY_RANKING_PROFILE });
  let nickname = $state('');
  let nicknameError = $state(false);
  let nicknameSaved = $state(false);
  let optOut = $state(false);

  type DeleteState = { kind: 'ok'; count: number } | { kind: 'none' } | { kind: 'error' } | { kind: 'nokey' } | null;
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deleteState = $state<DeleteState>(null);

  const summary = $derived(index.find((item) => item.id === scenarioId) ?? null);
  const roleOptions = $derived(summary?.roles.map((item) => item.role) ?? []);
  const finished = $derived($play?.finished === true);

  $effect(() => {
    // 条件が変わるたびに取り直す。古い応答は捨てる
    const targetScenario = scenarioId;
    const targetRole = role;
    const targetPeriod = period;
    const targetMode = mode;
    void reloadSeq;
    if (!enabled || targetScenario === '') return;

    let cancelled = false;
    loading = true;
    loadError = false;
    void fetchRanking({
      scenarioId: targetScenario,
      role: targetRole,
      period: targetPeriod,
      mode: targetMode,
    }).then((response) => {
      if (cancelled) return;
      ranking = response;
      loadError = response === null;
      loading = false;
    });
    return () => {
      cancelled = true;
    };
  });

  onMount(() => {
    // ランキングが無効なビルドでは、通信も UI も一切出さない
    if (!enabled) return;
    let cancelled = false;
    profile = loadRankingProfile();
    nickname = profile.nickname;
    optOut = profile.optOut;
    void loadIndex()
      .then((list) => {
        if (cancelled) return;
        index = list;
        const saved = $play;
        if (saved) {
          scenarioId = saved.scenarioId;
          role = saved.role;
          return;
        }
        const first = list[0];
        if (first) {
          scenarioId = first.id;
          role = first.roles[0]?.role ?? 'executive';
        }
      })
      .catch(() => {
        if (!cancelled) indexError = true;
      });
    return () => {
      cancelled = true;
    };
  });

  function changeScenario(id: string): void {
    scenarioId = id;
    const found = index.find((item) => item.id === id);
    if (!found || !found.roles.some((item) => item.role === role)) {
      role = found?.roles[0]?.role ?? 'executive';
    }
  }

  function changeRole(value: string): void {
    const next = roleOptions.find((item) => item === value);
    if (next) role = next;
  }

  function saveNickname(): void {
    if (!isValidNickname(nickname)) {
      nicknameError = true;
      nicknameSaved = false;
      return;
    }
    const next = { ...profile, nickname: normalizeNickname(nickname), optOut };
    saveRankingProfile(next);
    profile = next;
    nicknameError = false;
    nicknameSaved = true;
  }

  function changeOptOut(value: boolean): void {
    optOut = value;
    const next = {
      ...profile,
      nickname: isValidNickname(nickname) ? normalizeNickname(nickname) : profile.nickname,
      optOut: value,
    };
    saveRankingProfile(next);
    profile = next;
  }

  function openDelete(): void {
    deleteState = null;
    deleteOpen = true;
  }

  function cancelDelete(): void {
    if (deleting) return;
    deleteOpen = false;
  }

  async function deleteMine(): Promise<void> {
    if (deleting) return;
    const deleteKey = loadDeleteKey();
    if (deleteKey === '' || profile.clientId === '') {
      deleteOpen = false;
      deleteState = { kind: 'nokey' };
      return;
    }
    deleting = true;
    try {
      const response = await deletePlays({ clientId: profile.clientId, deleteKey });
      if (!response.ok) {
        deleteState = { kind: 'error' };
      } else if ((response.deleted ?? 0) > 0) {
        deleteState = { kind: 'ok', count: response.deleted ?? 0 };
        reloadSeq += 1;
      } else {
        deleteState = { kind: 'none' };
      }
    } catch {
      deleteState = { kind: 'error' };
    } finally {
      deleting = false;
      deleteOpen = false;
    }
  }

  function isSelf(entry: RankingEntry): boolean {
    return profile.nickname !== '' && entry.nickname === profile.nickname;
  }
</script>

{#if enabled}
  <section class="screen ranking" data-screen="S12Ranking">
    <header class="ranking-head">
      <div>
        <p class="eyebrow">{t('rk.title')}</p>
        <h1>{t('rk.title')}</h1>
      </div>
      <button type="button" class="btn btn--ghost" onclick={() => screen.set(finished ? 'S08' : 'S01')}>
        {finished ? t('rk.backEnding') : t('rk.backTitle')}
      </button>
    </header>

    <p class="lead">{t('rk.lead')}</p>

    {#if indexError}
      <p class="error-text" role="alert">{t('rk.error')}</p>
    {:else}
      <section class="panel filters" aria-label={t('rk.title')}>
        <label class="field">
          <span>{t('rk.scenario')}</span>
          <select
            value={scenarioId}
            onchange={(event) => changeScenario((event.currentTarget as HTMLSelectElement).value)}
          >
            {#each index as item (item.id)}
              <option value={item.id}>{loc(item.title)}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>{t('rk.role')}</span>
          <select
            value={role}
            onchange={(event) => changeRole((event.currentTarget as HTMLSelectElement).value)}
          >
            {#each roleOptions as option (option)}
              <option value={option}>{t(`sa.roles.role.${option}`)}</option>
            {/each}
          </select>
        </label>

        <div class="field">
          <span>{t('rk.mode')}</span>
          <div class="period-switch" role="group" aria-label={t('rk.mode')}>
            <button
              type="button"
              class="btn btn--ghost btn--small"
              class:is-active={mode === 'normal'}
              aria-pressed={mode === 'normal'}
              onclick={() => { mode = 'normal'; }}
            >{t('rk.modeNormal')}</button>
            <button
              type="button"
              class="btn btn--ghost btn--small"
              class:is-active={mode === 'hard'}
              aria-pressed={mode === 'hard'}
              onclick={() => { mode = 'hard'; }}
            >{t('rk.modeHard')}</button>
          </div>
        </div>

        <div class="field">
          <span>{t('rk.period')}</span>
          <div class="period-switch" role="group" aria-label={t('rk.period')}>
            <button
              type="button"
              class="btn btn--ghost btn--small"
              class:is-active={period === 'week'}
              aria-pressed={period === 'week'}
              onclick={() => { period = 'week'; }}
            >{t('rk.periodWeek')}</button>
            <button
              type="button"
              class="btn btn--ghost btn--small"
              class:is-active={period === 'all'}
              aria-pressed={period === 'all'}
              onclick={() => { period = 'all'; }}
            >{t('rk.periodAll')}</button>
          </div>
        </div>
      </section>

      <section class="panel" aria-labelledby="ranking-list-heading">
        <h2 id="ranking-list-heading">{t('rk.title')}</h2>
        {#if loading}
          <p class="hint" role="status">{t('rk.loading')}</p>
        {:else if loadError}
          <p class="error-text" role="alert">{t('rk.error')}</p>
          <button type="button" class="btn btn--small" onclick={() => { reloadSeq += 1; }}>
            {t('rk.retry')}
          </button>
        {:else if ranking && ranking.entries.length > 0}
          <p class="muted total">{t('rk.total', { total: ranking.total })}</p>
          <div class="ranking-table">
            <div class="ranking-row ranking-row--head" aria-hidden="true">
              <span>{t('rk.columnPosition')}</span>
              <span>{t('rk.columnNickname')}</span>
              <span>{t('rk.columnScore')}</span>
              <span>{t('rk.columnRank')}</span>
            </div>
            <ol class="ranking-list">
              {#each ranking.entries as entry (`${entry.position}:${entry.nickname}:${entry.score}`)}
                <li class="ranking-row" class:is-self={isSelf(entry)}>
                  <span class="pos">{entry.position}</span>
                  <span class="nick">{entry.nickname}</span>
                  <span class="score">{entry.score}</span>
                  <span class="rank rank-{entry.rank.toLowerCase()}">{entry.rank}</span>
                </li>
              {/each}
            </ol>
          </div>
        {:else}
          <p class="muted">{t('rk.empty')}</p>
        {/if}
      </section>
    {/if}

    <section class="panel settings" aria-labelledby="ranking-settings-heading" data-ranking-settings>
      <h2 id="ranking-settings-heading">{t('rk.settings.heading')}</h2>
      <p class="hint">{t('rk.settings.lead')}</p>

      <label class="field">
        <span>{t('rk.nickname.label')}</span>
        <input
          type="text"
          maxlength={16}
          autocomplete="nickname"
          data-ranking-nickname
          bind:value={nickname}
          oninput={() => { nicknameError = false; nicknameSaved = false; }}
          aria-invalid={nicknameError}
          aria-describedby="ranking-nickname-hint"
        />
      </label>
      <p id="ranking-nickname-hint" class="hint">{t('rk.nickname.hint')}</p>
      {#if nicknameError}
        <p class="error-text" role="alert">{t('rk.nickname.invalid')}</p>
      {/if}
      {#if nicknameSaved}
        <p class="hint" role="status">{t('rk.nickname.saved')}</p>
      {/if}

      <p class="notice notice--warn" data-ranking-warning>{t(RANKING_KEYS.nicknameWarning)}</p>
      <p class="hint">{t(RANKING_KEYS.autoNotice)}</p>

      <label class="check">
        <input
          type="checkbox"
          data-ranking-optout
          checked={optOut}
          onchange={(event) => changeOptOut((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>{t(RANKING_KEYS.optOutLabel)}</span>
      </label>
      <p class="hint">{t('rk.optout.hint')}</p>

      <div class="join-actions">
        <button type="button" class="btn btn--primary" data-ranking-save onclick={saveNickname}>
          {t('rk.nickname.save')}
        </button>
      </div>
    </section>

    <section class="panel delete-panel" aria-labelledby="ranking-delete-heading" data-ranking-delete-panel>
      <h2 id="ranking-delete-heading">{t('rk.delete.heading')}</h2>
      <p class="hint">{t('rk.delete.lead')}</p>

      {#if !deleteOpen}
        <button type="button" class="btn btn--ghost" data-ranking-delete onclick={openDelete}>
          {t('rk.delete.button')}
        </button>
      {:else}
        <p class="notice notice--warn" role="alert">{t('rk.delete.confirm')}</p>
        <div class="join-actions">
          <button type="button" class="btn btn--ghost" data-ranking-delete-cancel onclick={cancelDelete} disabled={deleting}>
            {t('rk.delete.no')}
          </button>
          <button type="button" class="btn btn--primary" data-ranking-delete-confirm onclick={deleteMine} disabled={deleting}>
            {deleting ? t('rk.delete.deleting') : t('rk.delete.yes')}
          </button>
        </div>
      {/if}

      {#if deleteState}
        <p
          role="status"
          class:error-text={deleteState.kind === 'error'}
          data-ranking-delete-status={deleteState.kind}
        >
          {#if deleteState.kind === 'ok'}
            {t('rk.delete.done', { deleted: deleteState.count })}
          {:else if deleteState.kind === 'none'}
            {t('rk.delete.none')}
          {:else if deleteState.kind === 'nokey'}
            {t('rk.delete.noKey')}
          {:else}
            {t('rk.delete.error')}
          {/if}
        </p>
      {/if}

      <p class="hint">{t('rk.delete.cache')}</p>

      {#if deleteState?.kind === 'ok'}
        <label class="check">
          <input
            type="checkbox"
            data-ranking-delete-optout
            checked={optOut}
            onchange={(event) => changeOptOut((event.currentTarget as HTMLInputElement).checked)}
          />
          <span>{t('rk.delete.optOutAfter')}</span>
        </label>
      {/if}
    </section>
  </section>
{/if}

<style>
  .ranking {
    display: grid;
    gap: 0.9rem;
  }
  .ranking-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .ranking-head h1 {
    margin: 0.1rem 0 0;
    font-size: 1.5em;
  }
  .eyebrow,
  .lead {
    margin: 0;
    color: var(--muted);
  }
  .lead {
    line-height: 1.8;
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.7rem;
    align-items: end;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85em;
    color: var(--muted);
  }
  .field select,
  .field input {
    min-height: 2.4em;
    padding: 0.35em 0.5em;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
  }
  .period-switch {
    display: flex;
    gap: 0.3rem;
  }
  .total {
    margin: 0 0 0.4rem;
  }
  .ranking-table {
    display: grid;
    gap: 0.2rem;
  }
  .ranking-list {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ranking-row {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) 6rem 3.5rem;
    gap: 0.4rem;
    align-items: center;
    padding: 0.4rem 0.5rem;
    border-radius: 5px;
    font-size: 0.92em;
  }
  .ranking-row--head {
    color: var(--muted);
    font-size: 0.75em;
  }
  .ranking-row:not(.ranking-row--head):nth-child(odd) {
    background: var(--bg-soft);
  }
  .ranking-row.is-self {
    outline: 1px solid var(--accent);
    background: var(--accent-dim);
  }
  .pos,
  .score {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .nick {
    overflow-wrap: anywhere;
  }
  .rank {
    font-weight: 800;
    text-align: center;
  }
  .rank-s { color: var(--warn); }
  .rank-a { color: var(--accent); }
  .rank-b { color: var(--ok); }
  .rank-c { color: var(--text-soft); }
  .rank-d { color: var(--danger); }
  .settings,
  .delete-panel {
    display: grid;
    gap: 0.6rem;
    align-items: start;
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
  .join-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .result-line {
    margin: 0.2rem 0 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 639px) {
    .ranking-head,
    .join-actions {
      flex-direction: column-reverse;
    }
    .ranking-head .btn,
    .join-actions .btn {
      width: 100%;
    }
    .ranking-row {
      grid-template-columns: 2.8rem minmax(0, 1fr) 4.5rem 2.5rem;
    }
  }
</style>
