<script lang="ts">
  // 音・出来事の字幕（A05）。ミュートでも何が起きたか分かるようにする
  import { t, loc } from '../../i18n';
  import { formatClock, isKnownSe, mediaLabelKey, type ShownCaption } from './logic';

  let { captions }: { captions: ShownCaption[] } = $props();
</script>

{#if captions.length > 0}
  <div class="captions" role="status" aria-live="polite">
    {#each captions as caption (caption.captionId)}
      <p class="caption">
        {#if caption.kind === 'se'}
          {isKnownSe(caption.id) ? t(`sb.caption.se.${caption.id}`) : t('sb.caption.se.default', { id: caption.id })}
        {:else if caption.kind === 'voice'}
          {#if caption.media === 'boss' || caption.media === 'vendor'}
            {t('sb.caption.call', { who: t(mediaLabelKey(caption.media)) })}
          {:else if caption.media === 'attacker'}
            {t('sb.caption.mail', { who: t(mediaLabelKey(caption.media)) })}
          {:else}
            {t('sb.caption.notify', { media: t(mediaLabelKey(caption.media)) })}
          {/if}
        {:else if caption.kind === 'clock'}
          {t('sb.caption.clock', { time: formatClock(caption.to) })}
        {:else}
          {#if caption.prefixKey}{t(caption.prefixKey)}：{/if}{loc(caption.text)}
        {/if}
      </p>
    {/each}
  </div>
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
</style>
