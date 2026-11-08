<script lang="ts">
  // S05 上部バー: n回目・時計・期限・4ゲージ・臆病ゲージ（数値と文字で必ず出す）
  import type { PlayState, Scenario } from '../../engine/types';
  import { t, loc } from '../../i18n';
  import { deadlineViews, formatClock, gaugeViews } from './logic';

  let { play, scenario }: { play: PlayState; scenario: Scenario } = $props();

  const gauges = $derived(gaugeViews(play.gauges));
  const deadlines = $derived(deadlineViews(play, scenario));
  const coward = $derived(Math.min(4, Math.max(0, play.cowardStreak)));
</script>

<header class="topbar" aria-label={t('sb.main.aria')}>
  <div class="primary">
    <span class="play-count">{t('sb.play.count', { n: play.playCount })}</span>
    <span class="clock">
      <span class="day">{t('sb.clock.day', { day: play.clock.day })}</span>
      <span class="time">{formatClock(play.clock)}</span>
    </span>
    <span class="phase">{t(`sb.phase.${play.phase}`)}</span>
  </div>

  <div class="deadlines" aria-label={t('sb.deadline.heading')}>
    {#if deadlines.length === 0}
      <span class="deadline safe">{t('sb.deadline.none')}</span>
    {/if}
    {#each deadlines as d (d.id)}
      <span class="deadline {d.status}" data-status={d.status}>
        <span class="deadline-label">
          {d.label ? t('sb.deadline.label', { label: loc(d.label) }) : t('sb.deadline.fallback')}
        </span>
        <span class="deadline-text">{t(d.textKey, d.vars)}</span>
      </span>
    {/each}
  </div>

  <div class="gauges" aria-label={t('sb.gauge.section')}>
    {#each gauges as g (g.key)}
      <div class="gauge" data-gauge={g.key}>
        <span class="gauge-text">
          {t(g.labelKey)} <strong>{g.value}</strong>／<span class="level">{t(g.levelKey)}</span>
        </span>
        <span class="meter" aria-hidden="true"><span class="fill" style="width: {g.value}%"></span></span>
      </div>
    {/each}
    <div class="gauge coward" data-gauge="coward">
      <span class="gauge-text">{t('sb.gauge.coward')} <strong>{coward}</strong>／4</span>
      <span class="meter" aria-hidden="true"><span class="fill" style="width: {coward * 25}%"></span></span>
    </div>
  </div>
</header>

<style>
  .topbar {
    display: grid;
    gap: 0.4rem 1rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 8px;
    background: var(--panel, #1b1f27);
    color: var(--text, #e8e6e1);
    font-size: 0.9rem;
  }
  .primary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem 1rem;
  }
  .play-count {
    font-weight: 700;
    color: var(--accent, #d8b26a);
  }
  .clock {
    display: inline-flex;
    gap: 0.5rem;
    align-items: baseline;
    font-variant-numeric: tabular-nums;
  }
  .clock .time {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .phase {
    color: var(--muted, #a3a8b3);
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 999px;
    padding: 0 0.5rem;
    font-size: 0.8rem;
  }
  .deadlines {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.8rem;
  }
  .deadline {
    display: inline-flex;
    gap: 0.4rem;
    align-items: baseline;
    color: var(--muted, #a3a8b3);
  }
  .deadline-label {
    font-weight: 600;
  }
  /* 期限の赤: 点滅させずに太くする（10.4） */
  .deadline[data-status='warn'] {
    color: var(--warn, #e0a04a);
    font-weight: 700;
  }
  .deadline[data-status='over'] {
    color: var(--danger, #e05c5c);
    font-weight: 800;
  }
  .gauges {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: 0.35rem 0.8rem;
  }
  .gauge {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .gauge-text {
    font-size: 0.82rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .gauge-text strong {
    font-variant-numeric: tabular-nums;
  }
  .level {
    color: var(--muted, #a3a8b3);
  }
  .meter {
    display: block;
    height: 4px;
    border-radius: 2px;
    background: var(--track, #2a2f39);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent, #d8b26a);
  }
  .gauge[data-gauge='flame'] .fill {
    background: #c9663f;
  }
  .gauge[data-gauge='trust'] .fill {
    background: #5f9e86;
  }
  .gauge[data-gauge='stamina'] .fill {
    background: #7a8db8;
  }
  .coward .fill {
    background: #8a7bb0;
  }
</style>
