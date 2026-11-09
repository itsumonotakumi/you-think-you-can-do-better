<script lang="ts">
  // 音・出来事の字幕（A05）。ミュートでも何が起きたか分かるようにする。
  // 表示は App.svelte（共通の親）が行い、どの画面でも同じ部品を使う。
  // 表示待ちは store の captions、表示し終えたものは captionHistory に残す。
  import { t, loc } from '../../i18n';
  import { captionHistory, captions } from '../store';
  import { play } from '../store';
  import { formatClock, groupCaptions, isKnownSe, mediaLabelKey, type ShownCaption } from './logic';

  /** 履歴として並べる件数（同じ文言は1件にまとめた後で数える） */
  const VISIBLE_HISTORY = 5;

  const current = $derived($captions[0] ?? null);
  const history = $derived(groupCaptions($captionHistory, label, VISIBLE_HISTORY));

  function label(caption: ShownCaption): string {
    if (caption.kind === 'se') {
      return isKnownSe(caption.id)
        ? t(`sb.caption.se.${caption.id}`)
        : t('sb.caption.se.default', { id: caption.id });
    }
    if (caption.kind === 'voice') {
      if (caption.media === 'boss' || caption.media === 'vendor') {
        return t('sb.caption.call', { who: t(mediaLabelKey(caption.media, $play?.role)) });
      }
      if (caption.media === 'attacker') {
        return t('sb.caption.mail', { who: t(mediaLabelKey(caption.media, $play?.role)) });
      }
      return t('sb.caption.notify', { media: t(mediaLabelKey(caption.media, $play?.role)) });
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
    <!-- 履歴は画面をふさがないよう畳んでおく（既定は閉じる。開けば読める） -->
    <details class="history-box">
      <summary class="history-summary">{t('sb.caption.history', { count: history.length })}</summary>
      <ol class="history" aria-live="off">
        {#each history as group (group.caption.captionId)}
          <li class="caption history-item">
            <span class="history-text">{label(group.caption)}</span>
            {#if group.count > 1}
              <span class="repeat">{t('sb.caption.repeat', { count: group.count })}</span>
            {/if}
          </li>
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
  /* いま起きたこと（着信・通知・時刻）は大きく目立たせる */
  .caption.current {
    padding: 0.55rem 0.9rem;
    border-left-width: 6px;
    border-left-color: var(--danger);
    background: var(--panel);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
    font-size: 1.25rem;
    font-weight: 700;
    animation: caption-in 0.25s ease-out;
  }
  @keyframes caption-in {
    from { transform: translateY(8px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .caption.current { animation: none; }
  }
  :global(.reduce-motion) .caption.current {
    animation: none;
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
  .repeat {
    margin-left: 0.35rem;
    color: var(--text-soft);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
