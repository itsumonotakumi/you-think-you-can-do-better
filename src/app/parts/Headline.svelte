<script lang="ts">
  // 翌朝の新聞見出し（#8）。結果画面の冒頭に出す。シェア画像もこの文言を使う。
  import type { PlayState, Scenario } from '../../engine/types';
  import { headlineFor } from '../headline';
  import { loc, t } from '../../i18n';

  let { state, scenario }: { state: PlayState; scenario: Scenario } = $props();

  const headline = $derived(headlineFor(state, scenario));
</script>

<aside class="headline" data-part="headline" aria-label={t('headline.region')}>
  <div class="masthead">
    <span class="paper">{t('headline.paper')}</span>
    <span class="edition">{t('headline.edition')}</span>
  </div>
  <p class="date">{t('headline.date')}</p>
  <h2 class="title">{loc(headline)}</h2>
  <p class="note">{t('headline.note')}</p>
</aside>

<style>
  .headline {
    margin: 0.4rem 0 0.6rem;
    padding: 0.75rem 1rem 0.9rem;
    border-top: 3px double var(--line-strong);
    border-bottom: 3px double var(--line-strong);
    background: var(--bg-soft);
    color: var(--text);
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", Georgia,
      "Times New Roman", serif;
  }
  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--line-strong);
  }
  .paper {
    font-size: 1.05em;
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  .edition {
    color: var(--muted);
    font-size: 0.75em;
    letter-spacing: 0.08em;
  }
  .date {
    margin: 0.35rem 0 0;
    color: var(--muted);
    font-size: 0.78em;
    letter-spacing: 0.06em;
  }
  .title {
    margin: 0.5rem 0 0.55rem;
    font-size: 1.5em;
    font-weight: 800;
    line-height: 1.5;
    letter-spacing: 0.02em;
    text-wrap: balance;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
    font-size: 0.72em;
    line-height: 1.6;
  }
  @media (max-width: 639px) {
    .headline {
      padding: 0.65rem 0.75rem 0.75rem;
    }
    .title {
      font-size: 1.25em;
    }
    .paper {
      letter-spacing: 0.1em;
    }
  }
  @media print {
    .headline {
      border-color: #000;
      background: #fff;
      color: #000;
    }
    .masthead {
      border-color: #000;
    }
    .date,
    .edition,
    .note {
      color: #333;
    }
  }
</style>
