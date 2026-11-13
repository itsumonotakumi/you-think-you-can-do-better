<script lang="ts">
  // S13 称号一覧（#9）。獲得済みは条件を、未獲得はぼかしたヒントを出す。
  // ルーターはオーケストレーター所有のため、S01 から重ねて開く（data-screen は S13Achievements）。
  import { ACHIEVEMENTS, loadAchievements } from '../achievements';
  import type { AchievementStore } from '../achievements';
  import { loc, t } from '../../i18n';

  let { onBack = () => {} }: { onBack?: () => void } = $props();

  const store = $state<AchievementStore>(loadAchievements());
  const items = $derived(ACHIEVEMENTS.map((def) => ({ def, record: store[def.id] })));
  const unlocked = $derived(items.filter((item) => item.record !== undefined).length);

  function handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') onBack();
  }
</script>

<svelte:window onkeydown={handleKey} />

<dialog open class="achievements" data-screen="S13Achievements" aria-labelledby="achievements-heading">
  <section class="screen screen--narrow">
    <header class="screen-head">
      <p class="eyebrow">{t('ach.eyebrow')}</p>
      <h1 id="achievements-heading">{t('ach.title')}</h1>
      <p class="count">{t('ach.count', { got: unlocked, total: ACHIEVEMENTS.length })}</p>
    </header>

    <ul class="list">
      {#each items as item (item.def.id)}
        <li class="item" class:locked={item.record === undefined}>
          <div class="item-head">
            <span class="mark" aria-hidden="true">{item.record === undefined ? '☆' : '★'}</span>
            <h2>{loc(item.def.title)}</h2>
            <span class="scope">{t(item.def.scope === 'play' ? 'ach.scope.play' : 'ach.scope.total')}</span>
          </div>
          {#if item.record === undefined}
            <p class="hint">
              <span class="badge">{t('ach.locked')}</span>
              {loc(item.def.hint)}
            </p>
          {:else}
            <p class="desc">{loc(item.def.description)}</p>
            <p class="meta">{t('ach.earnedAt', { date: item.record.at.slice(0, 10) })}</p>
          {/if}
        </li>
      {/each}
    </ul>

    <p class="note">{t('ach.hintNote')}</p>

    <div class="actions">
      <button type="button" class="btn btn--primary" onclick={onBack}>{t('ach.back')}</button>
    </div>
  </section>
</dialog>

<style>
  .achievements {
    position: fixed;
    inset: 0;
    z-index: 40;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
  }
  .count {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
  }
  .item.locked {
    background: transparent;
    border-style: dashed;
  }
  .item-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .mark {
    color: var(--accent);
    font-size: 1.1em;
  }
  .locked .mark {
    color: var(--muted);
  }
  .item h2 {
    flex: 1;
    margin: 0;
    font-size: 1em;
  }
  .locked h2 {
    color: var(--text-soft);
  }
  .scope {
    color: var(--muted);
    font-size: 0.75em;
    white-space: nowrap;
  }
  .desc,
  .hint,
  .meta,
  .note {
    margin: 0.3rem 0 0;
    line-height: 1.7;
  }
  .hint {
    color: var(--muted);
  }
  .badge {
    display: inline-block;
    margin-right: 0.4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.75em;
  }
  .meta,
  .note {
    color: var(--muted);
    font-size: 0.85em;
  }
  .note {
    margin-top: 0.8rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  @media (max-width: 639px) {
    .actions .btn {
      width: 100%;
    }
  }
</style>
