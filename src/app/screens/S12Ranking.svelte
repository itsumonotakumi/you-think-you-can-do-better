<script lang="ts">
  // S12 ランキング（#7）。API のベース URL が無いビルドでは何も表示しない。
  // 送信は本人が同意した時だけ。初回プレイに限る。
  import { onMount } from 'svelte';
  import { loadIndex } from '../../data/loader';
  import type {
    RankingEntry, RankingResponse, RoleId, ScenarioSummary, SubmissionResult,
  } from '../../engine/types';
  import { loc, t } from '../../i18n';
  import { play, scenario, screen, settings } from '../store';
  import {
    buildRankingSubmission, canSubmitRanking, ensureRankingProfile, fetchRanking,
    isRankingEnabled, isValidNickname, loadRankingProfile, mountTurnstile, normalizeNickname,
    saveRankingProfile, submitPlay, submissionInput, turnstileSiteKey,
  } from '../ranking';
  import type { RankingProfile } from '../ranking';

  const enabled = isRankingEnabled();
  const siteKey = turnstileSiteKey();

  let index = $state<ScenarioSummary[]>([]);
  let indexError = $state(false);
  let scenarioId = $state('');
  let role = $state<RoleId>('executive');
  let period = $state<'week' | 'all'>('week');
  let ranking = $state<RankingResponse | null>(null);
  let loading = $state(false);
  let loadError = $state(false);
  let reloadSeq = $state(0);

  let profile = $state<RankingProfile>({ nickname: '', consent: false, clientId: '' });
  let consentOpen = $state(false);
  let nickname = $state('');
  let agree = $state(false);
  let nicknameError = $state(false);
  let turnstileToken = $state('');
  let turnstileHost = $state<HTMLDivElement | null>(null);
  let turnstileNonce = $state(0);
  let submitting = $state(false);
  let submitError = $state(false);
  let submitResult = $state<SubmissionResult | null>(null);
  let submitted = $state(false);

  const summary = $derived(index.find((item) => item.id === scenarioId) ?? null);
  const roleOptions = $derived(summary?.roles.map((item) => item.role) ?? []);
  const playCount = $derived($play?.playCount ?? 0);
  const finished = $derived($play?.finished === true);
  const canParticipate = $derived(canSubmitRanking($play, $scenario));
  const mode = $derived($play?.mode ?? 'normal');

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

  $effect(() => {
    // Turnstile はサイトキーがある時だけ読み込む
    const host = turnstileHost;
    const open = consentOpen;
    void turnstileNonce;
    if (!open || !host || siteKey === '') {
      turnstileToken = '';
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | null = null;
    void mountTurnstile(
      host,
      siteKey,
      (token) => {
        if (!cancelled) turnstileToken = token;
      },
      $settings.lang === 'en' ? 'en' : 'ja',
    ).then((done) => {
      if (cancelled) {
        done?.();
        return;
      }
      cleanup = done;
    });
    return () => {
      cancelled = true;
      cleanup?.();
      cleanup = null;
    };
  });

  onMount(() => {
    let cancelled = false;
    profile = loadRankingProfile();
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

  function openConsent(): void {
    profile = loadRankingProfile();
    nickname = profile.nickname;
    agree = profile.consent;
    nicknameError = false;
    submitError = false;
    submitResult = null;
    turnstileToken = '';
    turnstileNonce += 1;
    consentOpen = true;
  }

  function closeConsent(): void {
    consentOpen = false;
    nicknameError = false;
    submitError = false;
    turnstileToken = '';
  }

  async function submit(): Promise<void> {
    if (submitting) return;
    const state = $play;
    const current = $scenario;
    if (!state || !current || !canSubmitRanking(state, current)) {
      submitError = true;
      return;
    }
    if (!isValidNickname(nickname)) {
      nicknameError = true;
      return;
    }
    nicknameError = false;
    submitting = true;
    submitError = false;
    try {
      const ensured = ensureRankingProfile();
      const saved: RankingProfile = {
        ...ensured,
        nickname: normalizeNickname(nickname),
        consent: agree,
      };
      saveRankingProfile(saved);
      profile = saved;

      const payload = buildRankingSubmission(state, current, submissionInput(saved, turnstileToken));
      if (!payload) {
        submitError = true;
        return;
      }
      const response = await submitPlay(payload);
      if (response.ok) {
        submitResult = response;
        submitted = true;
        consentOpen = false;
        reloadSeq += 1;
      } else {
        submitError = true;
        // Turnstile のトークンは一度きりなので、やり直し用に作り直す
        turnstileToken = '';
        turnstileNonce += 1;
      }
    } catch {
      submitError = true;
    } finally {
      submitting = false;
    }
  }

  function isSelf(entry: RankingEntry): boolean {
    if (submitResult?.ok !== true) return false;
    if (profile.nickname === '' || entry.nickname !== profile.nickname) return false;
    return typeof submitResult.score !== 'number' || submitResult.score === entry.score;
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

    {#if submitResult?.ok}
      <section class="panel result" data-ranking-result>
        <h2>{t('rk.join.resultHeading')}</h2>
        {#if typeof submitResult.position === 'number' && typeof submitResult.total === 'number'}
          <p class="result-line">
            {t('rk.join.position', { position: submitResult.position, total: submitResult.total })}
          </p>
        {/if}
        {#if typeof submitResult.percentile === 'number'}
          <p class="result-line">
            {t('rk.join.percentile', { percentile: submitResult.percentile })}
          </p>
        {/if}
        {#if typeof submitResult.score === 'number' && submitResult.rank}
          <p class="result-line">
            {t('rk.join.score', { score: submitResult.score, rank: submitResult.rank })}
          </p>
        {/if}
      </section>
    {/if}

    {#if finished}
      {#if canParticipate && !submitted}
        <section class="panel join" aria-labelledby="ranking-join-heading">
          <h2 id="ranking-join-heading">{t('rk.join.heading')}</h2>
          <p>{t('rk.join.lead')}</p>
          {#if !consentOpen}
            <button type="button" class="btn btn--primary" data-ranking-open onclick={openConsent}>
              {t('rk.join.open')}
            </button>
          {:else}
            <div class="join-form">
              <dl class="sent-grid">
                <div>
                  <dt>{t('rk.join.sentHeading')}</dt>
                  <dd>{t('rk.join.sent')}</dd>
                </div>
                <div>
                  <dt>{t('rk.join.notSentHeading')}</dt>
                  <dd>{t('rk.join.notSent')}</dd>
                </div>
              </dl>

              <label class="field">
                <span>{t('rk.join.nickname')}</span>
                <input
                  type="text"
                  maxlength={16}
                  autocomplete="nickname"
                  data-ranking-nickname
                  bind:value={nickname}
                  aria-invalid={nicknameError}
                  aria-describedby="ranking-nickname-hint"
                />
              </label>
              <p id="ranking-nickname-hint" class="hint">{t('rk.join.nicknameHint')}</p>
              {#if nicknameError}
                <p class="error-text" role="alert">{t('rk.join.nicknameInvalid')}</p>
              {/if}

              <label class="check">
                <input type="checkbox" data-ranking-agree bind:checked={agree} />
                <span>{t('rk.join.consent')}</span>
              </label>

              {#if siteKey !== ''}
                <div class="turnstile">
                  <p class="label">{t('rk.join.verify')}</p>
                  <div class="turnstile-host" bind:this={turnstileHost}></div>
                </div>
              {/if}

              {#if submitError}
                <p class="error-text" role="alert">{t('rk.join.error')}</p>
              {/if}

              <div class="join-actions">
                <button type="button" class="btn btn--ghost" onclick={closeConsent} disabled={submitting}>
                  {t('rk.join.cancel')}
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  data-ranking-submit
                  onclick={submit}
                  disabled={submitting || !agree || playCount !== 1}
                >
                  {submitting ? t('rk.join.submitting') : t('rk.join.submit')}
                </button>
              </div>
            </div>
          {/if}
        </section>
      {:else if playCount > 1}
        <p class="hint">{t('rk.join.firstOnly')}</p>
      {/if}
    {/if}
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
  .join-form {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.7rem;
  }
  .sent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.5rem;
    margin: 0;
  }
  .sent-grid div {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg-soft);
  }
  .sent-grid dt {
    color: var(--muted);
    font-size: 0.8em;
  }
  .sent-grid dd {
    margin: 0.2rem 0 0;
    line-height: 1.7;
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
  .turnstile-host {
    min-height: 2rem;
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
