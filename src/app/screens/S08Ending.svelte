<script module lang="ts">
  import type { PlayState, Rank, Scenario } from '../../engine/types';

  /** ランクの見た目用クラス */
  export function rankClass(rank: Rank): string {
    return `rank-${rank.toLowerCase()}`;
  }

  /** 最初の「通知・公表」の判断を終えた時刻までの時間（時間単位）。無ければ null */
  export function publicationHours(state: PlayState, scenario: Scenario): number | null {
    const role = scenario.roles[state.role];
    if (!role) return null;
    for (const record of state.history) {
      const point = role.points.find((item) => item.id === record.pointId);
      if (!point || point.phase !== 'notify') continue;
      const choice = point.choices.find((item) => item.id === record.choiceId);
      if (!choice) continue;
      const minutes = (record.at.day - scenario.start.day) * 1440
        + (record.at.minutes - scenario.start.minutes) + choice.minutes;
      return Math.max(0, minutes) / 60;
    }
    return null;
  }
</script>

<script lang="ts">
  // S08 エンディング: 結果を一度だけ記録し、ランクと売上見通しを出す
  import { onMount } from 'svelte';
  import { computeResult } from '../../engine';
  import { audio } from '../../audio';
  import { loc, notice, t } from '../../i18n';
  import { loadPlays, recordResult, saveProgress } from '../../storage';
  import { loadIndex } from '../../data/loader';
  import { play, scenario, screen, settings } from '../store';
  import { isRankingEnabled, RANKING_KEYS } from '../ranking';
  import { runFx } from '../effects';
  import { minutesBetween } from '../parts/logic';
  import { headlineFor } from '../headline';
  import { localizedFor } from '../share/data';
  import ShareButton from '../parts/ShareButton.svelte';
  import Headline from '../parts/Headline.svelte';
  import '../effects/effects.css';

  let recorded = false;
  const rankingEnabled = isRankingEnabled();
  import { grantAchievements, representativeTitle } from '../achievements';
  import type { Achievement } from '../../engine/types';
  /** このプレイで新しく獲得した称号（#9） */
  let newAchievements = $state<Achievement[]>([]);

  const result = $derived($play && $scenario ? computeResult($play, $scenario) : null);
  const ending = $derived(result && $scenario ? $scenario.endings[result.rank] : null);
  const prologue = $derived($play?.prologue ?? null);
  const publishedHours = $derived($play && $scenario ? publicationHours($play, $scenario) : null);
  const elapsedHours = $derived(
    $play && $scenario ? Math.max(0, minutesBetween($scenario.start, $play.clock)) / 60 : 0,
  );
  const shownHours = $derived(publishedHours ?? elapsedHours);
  const headlineSource = $derived($play && $scenario ? { state: $play, scenario: $scenario } : null);
  /** シェアに渡す見出しと称号。画面と同じ内容にする */
  const shareHeadline = $derived(
    $play && $scenario ? localizedFor(headlineFor($play, $scenario), $settings.lang) : '',
  );
  const shareTitle = $derived.by(() => {
    const picked = representativeTitle(newAchievements);
    return picked ? localizedFor(picked.title, $settings.lang) : '';
  });

  $effect(() => {
    audio.setVolumes({ bgm: $settings.bgmVolume, se: $settings.seVolume, muted: $settings.muted });
  });

  onMount(() => {
    const state = $play;
    const current = $scenario;
    const value = result;
    if (!state || !current || !value || recorded) return;
    recorded = true;

    // 結果の記録はこの画面で一度だけ。進行中のプレイはここで閉じる
    recordResult(state.scenarioId, state.role, {
      rank: value.rank,
      score: value.official,
      raw: value.raw,
      playCount: value.playCount,
      at: new Date().toISOString(),
    }, state.mode === 'hard' ? 'hard' : 'normal');
    saveProgress(null);

    // 称号（#9）: 1回のプレイで決まるものと、積み重ねで決まるものをまとめて判定する
    const at = new Date().toISOString();
    const grant = (scenarioIds?: string[]): Achievement[] => grantAchievements({
      state, scenario: current, result: value, plays: loadPlays(), scenarioIds, at,
    });
    newAchievements = grant();
    // 全シナリオ制覇は公開中のシナリオ一覧が要る。読み込めたときだけ追加で判定する
    void loadIndex()
      .then((list) => {
        const more = grant(list.map((item) => item.id));
        if (more.length > 0) newAchievements = [...newAchievements, ...more];
      })
      .catch(() => {
        // 一覧が読めなくても、その他の称号は判定済み
      });

    audio.playBgm(current.endings[value.rank].bgm);
    audio.playSe('stamp');
    runFx('stamp');
  });

  function hoursText(hours: number): string {
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }
</script>

