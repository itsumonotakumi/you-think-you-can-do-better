<script lang="ts">
  // 音・出来事の字幕（A05）。ミュートでも何が起きたか分かるようにする。
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

{#if current}
  <div class="captions" role="status" aria-live="polite">
    <p class="caption current">{label(current)}</p>
  </div>
{/if}

{#if history.length > 0}
  <ol class="history" aria-live="off">
    {#each history as caption (caption.captionId)}
      <li class="caption history-item">{label(caption)}</li>
    {/each}
  </ol>
{/if}

<style>
  .captions {
    display: grid;
    gap: 0.2rem;
    margin: 0.4rem 0;
  }
  .caption {
    margin: 0;
    padding: 0.3rem 0.6rem;
    border-left: 3px solid var(--accent, #d8b26a);
    background: var(--panel-2, #222731);
    color: var(--text, #e8e6e1);
    font-size: 0.9rem;
  }
  .history {
    display: grid;
    gap: 0.1rem;
    margin: 0 0 0.4rem;
    padding: 0;
    list-style: none;
  }
  .history-item {
    border-left-color: var(--border, #3a3f4b);
    background: none;
    color: var(--muted, #a3a8b3);
    font-size: 0.75rem;
  }
</style>
