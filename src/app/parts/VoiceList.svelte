<script lang="ts">
  // 世間の声。媒体アイコンと文字だけ。誘導かどうかで見た目を変えない
  import { t, loc } from '../../i18n';
  import { formatClock, mediaGlyph, mediaLabelKey, type VoiceItem } from './logic';

  let { voices }: { voices: VoiceItem[] } = $props();
</script>

{#if voices.length === 0}
  <p class="empty">{t('sb.voices.empty')}</p>
{:else}
  <ul class="voices">
    {#each voices as voice, index (voice.id + ':' + index)}
      <li class="voice">
        <span class="meta">
          <span class="badge" data-media={voice.media} aria-hidden="true">{mediaGlyph(voice.media)}</span>
          <span class="media">{t(mediaLabelKey(voice.media))}</span>
          <time class="time">{formatClock(voice.at)}</time>
        </span>
        <p class="text">{loc(voice.text)}</p>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .voices {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .voice {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--panel-hover);
  }
  .meta {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .badge {
    display: inline-block;
    min-width: 1.2rem;
    border: 1px solid var(--line-strong);
    border-radius: 3px;
    text-align: center;
    font-weight: 700;
    line-height: 1.4;
  }
  .text {
    margin: 0.25rem 0 0;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .time {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
