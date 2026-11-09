<script lang="ts">
  import { audio } from '../../audio';
  import { loadIndex } from '../../data/loader';
  import { applyLang, loc, notice, t, takePendingNotice } from '../../i18n';
  import { loadPlays } from '../../storage';
  import { keyVisual } from '../illustrations';
  import { scenario, screen, selectedScenarioId, settings } from '../store';
  import type { PlaysStore, ScenarioSummary } from '../../engine/types';
  import '../styles/base.css';

  type Phase = 'loading' | 'ready' | 'error';

  let summaries = $state<ScenarioSummary[]>([]);
  let plays = $state<PlaysStore>({});
  let phase = $state<Phase>('loading');
  // タイトルから引き継いだ連絡（版が変わった等）。無ければ何も出さない
  let transitionNotice = $state<string | null>(takePendingNotice());

  async function load(): Promise<void> {
    phase = 'loading';
    try {
      summaries = await loadIndex();
      plays = loadPlays();
      phase = 'ready';
    } catch {
      phase = 'error';
    }
  }

  $effect(() => {
    void load();
  });

  function recordFor(scenarioId: string) {
    let first: { rank: string; score: number } | null = null;
    let best: { rank: string; score: number; count: number } | null = null;
    const prefix = `${scenarioId}/`;
    for (const [key, rec] of Object.entries(plays)) {
      if (!key.startsWith(prefix)) continue;
      if (rec.first && (!first || rec.first.score > first.score)) {
        first = { rank: rec.first.rank, score: rec.first.score };
      }
      if (rec.best && (!best || rec.best.score > best.score)) {
        best = { rank: rec.best.rank, score: rec.best.score, count: rec.best.count };
      }
    }
    return { first, best };
  }

  const cards = $derived.by(() => {
    applyLang($settings.lang);
    return summaries.map((s) => {
      const { first, best } = recordFor(s.id);
      const minutes = s.roles.length > 0 ? Math.min(...s.roles.map((r) => r.estimateMinutes)) : null;
      return {
        id: s.id,
        title: loc(s.title),
        tagline: loc(s.tagline),
        keySrc: keyVisual(s.id),
        keyAlt: t('sa.images.key', { title: loc(s.title) }),
        period: loc(s.sourcePeriod),
        status: s.status,
        statusLabel: t(`sa.scenarios.status.${s.status}`),
        stars: '★'.repeat(s.difficulty) + '☆'.repeat(Math.max(0, 5 - s.difficulty)),
        difficultyLabel: t('sa.scenarios.difficultyValue', { n: s.difficulty }),
        minutesLabel: minutes === null ? '' : t('sa.scenarios.minutes', { n: minutes }),
        rolesLabel: t('sa.scenarios.roles', { n: s.roles.length }),
        firstLabel: first
          ? t('sa.scenarios.firstValue', { rank: first.rank, score: first.score })
          : t('sa.scenarios.noRecord'),
        bestLabel: best
          ? t('sa.scenarios.bestN', { n: best.count, rank: best.rank, score: best.score })
          : '',
        hasRecord: first !== null,
      };
    });
  });

  const hasAnyRecord = $derived(cards.some((card) => card.hasRecord));

  const ui = $derived.by(() => {
    applyLang($settings.lang);
    return {
      title: t('sa.scenarios.title'),
      lead: t('sa.scenarios.lead'),
      difficulty: t('sa.scenarios.difficulty'),
      period: t('sa.scenarios.period'),
      first: t('sa.scenarios.first'),
      select: t('sa.scenarios.select'),
      empty: t('sa.scenarios.empty'),
      loadError: t('sa.scenarios.loadError'),
      loading: t('sa.common.loading'),
      retry: t('sa.common.retry'),
      back: t('sa.common.back'),
      score: notice('score'),
    };
  });

  function select(id: string): void {
    audio.playSe('select');
    selectedScenarioId.set(id);
    scenario.set(null);
    screen.set('S04');
  }

  function backToTitle(): void {
    transitionNotice = null;
    screen.set('S01');
  }
</script>

<section class="screen" data-screen="S03ScenarioSelect">
  <header class="screen-head">
    <h1>{ui.title}</h1>
    <p class="lead">{ui.lead}</p>
  </header>

  {#if transitionNotice}
    <p class="notice notice--warn" role="status">{transitionNotice}</p>
  {/if}

  {#if phase === 'loading'}
    <p class="muted" role="status">{ui.loading}</p>
  {:else if phase === 'error'}
    <div class="panel stack">
      <p class="error-text" role="alert">{ui.loadError}</p>
      <button class="btn" onclick={load}>{ui.retry}</button>
    </div>
  {:else if cards.length === 0}
    <p class="panel muted">{ui.empty}</p>
  {:else}
    <ul class="scenario-list">
      {#each cards as card (card.id)}
        <li class="scenario-card">
          {#if card.keySrc}
            <img
              class="scenario-card__key"
              src={card.keySrc}
              alt={card.keyAlt}
              width="1280"
              height="721"
              loading="lazy"
              decoding="async"
              onerror={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          {/if}
          <div class="scenario-card__head">
            <h2 class="scenario-card__title">{card.title}</h2>
            <span class="badge badge--{card.status}">{card.statusLabel}</span>
          </div>
          <p class="scenario-card__tagline">{card.tagline}</p>

          <dl class="meta">
            <div class="meta__row">
              <dt>{ui.difficulty}</dt>
              <dd>
                <span class="stars" aria-hidden="true">{card.stars}</span>
                <span class="sr-only">{card.difficultyLabel}</span>
                <span class="meta__num">{card.difficultyLabel}</span>
              </dd>
            </div>
            <div class="meta__row">
              <dt>{ui.period}</dt>
              <dd>{card.period}</dd>
            </div>
            <div class="meta__row">
              <dt>{ui.first}</dt>
              <dd class:record-muted={!card.hasRecord}>{card.firstLabel}</dd>
            </div>
          </dl>

          {#if card.bestLabel}
            <p class="record-best">{card.bestLabel}</p>
          {/if}

          <p class="scenario-card__foot muted small">{card.rolesLabel}{#if card.minutesLabel} ・ {card.minutesLabel}{/if}</p>

          <button class="btn btn--primary btn--wide" onclick={() => select(card.id)}>{ui.select}</button>
        </li>
      {/each}
    </ul>

    {#if hasAnyRecord}
      <p class="notice">{ui.score}</p>
    {/if}
  {/if}

  <div class="row">
    <button class="btn btn--ghost" onclick={backToTitle}>{ui.back}</button>
  </div>
</section>

<style>
  .scenario-card__key {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1280 / 721;
    object-fit: cover;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-hover);
  }
</style>
