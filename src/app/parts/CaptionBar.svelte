<script lang="ts">
  // 音・出来事の字幕（A05）。ミュートでも何が起きたか分かるようにする。
  // 表示は App.svelte（共通の親）が行い、どの画面でも同じ部品を使う。
  // 表示待ちは store の captions、表示し終えたものは captionHistory に残す。
  import { t, loc } from '../../i18n';
  import { captionHistory, captions } from '../store';
  import { formatClock, isKnownSe, mediaLabelKey, type ShownCaption } from './logic';

  /** 履歴として並べる件数 */
  const VISIBLE_HISTORY = 5;

  const current = $derived($captions[0] ?? null);
  const history = $derived($captionHistory.slice(0, VISIBLE_HISTORY));

  function label(caption: ShownCaption): string {
    if (caption.kind === 'se') {
      return isKnownSe(caption.id)
        ? t(`sb.caption.se.${caption.id}`)
        : t('sb.caption.se.default', { id: caption.id });
    }
    if (caption.kind === 'voice') {
      if (caption.media === 'boss' || caption.media === 'vendor') {
        return t('sb.caption.call', { who: t(mediaLabelKey(caption.media)) });
      }
      if (caption.media === 'attacker') {
        return t('sb.caption.mail', { who: t(mediaLabelKey(caption.media)) });
      }
      return t('sb.caption.notify', { media: t(mediaLabelKey(caption.media)) });
    }
    if (caption.kind === 'clock') return t('sb.caption.clock', { time: formatClock(caption.to) });
    const prefix = caption.prefixKey ? `${t(caption.prefixKey)}：` : '';
    return prefix + loc(caption.text);
  }
</script>

<div class="caption-bar" data-caption-bar>
  {#if current}
    <div class="captions" role="status" aria-live="polite">
      <p class="caption current">{label(current)}</p>
    </div>
  {/if}

  {#if history.length > 0}
    <!-- 履歴は画面をふさがないよう畳んでおく（開けば読める） -->
    <details class="history-box">
      <summary class="history-summary">{t('sb.caption.history', { count: history.length })}</summary>
      <ol class="history" aria-live="off">
        {#each history as caption (caption.captionId)}
          <li class="caption history-item">{label(caption)}</li>
        {/each}
      </ol>
    </details>
  {/if}
</div>

<style>
  .caption-bar {
    display: grid;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
  }
  .captions {
    display: grid;
    gap: 0.2rem;
    margin: 0;
  }
  .caption {
    margin: 0;
    padding: 0.3rem 0.6rem;
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
    background: var(--panel-hover);
    color: var(--text);
    font-size: 0.9rem;
  }
  .history-box {
    padding: 0.15rem 0.35rem 0.3rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
  .history-summary {
    color: var(--muted);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .history-summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .history {
    display: grid;
    gap: 0.1rem;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
  }
  .history-item {
    border-left-color: var(--line-strong);
    background: none;
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