<section class="screen screen--narrow ending" data-screen="S08Ending">
  <header class="ending-head">
    <p class="eyebrow">{t('sc.ending.title')}</p>
    <h1>{t('sc.ending.title')}</h1>
    {#if result}
      <p class="play-count">{t('sc.playCount', { n: result.playCount })}</p>
    {/if}
  </header>

  {#if headlineSource}
    <Headline state={headlineSource.state} scenario={headlineSource.scenario} />
  {/if}

  {#if result}
    <div class="stamp-wrap">
      <p class="stamp-label">{t('sc.ending.rank')}</p>
      <p
        class="stamp {rankClass(result.rank)}"
        data-fx="stamp"
        aria-label={`${t('sc.ending.rank')}: ${result.rank}`}
      >{result.rank}</p>
    </div>

    {#if ending}
      <p class="ending-text">{loc(ending.text)}</p>
    {/if}

    {#if result.fatal}
      <p class="notice notice--warn">{t('sc.ending.fatalNote')}</p>
    {/if}

    <section class="panel" aria-labelledby="ending-score-heading">
      <h2 id="ending-score-heading">{t('sc.ending.summaryHeading')}</h2>
      <dl class="score-grid">
        <div>
          <dt>{t('sc.ending.raw')}</dt>
          <dd>{result.raw}</dd>
        </div>
        <div>
          <dt>{t('sc.ending.multiplier')}</dt>
          <dd>×{result.multiplier}</dd>
        </div>
        <div>
          <dt>{t('sc.ending.official')}</dt>
          <dd>{result.official}</dd>
        </div>
        <div>
          <dt>{t('sc.ending.sales')}</dt>
          <dd>{t('sc.ending.salesValue', { percent: result.sales })}</dd>
        </div>
      </dl>
      <p class="hint">{t('sc.ending.salesNote')}</p>
    </section>

    {#if newAchievements.length > 0}
      <section class="panel achievements" aria-labelledby="ending-achievements-heading">
        <h2 id="ending-achievements-heading">{t('ach.newHeading')}</h2>
        <ul>
          {#each newAchievements as item (item.id)}
            <li>
              <strong>{loc(item.title)}</strong>
              <span>{loc(item.description)}</span>
            </li>
          {/each}
        </ul>
        <p class="hint">{t('ach.newNote')}</p>
      </section>
    {/if}

    <section class="panel" aria-labelledby="ending-prologue-heading">
      <h2 id="ending-prologue-heading">{t('sc.ending.prologueHeading')}</h2>
      <p class="label">{t('sc.ending.prologueComment')}</p>
      {#if prologue && prologue.comment.trim() !== ''}
        <blockquote class="quote">{prologue.comment}</blockquote>
      {:else}
        <p class="muted">{t('sc.ending.prologueEmpty')}</p>
      {/if}

      <dl class="time-grid">
        <div>
          <dt>{t('sc.ending.predicted')}</dt>
          <dd>
            {#if prologue && prologue.predictedHours !== null}
              {t('sc.ending.predictedValue', { hours: prologue.predictedHours })}
            {:else}
              {t('sc.ending.predictedNone')}
            {/if}
          </dd>
        </div>
        <div>
          <dt>{publishedHours !== null ? t('sc.ending.published') : t('sc.ending.elapsed')}</dt>
          <dd>{t('sc.ending.elapsedValue', { hours: hoursText(shownHours) })}</dd>
        </div>
      </dl>
      <p class="hint">{t('sc.ending.compareNote')}</p>
    </section>

    <div class="notice-stack">
      {#if result.playCount >= 2}
        <p class="notice notice--warn">{notice('replay')}</p>
      {/if}
      <p class="notice">{notice('criminal')}</p>
      <p class="notice">{notice('score')}</p>
    </div>

    <div class="actions">
      {#if rankingEnabled && result.playCount === 1}
        <button
          type="button"
          class="btn rank-join"
          data-ranking-join
          onclick={() => screen.set('S12')}
        >
          {t(RANKING_KEYS.endingJoin)}
        </button>
      {/if}
      <button type="button" class="btn btn--ghost" onclick={() => screen.set('S01')}>
        {t('sc.ending.titleButton')}
      </button>
      <button type="button" class="btn btn--primary" onclick={() => screen.set('S09')}>
        {t('sc.ending.next')}
      </button>
      {#if $play && $scenario}
        <ShareButton
          scenario={$scenario}
          playState={$play}
          result={result}
          headline={shareHeadline}
          achievement={shareTitle}
        />
      {/if}
    </div>
  {:else}
    <div class="panel stack">
      <p>{t('sc.ending.missing')}</p>
      <button type="button" class="btn" onclick={() => screen.set('S01')}>
        {t('sc.ending.titleButton')}
      </button>
    </div>
  {/if}
</section>

<style>
  .ending {
    display: grid;
    gap: 0.9rem;
  }
  .ending-head {
    text-align: center;
  }
  .ending-head h1 {
    margin: 0.1rem 0 0.3rem;
    font-size: 1.6em;
  }
  .eyebrow {
    margin: 0;
  }
  .play-count {
    margin: 0;
    color: var(--muted);
  }
  .stamp-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    margin: 0.2rem 0;
  }
  .stamp-label {
    margin: 0;
    color: var(--muted);
    font-size: 0.85em;
  }
  .stamp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 4.2em;
    height: 4.2em;
    margin: 0;
    border: 4px solid currentColor;
    border-radius: 50%;
    font-size: 2.2em;
    font-weight: 800;
    line-height: 1;
    transform: rotate(-6deg);
  }
  .rank-s {
    color: var(--warn);
  }
  .rank-a {
    color: var(--accent);
  }
  .rank-b {
    color: var(--ok);
  }
  .rank-c {
    color: var(--text-soft);
  }
  .rank-d {
    color: var(--danger);
  }
  .ending-text {
    margin: 0;
    padding: 0.9rem 1rem;
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    background: var(--bg-soft);
    font-size: 1.05em;
    line-height: 1.9;
  }
  .panel {
    margin: 0;
  }
  .panel h2 {
    margin: 0 0 0.6rem;
    font-size: 0.9em;
    color: var(--muted);
    font-weight: 600;
  }
  .score-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.6rem;
    margin: 0;
  }
  .score-grid div,
  .time-grid div {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg-soft);
  }
  .score-grid dt,
  .time-grid dt,
  .label {
    margin: 0;
    color: var(--muted);
    font-size: 0.8em;
  }
  .score-grid dd,
  .time-grid dd {
    margin: 0.15rem 0 0;
    font-size: 1.1em;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .time-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.6rem;
    margin: 0.6rem 0 0;
  }
  .quote {
    margin: 0.4rem 0 0;
    padding: 0.6rem 0.8rem;
    border-left: 3px solid var(--line-strong);
    background: var(--bg-soft);
    color: var(--text-soft);
    line-height: 1.8;
  }
  .achievements ul {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .achievements li {
    display: grid;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg-soft);
  }
  .achievements strong {
    color: var(--accent);
  }
  .achievements span {
    color: var(--text-soft);
    font-size: 0.9em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  @media (max-width: 639px) {
    .actions {
      flex-direction: column-reverse;
    }
    .actions .btn {
      width: 100%;
    }
  }
  /* 印刷は紙面（白背景）を前提にするため、テーマ変数ではなく固定色を使う */
  @media print {
    :global(html),
    :global(body) {
      background: #fff;
      color: #000;
    }
    .actions {
      display: none;
    }
    .ending {
      padding: 0;
      color: #000;
    }
    .panel,
    .ending-text,
    .quote,
    .score-grid div,
    .time-grid div {
      border-color: #999;
      background: #fff;
    }
    .stamp {
      color: #000;
      border-color: #000;
    }
    .notice {
      border-left-color: #666;
      background: #f4f4f4;
      color: #000;
    }
  }
</style>
